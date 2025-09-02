// services/openaiService.js - MEJORADO CON TABLAS BIEN FORMATEADAS
const { OpenAI } = require('openai');
const { DateTime } = require('luxon');
const axios = require('axios');
const cosmosService = require('./cosmosService');
const documentService = require('./documentService');
require('dotenv').config();

class AzureOpenAIService {
  constructor() {
    this.initialized = false;
    this.initializationError = null;
    this.openaiAvailable = false;
    this.tools = [];
    console.log('🚀 Inicializando Azure OpenAI Service...');
    this.diagnoseConfiguration();
    this.initializeAzureOpenAI();
    this.tools = this.defineTools();
    console.log(`✅ Servicio disponible: ${this.openaiAvailable}`);
  }

  // ... [Métodos de inicialización existentes - mantener iguales]
  diagnoseConfiguration() {
    this.config = {
      apiKey: process.env.OPENAI_API_KEY,
      endpoint: process.env.OPENAI_ENDPOINT,
      deploymentName: process.env.OPENAI_DEPLOYMENT || 'gpt-5-mini',
      apiVersion: process.env.OPENAI_API_VERSION || '2024-12-01-preview'
    };
  }

  initializeAzureOpenAI() {
    try {
      const { apiKey, endpoint, deploymentName, apiVersion } = this.config;

      if (!apiKey || !endpoint) {
        throw new Error('OPENAI_API_KEY y OPENAI_ENDPOINT requeridos');
      }

      this.openai = new OpenAI({
        apiKey,
        baseURL: `${endpoint}/openai/deployments/${deploymentName}`,
        defaultQuery: { 'api-version': apiVersion },
        defaultHeaders: {
          'Content-Type': 'application/json',
          'api-key': apiKey
        },
        timeout: 45000,
        maxRetries: 3
      });

      this.deploymentName = deploymentName;
      this.apiVersion = apiVersion;
      this.openaiAvailable = true;
      this.initialized = true;

      console.log('✅ Cliente Azure OpenAI configurado');
      if (process.env.NODE_ENV !== 'production') {
        this.testConnection().catch(() => {});
      }
    } catch (error) {
      this.initializationError = `Error inicializando Azure OpenAI: ${error.message}`;
      console.error('❌ Error inicializando Azure OpenAI:', error);
      this.openaiAvailable = false;
      this.initialized = false;
    }
  }

  // ... [Define tools y otros métodos existentes]

  /**
   * ✅ MÉTODO PRINCIPAL MEJORADO - Mejor integración RAG y formato
   */
  async procesarMensaje(mensaje, historial = [], userToken = null, userInfo = null, conversationId = null) {
    try {
      if (!this.openaiAvailable) return this.createUnavailableResponse();
      if (!this.initialized) {
        this.initializeAzureOpenAI();
        if (!this.openaiAvailable) return this.createUnavailableResponse();
      }

      const userId = userInfo?.usuario || 'unknown';
      console.log(`📝 [${userId}] Procesando: "${(mensaje || '').slice(0, 80)}..."`);

      // 1) ✅ MEJORADA: Detección más precisa para RAG
      const necesitaRAG = this.needsDocumentSearchMejorado(mensaje);
      
      if (necesitaRAG && documentService?.isAvailable?.()) {
        console.log(`📚 [${userId}] Activando RAG para consulta de documentos`);
        
        try {
          // ✅ CAMBIO IMPORTANTE: Usar el método unificado que ya sintetiza
          const respuestaRAG = await documentService.buscarDocumentos(mensaje, userId);
          
          return {
            type: 'text',
            content: respuestaRAG,
            metadata: {
              formatUsed: 'rag-unified-synthesis',
              modelUsed: this.deploymentName,
              documentSearchUsed: true,
              ragVersion: 'unified-v2'
            }
          };
          
        } catch (ragError) {
          console.warn(`⚠️ [${userId}] RAG falló, continuando sin documentos:`, ragError.message);
        }
      }

      // 2) Procesamiento normal con herramientas mejoradas
      let mensajesParaIA = [];
      let usingOpenAIFormat = false;

      if (cosmosService?.isAvailable?.() && conversationId) {
        try {
          const openaiConversation = await cosmosService.getConversationForOpenAI(conversationId, userId, true);
          if (openaiConversation?.length) {
            mensajesParaIA = [...openaiConversation];
            usingOpenAIFormat = true;
          }
        } catch (_) {}
      }

      if (!usingOpenAIFormat) {
        mensajesParaIA = this.formatearHistorialTradicional(historial, userInfo, '');
      }
      mensajesParaIA.push({ role: 'user', content: mensaje });

      const requestConfig = {
        model: this.deploymentName,
        messages: mensajesParaIA,
        temperature: this.calculateTemperature(mensaje),
        max_completion_tokens: this.calculateMaxTokens(mensaje)
      };

      if (this.shouldUseTools(mensaje)) {
        requestConfig.tools = this.tools;
        requestConfig.tool_choice = 'auto';
      }

      const response = await this.openai.chat.completions.create(requestConfig);
      const messageResponse = response.choices?.[0]?.message;
      
      if (!messageResponse) throw new Error('Respuesta vacía de Azure OpenAI');

      if (messageResponse.tool_calls) {
        const finalResponse = await this.procesarHerramientas(
          messageResponse,
          mensajesParaIA,
          userToken,
          userInfo,
          conversationId
        );
        
        finalResponse.metadata = {
          formatUsed: usingOpenAIFormat ? 'openai-conversation' : 'traditional-history',
          modelUsed: requestConfig.model,
          toolsUsed: true,
          documentSearchUsed: false,
          usage: response.usage
        };
        return finalResponse;
      }

      return {
        type: 'text',
        content: messageResponse.content || 'Respuesta vacía de Azure OpenAI',
        metadata: {
          formatUsed: usingOpenAIFormat ? 'openai-conversation' : 'traditional-history',
          modelUsed: requestConfig.model,
          toolsUsed: false,
          documentSearchUsed: false,
          usage: response.usage
        }
      };
      
    } catch (error) {
      console.error('❌ Error en procesarMensaje:', error);
      return this.manejarErrorOpenAI(error, userInfo);
    }
  }

