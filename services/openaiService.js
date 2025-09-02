// services/openaiService.js - Azure OpenAI + RAG + Tools (corregido)
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

  diagnoseConfiguration() {
    this.config = {
      apiKey: process.env.OPENAI_API_KEY,
      endpoint: process.env.OPENAI_ENDPOINT, // p.ej. https://<resource>.openai.azure.com
      deploymentName: process.env.OPENAI_DEPLOYMENT || 'gpt-5-mini',
      apiVersion: process.env.OPENAI_API_VERSION || '2024-12-01-preview'
    };
  }

  initializeAzureOpenAI() {
    try {
      const { apiKey, endpoint, deploymentName, apiVersion } = this.config;

      if (!apiKey) {
        throw new Error('OPENAI_API_KEY no configurada');
      }
      if (!endpoint) {
        throw new Error('OPENAI_ENDPOINT no configurado');
      }
      if (!endpoint.includes('openai.azure.com')) {
        console.warn('⚠️ El endpoint no parece ser de Azure OpenAI (verifica tu URL)');
      }

      console.log('🔑 Configurando cliente Azure OpenAI...');
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
      console.log(`🎯 Deployment: ${deploymentName}`);
      console.log(`📅 API Version: ${apiVersion}`);

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

  async testConnection() {
    try {
      console.log('🧪 Probando conectividad con Azure OpenAI...');
      const testResponse = await this.openai.chat.completions.create({
        model: this.deploymentName,
        messages: [{ role: 'user', content: 'ping' }],
        max_completion_tokens: 5,
        temperature: 0
      });
      if (testResponse?.choices?.length) {
        console.log('✅ Test de conectividad Azure OpenAI exitoso');
      } else {
        console.warn('⚠️ Respuesta de test inválida');
      }
    } catch (error) {
      console.warn('⚠️ Test de conectividad falló:', error.message);
    }
  }

  defineTools() {
    const tools = [
      {
        type: 'function',
        function: {
          name: 'buscar_documentos_nova',
          description:
            'Busca información en la documentación interna de Nova (APIs, políticas, procedimientos, guías técnicas).',
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
          description:
            'Consulta tasas de interés (Vista, Fijo 1/3/6 meses, FAP, Nov, Préstamos) para un año.',
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
          description:
            'Consulta saldos del usuario (disponible/retenido) por tipo de cuenta. Requiere token.',
          parameters: {
            type: 'object',
            properties: {
              tipo_sistema: { type: 'string', default: '' },
              incluir_detalles: { type: 'boolean', default: true }
            }
          }
        }
      },
      {
        type: 'function',
        function: {
          name: 'consultar_api_nova',
          description: 'Consulta un endpoint de Nova con el token del usuario.',
          parameters: {
            type: 'object',
            properties: {
              endpoint: { type: 'string' },
              metodo: { type: 'string', enum: ['GET', 'POST'], default: 'GET' },
              parametros: { type: 'object' }
            },
            required: ['endpoint']
          }
        }
      },
      {
        type: 'function',
        function: {
          name: 'generar_resumen_conversacion',
          description:
            'Genera un resumen ejecutivo de la conversación (si está en Cosmos).',
          parameters: {
            type: 'object',
            properties: {
              incluir_estadisticas: { type: 'boolean' },
              usar_formato_openai: { type: 'boolean' }
            }
          }
        }
      },
      {
        type: 'function',
        function: {
          name: 'analizar_conversacion_openai',
          description:
            'Analiza la conversación guardada (resumen, sentimientos, temas, patrones, recomendaciones).',
          parameters: {
            type: 'object',
            properties: {
              tipo_analisis: {
                type: 'string',
                enum: ['resumen', 'sentimientos', 'temas', 'patrones', 'recomendaciones']
              },
              incluir_sistema: { type: 'boolean' }
            },
            required: ['tipo_analisis']
          }
        }
      }
    ];
    console.log(`🛠️ ${tools.length} herramientas definidas para Azure OpenAI`);
    return tools;
  }

  // ===================== RAG Core =====================

  async generarRespuestaConDocumentos(pregunta, resultadosRaw, userInfo) {
    const userId = userInfo?.usuario || 'unknown';
    console.log(`🤖 [${userId}] === GENERANDO RESPUESTA RAG ===`);
    console.log(`📝 [${userId}] Pregunta: "${pregunta}"`);
    console.log(`📚 [${userId}] Documentos disponibles: ${resultadosRaw?.length || 0}`);

    if (!Array.isArray(resultadosRaw) || resultadosRaw.length === 0) {
      return `❌ **No se encontraron documentos relevantes** para tu consulta: "${pregunta}"\n\nIntenta reformular tu pregunta con términos más específicos.`;
    }

    let contexto = '';
    const documentosValidos = [];
    resultadosRaw.forEach((doc, index) => {
      if (!doc?.chunk || doc.chunk.trim().length < 10) return;
      documentosValidos.push(doc);
      const header = `=== DOCUMENTO ${index + 1}: ${doc.fileName || 'sin-nombre'} ===` + (doc.folder ? ` | Carpeta: ${doc.folder}` : '');
      const content = doc.chunk.length > 2000 ? doc.chunk.slice(0, 2000) + '\n[... contenido truncado ...]' : doc.chunk;
      contexto += `${header}\n${content}\n\n`;
    });

    if (!documentosValidos.length) {
      return `❌ **Error**: Los documentos encontrados no contienen información procesable.\n\n🔎 **Fuentes encontradas**: ${(resultadosRaw || []).map(r => r.fileName).join(', ')}`;
    }

    const systemPrompt = `Eres NOVA-AI, asistente virtual de Nova.

INSTRUCCIONES:
1) Responde SIEMPRE en español.
2) Basa tu respuesta ÚNICAMENTE en los documentos proporcionados.
3) Si el dato NO está en los documentos, dilo explícitamente.
4) Sé específico, técnico y útil.
5) Usa markdown y cita documentos al final.`;

    const userPrompt = `**PREGUNTA:**
${pregunta}

**DOCUMENTOS:**
${contexto}

**INSTRUCCIONES ESPECÍFICAS**
- Responde usando SOLO la información de los documentos.
- Si falta algo, indícalo.
- Estructura y sintetiza, no pegues texto literal.`;

    try {
      const completion = await this.openai.chat.completions.create({
        model: this.deploymentName,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        temperature: 0.3,
        max_completion_tokens: 1500,
        top_p: 0.9,
        frequency_penalty: 0.1,
        presence_penalty: 0.1
      });

      let respuesta = completion.choices?.[0]?.message?.content?.trim();
      if (!respuesta || respuesta.length < 10) {
        respuesta = await this.construirRespuestaFallback(pregunta, documentosValidos, userId);
      }

      const fuentes = [...new Set(documentosValidos.map(d => d.fileName).filter(Boolean))];
      const carpetas = [...new Set(documentosValidos.map(d => d.folder).filter(Boolean))];

      respuesta += `\n\n---\n\n`;
      respuesta += `🔎 **Fuentes consultadas**: ${fuentes.join(', ') || 'N/D'}`;
      if (carpetas.length) respuesta += `\n📁 **Carpetas**: ${carpetas.join(', ')}`;
      respuesta += `\n📊 **Documentos analizados**: ${documentosValidos.length}`;
      respuesta += `\n🤖 **Procesado con**: ${this.deploymentName} + Azure AI Search`;

      return respuesta;
    } catch (error) {
      console.error(`❌ [${userId}] Error en generarRespuestaConDocumentos:`, error);
      if (error.message?.includes('rate_limit')) {
        return `⏰ **Límite de velocidad**. Intenta más tarde.\n\n🔎 **Fuentes**: ${documentosValidos.map(d => d.fileName).join(', ')}`;
      }
      if (error.message?.includes('insufficient_quota')) {
        return `💳 **Cuota agotada**.\n\n🔎 **Fuentes**: ${documentosValidos.map(d => d.fileName).join(', ')}`;
      }
      return await this.construirRespuestaFallback(pregunta, documentosValidos, userId);
    }
  }

  async construirRespuestaFallback(pregunta, documentosValidos, userId) {
    console.log(`🔄 [${userId}] Construyendo respuesta fallback...`);
    let out = `🤖 **Respuesta basada en documentación de Nova**\n\n`;
    out += `**Tu consulta**: ${pregunta}\n\n`;
    documentosValidos.forEach((doc, i) => {
      const parrafos = (doc.chunk || '').split('\n').filter(p => p.trim().length > 20);
      out += `### 📄 Documento ${i + 1}: ${doc.fileName || 'sin-nombre'}\n\n`;
      parrafos.slice(0, 3).forEach(p => (out += `${p.trim()}\n\n`));
      if (parrafos.length > 3) out += `*[Más información en el documento...]*\n\n`;
      if (i < documentosValidos.length - 1) out += `---\n\n`;
    });
    out += `\n💡 Esta respuesta se basa en ${documentosValidos.length} documento(s) internos.\n`;
    return out;
  }

  async debugRespuestaRAG(pregunta, userId = 'debug') {
    try {
      const resultados = await documentService.buscarDocumentosRaw(pregunta, userId);
      if (!resultados?.length) return '❌ No se encontraron documentos para la consulta';
      const userInfo = { usuario: userId, nombre: 'Usuario Debug' };
      const respuesta = await this.generarRespuestaConDocumentos(pregunta, resultados, userInfo);
      return {
        pregunta,
        documentosEncontrados: resultados.length,
        respuesta,
        fuentes: resultados.map(r => ({ fileName: r.fileName, score: r.score }))
      };
    } catch (e) {
      return { error: e.message };
    }
  }

  // ===================== Procesamiento principal =====================

  async procesarMensaje(mensaje, historial = [], userToken = null, userInfo = null, conversationId = null) {
    try {
      if (!this.openaiAvailable) return this.createUnavailableResponse();
      if (!this.initialized) {
        this.initializeAzureOpenAI();
        if (!this.openaiAvailable) return this.createUnavailableResponse();
      }

      const userId = userInfo?.usuario || 'unknown';
      console.log(`📝 [${userId}] Procesando: "${(mensaje || '').slice(0, 80)}..."`);

      // 1) ¿Se requiere RAG?
      let resultadosRAG = null;
      if (this.needsDocumentSearch(mensaje) && documentService?.isAvailable?.()) {
        try {
          resultadosRAG = await documentService.buscarDocumentosRaw(mensaje, userId, {
            k: 6,
            kNeighbors: 15,
            maxPerFile: 2
          });
        } catch (e) {
          console.warn('⚠️ Búsqueda RAW falló, sigo sin RAG:', e.message);
        }
      }

      // 2) Con RAG
      if (Array.isArray(resultadosRAG) && resultadosRAG.length > 0) {
        const respuestaConcreta = await this.generarRespuestaConDocumentos(mensaje, resultadosRAG, userInfo);
        return {
          type: 'text',
          content: respuestaConcreta,
          metadata: {
            formatUsed: 'rag-synthesis',
            modelUsed: this.deploymentName,
            azureDeployment: this.deploymentName,
            apiVersion: this.apiVersion,
            docChunks: resultadosRAG.map(r => ({ fileName: r.fileName, folder: r.folder, score: r.score })),
            documentSearchUsed: true
          }
        };
      }

      // 3) Sin RAG → conversación/herramientas
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
          azureDeployment: this.deploymentName,
          apiVersion: this.apiVersion,
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
          azureDeployment: this.deploymentName,
          apiVersion: this.apiVersion,
          usage: response.usage
        }
      };
    } catch (error) {
      console.error('❌ Error en procesarMensaje:', error);
      return this.manejarErrorOpenAI(error, userInfo);
    }
  }

  // ===================== Helpers conversación / herramientas =====================

  needsDocumentSearch(mensaje) {
    const m = (mensaje || '').toLowerCase();
    const kws = [
      'endpoint', 'api', 'rest', 'validasocio', 'valida socio', 'autenticacion', 'autenticación',
      'login', 'inicio sesion', 'inicio de sesión', 'version', 'versión', 'v1.1', 'documentacion',
      'documentación', 'especificacion', 'especificación', 'procedimiento', 'política', 'politica',
      'lineamiento', 'protocolo', 'guía', 'guia', 'manual', 'validacion', 'validación', 'control',
      'verificacion', 'verificación', 'requisito', 'parametro', 'parámetro', 'propósito', 'proposito',
      'para qué sirve', 'para que sirve', 'referencia', 'información técnica', 'especificaciones técnicas'
    ];
    return kws.some(k => m.includes(k));
  }

  formatearHistorialTradicional(historial, userInfo, documentContext = '') {
    const fechaActual = DateTime.now().setZone('America/Mexico_City');
    const userContext = userInfo
      ? `Usuario autenticado: ${userInfo.nombre} (${userInfo.usuario})`
      : 'Usuario no autenticado';

    const systemContent = `
Tu nombre es Nova-AI, asistente virtual de Nova.
- Responde solo en español.
- Usa el historial como referencia.
- Si una parte no proviene de docs internos, indícalo: **Esta información no proviene de los documentos internos de Nova**.
- Sé claro, útil, y estructurado con markdown.
- Si no conoces la respuesta, dilo.
- Prioriza precisión sobre creatividad.

🔷 Contexto: ${userContext}
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
        const parametros = JSON.parse(args || '{}');
        const resultado = await this.ejecutarHerramienta(name, parametros, userToken, userInfo, conversationId);
        resultados.push({
          tool_call_id: id,
          content: typeof resultado === 'object' ? JSON.stringify(resultado, null, 2) : String(resultado)
        });
      } catch (error) {
        resultados.push({ tool_call_id: id, content: `Error ejecutando ${name}: ${error.message}` });
      }
    }

    const finalMessages = [
      ...mensajesPrevios,
      messageResponse,
      ...resultados.map(r => ({ role: 'tool', tool_call_id: r.tool_call_id, content: r.content }))
    ];

    const finalResponse = await this.openai.chat.completions.create({
      model: this.deploymentName,
      messages: finalMessages,
      temperature: 0.7,
      max_completion_tokens: 2000
    });

    return {
      type: 'text',
      content: finalResponse.choices?.[0]?.message?.content || 'No se pudo generar respuesta final'
    };
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
        return await this.consultarSaldoUsuario(
          userToken,
          userInfo,
          parametros.tipo_sistema || '',
          parametros.incluir_detalles !== false
        );
      case 'generar_resumen_conversacion':
        return await this.generarResumenConversacion(
          conversationId,
          userInfo,
          parametros.incluir_estadisticas,
          parametros.usar_formato_openai
        );
      case 'consultar_api_nova':
        return await this.consultarApiNova(
          parametros.endpoint,
          userToken,
          parametros.metodo || 'GET',
          parametros.parametros
        );
      case 'analizar_conversacion_openai':
        return await this.analizarConversacionOpenAI(
          conversationId,
          userInfo,
          parametros.tipo_analisis,
          parametros.incluir_sistema
        );
      case 'buscar_documentos_nova':
        if (!documentService?.isAvailable?.()) return '❌ Document Service no disponible';
        return await documentService.buscarDocumentos(parametros.consulta, parametros.tipo_busqueda || 'general');
      default:
        throw new Error(`Herramienta desconocida: ${nombre}`);
    }
  }

  // ===================== Herramientas negocio =====================

  async consultarSaldoUsuario(userToken, userInfo, tipoSist = '', incluirDetalles = true) {
    try {
      if (!userToken || !userInfo) return '❌ **Error**: Usuario no autenticado para consultar saldo';
      const cveUsuario = userInfo.usuario;
      const requestBody = {
        usuarioActual: { CveUsuario: cveUsuario },
        data: { NumSocio: cveUsuario, TipoSist: tipoSist }
      };
      const url =
        process.env.NOVA_API_URL_SALDO ||
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
        return this.formatearSaldoUsuario(response.data, userInfo, incluirDetalles);
      }
      return `⚠️ **Respuesta inesperada al consultar saldo**: Status ${response.status}`;
    } catch (error) {
      if (error.response?.status === 401) return '🔒 **Autorización**: token expirado.';
      if (error.response?.status === 404) return '❌ **Servicio no encontrado** para saldos.';
      if (error.response?.status === 400) return '❌ **Datos inválidos** en la consulta de saldos.';
      return `❌ **Error consultando saldo**: ${error.message}`;
    }
  }

  formatearSaldoUsuario(saldoData, userInfo, incluirDetalles = true) {
    const hoyMX = new Date().toLocaleDateString('es-MX');
    const horaMX = new Date().toLocaleTimeString('es-MX');

    let resultado = `💳 **CONSULTA DE SALDO - NOVA CORPORATION**\n\n`;
    resultado += `👤 **Usuario**: ${userInfo.nombre || userInfo.usuario}\n`;
    resultado += `🆔 **Número de Socio**: ${userInfo.usuario}\n`;
    resultado += `📅 **Consulta**: ${hoyMX} ${horaMX}\n\n`;

    let saldos = [];
    if (Array.isArray(saldoData?.info)) saldos = saldoData.info;
    else if (Array.isArray(saldoData?.data)) saldos = saldoData.data;
    else if (Array.isArray(saldoData?.saldos)) saldos = saldoData.saldos;
    else if (Array.isArray(saldoData)) saldos = saldoData;

    if (!saldos.length) {
      resultado += `⚠️ **Sin información de saldo disponible**\n`;
      return resultado;
    }

    let totalDisponible = 0;
    let totalRetenido = 0;
    saldos.forEach(cuenta => {
      const disp = parseFloat(cuenta.saldoDisponible ?? cuenta.disponible ?? cuenta.SaldoDisponible ?? 0);
      const ret = parseFloat(cuenta.saldoRetenido ?? cuenta.retenido ?? cuenta.SaldoRetenido ?? 0);
      totalDisponible += disp;
      totalRetenido += ret;
    });
    const totalGeneral = totalDisponible + totalRetenido;

    resultado += `📊 **RESUMEN DE SALDOS**\n`;
    resultado += `💰 **Total Disponible**: $${totalDisponible.toLocaleString('es-MX', { minimumFractionDigits: 2 })}\n`;
    resultado += `🔒 **Total Retenido**: $${totalRetenido.toLocaleString('es-MX', { minimumFractionDigits: 2 })}\n`;
    resultado += `💎 **Total General**: $${totalGeneral.toLocaleString('es-MX', { minimumFractionDigits: 2 })}\n\n`;

    if (incluirDetalles) {
      resultado += `📋 **DETALLE POR CUENTA**\n\n`;
      saldos.forEach((cuenta, i) => {
        const tipo = cuenta.tipoCuenta ?? cuenta.tipo ?? cuenta.TipoCuenta ?? `Cuenta ${i + 1}`;
        const disp = parseFloat(cuenta.saldoDisponible ?? cuenta.disponible ?? cuenta.SaldoDisponible ?? 0);
        const ret = parseFloat(cuenta.saldoRetenido ?? cuenta.retenido ?? cuenta.SaldoRetenido ?? 0);
        const tot = disp + ret;
        resultado += `🏦 **${tipo}**\n`;
        resultado += `   💰 Disponible: $${disp.toLocaleString('es-MX', { minimumFractionDigits: 2 })}\n`;
        resultado += `   🔒 Retenido: $${ret.toLocaleString('es-MX', { minimumFractionDigits: 2 })}\n`;
        resultado += `   💎 Total: $${tot.toLocaleString('es-MX', { minimumFractionDigits: 2 })}\n\n`;
      });
      resultado += `💡 **Saldo Disponible** = uso inmediato; **Retenido** = fondos con restricción temporal.\n`;
    }
    return resultado;
  }

  async consultarTasasInteres(anio, userToken, userInfo) {
    try {
      if (!userToken || !userInfo) return '❌ **Error**: Usuario no autenticado para consultar tasas';
      const cveUsuario = userInfo.usuario;
      const numRI = this.extractNumRIFromToken(userToken) || '7';

      const requestBody = {
        usuarioActual: { CveUsuario: cveUsuario },
        data: { NumRI: numRI, Anio: anio }
      };
      const url =
        process.env.NOVA_API_URL_TASA ||
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
        return this.formatearTablaTasas(response.data.info, anio, cveUsuario);
      }
      return `⚠️ **Respuesta inesperada al consultar tasas**: Status ${response.status}`;
    } catch (error) {
      if (error.response?.status === 401) return '🔒 **Autorización**: token expirado.';
      if (error.response?.status === 404) return '❌ **Servicio no encontrado** para tasas.';
      if (error.response?.status === 400) return `❌ **Datos inválidos**: año ${anio} inválido.`;
      return `❌ **Error consultando tasas**: ${error.message}`;
    }
  }

  extractNumRIFromToken(token) {
    try {
      if (!token) return null;
      const clean = token.replace(/^Bearer\s+/, '');
      const parts = clean.split('.');
      if (parts.length !== 3) return null;
      const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString());

      const keys = [
        'NumRI',
        'numRI',
        'numri',
        'http://schemas.xmlsoap.org/ws/2005/05/identity/claims/nameidentifier',
        'sub',
        'user_id',
        'employee_id'
      ];
      for (const key of keys) {
        if (payload[key]) {
          const n = parseInt(payload[key]);
          if (!isNaN(n)) return n;
        }
      }
      const candidate =
        payload['http://schemas.xmlsoap.org/ws/2005/05/identity/claims/name'] ||
        payload.name ||
        payload.preferred_username;
      if (candidate) {
        const n = parseInt(candidate);
        if (!isNaN(n)) return n;
      }
      return null;
    } catch {
      return null;
    }
  }

  formatearTablaTasas(tasasData, anio, usuario) {
    try {
      if (!Array.isArray(tasasData) || !tasasData.length) return '❌ **Error**: Datos de tasas vacíos';
      const hoyMX = new Date().toLocaleDateString('es-MX');
      const norm = s =>
        (s ?? '')
          .toString()
          .toLowerCase()
          .normalize('NFD')
          .replace(/[\u0300-\u036f]/g, '')
          .trim();
      const monthIdx = {
        enero: 1,
        febrero: 2,
        marzo: 3,
        abril: 4,
        mayo: 5,
        junio: 6,
        julio: 7,
        agosto: 8,
        septiembre: 9,
        setiembre: 9,
        octubre: 10,
        noviembre: 11,
        diciembre: 12
      };
      const pct = v => {
        if (v === undefined || v === null || v === '') return '—';
        const n = Number(v);
        return Number.isFinite(n) ? `${n}%` : String(v);
      };
      const filas = [...tasasData]
        .sort((a, b) => (monthIdx[norm(a.Mes)] ?? 99) - (monthIdx[norm(b.Mes)] ?? 99))
        .map(m => ({
          Mes: (m.Mes || '').toString(),
          Vista: pct(m.vista),
          Fijo1m: pct(m.fijo1),
          Fijo3m: pct(m.fijo3),
          Fijo6m: pct(m.fijo6),
          FAP: pct(m.FAP),
          Nov: pct(m.Nov),
          Prestamos: pct(m.Prestamos)
        }));

      const headers = ['Mes', 'Vista', 'Fijo 1m', 'Fijo 3m', 'Fijo 6m', 'FAP', 'Nov', 'Préstamos'];
      const allRows = [headers, ...filas.map(f => [f.Mes, f.Vista, f.Fijo1m, f.Fijo3m, f.Fijo6m, f.FAP, f.Nov, f.Prestamos])];
      const widths = headers.map((_, i) => Math.max(...allRows.map(r => (r[i] ?? '').toString().length)));
      const pad = (txt, i) => (txt ?? '').toString().padEnd(widths[i], ' ');
      const sep = ' | ';
      const headerLine = headers.map((h, i) => pad(h, i)).join(sep);
      const divider = widths.map(w => ''.padEnd(w, '─')).join('─┼─');
      const bodyLines = filas
        .map(r => [r.Mes, r.Vista, r.Fijo1m, r.Fijo3m, r.Fijo6m, r.FAP, r.Nov, r.Prestamos].map((c, i) => pad(c, i)).join(sep))
        .join('\n');

      let out = `💰 **TASAS DE INTERÉS NOVA CORPORATION ${anio}**\n\n`;
      out += `👤 **Usuario**: ${usuario}   📅 **Año**: ${anio}   🕐 **Actualizado**: ${hoyMX}\n\n`;
      out += `📊 **Detalle mes por mes**\n`;
      out += '```text\n' + headerLine + '\n' + divider + '\n' + bodyLines + '\n```\n';
      out += `\nLeyenda: **—** sin dato.\n`;
      return out;
    } catch (e) {
      return `❌ **Error formateando tasas**: ${e.message}`;
    }
  }

  async consultarApiNova(endpoint, userToken, metodo = 'GET', parametros = {}) {
    try {
      if (!userToken) return '❌ Token requerido para consultar API Nova';
      const baseUrl = 'https://pruebas.nova.com.mx/ApiRestNova/api';
      const url = endpoint.startsWith('http') ? endpoint : `${baseUrl}/${endpoint.replace(/^\//, '')}`;
      const config = {
        method: metodo,
        url,
        headers: {
          Authorization: `Bearer ${userToken}`,
          'Content-Type': 'application/json',
          Accept: 'application/json'
        },
        timeout: 15000
      };
      if (metodo === 'POST' && parametros) config.data = parametros;
      if (metodo === 'GET' && parametros) config.params = parametros;

      const response = await axios(config);
      if (response.status === 200) {
        return { success: true, data: response.data, status: response.status, message: 'Consulta exitosa' };
      }
      return { success: false, status: response.status, message: `Respuesta inesperada: ${response.status}` };
    } catch (error) {
      if (error.response) {
        return {
          success: false,
          status: error.response.status,
          message: `Error ${error.response.status}: ${error.response.data?.message || 'Error del servidor'}`,
          data: error.response.data
        };
      }
      return { success: false, message: `Error de conexión: ${error.message}` };
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
    info += `📝 **Nombre**: ${userInfo.nombre}\n`;
    info += `👤 **Usuario**: ${userInfo.usuario}\n`;
    info += `🏢 **Apellido Paterno**: ${userInfo.paterno || 'N/A'}\n`;
    info += `🏢 **Apellido Materno**: ${userInfo.materno || 'N/A'}\n`;
    if (incluirToken && userInfo.token) {
      info += `🔑 **Token**: ${userInfo.token.substring(0, 50)}...\n`;
      info += `📊 **Token válido**: ${userInfo.token.length > 100 ? 'Sí' : 'Posible no'}\n`;
    }
    info += `\n💡 Datos extraídos del token de autenticación de Nova.`;
    return info;
  }

  async analizarConversacionOpenAI(conversationId, userInfo, tipoAnalisis, incluirSistema = true) {
    try {
      if (!cosmosService?.isAvailable?.() || !conversationId) {
        return '❌ **Error**: Análisis no disponible (Cosmos/conversación requerida).';
      }
      const conversacion = await cosmosService.getConversationForOpenAI(conversationId, userInfo?.usuario || 'unknown', incluirSistema);
      if (!conversacion?.length) return '❌ **No hay conversación en formato OpenAI para analizar**';

      const prompt = this.crearPromptAnalisis(tipoAnalisis, conversacion, userInfo);
      const analisisResponse = await this.openai.chat.completions.create({
        model: this.deploymentName,
        messages: [
          { role: 'system', content: 'Eres un analista experto en conversaciones corporativas.' },
          { role: 'user', content: prompt }
        ],
        temperature: 0.3,
        max_completion_tokens: 2000
      });

      const analisis = analisisResponse.choices?.[0]?.message?.content || 'No se pudo generar el análisis.';
      let resultado = `🔍 **Análisis de Conversación: ${tipoAnalisis.toUpperCase()}**\n\n`;
      resultado += `👤 **Usuario**: ${userInfo?.nombre || 'Usuario'} (${userInfo?.usuario || 'N/A'})\n`;
      resultado += `📊 **Mensajes analizados**: ${conversacion.length}\n`;
      resultado += `🤖 **Formato**: OpenAI Chat API\n`;
      resultado += `📅 **Generado**: ${new Date().toLocaleString('es-MX')}\n\n`;
      resultado += `**Resultado del análisis:**\n\n${analisis}`;
      return resultado;
    } catch (error) {
      return `❌ **Error en análisis**: ${error.message}`;
    }
  }

  crearPromptAnalisis(tipoAnalisis, conversacion, userInfo) {
    const conv = JSON.stringify(conversacion, null, 2);
    const prompts = {
      resumen: `Analiza la conversación y proporciona un resumen ejecutivo:\n\n${conv}\n\nIncluye: temas, conclusiones, acciones pendientes y puntos clave.`,
      sentimientos: `Analiza sentimientos y tono:\n\n${conv}\n\nIncluye: tono, satisfacción, fricciones, engagement y recomendaciones.`,
      temas: `Identifica y categoriza temas:\n\n${conv}\n\nIncluye: temas principales, subtemas, frecuencia y relaciones.`,
      patrones: `Analiza patrones de comunicación:\n\n${conv}\n\nIncluye: patrones de preguntas/respuestas, flujo, clarificaciones y mejoras.`,
      recomendaciones: `Recomendaciones estratégicas basadas en la conversación:\n\n${conv}\n\nIncluye: productos/servicios, seguimiento, cross-sell y mejoras.`
    };
    return prompts[tipoAnalisis] || prompts.resumen;
  }

  async generarResumenConversacion(conversationId, userInfo, incluirEstadisticas = true, usarFormatoOpenAI = true) {
    try {
      if (!conversationId || !userInfo) return '⚠️ No hay conversación activa para generar resumen';
      const fecha = DateTime.now().setZone('America/Mexico_City').toFormat('dd/MM/yyyy HH:mm');

      let resumen = `📊 **Resumen de Conversación**\n\n`;
      resumen += `👤 **Usuario**: ${userInfo.nombre} (${userInfo.usuario})\n`;
      resumen += `📅 **Fecha**: ${fecha}\n`;

      if (usarFormatoOpenAI && cosmosService?.isAvailable?.()) {
        const conversacion = await cosmosService.getConversationMessages(conversationId, userInfo.usuario);
        if (conversacion?.length) {
          resumen += `🤖 **Formato**: OpenAI Chat API (${conversacion.length} mensajes)\n`;
          if (incluirEstadisticas) {
            const stats = this.calcularEstadisticasConversacion(conversacion);
            resumen += `📊 **Estadísticas**: system=${stats.system}, user=${stats.user}, assistant=${stats.assistant}, avgWords=${stats.avgWords}\n`;
          }
          const detalle = await this.analizarConversacionOpenAI(conversationId, userInfo, 'resumen', false);
          resumen += `\n**Resumen inteligente**:\n${detalle}`;
          return resumen;
        }
      }

      if (incluirEstadisticas) {
        resumen += `💾 **Persistencia**: ${cosmosService?.isAvailable?.() ? 'Cosmos DB' : 'Solo memoria'}\n`;
        resumen += `🤖 **IA**: ${this.deploymentName}\n`;
      }
      resumen += `\n💡 Para ver historial: escribe "historial".`;
      return resumen;
    } catch (e) {
      return `❌ Error generando resumen: ${e.message}`;
    }
  }

  calcularEstadisticasConversacion(conversacion) {
    const stats = { system: 0, user: 0, assistant: 0, totalWords: 0, avgWords: 0 };
    conversacion.forEach(msg => {
      if (stats[msg.role] !== undefined) stats[msg.role]++;
      const words = (msg.content || '').split(/\s+/).filter(Boolean).length;
      stats.totalWords += words;
    });
    stats.avgWords = conversacion.length ? Math.round(stats.totalWords / conversacion.length) : 0;
    return stats;
  }

  // ===================== Miscelánea =====================

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
