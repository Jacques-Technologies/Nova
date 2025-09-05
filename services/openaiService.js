// services/openaiService.js - VERSIÓN SIMPLIFICADA Y FUNCIONAL
const { OpenAI } = require('openai');
const { DateTime } = require('luxon');
const axios = require('axios');
const cosmosService = require('./cosmosService');
const documentService = require('./documentService');
require('dotenv').config();

class AzureOpenAIService {
  constructor() {
    this.initialized = false;
    this.openaiAvailable = false;
    this.tools = this.defineTools();
    
    console.log('Inicializando Azure OpenAI Service...');
    this.initializeAzureOpenAI();
  }

  initializeAzureOpenAI() {
    try {
      const apiKey = process.env.OPENAI_API_KEY;
      const endpoint = process.env.OPENAI_ENDPOINT;
      const deploymentName = process.env.OPENAI_DEPLOYMENT || 'gpt-5-mini';
      const apiVersion = process.env.OPENAI_API_VERSION || '2024-12-01-preview';

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
        timeout: 45000
      });

      this.deploymentName = deploymentName;
      this.openaiAvailable = true;
      this.initialized = true;

      console.log('Azure OpenAI configurado correctamente');
    } catch (error) {
      console.error('Error inicializando Azure OpenAI:', error.message);
      this.openaiAvailable = false;
      this.initialized = false;
    }
  }

  // MÉTODO PRINCIPAL SIMPLIFICADO
  async procesarMensaje(mensaje, historial = [], userToken = null, userInfo = null, conversationId = null) {
    try {
      if (!this.openaiAvailable) {
        return {
          type: 'text',
          content: 'Azure OpenAI no está disponible. Verifica la configuración.'
        };
      }

      const userId = userInfo?.usuario || 'unknown';
      console.log(`[${userId}] Procesando mensaje: "${mensaje}"`);

      // Preparar mensajes para OpenAI
      const messages = await this.prepararMensajes(mensaje, historial, userInfo, conversationId);

      // Configuración de la petición
      const requestConfig = {
        model: this.deploymentName,
        messages: messages,
        temperature: 1.0,
        max_completion_tokens: 3000,
        tools: this.tools,
        tool_choice: 'auto'
      };

      // Llamada a OpenAI
      const response = await this.openai.chat.completions.create(requestConfig);
      const messageResponse = response.choices?.[0]?.message;

      if (!messageResponse) {
        throw new Error('Respuesta vacía de Azure OpenAI');
      }

      // Si hay tool_calls, procesarlos
      if (messageResponse.tool_calls) {
        return await this.procesarHerramientas(
          messageResponse, 
          messages, 
          userToken, 
          userInfo, 
          conversationId
        );
      }

      // Respuesta directa
      return {
        type: 'text',
        content: messageResponse.content || 'Respuesta vacía',
        metadata: {
          usage: response.usage
        }
      };

    } catch (error) {
      console.error(`Error procesando mensaje:`, error);
      return {
        type: 'text',
        content: `Error: ${error.message}`
      };
    }
  }

  // PREPARAR MENSAJES
  async prepararMensajes(mensaje, historial, userInfo, conversationId) {
    let messages = [];

    // System message
    const fechaActual = DateTime.now().setZone('America/Mexico_City');
    const userContext = userInfo?.nombre 
      ? `Usuario: ${userInfo.nombre} (${userInfo.usuario})`
      : 'Usuario no identificado';

    const systemContent = `Eres Nova-AI, asistente especializado de Nova Corporation.

CONTEXTO:
• ${userContext}
• Fecha/Hora: ${fechaActual.toFormat('dd/MM/yyyy HH:mm:ss')} (${fechaActual.zoneName})

INSTRUCCIONES:
• Responde SIEMPRE en español
• Sé profesional, preciso y útil
• Para información técnica de APIs/documentación, usa la herramienta buscar_documentos_nova
• Para consultas de saldo, usa consultar_saldo_usuario
• Para tasas de interés, usa consultar_tasas_interes
• Si no tienes información específica, indícalo claramente
• NO inventes información que no esté en los documentos`;

    messages.push({ role: 'system', content: systemContent });

    // Historial de Cosmos DB si está disponible
    if (cosmosService?.isAvailable?.() && conversationId && userInfo?.usuario) {
      try {
        const conversacionCosmos = await cosmosService.getConversationForOpenAI(
          conversationId, 
          userInfo.usuario
        );
        if (conversacionCosmos?.length > 0) {
          // Tomar solo las últimas 10 interacciones para no saturar
          const recentMessages = conversacionCosmos.slice(-20);
          messages.push(...recentMessages);
        }
      } catch (error) {
        console.warn(`Error obteniendo historial Cosmos: ${error.message}`);
      }
    }

    // Historial tradicional como fallback
    if (Array.isArray(historial) && historial.length > 0) {
      const recentHistory = historial.slice(-10);
      recentHistory.forEach(item => {
        if (item?.content?.trim() && item.role) {
          messages.push({ 
            role: item.role, 
            content: item.content.trim() 
          });
        }
      });
    }

    // Mensaje actual del usuario
    messages.push({ 
      role: 'user', 
      content: mensaje.trim()
    });

    return messages;
  }

  // DEFINIR HERRAMIENTAS
  defineTools() {
    return [
      {
        type: 'function',
        function: {
          name: 'buscar_documentos_nova',
          description: 'Busca información específica en documentación interna de Nova Corporation (APIs, políticas, procedimientos)',
          parameters: {
            type: 'object',
            properties: {
              consulta: { 
                type: 'string', 
                description: 'Término específico a buscar en la documentación' 
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
          description: 'Obtiene fecha y hora actual en zona México',
          parameters: {
            type: 'object',
            properties: {
              formato: { 
                type: 'string', 
                enum: ['completo', 'fecha', 'hora'], 
                default: 'completo' 
              }
            }
          }
        }
      },
      {
        type: 'function',
        function: {
          name: 'obtener_informacion_usuario',
          description: 'Obtiene información del perfil del usuario autenticado',
          parameters: {
            type: 'object',
            properties: {}
          }
        }
      },
      {
        type: 'function',
        function: {
          name: 'consultar_tasas_interes',
          description: 'Consulta tasas de interés mensuales de Nova Corporation',
          parameters: {
            type: 'object',
            properties: {
              anio: { 
                type: 'integer', 
                minimum: 2020, 
                maximum: 2030,
                description: 'Año para consultar las tasas' 
              }
            },
            required: ['anio']
          }
        }
      },
      {
        type: 'function',
        function: {
          name: 'consultar_saldo_usuario',
          description: 'Consulta saldos del usuario. Requiere autenticación.',
          parameters: {
            type: 'object',
            properties: {}
          }
        }
      }
    ];
  }

  // PROCESAR HERRAMIENTAS
  async procesarHerramientas(messageResponse, mensajesPrevios, userToken, userInfo, conversationId) {
    const userId = userInfo?.usuario || 'unknown';
    const resultados = [];

    console.log(`[${userId}] Procesando ${messageResponse.tool_calls.length} herramienta(s)`);

    // Ejecutar cada tool call
    for (const call of messageResponse.tool_calls) {
      const { function: fnCall, id } = call;
      const { name, arguments: args } = fnCall;
      
      try {
        console.log(`[${userId}] Ejecutando: ${name}`);
        const parametros = JSON.parse(args || '{}');
        
        const resultado = await this.ejecutarHerramienta(
          name, 
          parametros, 
          userToken, 
          userInfo, 
          conversationId
        );
        
        resultados.push({
          tool_call_id: id,
          content: typeof resultado === 'object' ? JSON.stringify(resultado, null, 2) : String(resultado)
        });

        console.log(`[${userId}] ${name} ejecutado exitosamente`);
        
      } catch (error) {
        console.error(`[${userId}] Error ejecutando ${name}:`, error.message);
        resultados.push({
          tool_call_id: id,
          content: `Error ejecutando ${name}: ${error.message}`
        });
      }
    }

    // Construir mensajes finales para OpenAI
    const finalMessages = [
      ...mensajesPrevios,
      messageResponse,
      ...resultados.map(r => ({ 
        role: 'tool', 
        tool_call_id: r.tool_call_id, 
        content: r.content 
      }))
    ];

    // Llamada final a OpenAI para generar respuesta
    const finalResponse = await this.openai.chat.completions.create({
      model: this.deploymentName,
      messages: finalMessages,
      temperature: 1.0,
      max_completion_tokens: 3500
    });

    return {
      type: 'text',
      content: finalResponse.choices?.[0]?.message?.content || 'No se pudo generar respuesta final',
      metadata: {
        toolsUsed: messageResponse.tool_calls.map(tc => tc.function.name),
        usage: finalResponse.usage
      }
    };
  }

  // EJECUTAR HERRAMIENTA INDIVIDUAL
  async ejecutarHerramienta(nombre, parametros, userToken, userInfo, conversationId) {
    switch (nombre) {
      case 'obtener_fecha_hora_actual':
        return this.obtenerFechaHora(parametros.formato || 'completo');

      case 'obtener_informacion_usuario':
        return this.obtenerInfoUsuario(userInfo);

      case 'consultar_tasas_interes':
        return await this.consultarTasasInteres(parametros.anio, userToken, userInfo);

      case 'consultar_saldo_usuario':
        return await this.consultarSaldoUsuario(userToken, userInfo);

      case 'buscar_documentos_nova':
        return await this.buscarDocumentosNova(parametros.consulta, userInfo);

      default:
        throw new Error(`Herramienta desconocida: ${nombre}`);
    }
  }

  // IMPLEMENTACIÓN DE HERRAMIENTAS

  obtenerFechaHora(formato = 'completo') {
    const ahora = DateTime.now().setZone('America/Mexico_City');
    switch (formato) {
      case 'fecha': 
        return `Fecha: ${ahora.toFormat('dd/MM/yyyy')}`;
      case 'hora': 
        return `Hora: ${ahora.toFormat('HH:mm:ss')}`;
      default:
        return `Fecha y hora actual: ${ahora.toFormat('dd/MM/yyyy HH:mm:ss')} (${ahora.zoneName})`;
    }
  }

  obtenerInfoUsuario(userInfo) {
    if (!userInfo) {
      return 'No hay información de usuario disponible';
    }
    
    let info = 'Información del usuario:\n';
    if (userInfo.nombre) info += `- Nombre: ${userInfo.nombre}\n`;
    if (userInfo.usuario) info += `- Usuario/Socio: ${userInfo.usuario}\n`;
    if (userInfo.paterno) info += `- Apellido paterno: ${userInfo.paterno}\n`;
    if (userInfo.materno) info += `- Apellido materno: ${userInfo.materno}\n`;
    
    const tieneToken = !!(userInfo.token && userInfo.token.length > 50);
    info += `- Estado: ${tieneToken ? 'Autenticado' : 'Sin autenticar'}`;
    
    return info;
  }

  async consultarTasasInteres(anio, userToken, userInfo) {
    try {
      if (!userToken || !userInfo) {
        return 'Error: Autenticación requerida para consultar tasas de interés';
      }
      
      const cveUsuario = userInfo.usuario;
      const numRI = this.extractNumRIFromToken(userToken) || '7';

      const requestBody = { 
        usuarioActual: { CveUsuario: cveUsuario }, 
        data: { NumRI: numRI, Anio: anio } 
      };
      
      const url = process.env.NOVA_API_URL_TASA || 'https://pruebas.nova.com.mx/ApiRestNova/api/ConsultaTasa/consultaTasa';

      const response = await axios.post(url, requestBody, {
        headers: { 
          'Content-Type': 'application/json', 
          Authorization: `Bearer ${userToken}`,
          Accept: 'application/json' 
        },
        timeout: 15000
      });

      if (response.status === 200 && response.data?.info) {
        return this.formatearTasas(response.data.info, anio);
      } else {
        return `Sin datos de tasas para el año ${anio}`;
      }
    } catch (error) {
      console.error(`Error consultando tasas ${anio}:`, error.message);
      if (error.response?.status === 401) {
        return 'Error: Token expirado. Inicia sesión nuevamente.';
      }
      return `Error consultando tasas: ${error.message}`;
    }
  }

  formatearTasas(tasasData, anio) {
  if (!Array.isArray(tasasData) || !tasasData.length) {
    return 'No hay datos de tasas disponibles';
  }

  // Mapear nombres de meses
  const meses = {
    '1': 'Ene', '2': 'Feb', '3': 'Mar', '4': 'Abr',
    '5': 'May', '6': 'Jun', '7': 'Jul', '8': 'Ago',
    '9': 'Sep', '10': 'Oct', '11': 'Nov', '12': 'Dic'
  };

  let respuesta = `## 📊 TASAS DE INTERÉS NOVA CORPORATION ${anio}\n\n`;
  
  // Crear tabla principal
  respuesta += '| **Mes** | **Vista** | **Fijo 1M** | **Fijo 3M** | **Fijo 6M** | **FAP** | **Nov** | **Préstamos** |\n';
  respuesta += '|---------|-----------|-------------|-------------|-------------|---------|---------|---------------|\n';
  
  // Ordenar datos por mes
  const datosOrdenados = tasasData.sort((a, b) => {
    const mesA = parseInt(a.Mes || '0');
    const mesB = parseInt(b.Mes || '0');
    return mesA - mesB;
  });

  // Llenar filas de la tabla
  datosOrdenados.forEach(item => {
    const numeroMes = (item.Mes || '').toString();
    const nombreMes = meses[numeroMes] || `Mes ${numeroMes}`;
    
    const vista = item.vista ? `${item.vista}%` : '-';
    const fijo1 = item.fijo1 ? `${item.fijo1}%` : '-';
    const fijo3 = item.fijo3 ? `${item.fijo3}%` : '-';
    const fijo6 = item.fijo6 ? `${item.fijo6}%` : '-';
    const fap = item.FAP ? `${item.FAP}%` : '-';
    const nov = item.Nov ? `${item.Nov}%` : '-';
    const prestamos = item.Prestamos ? `${item.Prestamos}%` : '-';
    
    respuesta += `| **${nombreMes}-${anio.toString().slice(-2)}** | ${vista} | ${fijo1} | ${fijo3} | ${fijo6} | ${fap} | ${nov} | ${prestamos} |\n`;
  });

  // Calcular estadísticas
  const estadisticas = this.calcularEstadisticasTasas(tasasData);
  
  respuesta += '\n---\n\n';
  respuesta += '## 📈 RESUMEN ESTADÍSTICO\n\n';
  
  // Tabla de resumen estadístico
  respuesta += '| **Tipo de Tasa** | **Promedio** | **Mínimo** | **Máximo** | **Variación** |\n';
  respuesta += '|------------------|--------------|------------|------------|---------------|\n';
  
  Object.entries(estadisticas).forEach(([tipo, stats]) => {
    const promedio = stats.promedio.toFixed(2) + '%';
    const minimo = stats.minimo.toFixed(2) + '%';
    const maximo = stats.maximo.toFixed(2) + '%';
    const variacion = (stats.maximo - stats.minimo).toFixed(2) + '%';
    
    respuesta += `| **${tipo}** | ${promedio} | ${minimo} | ${maximo} | ${variacion} |\n`;
  });

  // Análisis de tendencias
  const tendencias = this.analizarTendencias(tasasData);
  if (tendencias.length > 0) {
    respuesta += '\n---\n\n';
    respuesta += '## 📊 ANÁLISIS DE TENDENCIAS\n\n';
    tendencias.forEach(tendencia => {
      respuesta += `• **${tendencia.tipo}**: ${tendencia.descripcion}\n`;
    });
  }

  // Información adicional
  respuesta += '\n---\n\n';
  respuesta += '### ℹ️ Información Adicional:\n';
  respuesta += `• **Período consultado**: Enero - Diciembre ${anio}\n`;
  respuesta += `• **Total de meses con datos**: ${tasasData.length}\n`;
  respuesta += `• **Fecha de consulta**: ${new Date().toLocaleDateString('es-MX')}\n`;
  respuesta += '\n💡 *¿Necesitas un análisis específico o exportar estos datos? ¡Solo pregúntame!*';

  return respuesta;
}

// Función auxiliar para calcular estadísticas
calcularEstadisticasTasas(tasasData) {
  const tipos = ['vista', 'fijo1', 'fijo3', 'fijo6', 'FAP', 'Nov', 'Prestamos'];
  const estadisticas = {};
  
  tipos.forEach(tipo => {
    const valores = tasasData
      .map(item => parseFloat(item[tipo]))
      .filter(val => !isNaN(val) && val > 0);
    
    if (valores.length > 0) {
      const tipoNombre = {
        'vista': 'Vista',
        'fijo1': 'Fijo 1M',
        'fijo3': 'Fijo 3M', 
        'fijo6': 'Fijo 6M',
        'FAP': 'FAP',
        'Nov': 'Nov',
        'Prestamos': 'Préstamos'
      }[tipo] || tipo;

      estadisticas[tipoNombre] = {
        promedio: valores.reduce((a, b) => a + b, 0) / valores.length,
        minimo: Math.min(...valores),
        maximo: Math.max(...valores)
      };
    }
  });
  
  return estadisticas;
}

// Función auxiliar para analizar tendencias
analizarTendencias(tasasData) {
  const tendencias = [];
  
  if (tasasData.length < 2) return tendencias;
  
  // Analizar tendencia de tasas más importantes
  const tiposImportantes = ['fijo1', 'fijo3', 'fijo6', 'Prestamos'];
  
  tiposImportantes.forEach(tipo => {
    const valores = tasasData
      .filter(item => item[tipo] && !isNaN(parseFloat(item[tipo])))
      .map(item => parseFloat(item[tipo]));
    
    if (valores.length >= 2) {
      const inicial = valores[0];
      const final = valores[valores.length - 1];
      const diferencia = final - inicial;
      
      const tipoNombre = {
        'fijo1': 'Fijo 1M',
        'fijo3': 'Fijo 3M',
        'fijo6': 'Fijo 6M', 
        'Prestamos': 'Préstamos'
      }[tipo];
      
      if (Math.abs(diferencia) >= 0.1) {
        const direccion = diferencia > 0 ? 'incrementó' : 'disminuyó';
        const descripcion = `${direccion} ${Math.abs(diferencia).toFixed(2)} puntos porcentuales (de ${inicial}% a ${final}%)`;
        
        tendencias.push({
          tipo: tipoNombre,
          descripcion: descripcion
        });
      }
    }
  });
  
  return tendencias;
}

// Función auxiliar para calcular estadísticas
calcularEstadisticasTasas(tasasData) {
  const tipos = ['vista', 'fijo1', 'fijo3', 'fijo6', 'FAP', 'Nov', 'Prestamos'];
  const estadisticas = {};
  
  tipos.forEach(tipo => {
    const valores = tasasData
      .map(item => parseFloat(item[tipo]))
      .filter(val => !isNaN(val) && val > 0);
    
    if (valores.length > 0) {
      const tipoNombre = {
        'vista': 'Vista',
        'fijo1': 'Fijo 1M',
        'fijo3': 'Fijo 3M', 
        'fijo6': 'Fijo 6M',
        'FAP': 'FAP',
        'Nov': 'Nov',
        'Prestamos': 'Préstamos'
      }[tipo] || tipo;

      estadisticas[tipoNombre] = {
        promedio: valores.reduce((a, b) => a + b, 0) / valores.length,
        minimo: Math.min(...valores),
        maximo: Math.max(...valores)
      };
    }
  });
  
  return estadisticas;
}

// Función auxiliar para analizar tendencias
analizarTendencias(tasasData) {
  const tendencias = [];
  
  if (tasasData.length < 2) return tendencias;
  
  // Analizar tendencia de tasas más importantes
  const tiposImportantes = ['fijo1', 'fijo3', 'fijo6', 'Prestamos'];
  
  tiposImportantes.forEach(tipo => {
    const valores = tasasData
      .filter(item => item[tipo] && !isNaN(parseFloat(item[tipo])))
      .map(item => parseFloat(item[tipo]));
    
    if (valores.length >= 2) {
      const inicial = valores[0];
      const final = valores[valores.length - 1];
      const diferencia = final - inicial;
      
      const tipoNombre = {
        'fijo1': 'Fijo 1M',
        'fijo3': 'Fijo 3M',
        'fijo6': 'Fijo 6M', 
        'Prestamos': 'Préstamos'
      }[tipo];
      
      if (Math.abs(diferencia) >= 0.1) {
        const direccion = diferencia > 0 ? 'incrementó' : 'disminuyó';
        const descripcion = `${direccion} ${Math.abs(diferencia).toFixed(2)} puntos porcentuales (de ${inicial}% a ${final}%)`;
        
        tendencias.push({
          tipo: tipoNombre,
          descripcion: descripcion
        });
      }
    }
  });
  
  return tendencias;
}

  async consultarSaldoUsuario(userToken, userInfo) {
    try {
      if (!userToken || !userInfo) {
        return 'Error: Autenticación requerida para consultar saldo';
      }

      const cveUsuario = userInfo.usuario;
      const requestBody = { 
        usuarioActual: { CveUsuario: cveUsuario }, 
        data: { NumSocio: cveUsuario, TipoSist: '' } 
      };
      
      const url = process.env.NOVA_API_URL_SALDO || 'https://pruebas.nova.com.mx/ApiRestNova/api/ConsultaSaldo/ObtSaldo';

      const response = await axios.post(url, requestBody, {
        headers: { 
          'Content-Type': 'application/json', 
          Authorization: `Bearer ${userToken}`,
          Accept: 'application/json' 
        },
        timeout: 15000
      });

      if (response.status === 200 && response.data) {
        return this.formatearSaldo(response.data, userInfo);
      }
      return 'No se pudo obtener información de saldo';

    } catch (error) {
      console.error('Error consultando saldo:', error.message);
      if (error.response?.status === 401) {
        return 'Error: Token expirado. Inicia sesión nuevamente.';
      }
      return `Error consultando saldo: ${error.message}`;
    }
  }

  formatearSaldo(saldoData, userInfo) {
    let resultado = `Consulta de saldo para ${userInfo.nombre || userInfo.usuario}:\n\n`;

    let saldos = [];
    if (Array.isArray(saldoData?.info)) saldos = saldoData.info;
    else if (Array.isArray(saldoData?.data)) saldos = saldoData.data;
    else if (Array.isArray(saldoData)) saldos = saldoData;

    if (!saldos.length) {
      return resultado + 'Sin información de saldo disponible';
    }

    let totalDisponible = 0;
    let totalRetenido = 0;

    saldos.forEach((cuenta, index) => {
      const disp = parseFloat(cuenta.saldoDisponible ?? cuenta.disponible ?? cuenta.SaldoDisponible ?? 0);
      const ret = parseFloat(cuenta.saldoRetenido ?? cuenta.retenido ?? cuenta.SaldoRetenido ?? 0);
      const tipo = cuenta.tipoCuenta ?? cuenta.tipo ?? cuenta.TipoCuenta ?? `Cuenta ${index + 1}`;
      
      totalDisponible += disp;
      totalRetenido += ret;
      
      resultado += `${tipo}:\n`;
      resultado += `  - Disponible: $${disp.toLocaleString('es-MX', { minimumFractionDigits: 2 })}\n`;
      resultado += `  - Retenido: $${ret.toLocaleString('es-MX', { minimumFractionDigits: 2 })}\n`;
      resultado += `  - Total: $${(disp + ret).toLocaleString('es-MX', { minimumFractionDigits: 2 })}\n\n`;
    });

    const totalGeneral = totalDisponible + totalRetenido;
    resultado += `RESUMEN:\n`;
    resultado += `- Total Disponible: $${totalDisponible.toLocaleString('es-MX', { minimumFractionDigits: 2 })}\n`;
    resultado += `- Total Retenido: $${totalRetenido.toLocaleString('es-MX', { minimumFractionDigits: 2 })}\n`;
    resultado += `- TOTAL GENERAL: $${totalGeneral.toLocaleString('es-MX', { minimumFractionDigits: 2 })}`;

    return resultado;
  }

  async buscarDocumentosNova(consulta, userInfo) {
    const userId = userInfo?.usuario || 'unknown';
    
    try {
      if (!documentService?.isAvailable?.()) {
        return 'Servicio de búsqueda de documentos no disponible. Verifica la configuración de Azure Search.';
      }

      console.log(`[${userId}] Buscando en documentos: "${consulta}"`);
      const resultado = await documentService.buscarDocumentos(consulta, userId);
      
      if (!resultado || typeof resultado !== 'string') {
        return 'No se encontró información relevante en los documentos.';
      }
      
      if (resultado.length < 50) {
        return 'No se encontraron documentos relevantes para la consulta.';
      }

      return resultado;

    } catch (error) {
      console.error(`[${userId}] Error buscando documentos:`, error.message);
      return `Error en búsqueda de documentos: ${error.message}`;
    }
  }

  // UTILIDADES

  extractNumRIFromToken(token) {
    try {
      if (!token) return null;
      const clean = token.replace(/^Bearer\s+/, '');
      const parts = clean.split('.');
      if (parts.length !== 3) return null;
      
      const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString());
      
      // Buscar NumRI en varios campos posibles
      const keys = ['NumRI', 'numRI', 'numri', 'sub', 'user_id'];
      for (const key of keys) {
        if (payload[key]) {
          const n = parseInt(payload[key]);
          if (!isNaN(n) && n > 0) return n;
        }
      }
      return 7; // Default
    } catch (error) {
      console.warn('Error extrayendo NumRI del token:', error.message);
      return 7;
    }
  }

  // INFORMACIÓN DEL SERVICIO

  getServiceStats() {
    return {
      available: this.openaiAvailable,
      initialized: this.initialized,
      deployment: this.deploymentName,
      toolsCount: this.tools?.length || 0,
      integrations: {
        documentService: documentService?.isAvailable?.() || false,
        cosmosService: cosmosService?.isAvailable?.() || false
      }
    };
  }

  isAvailable() { 
    return this.openaiAvailable && this.initialized; 
  }

  cleanup() { 
    console.log('OpenAI Service limpiado'); 
  }
}

// Crear instancia singleton
const openaiService = new AzureOpenAIService();
module.exports = openaiService;