  /**
   * ✅ MEJORADA: Detección más precisa para búsqueda de documentos
   */
  needsDocumentSearchMejorado(mensaje) {
    const mensajeLower = mensaje.toLowerCase();
    
    // Palabras clave expandidas y más precisas
    const documentKeywords = [
      // APIs y endpoints
      'endpoint', 'endpoints', 'api', 'rest', 'validasocio', 'valida socio', 'validar socio',
      'autenticacion', 'autenticación', 'login', 'inicio sesion', 'token', 'bearer',
      'get', 'post', 'put', 'delete', 'request', 'response', 'método', 'metodo',
      
      // Versiones y documentación
      'version', 'versión', 'v1', 'v1.1', 'v2', 'documentacion', 'documentación',
      'especificacion', 'especificación', 'manual', 'guía', 'guia',
      
      // Procedimientos y políticas
      'procedimiento', 'proceso', 'política', 'politica', 'lineamiento',
      'norma', 'regla', 'protocolo', 'instructivo', 'metodología',
      
      // Preguntas técnicas generales
      'como funciona', 'cómo funciona', 'que es', 'qué es', 'cuáles son', 'cuales son',
      'para que sirve', 'para qué sirve', 'como se usa', 'cómo se usa',
      'como hacer', 'cómo hacer', 'instrucciones', 'pasos',
      
      // Referencias específicas Nova
      'nova', 'apirestnova', 'sistema nova', 'plataforma', 'servicio'
    ];
    
    const needsSearch = documentKeywords.some(keyword => mensajeLower.includes(keyword));
    
    // Detectar preguntas interrogativas
    const esPreguntas = mensajeLower.match(/^(qué|que|cómo|como|cuál|cual|cuáles|cuales|dónde|donde|cuándo|cuando|por qué|por que|para qué|para que)/);
    
    const finalDecision = needsSearch || esPreguntas;
    
    if (finalDecision) {
      console.log(`📚 [MEJORADO] Búsqueda de documentos requerida para: "${mensaje.substring(0, 50)}..."`);
    }
    
    return finalDecision;
  }

  // ... [Métodos de herramientas existentes - mantener iguales hasta llegar a formatearTablaTasas]

  /**
   * ✅ COMPLETAMENTE REESCRITO: Formateo de tabla de tasas con markdown correcto
   */
  formatearTablaTasas(tasasData, anio, usuario) {
    try {
      if (!Array.isArray(tasasData) || !tasasData.length) {
        return '❌ **Error**: Datos de tasas vacíos';
      }

      const hoyMX = new Date().toLocaleDateString('es-MX');
      
      // Normalizar nombres de meses
      const norm = s => (s ?? '').toString().toLowerCase()
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
      
      const monthIdx = {
        enero: 1, febrero: 2, marzo: 3, abril: 4, mayo: 5, junio: 6,
        julio: 7, agosto: 8, septiembre: 9, setiembre: 9, octubre: 10,
        noviembre: 11, diciembre: 12
      };
      
      // Formatear porcentajes
      const pct = v => {
        if (v === undefined || v === null || v === '') return '—';
        const n = Number(v);
        return Number.isFinite(n) ? `${n.toFixed(2)}%` : String(v);
      };
      
      // Ordenar y procesar datos
      const filas = [...tasasData]
        .sort((a, b) => (monthIdx[norm(a.Mes)] ?? 99) - (monthIdx[norm(b.Mes)] ?? 99))
        .map(m => ({
          mes: (m.Mes || '').toString(),
          vista: pct(m.vista),
          fijo1m: pct(m.fijo1),
          fijo3m: pct(m.fijo3),
          fijo6m: pct(m.fijo6),
          fap: pct(m.FAP),
          nov: pct(m.Nov),
          prestamos: pct(m.Prestamos)
        }));

      // ✅ NUEVA IMPLEMENTACIÓN: Usar markdown table
      let respuesta = `💰 **TASAS DE INTERÉS NOVA CORPORATION ${anio}**\n\n`;
      respuesta += `👤 **Usuario**: ${usuario}\n`;
      respuesta += `📅 **Año**: ${anio}\n`;
      respuesta += `🕐 **Actualizado**: ${hoyMX}\n\n`;
      respuesta += `📊 **Detalle mensual:**\n\n`;
      
      // ✅ TABLA MARKDOWN BIEN FORMATEADA
      respuesta += `| Mes | Vista | Fijo 1m | Fijo 3m | Fijo 6m | FAP | Nov | Préstamos |\n`;
      respuesta += `|-----|-------|---------|---------|---------|-----|-----|----------|\n`;
      
      filas.forEach(fila => {
        respuesta += `| ${fila.mes.padEnd(3)} | ${fila.vista.padStart(7)} | ${fila.fijo1m.padStart(7)} | ${fila.fijo3m.padStart(7)} | ${fila.fijo6m.padStart(7)} | ${fila.fap.padStart(5)} | ${fila.nov.padStart(5)} | ${fila.prestamos.padStart(8)} |\n`;
      });
      
      respuesta += `\n💡 **Leyenda**: **—** = sin dato disponible\n`;
      respuesta += `🔢 **Total de meses**: ${filas.length}\n`;
      
      // ✅ ANÁLISIS ADICIONAL: Rangos de tasas
      const tasasNumericas = {
        vista: filas.map(f => parseFloat(f.vista)).filter(n => !isNaN(n)),
        fijo1m: filas.map(f => parseFloat(f.fijo1m)).filter(n => !isNaN(n)),
        fijo3m: filas.map(f => parseFloat(f.fijo3m)).filter(n => !isNaN(n)),
        fijo6m: filas.map(f => parseFloat(f.fijo6m)).filter(n => !isNaN(n)),
        prestamos: filas.map(f => parseFloat(f.prestamos)).filter(n => !isNaN(n))
      };
      
      respuesta += `\n📈 **Análisis de rangos:**\n`;
      
      Object.entries(tasasNumericas).forEach(([tipo, valores]) => {
        if (valores.length > 0) {
          const min = Math.min(...valores);
          const max = Math.max(...valores);
          const avg = valores.reduce((a, b) => a + b, 0) / valores.length;
          respuesta += `• **${tipo.charAt(0).toUpperCase() + tipo.slice(1)}**: ${min.toFixed(2)}% - ${max.toFixed(2)}% (prom: ${avg.toFixed(2)}%)\n`;
        }
      });
      
      return respuesta;
      
    } catch (error) {
      console.error('❌ Error formateando tasas:', error.message);
      return `❌ **Error formateando tabla de tasas**: ${error.message}`;
    }
  }

  /**
   * ✅ MÉTODO MEJORADO: Formateo de saldo con tablas estructuradas
   */
  formatearSaldoUsuario(saldoData, userInfo, incluirDetalles = true) {
    const hoyMX = new Date().toLocaleDateString('es-MX');
    const horaMX = new Date().toLocaleTimeString('es-MX');

    let resultado = `💳 **CONSULTA DE SALDO - NOVA CORPORATION**\n\n`;
    resultado += `| **Campo** | **Valor** |\n`;
    resultado += `|-----------|----------|\n`;
    resultado += `| 👤 Usuario | ${userInfo.nombre || userInfo.usuario} |\n`;
    resultado += `| 🆔 Número de Socio | ${userInfo.usuario} |\n`;
    resultado += `| 📅 Fecha/Hora | ${hoyMX} ${horaMX} |\n\n`;

    let saldos = [];
    if (Array.isArray(saldoData?.info)) saldos = saldoData.info;
    else if (Array.isArray(saldoData?.data)) saldos = saldoData.data;
    else if (Array.isArray(saldoData?.saldos)) saldos = saldoData.saldos;
    else if (Array.isArray(saldoData)) saldos = saldoData;

    if (!saldos.length) {
      resultado += `⚠️ **Sin información de saldo disponible**\n`;
      return resultado;
    }

    // Calcular totales
    let totalDisponible = 0;
    let totalRetenido = 0;
    const cuentasProcesadas = [];

    saldos.forEach((cuenta, index) => {
      const disp = parseFloat(cuenta.saldoDisponible ?? cuenta.disponible ?? cuenta.SaldoDisponible ?? 0);
      const ret = parseFloat(cuenta.saldoRetenido ?? cuenta.retenido ?? cuenta.SaldoRetenido ?? 0);
      const tipo = cuenta.tipoCuenta ?? cuenta.tipo ?? cuenta.TipoCuenta ?? `Cuenta ${index + 1}`;
      
      totalDisponible += disp;
      totalRetenido += ret;
      
      cuentasProcesadas.push({
        tipo,
        disponible: disp,
        retenido: ret,
        total: disp + ret
      });
    });

    const totalGeneral = totalDisponible + totalRetenido;

    // ✅ RESUMEN EN TABLA MARKDOWN
    resultado += `📊 **RESUMEN DE SALDOS**\n\n`;
    resultado += `| **Concepto** | **Monto** |\n`;
    resultado += `|--------------|----------:|\n`;
    resultado += `| 💰 Total Disponible | ${totalDisponible.toLocaleString('es-MX', { minimumFractionDigits: 2 })} |\n`;
    resultado += `| 🔒 Total Retenido | ${totalRetenido.toLocaleString('es-MX', { minimumFractionDigits: 2 })} |\n`;
    resultado += `| 💎 **Total General** | **${totalGeneral.toLocaleString('es-MX', { minimumFractionDigits: 2 })}** |\n\n`;

    if (incluirDetalles && cuentasProcesadas.length > 0) {
      resultado += `📋 **DETALLE POR CUENTA**\n\n`;
      resultado += `| **Cuenta** | **Disponible** | **Retenido** | **Total** |\n`;
      resultado += `|------------|---------------:|-------------:|----------:|\n`;
      
      cuentasProcesadas.forEach(cuenta => {
        resultado += `| ${cuenta.tipo} | ${cuenta.disponible.toLocaleString('es-MX', { minimumFractionDigits: 2 })} | ${cuenta.retenido.toLocaleString('es-MX', { minimumFractionDigits: 2 })} | ${cuenta.total.toLocaleString('es-MX', { minimumFractionDigits: 2 })} |\n`;
      });
      
      resultado += `\n💡 **Nota**: Saldo **Disponible** = uso inmediato; **Retenido** = fondos con restricción temporal.\n`;
    }

    return resultado;
  }

  /**
   * ✅ MEJORADO: Consultar tasas con mejor manejo de errores
   */
  async consultarTasasInteres(anio, userToken, userInfo) {
    try {
      if (!userToken || !userInfo) {
        return '❌ **Error**: Usuario no autenticado para consultar tasas de interés.';
      }
      
      const cveUsuario = userInfo.usuario;
      const numRI = this.extractNumRIFromToken(userToken) || '7';

      console.log(`💰 [${cveUsuario}] Consultando tasas para año ${anio}, NumRI: ${numRI}`);

      const requestBody = {
        usuarioActual: { CveUsuario: cveUsuario },
        data: { NumRI: numRI, Anio: anio }
      };

      const url = process.env.NOVA_API_URL_TASA || 
        'https://pruebas.nova.com.mx/ApiRestNova/api/ConsultaTasa/consultaTasa';

      const response = await axios.post(url, requestBody, {
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${userToken}`,
          Accept: 'application/json'
        },
        timeout: 15000
      });

      if (response.status === 200 && response.data?.info) {
        console.log(`✅ [${cveUsuario}] Tasas obtenidas exitosamente: ${response.data.info.length} registros`);
        return this.formatearTablaTasas(response.data.info, anio, cveUsuario);
      } else {
        return `⚠️ **Respuesta inesperada**: Status ${response.status}. No se pudieron obtener las tasas para ${anio}.`;
      }
    } catch (error) {
      console.error(`❌ Error consultando tasas ${anio}:`, error.message);
      
      if (error.response?.status === 401) {
        return '🔒 **Token expirado**: Por favor, inicia sesión nuevamente.';
      } else if (error.response?.status === 404) {
        return '❌ **Servicio no encontrado**: El endpoint de tasas no está disponible.';
      } else if (error.response?.status === 400) {
        return `❌ **Año inválido**: ${anio} no es un año válido para consultar tasas.`;
      } else {
        return `❌ **Error de conexión**: ${error.message}`;
      }
    }
  }

  // ... [Resto de métodos existentes mantenerlos iguales]

  defineTools() {
    const tools = [
      {
        type: 'function',
        function: {
          name: 'buscar_documentos_nova',
          description: 'Busca información en la documentación interna de Nova (APIs, políticas, procedimientos, guías técnicas).',
          parameters: {
            type: 'object',
            properties: {
              consulta: { type: 'string', description: 'Término o frase a buscar' },
              tipo_busqueda: {
                type: 'string',
                enum: ['general', 'politicas', 'api', 'procedimientos', 'tecnica'],
                default: 'general'
              }
            },
            required: ['consulta']
          }
        }
      },
      {
        type: 'function',
        function: {
          name: 'obtener_fecha_hora_actual',
          description: 'Obtiene fecha/hora actual en zona América/México_City',
          parameters: {
            type: 'object',
            properties: {
              formato: {
                type: 'string',
                enum: ['completo', 'fecha', 'hora', 'timestamp']
              }
            }
          }
        }
      },
      {
        type: 'function',
        function: {
          name: 'obtener_informacion_usuario',
          description: 'Regresa información básica del usuario autenticado',
          parameters: {
            type: 'object',
            properties: {
              incluir_token: { type: 'boolean', description: 'Incluir prefijo del token' }
            }
          }
        }
      },
      {
        type: 'function',
        function: {
          name: 'consultar_tasas_interes',
          description: 'Consulta tasas de interés (Vista, Fijo 1/3/6 meses, FAP, Nov, Préstamos) para un año.',
          parameters: {
            type: 'object',
            properties: { anio: { type: 'integer', minimum: 2020, maximum: 2030 } },
            required: ['anio']
          }
        }
      },
      {
        type: 'function',
        function: {
          name: 'consultar_saldo_usuario',
          description: 'Consulta saldos del usuario (disponible/retenido) por tipo de cuenta. Requiere token.',
          parameters: {
            type: 'object',
            properties: {
              tipo_sistema: { type: 'string', default: '' },
              incluir_detalles: { type: 'boolean', default: true }
            }
          }
        }
      }
      // ... más herramientas según necesidad
    ];
    return tools;
  }

  async ejecutarHerramienta(nombre, parametros, userToken, userInfo, conversationId) {
    switch (nombre) {
      case 'obtener_fecha_hora_actual':
        return this.obtenerFechaHora(parametros.formato || 'completo');
      case 'obtener_informacion_usuario':
        return this.obtenerInfoUsuario(userInfo, parametros.incluir_token);
      case 'consultar_tasas_interes':
        return await this.consultarTasasInteres(parametros.anio, userToken, userInfo);
      case 'consultar_saldo_usuario':
        return await this.consultarSaldoUsuario(userToken, userInfo, parametros.tipo_sistema || '', parametros.incluir_detalles !== false);
      case 'buscar_documentos_nova':
        if (!documentService?.isAvailable?.()) return '❌ Document Service no disponible';
        return await documentService.buscarDocumentos(parametros.consulta, parametros.tipo_busqueda || 'general');
      default:
        throw new Error(`Herramienta desconocida: ${nombre}`);
    }
  }

  // ===================== Métodos de utilidad existentes =====================

  async consultarSaldoUsuario(userToken, userInfo, tipoSist = '', incluirDetalles = true) {
    try {
      if (!userToken || !userInfo) {
        return '❌ **Error**: Usuario no autenticado para consultar saldo';
      }
      
      const cveUsuario = userInfo.usuario;
      console.log(`💳 [${cveUsuario}] Consultando saldo, tipoSist: "${tipoSist}"`);
      
      const requestBody = {
        usuarioActual: { CveUsuario: cveUsuario },
        data: { NumSocio: cveUsuario, TipoSist: tipoSist }
      };
      
      const url = process.env.NOVA_API_URL_SALDO ||
        'https://pruebas.nova.com.mx/ApiRestNova/api/ConsultaSaldo/ObtSaldo';

      const response = await axios.post(url, requestBody, {
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${userToken}`,
          Accept: 'application/json'
        },
        timeout: 15000
      });

      if (response.status === 200 && response.data) {
        console.log(`✅ [${cveUsuario}] Saldo obtenido exitosamente`);
        return this.formatearSaldoUsuario(response.data, userInfo, incluirDetalles);
      }
      
      return `⚠️ **Respuesta inesperada al consultar saldo**: Status ${response.status}`;
      
    } catch (error) {
      console.error(`❌ Error consultando saldo:`, error.message);
      
      if (error.response?.status === 401) return '🔒 **Autorización**: token expirado o inválido.';
      if (error.response?.status === 404) return '❌ **Servicio no encontrado** para consulta de saldos.';
      if (error.response?.status === 400) return '❌ **Datos inválidos** en la consulta de saldos.';
      
      return `❌ **Error consultando saldo**: ${error.message}`;
    }
  }

  extractNumRIFromToken(token) {
    try {
      if (!token) return null;
      
      const clean = token.replace(/^Bearer\s+/, '');
      const parts = clean.split('.');
      if (parts.length !== 3) return null;
      
      const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString());

      // Buscar NumRI en diferentes campos posibles
      const keys = [
        'NumRI', 'numRI', 'numri',
        'http://schemas.xmlsoap.org/ws/2005/05/identity/claims/nameidentifier',
        'sub', 'user_id', 'employee_id'
      ];
      
      for (const key of keys) {
        if (payload[key]) {
          const n = parseInt(payload[key]);
          if (!isNaN(n)) return n;
        }
      }
      
      // Intentar con nombre si está disponible
      const candidate = payload['http://schemas.xmlsoap.org/ws/2005/05/identity/claims/name'] ||
        payload.name || payload.preferred_username;
        
      if (candidate) {
        const n = parseInt(candidate);
        if (!isNaN(n)) return n;
      }
      
      return null;
    } catch {
      return null;
    }
  }

  obtenerFechaHora(formato = 'completo') {
    const ahora = DateTime.now().setZone('America/Mexico_City');
    switch (formato) {
      case 'fecha':
        return ahora.toFormat('dd/MM/yyyy');
      case 'hora':
        return ahora.toFormat('HH:mm:ss');
      case 'timestamp':
        return ahora.toISO();
      default:
        return {
          fecha: ahora.toFormat('dd/MM/yyyy'),
          hora: ahora.toFormat('HH:mm:ss'),
          timezone: ahora.zoneName,
          diaSemana: ahora.toFormat('cccc'),
          timestamp: ahora.toISO(),
          formato_humano: ahora.toFormat('dd/MM/yyyy HH:mm:ss')
        };
    }
  }

  obtenerInfoUsuario(userInfo, incluirToken = false) {
    if (!userInfo) return 'No hay información de usuario disponible';
    
    let info = `👤 **Información del Usuario:**\n\n`;
    info += `| **Campo** | **Valor** |\n`;
    info += `|-----------|----------|\n`;
    info += `| 📝 Nombre | ${userInfo.nombre || 'N/A'} |\n`;
    info += `| 👤 Usuario | ${userInfo.usuario || 'N/A'} |\n`;
    info += `| 🏢 Apellido Paterno | ${userInfo.paterno || 'N/A'} |\n`;
    info += `| 🏢 Apellido Materno | ${userInfo.materno || 'N/A'} |\n`;
    
    if (incluirToken && userInfo.token) {
      info += `| 🔑 Token (prefijo) | ${userInfo.token.substring(0, 50)}... |\n`;
      info += `| 📊 Token válido | ${userInfo.token.length > 100 ? 'Sí' : 'Posible no'} |\n`;
    }
    
    info += `\n💡 Datos extraídos del token de autenticación de Nova.`;
    return info;
  }

  // ===================== Métodos de configuración y estado =====================

  formatearHistorialTradicional(historial, userInfo, documentContext = '') {
    const fechaActual = DateTime.now().setZone('America/Mexico_City');
    const userContext = userInfo
      ? `Usuario autenticado: ${userInfo.nombre} (${userInfo.usuario})`
      : 'Usuario no autenticado';

    const systemContent = `
Tu nombre es Nova-AI, asistente virtual de Nova Corporation.

DIRECTRICES:
- Responde SIEMPRE en español
- Usa el historial como referencia para continuidad
- Estructura tus respuestas con markdown para mejor legibilidad
- Si usas tablas, utiliza formato markdown correcto
- Para datos numéricos importantes, presenta tablas organizadas
- Sé preciso, útil y profesional
- Si no conoces algo, indícalo claramente

CONTEXTO:
🔷 ${userContext}
🔷 Fecha/Hora: ${fechaActual.toFormat('dd/MM/yyyy HH:mm:ss')} (${fechaActual.zoneName})
`.trim();

    const mensajes = [{ role: 'system', content: systemContent }];
    
    if (Array.isArray(historial)) {
      historial.forEach(item => {
        if (item?.content?.trim()) {
          mensajes.push({ role: item.role, content: item.content.trim() });
        }
      });
    }
    
    return mensajes;
  }

  async procesarHerramientas(messageResponse, mensajesPrevios, userToken, userInfo, conversationId) {
    const resultados = [];
    
    for (const call of messageResponse.tool_calls) {
      const { function: fnCall, id } = call;
      const { name, arguments: args } = fnCall;
      
      try {
        console.log(`🛠️ Ejecutando herramienta: ${name}`);
        const parametros = JSON.parse(args || '{}');
        const resultado = await this.ejecutarHerramienta(name, parametros, userToken, userInfo, conversationId);
        
        resultados.push({
          tool_call_id: id,
          content: typeof resultado === 'object' ? JSON.stringify(resultado, null, 2) : String(resultado)
        });
      } catch (error) {
        console.error(`❌ Error ejecutando ${name}:`, error.message);
        resultados.push({ 
          tool_call_id: id, 
          content: `Error ejecutando ${name}: ${error.message}` 
        });
      }
    }

    const finalMessages = [
      ...mensajesPrevios,
      messageResponse,
      ...resultados.map(r => ({ 
        role: 'tool', 
        tool_call_id: r.tool_call_id, 
        content: r.content 
      }))
    ];

    const finalResponse = await this.openai.chat.completions.create({
      model: this.deploymentName,
      messages: finalMessages,
      temperature: 1.0,
      max_completion_tokens: 3000
    });

    return {
      type: 'text',
      content: finalResponse.choices?.[0]?.message?.content || 'No se pudo generar respuesta final'
    };
  }

  calculateTemperature(mensaje) {
    const m = (mensaje || '').toLowerCase();
    // Respuestas más precisas para consultas técnicas/financieras
    if (['tasas', 'saldo', 'información', 'qué es', 'como', 'cómo', 'explicar'].some(k => m.includes(k))) {
      return 0.3;
    }
    // Más creatividad para tareas generativas
    if (['crear', 'escribe', 'idea', 'sugerencia'].some(k => m.includes(k))) {
      return 0.8;
    }
    return 0.7;
  }

  calculateMaxTokens(mensaje) {
    if ((mensaje || '').length > 500) return 4000;
    if ((mensaje || '').length > 200) return 2500;
    return 2000;
  }

  shouldUseTools(mensaje) {
    const m = (mensaje || '').toLowerCase();
    const toolKeywords = [
      // Fecha/Hora
      'fecha', 'hora', 'día', 'hoy', 'cuando', 'qué día',
      // Info usuario
      'mi información', 'mis datos', 'perfil', 'mi info', 'quien soy',
      // Saldos
      'saldo', 'saldos', 'cuánto tengo', 'cuanto tengo', 'dinero', 'cuenta', 'cuentas',
      // Tasas
      'tasas', 'tasa', 'interes', 'interés', 'préstamo', 'crédito', 'vista', 'fijo', 'fap', 'nov',
      // Documentos (aunque ahora se maneja en RAG primero)
      'buscar', 'documentos', 'busca información'
    ];
    return toolKeywords.some(k => m.includes(k));
  }

  createUnavailableResponse() {
    return {
      type: 'text',
      content:
        `🤖 **Servicio OpenAI no disponible**\n\n` +
        `❌ **Error**: ${this.initializationError || 'No inicializado'}\n\n` +
        `💡 Verifica OPENAI_API_KEY / OPENAI_ENDPOINT / cuota.\n`
    };
  }

  manejarErrorOpenAI(error, userInfo) {
    const msg = (error?.message || '').toLowerCase();
    let reason = '🔧 **Error técnico**';
    if (msg.includes('insufficient_quota')) reason = '💳 **Cuota agotada**';
    else if (msg.includes('rate_limit')) reason = '⏰ **Límite de velocidad**';
    else if (msg.includes('invalid_api_key')) reason = '🔑 **API Key inválida**';
    else if (msg.includes('model_not_found')) reason = '🤖 **Modelo no encontrado**';
    else if (msg.includes('timeout')) reason = '⏰ **Timeout**';

    return { type: 'text', content: `❌ **Error del servicio OpenAI**\n\n${reason}: ${error.message}\n` };
    }

  selectBestModel(mensaje) {
    return 'gpt-5-mini';
  }
  calculateTemperature(mensaje) {
    const m = (mensaje || '').toLowerCase();
    if (['qué es', 'como', 'cómo', 'explicar', 'información', 'tasas', 'saldo', 'resumen'].some(k => m.includes(k)))
      return 0.3;
    if (['crear', 'escribe', 'idea'].some(k => m.includes(k))) return 0.8;
    return 1.0;
  }
  calculateMaxTokens(mensaje) {
    if ((mensaje || '').length > 500) return 4000;
    if ((mensaje || '').length > 200) return 2000;
    return 1500;
  }
  shouldUseTools(mensaje) {
    const m = (mensaje || '').toLowerCase();
    const kws = [
      'fecha', 'hora', 'día', 'hoy', 'cuando', 'qué día',
      'mi información', 'mis datos', 'perfil', 'mi info', 'quien soy',
      'saldo', 'saldos', 'cuánto tengo', 'cuanto tengo', 'dinero', 'cuenta', 'cuentas',
      'tasas', 'tasa', 'interes', 'interés', 'préstamo', 'crédito', 'vista', 'fijo', 'fap', 'nov',
      'resumen', 'resumir', 'análisis', 'analizar', 'reporte', 'informe',
      'analizar conversacion', 'analisis conversacion', 'patrones', 'sentimientos', 'temas', 'recomendaciones',
      'consultar', 'api', 'buscar', 'endpoint'
    ];
    return kws.some(k => m.includes(k));
  }

  getServiceStats() {
    return {
      initialized: this.initialized,
      available: this.openaiAvailable,
      error: this.initializationError,
      modelsAvailable: [this.deploymentName],
      featuresEnabled: {
        basic_conversation: true,
        tools: true,
        conversation_history: true,
        user_context: true,
        saldo_consultation: true,
        tasas_interes: true,
        api_integration: true,
        openai_conversation_format: !!cosmosService?.isAvailable?.(),
        conversation_analysis: !!cosmosService?.isAvailable?.()
      },
      toolsCount: this.tools?.length || 0,
      timestamp: new Date().toISOString(),
      version: '2.2.0-saldos-support'
    };
  }

  isAvailable() {
    return this.openaiAvailable && this.initialized;
  }

  async procesarConversacionCompleta(conversationId, userId, userInfo) {
    try {
      if (!cosmosService?.isAvailable?.() || !conversationId) return null;
      const conversacion = await cosmosService.getConversationForOpenAI(conversationId, userId, true);
      if (!conversacion?.length) return null;
      return {
        messages: conversacion,
        stats: this.calcularEstadisticasConversacion(conversacion),
        readyForAPI: true,
        timestamp: new Date().toISOString()
      };
    } catch {
      return null;
    }
  }

  cleanup() {
    console.log('🧹 OpenAI Service limpiado');
  }
}

const openaiService = new AzureOpenAIService();
module.exports = openaiService;
