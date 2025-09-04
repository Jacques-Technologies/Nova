// services/openaiService.js - VERSIÓN MEJORADA CON INTEGRACIÓN OPTIMIZADA
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
    
    // ✅ NUEVA CONFIGURACIÓN OPTIMIZADA
    this.config = {
      maxConversationTokens: 4000,      // Tokens máximos para conversación
      maxResponseTokens: 3000,          // Tokens máximos para respuesta
      defaultTemperature: 1.0,          // Temperatura por defecto
      technicalTemperature:1.0,        // Para consultas técnicas
      creativeTemperature: 1.0,          // Para tareas creativas
      ragIntegrationTimeout: 15000,     // Timeout para integración RAG
      retryAttempts: 3,                 // Intentos de retry
      ragPriorityKeywords: [            // Keywords que activan RAG con prioridad
        'api', 'endpoint', 'servicio', 'método', 'validasocio', 'autenticacion',
        'procedimiento', 'política', 'documentación', 'manual', 'guía',
        'qué es', 'cómo', 'cuáles', 'para qué', 'explicar'
      ]
    };

    console.log('🚀 Inicializando Azure OpenAI Service v2.0...');
    this.diagnoseConfiguration();
    this.initializeAzureOpenAI();
    this.tools = this.defineEnhancedTools();
    console.log(`✅ OpenAI Service v2.0 inicializado - Disponible: ${this.openaiAvailable}`);
  }

  diagnoseConfiguration() {
    this.serviceConfig = {
      apiKey: process.env.OPENAI_API_KEY,
      endpoint: process.env.OPENAI_ENDPOINT,
      deploymentName: process.env.OPENAI_DEPLOYMENT || 'gpt-5-mini',
      apiVersion: process.env.OPENAI_API_VERSION || '2024-12-01-preview'
    };

    console.log('🔧 Configuración Azure OpenAI:', {
      endpoint: this.serviceConfig.endpoint ? '✅ Configurado' : '❌ Faltante',
      apiKey: this.serviceConfig.apiKey ? '✅ Configurado' : '❌ Faltante',
      deployment: this.serviceConfig.deploymentName,
      version: this.serviceConfig.apiVersion
    });
  }

  initializeAzureOpenAI() {
    try {
      const { apiKey, endpoint, deploymentName, apiVersion } = this.serviceConfig;

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
        maxRetries: this.config.retryAttempts
      });

      this.deploymentName = deploymentName;
      this.apiVersion = apiVersion;
      this.openaiAvailable = true;
      this.initialized = true;

      console.log('✅ Cliente Azure OpenAI configurado exitosamente');
    } catch (error) {
      this.initializationError = `Error inicializando Azure OpenAI: ${error.message}`;
      console.error('❌ Error inicializando Azure OpenAI:', error);
      this.openaiAvailable = false;
      this.initialized = false;
    }
  }

  /**
   * ✅ MÉTODO PRINCIPAL MEJORADO - Procesamiento más inteligente y concreto
   */
  async procesarMensaje(mensaje, historial = [], userToken = null, userInfo = null, conversationId = null) {
    const startTime = Date.now();
    
    try {
      if (!this.openaiAvailable) return this.createUnavailableResponse();
      if (!this.initialized) {
        this.initializeAzureOpenAI();
        if (!this.openaiAvailable) return this.createUnavailableResponse();
      }

      const userId = userInfo?.usuario || 'unknown';
      console.log(`📝 [${userId}] === PROCESANDO MENSAJE v2.0 ===`);
      console.log(`💬 [${userId}] Query: "${(mensaje || '').slice(0, 80)}..."`);

      // 1️⃣ ANÁLISIS INTELIGENTE DEL MENSAJE
      const messageAnalysis = this.analizarMensajeCompleto(mensaje, historial, userInfo);
      console.log(`🧠 [${userId}] Análisis: tipo=${messageAnalysis.type}, estrategia=${messageAnalysis.strategy}`);

      // 2️⃣ DECISIÓN ESTRATÉGICA DE PROCESAMIENTO
      const response = await this.ejecutarEstrategiaOptima(
        mensaje, 
        messageAnalysis, 
        historial, 
        userToken, 
        userInfo, 
        conversationId
      );

      const duration = Date.now() - startTime;
      console.log(`✅ [${userId}] Mensaje procesado en ${duration}ms`);

      // 3️⃣ POSTPROCESAMIENTO Y OPTIMIZACIÓN
      return this.postprocesarRespuesta(response, messageAnalysis, duration);

    } catch (error) {
      console.error('❌ Error en procesarMensaje v2.0:', error);
      return this.manejarErrorInteligente(error, userInfo);
    }
  }

  /**
   * ✅ ANÁLISIS COMPLETO E INTELIGENTE DEL MENSAJE
   */
  analizarMensajeCompleto(mensaje, historial, userInfo) {
    const mensajeLower = (mensaje || '').toLowerCase().trim();
    const palabras = mensajeLower.split(/\s+/);
    
    // Análisis básico
    const analysis = {
      originalLength: mensaje.length,
      wordCount: palabras.length,
      hasQuestion: /^(qué|que|cómo|como|cuál|cual|dónde|donde|cuándo|cuando|por qué|por que|para qué|para que)/.test(mensajeLower),
      isCommand: /^(buscar|consultar|mostrar|listar|obtener|crear|generar)/.test(mensajeLower),
      complexity: this.evaluarComplejidadMensaje(mensaje, historial),
      userContext: this.analizarContextoUsuario(userInfo),
      temporality: this.detectarTemporalidad(mensajeLower)
    };

    // Determinar tipo principal
    analysis.type = this.determinarTipoMensaje(mensajeLower, analysis);
    
    // Determinar estrategia óptima de procesamiento  
    analysis.strategy = this.determinarEstrategiaProcesamiento(analysis, mensajeLower);

    // Detectar necesidad específica de RAG
    analysis.needsRAG = this.evaluarNecesidadRAG(mensajeLower, analysis);
    
    // Determinar configuración de IA óptima
    analysis.aiConfig = this.determinarConfiguracionIA(analysis, mensajeLower);

    return analysis;
  }

  /**
   * ✅ EVALUACIÓN DE COMPLEJIDAD DEL MENSAJE
   */
  evaluarComplejidadMensaje(mensaje, historial) {
    let complexity = 'simple';
    const length = mensaje.length;
    const sentences = mensaje.split(/[.!?]+/).length;
    const historialLength = Array.isArray(historial) ? historial.length : 0;

    if (length > 500 || sentences > 3 || historialLength > 5) {
      complexity = 'complex';
    } else if (length > 200 || sentences > 1 || historialLength > 2) {
      complexity = 'medium';
    }

    return complexity;
  }

  /**
   * ✅ ANÁLISIS DE CONTEXTO DE USUARIO
   */
  analizarContextoUsuario(userInfo) {
    if (!userInfo) return { authenticated: false, priority: 'normal' };
    
    return {
      authenticated: !!(userInfo.usuario && userInfo.token),
      hasFullProfile: !!(userInfo.nombre && userInfo.paterno),
      priority: userInfo.usuario ? 'authenticated' : 'normal',
      canAccessAPIs: !!(userInfo.token && userInfo.usuario)
    };
  }

  /**
   * ✅ DETECTAR TEMPORALIDAD
   */
  detectarTemporalidad(mensajeLower) {
    if (['hoy', 'ahora', 'actual', 'presente', 'fecha', 'hora'].some(t => mensajeLower.includes(t))) {
      return 'immediate';
    }
    if (['ayer', 'mañana', 'próximo', 'siguiente', 'futuro'].some(t => mensajeLower.includes(t))) {
      return 'relative';
    }
    return 'atemporal';
  }

  /**
   * ✅ DETERMINAR TIPO DE MENSAJE
   */
  determinarTipoMensaje(mensajeLower, analysis) {
    // Consultas técnicas/documentales
    if (this.config.ragPriorityKeywords.some(k => mensajeLower.includes(k))) {
      return 'technical_query';
    }
    
    // Servicios financieros
    if (['saldo', 'tasas', 'interes', 'cuenta', 'dinero'].some(k => mensajeLower.includes(k))) {
      return 'financial_service';
    }

    // Información de usuario
    if (['mi información', 'mis datos', 'perfil', 'quien soy'].some(k => mensajeLower.includes(k))) {
      return 'user_info';
    }

    // Fecha y hora
    if (['fecha', 'hora', 'día', 'hoy', 'cuando'].some(k => mensajeLower.includes(k))) {
      return 'datetime_query';
    }

    // Conversación general
    return analysis.hasQuestion ? 'general_question' : 'conversation';
  }

  /**
   * ✅ DETERMINAR ESTRATEGIA DE PROCESAMIENTO
   */
  determinarEstrategiaProcesamiento(analysis, mensajeLower) {
    // RAG tiene máxima prioridad para consultas técnicas
    if (analysis.needsRAG && documentService?.isAvailable?.()) {
      return 'rag_primary';
    }

    // Herramientas para servicios específicos
    if (['saldo', 'tasas', 'fecha', 'mi información'].some(k => mensajeLower.includes(k))) {
      return 'tools_primary';
    }

    // Conversación directa para el resto
    return 'direct_conversation';
  }

  /**
   * ✅ EVALUACIÓN MEJORADA DE NECESIDAD RAG
   */
  evaluarNecesidadRAG(mensajeLower, analysis) {
    // Prioridad alta - Keywords técnicos específicos
    const highPriorityRAG = [
      'validasocio', 'api nova', 'endpoint', 'autenticacion', 'validación',
      'documentación', 'manual', 'procedimiento', 'política'
    ].some(k => mensajeLower.includes(k));

    // Prioridad media - Preguntas exploratorias
    const mediumPriorityRAG = analysis.hasQuestion && [
      'qué es', 'como funciona', 'para qué', 'cuáles son'
    ].some(k => mensajeLower.includes(k));

    // Prioridad baja - Términos generales técnicos
    const lowPriorityRAG = ['servicio', 'sistema', 'nova'].some(k => mensajeLower.includes(k)) 
                         && analysis.wordCount <= 5;

    return highPriorityRAG || mediumPriorityRAG || lowPriorityRAG;
  }

  /**
   * ✅ CONFIGURACIÓN ÓPTIMA DE IA
   */
  determinarConfiguracionIA(analysis, mensajeLower) {
    let temperature = this.config.defaultTemperature;
    let maxTokens = this.config.maxResponseTokens;

    // Consultas técnicas: más precisión
    if (analysis.type === 'technical_query' || analysis.type === 'financial_service') {
      temperature = this.config.technicalTemperature;
      maxTokens = Math.max(2000, maxTokens);
    }

    // Consultas creativas: más libertad
    if (['crear', 'escribe', 'genera', 'idea'].some(k => mensajeLower.includes(k))) {
      temperature = this.config.creativeTemperature;
      maxTokens = Math.max(3000, maxTokens);
    }

    // Respuestas complejas: más tokens
    if (analysis.complexity === 'complex') {
      maxTokens = Math.max(4000, maxTokens);
    }

    return { temperature, maxTokens };
  }

  /**
   * ✅ EJECUCIÓN DE ESTRATEGIA ÓPTIMA
   */
  async ejecutarEstrategiaOptima(mensaje, analysis, historial, userToken, userInfo, conversationId) {
    const userId = userInfo?.usuario || 'unknown';
    
    switch (analysis.strategy) {
      case 'rag_primary':
        return await this.ejecutarEstrategiaRAG(mensaje, analysis, userInfo, userId);
        
      case 'tools_primary':
        return await this.ejecutarEstrategiaHerramientas(mensaje, analysis, historial, userToken, userInfo, conversationId);
        
      case 'direct_conversation':
      default:
        return await this.ejecutarConversacionDirecta(mensaje, analysis, historial, userToken, userInfo, conversationId);
    }
  }

  /**
   * ✅ ESTRATEGIA RAG OPTIMIZADA - Con fallback inteligente
   */
  async ejecutarEstrategiaRAG(mensaje, analysis, userInfo, userId) {
    console.log(`📚 [${userId}] Ejecutando estrategia RAG optimizada`);
    
    try {
      // Timeout configurado para RAG
      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('RAG timeout')), this.config.ragIntegrationTimeout)
      );

      const ragPromise = documentService.buscarDocumentos(mensaje, userId, {
        k: analysis.complexity === 'complex' ? 10 : 8,
        maxPerFile: 3,
        minScore: 0.6
      });

      // Ejecutar con timeout
      const respuestaRAG = await Promise.race([ragPromise, timeoutPromise]);
      
      // Validar calidad de respuesta RAG
      if (this.esRespuestaRAGValida(respuestaRAG)) {
        console.log(`✅ [${userId}] RAG exitoso - respuesta válida generada`);
        return {
          type: 'text',
          content: respuestaRAG,
          metadata: {
            strategy: 'rag_primary',
            source: 'document_search',
            processingVersion: '2.0',
            analysisType: analysis.type,
            ragSuccess: true
          }
        };
      } else {
        console.warn(`⚠️ [${userId}] Respuesta RAG de baja calidad, usando fallback`);
        throw new Error('Respuesta RAG insuficiente');
      }

    } catch (error) {
      console.warn(`⚠️ [${userId}] RAG falló (${error.message}), ejecutando fallback inteligente`);
      
      // Fallback: conversación con contexto de que se intentó RAG
      const mensajeConContexto = `[CONTEXTO: Se buscó información en documentos pero no se encontraron resultados relevantes]

Usuario pregunta: ${mensaje}

Proporciona la mejor respuesta posible basada en tu conocimiento general sobre Nova Corporation y sistemas similares. Sé claro sobre qué información tienes y cuál necesitaría consultar en documentación específica.`;

      return await this.ejecutarConversacionDirecta(
        mensajeConContexto, 
        analysis, 
        [], 
        null, 
        { usuario: userId }, 
        null
      );
    }
  }

  /**
   * ✅ VALIDACIÓN DE CALIDAD RAG
   */
  esRespuestaRAGValida(respuesta) {
    if (!respuesta || typeof respuesta !== 'string') return false;
    if (respuesta.length < 100) return false;
    
    // Verificar que no sean solo mensajes de error
    const errorIndicators = [
      'no se encontraron',
      'sin resultados',
      'error en búsqueda',
      'servicio no disponible'
    ];
    
    const hasError = errorIndicators.some(indicator => 
      respuesta.toLowerCase().includes(indicator)
    );
    
    // Verificar que tenga contenido informativo
    const infoIndicators = [
      'api', 'endpoint', 'servicio', 'procedimiento', 
      'método', 'parámetro', 'validación', 'autenticación'
    ];
    
    const hasInfo = infoIndicators.some(indicator => 
      respuesta.toLowerCase().includes(indicator)
    );
    
    return !hasError && hasInfo;
  }

  /**
   * ✅ ESTRATEGIA DE HERRAMIENTAS MEJORADA
   */
  async ejecutarEstrategiaHerramientas(mensaje, analysis, historial, userToken, userInfo, conversationId) {
    const userId = userInfo?.usuario || 'unknown';
    console.log(`🛠️ [${userId}] Ejecutando estrategia de herramientas`);

    // Preparar mensajes para OpenAI con herramientas
    const mensajesParaIA = await this.prepararMensajesOptimizados(
      mensaje, 
      historial, 
      userInfo, 
      conversationId,
      analysis
    );

    const requestConfig = {
      model: this.deploymentName,
      messages: mensajesParaIA,
      temperature: analysis.aiConfig.temperature,
      max_completion_tokens: Math.min(analysis.aiConfig.maxTokens, 3000),
      tools: this.tools,
      tool_choice: 'auto'
    };

    try {
      const response = await this.openai.chat.completions.create(requestConfig);
      const messageResponse = response.choices?.[0]?.message;
      
      if (!messageResponse) {
        throw new Error('Respuesta vacía de Azure OpenAI');
      }

      // Procesar herramientas si las hay
      if (messageResponse.tool_calls) {
        const finalResponse = await this.procesarHerramientasOptimizado(
          messageResponse,
          mensajesParaIA,
          userToken,
          userInfo,
          conversationId,
          analysis
        );
        
        finalResponse.metadata = {
          strategy: 'tools_primary',
          toolsUsed: messageResponse.tool_calls.map(tc => tc.function.name),
          analysisType: analysis.type,
          processingVersion: '2.0',
          usage: response.usage
        };
        
        return finalResponse;
      }

      return {
        type: 'text',
        content: messageResponse.content || 'Respuesta vacía de Azure OpenAI',
        metadata: {
          strategy: 'tools_primary',
          toolsUsed: [],
          analysisType: analysis.type,
          processingVersion: '2.0',
          usage: response.usage
        }
      };

    } catch (error) {
      console.error(`❌ [${userId}] Error en estrategia de herramientas:`, error);
      // Fallback a conversación directa
      return await this.ejecutarConversacionDirecta(mensaje, analysis, historial, userToken, userInfo, conversationId);
    }
  }

  /**
   * ✅ CONVERSACIÓN DIRECTA OPTIMIZADA
   */
  async ejecutarConversacionDirecta(mensaje, analysis, historial, userToken, userInfo, conversationId) {
    const userId = userInfo?.usuario || 'unknown';
    console.log(`💬 [${userId}] Ejecutando conversación directa optimizada`);

    const mensajesParaIA = await this.prepararMensajesOptimizados(
      mensaje, 
      historial, 
      userInfo, 
      conversationId,
      analysis
    );

    const requestConfig = {
      model: this.deploymentName,
      messages: mensajesParaIA,
      temperature: analysis.aiConfig.temperature,
      max_completion_tokens: analysis.aiConfig.maxTokens,
      top_p: 0.9,
      frequency_penalty: 0.1,
      presence_penalty: 0.1
    };

    try {
      const response = await this.openai.chat.completions.create(requestConfig);
      const content = response.choices?.[0]?.message?.content;
      
      if (!content) {
        throw new Error('Respuesta vacía de Azure OpenAI');
      }

      return {
        type: 'text',
        content: content.trim(),
        metadata: {
          strategy: 'direct_conversation',
          analysisType: analysis.type,
          processingVersion: '2.0',
          temperature: requestConfig.temperature,
          usage: response.usage
        }
      };

    } catch (error) {
      console.error(`❌ [${userId}] Error en conversación directa:`, error);
      throw error;
    }
  }

  /**
   * ✅ PREPARACIÓN OPTIMIZADA DE MENSAJES
   */
  async prepararMensajesOptimizados(mensaje, historial, userInfo, conversationId, analysis) {
    let mensajes = [];
    let usingCosmosHistory = false;

    // Intentar usar historial optimizado de Cosmos
    if (cosmosService?.isAvailable?.() && conversationId && userInfo?.usuario) {
      try {
        const conversacionCosmos = await cosmosService.getConversationForOpenAI(
          conversationId, 
          userInfo.usuario, 
          true
        );
        
        if (conversacionCosmos?.length > 0) {
          // Optimizar el historial según el análisis
          mensajes = this.optimizarHistorialSegunAnalisis(conversacionCosmos, analysis);
          usingCosmosHistory = true;
        }
      } catch (error) {
        console.warn(`⚠️ Error obteniendo historial Cosmos: ${error.message}`);
      }
    }

    // Fallback a historial tradicional
    if (!usingCosmosHistory) {
      const systemMessage = this.crearSystemMessageOptimizado(userInfo, analysis);
      mensajes = [systemMessage];
      
      // Agregar historial tradicional optimizado
      if (Array.isArray(historial) && historial.length > 0) {
        const historialOptimizado = this.optimizarHistorialTradicional(historial, analysis);
        mensajes.push(...historialOptimizado);
      }
    }

    // Agregar mensaje actual
    mensajes.push({ 
      role: 'user', 
      content: this.optimizarMensajeUsuario(mensaje, analysis)
    });

    // Limitar tokens totales
    return this.limitarTokensConversacion(mensajes, analysis);
  }

  /**
   * ✅ SYSTEM MESSAGE OPTIMIZADO
   */
  crearSystemMessageOptimizado(userInfo, analysis) {
    const fechaActual = DateTime.now().setZone('America/Mexico_City');
    const userContext = userInfo?.nombre 
      ? `Usuario: ${userInfo.nombre} (${userInfo.usuario})`
      : 'Usuario no identificado';

    let instruccionesEspecificas = '';
    
    switch (analysis.type) {
      case 'technical_query':
        instruccionesEspecificas = `
- Para consultas técnicas, sé PRECISO y ESTRUCTURADO
- Usa markdown para organizar información técnica
- Si mencionas APIs o endpoints, usa formato código
- Proporciona ejemplos concretos cuando sea posible`;
        break;
        
      case 'financial_service':
        instruccionesEspecificas = `
- Para consultas financieras, usa TABLAS MARKDOWN para datos numéricos
- Presenta montos con formato apropiado (decimales, separadores)
- Incluye contexto temporal relevante
- Sé claro sobre limitaciones de datos`;
        break;
        
      default:
        instruccionesEspecificas = `
- Responde de manera CONCISA y ÚTIL
- Usa estructura markdown apropiada
- Contextualiza tu respuesta al ámbito de Nova Corporation`;
    }

    const systemContent = `Eres Nova-AI, asistente especializado de Nova Corporation.

CONTEXTO ACTUAL:
• ${userContext}  
• Fecha/Hora: ${fechaActual.toFormat('dd/MM/yyyy HH:mm:ss')} (${fechaActual.zoneName})
• Tipo de consulta: ${analysis.type}
• Complejidad: ${analysis.complexity}

DIRECTRICES GENERALES:
• Responde SIEMPRE en español
• Sé profesional, preciso y útil
• Usa el contexto conversacional para continuidad
• Indica claramente si no tienes información específica${instruccionesEspecificas}

Proporciona respuestas que agreguen valor real al usuario.`.trim();

    return { role: 'system', content: systemContent };
  }

  /**
   * ✅ OPTIMIZACIÓN DE HISTORIAL SEGÚN ANÁLISIS
   */
  optimizarHistorialSegunAnalisis(historial, analysis) {
    let historialOptimizado = [...historial];
    const maxMessages = analysis.complexity === 'complex' ? 20 : 12;

    // Mantener system message si existe
    const systemMsg = historialOptimizado.find(m => m.role === 'system');
    let conversation = historialOptimizado.filter(m => m.role !== 'system');

    // Limitar cantidad de mensajes
    if (conversation.length > maxMessages) {
      // Mantener primeros y últimos mensajes más relevantes
      const keepFirst = 2;
      const keepLast = maxMessages - keepFirst;
      
      conversation = [
        ...conversation.slice(0, keepFirst),
        ...conversation.slice(-keepLast)
      ];
    }

    // Reconstruir con system message
    if (systemMsg) {
      historialOptimizado = [systemMsg, ...conversation];
    } else {
      historialOptimizado = conversation;
    }

    return historialOptimizado;
  }

  /**
   * ✅ OPTIMIZACIÓN DE HISTORIAL TRADICIONAL
   */
  optimizarHistorialTradicional(historial, analysis) {
    const mensajesOptimizados = [];
    const maxItems = analysis.complexity === 'complex' ? 8 : 5;

    // Tomar los mensajes más recientes y relevantes
    const historialReciente = historial.slice(-maxItems);

    historialReciente.forEach(item => {
      if (item?.content?.trim() && item.role) {
        mensajesOptimizados.push({
          role: item.role,
          content: item.content.trim()
        });
      }
    });

    return mensajesOptimizados;
  }

  /**
   * ✅ OPTIMIZACIÓN DEL MENSAJE DE USUARIO
   */
  optimizarMensajeUsuario(mensaje, analysis) {
    let mensajeOptimizado = mensaje.trim();

    // Para consultas técnicas, agregar contexto
    if (analysis.type === 'technical_query' && mensajeOptimizado.length < 50) {
      mensajeOptimizado = `En el contexto de Nova Corporation: ${mensajeOptimizado}`;
    }

    return mensajeOptimizado;
  }

  /**
   * ✅ LIMITACIÓN INTELIGENTE DE TOKENS
   */
  limitarTokensConversacion(mensajes, analysis) {
    const maxTokensEstimados = this.config.maxConversationTokens;
    let tokenEstimados = 0;
    const mensajesFiltrados = [];

    // Estimar tokens (aproximadamente 4 caracteres por token)
    for (let i = mensajes.length - 1; i >= 0; i--) {
      const mensaje = mensajes[i];
      const tokensMensaje = Math.ceil((mensaje.content?.length || 0) / 4);
      
      if (tokenEstimados + tokensMensaje <= maxTokensEstimados) {
        mensajesFiltrados.unshift(mensaje);
        tokenEstimados += tokensMensaje;
      } else if (mensaje.role === 'system') {
        // Siempre incluir system message, truncando si es necesario
        const maxSystemTokens = Math.floor(maxTokensEstimados * 0.1);
        const maxSystemChars = maxSystemTokens * 4;
        
        mensajesFiltrados.unshift({
          ...mensaje,
          content: mensaje.content.substring(0, maxSystemChars)
        });
        break;
      }
    }

    return mensajesFiltrados;
  }

  /**
   * ✅ PROCESAMIENTO OPTIMIZADO DE HERRAMIENTAS
   */
  async procesarHerramientasOptimizado(messageResponse, mensajesPrevios, userToken, userInfo, conversationId, analysis) {
    const userId = userInfo?.usuario || 'unknown';
    const resultados = [];
    
    console.log(`🛠️ [${userId}] Procesando ${messageResponse.tool_calls.length} herramienta(s)`);

    // Ejecutar herramientas en paralelo cuando sea posible
    const herramientasParalelas = ['obtener_fecha_hora_actual', 'obtener_informacion_usuario'];
    const herramientasSecuenciales = ['consultar_saldo_usuario', 'consultar_tasas_interes', 'buscar_documentos_nova'];

    for (const call of messageResponse.tool_calls) {
      const { function: fnCall, id } = call;
      const { name, arguments: args } = fnCall;
      
      try {
        console.log(`⚙️ [${userId}] Ejecutando: ${name}`);
        const parametros = JSON.parse(args || '{}');
        
        // Timeout para herramientas específicas
        const timeout = herramientasSecuenciales.includes(name) ? 20000 : 10000;
        
        const resultado = await Promise.race([
          this.ejecutarHerramienta(name, parametros, userToken, userInfo, conversationId),
          new Promise((_, reject) => 
            setTimeout(() => reject(new Error(`Timeout ejecutando ${name}`)), timeout)
          )
        ]);
        
        resultados.push({
          tool_call_id: id,
          content: typeof resultado === 'object' ? JSON.stringify(resultado, null, 2) : String(resultado)
        });

        console.log(`✅ [${userId}] ${name} ejecutado exitosamente`);
        
      } catch (error) {
        console.error(`❌ [${userId}] Error ejecutando ${name}:`, error.message);
        
        const errorMsg = this.generarMensajeErrorHerramienta(name, error, userInfo);
        resultados.push({ 
          tool_call_id: id, 
          content: errorMsg
        });
      }
    }

    // Generar respuesta final
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
      temperature: analysis.aiConfig.temperature,
      max_completion_tokens: Math.min(analysis.aiConfig.maxTokens, 3500)
    });

    return {
      type: 'text',
      content: finalResponse.choices?.[0]?.message?.content || 'No se pudo generar respuesta final'
    };
  }

  /**
   * ✅ MENSAJE DE ERROR INTELIGENTE PARA HERRAMIENTAS
   */
  generarMensajeErrorHerramienta(nombreHerramienta, error, userInfo) {
    const errorMsg = error.message.toLowerCase();
    
    if (errorMsg.includes('timeout')) {
      return `⏰ Timeout ejecutando ${nombreHerramienta}: El servicio tardó demasiado en responder.`;
    }
    
    if (errorMsg.includes('unauthorized') || errorMsg.includes('token')) {
      return `🔒 Error de autorización en ${nombreHerramienta}: ${userInfo?.usuario ? 'Token expirado' : 'Usuario no autenticado'}.`;
    }
    
    if (errorMsg.includes('network') || errorMsg.includes('connection')) {
      return `🌐 Error de conexión en ${nombreHerramienta}: Problema de conectividad con el servicio.`;
    }
    
    return `❌ Error en ${nombreHerramienta}: ${error.message}`;
  }

  /**
   * ✅ POSTPROCESAMIENTO DE RESPUESTA
   */
  postprocesarRespuesta(response, analysis, duration) {
    if (!response || !response.content) return response;

    // Agregar métricas de rendimiento si está en desarrollo
    if (process.env.NODE_ENV !== 'production' && duration > 5000) {
      response.content += `\n\n_[Procesado en ${duration}ms - Estrategia: ${analysis.strategy}]_`;
    }

    // Optimizar formato según el tipo de respuesta
    if (analysis.type === 'technical_query') {
      response.content = this.optimizarFormatoTecnico(response.content);
    } else if (analysis.type === 'financial_service') {
      response.content = this.optimizarFormatoFinanciero(response.content);
    }

    return response;
  }

  /**
   * ✅ OPTIMIZACIÓN DE FORMATO TÉCNICO
   */
  optimizarFormatoTecnico(content) {
    // Mejorar formato de código y endpoints
    return content
      .replace(/\b(GET|POST|PUT|DELETE|PATCH)\b/g, '**$1**')
      .replace(/\b(https?:\/\/[^\s]+)/g, '`$1`')
      .replace(/\b([a-zA-Z]+\.json|\.xml|\.csv)\b/g, '`$1`');
  }

  /**
   * ✅ OPTIMIZACIÓN DE FORMATO FINANCIERO
   */
  optimizarFormatoFinanciero(content) {
    // Mejorar formato de cantidades monetarias
    return content.replace(/\$\s*(\d+(?:,\d{3})*(?:\.\d{2})?)/g, '**$$1**');
  }

  /**
   * ✅ HERRAMIENTAS MEJORADAS
   */
  defineEnhancedTools() {
    return [
      {
        type: 'function',
        function: {
          name: 'buscar_documentos_nova',
          description: 'Busca información específica en documentación interna de Nova (APIs, políticas, procedimientos). Optimizado para consultas técnicas.',
          parameters: {
            type: 'object',
            properties: {
              consulta: { 
                type: 'string', 
                description: 'Término específico a buscar (ej: "validasocio API", "procedimiento autenticación")' 
              },
              tipo_busqueda: {
                type: 'string',
                enum: ['general', 'api', 'politicas', 'procedimientos', 'tecnica'],
                default: 'general',
                description: 'Tipo de información buscada para optimizar resultados'
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
          description: 'Obtiene fecha y hora actual en zona México (America/Mexico_City)',
          parameters: {
            type: 'object',
            properties: {
              formato: {
                type: 'string',
                enum: ['completo', 'fecha', 'hora', 'timestamp'],
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
            properties: {
              incluir_token: { 
                type: 'boolean', 
                default: false,
                description: 'Incluir información de token (solo para debugging)' 
              }
            }
          }
        }
      },
      {
        type: 'function',
        function: {
          name: 'consultar_tasas_interes',
          description: 'Consulta tasas de interés mensuales de Nova Corporation (Vista, Fijo 1/3/6 meses, FAP, Nov, Préstamos)',
          parameters: {
            type: 'object',
            properties: { 
              anio: { 
                type: 'integer', 
                minimum: 2020, 
                maximum: 2030,
                description: 'Año para consultar las tasas (ej: 2024)'
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
          description: 'Consulta saldos detallados del usuario (disponible/retenido) por tipo de cuenta. Requiere autenticación.',
          parameters: {
            type: 'object',
            properties: {
              tipo_sistema: { 
                type: 'string', 
                default: '',
                description: 'Filtro de tipo de sistema (opcional)'
              },
              incluir_detalles: { 
                type: 'boolean', 
                default: true,
                description: 'Incluir desglose detallado por cuenta'
              }
            }
          }
        }
      }
    ];
  }

  // ==================== MÉTODOS DE HERRAMIENTAS EXISTENTES ====================

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
        
      case 'buscar_documentos_nova':
        if (!documentService?.isAvailable?.()) {
          return '❌ **Document Service no disponible**\n\nEl servicio de búsqueda de documentos está temporalmente inactivo.';
        }
        return await documentService.buscarDocumentos(
          parametros.consulta, 
          userInfo?.usuario || 'tool-user',
          { tipo: parametros.tipo_busqueda || 'general' }
        );
        
      default:
        throw new Error(`Herramienta desconocida: ${nombre}`);
    }
  }

  // ==================== MÉTODOS FINANCIEROS MEJORADOS ====================

  /**
   * ✅ CONSULTA DE TASAS MEJORADA - Con mejor manejo de errores
   */
  async consultarTasasInteres(anio, userToken, userInfo) {
    try {
      if (!userToken || !userInfo) {
        return '❌ **Autenticación requerida**\n\nPara consultar tasas de interés necesitas estar autenticado.';
      }
      
      const cveUsuario = userInfo.usuario;
      const numRI = this.extractNumRIFromToken(userToken) || '7';

      console.log(`💰 [${cveUsuario}] Consultando tasas ${anio}, NumRI: ${numRI}`);

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
        console.log(`✅ [${cveUsuario}] Tasas obtenidas: ${response.data.info.length} registros`);
        return this.formatearTablaTasasMejorada(response.data.info, anio, cveUsuario);
      } else {
        return `⚠️ **Sin datos de tasas para ${anio}**\n\nNo se encontraron registros para el año solicitado.`;
      }
    } catch (error) {
      console.error(`❌ Error consultando tasas ${anio}:`, error.message);
      return this.manejarErrorConsultaTasas(error, anio);
    }
  }

  /**
   * ✅ FORMATEO MEJORADO DE TABLA DE TASAS
   */
  formatearTablaTasasMejorada(tasasData, anio, usuario) {
    try {
      if (!Array.isArray(tasasData) || !tasasData.length) {
        return '❌ **Error**: Datos de tasas vacíos o inválidos';
      }

      const hoyMX = new Date().toLocaleDateString('es-MX');
      
      // Mapeo de meses mejorado
      const monthOrder = {
        'enero': 1, 'febrero': 2, 'marzo': 3, 'abril': 4, 'mayo': 5, 'junio': 6,
        'julio': 7, 'agosto': 8, 'septiembre': 9, 'setiembre': 9, 'octubre': 10,
        'noviembre': 11, 'diciembre': 12
      };
      
      // Formatear porcentajes de forma consistente
      const formatPct = (value) => {
        if (value === undefined || value === null || value === '') return '—';
        const num = Number(value);
        return Number.isFinite(num) ? `${num.toFixed(2)}%` : '—';
      };
      
      // Procesar y ordenar datos
      const filas = tasasData
        .map(item => ({
          mes: (item.Mes || '').toString().toLowerCase().trim(),
          vista: formatPct(item.vista),
          fijo1m: formatPct(item.fijo1),
          fijo3m: formatPct(item.fijo3),
          fijo6m: formatPct(item.fijo6),
          fap: formatPct(item.FAP),
          nov: formatPct(item.Nov),
          prestamos: formatPct(item.Prestamos),
          orden: monthOrder[(item.Mes || '').toLowerCase().trim()] || 99
        }))
        .sort((a, b) => a.orden - b.orden);

      // Construir respuesta con mejor formato
      let respuesta = `💰 **TASAS DE INTERÉS NOVA CORPORATION ${anio}**\n\n`;
      respuesta += `| **Detalle** | **Valor** |\n`;
      respuesta += `|-------------|----------|\n`;
      respuesta += `| 👤 Usuario | ${usuario} |\n`;
      respuesta += `| 📅 Año consultado | ${anio} |\n`;
      respuesta += `| 📊 Registros | ${filas.length} meses |\n`;
      respuesta += `| 🕐 Actualizado | ${hoyMX} |\n\n`;
      
      // Tabla principal con mejor espaciado
      respuesta += `📈 **DETALLE MENSUAL**\n\n`;
      respuesta += `| **Mes** | **Vista** | **Fijo 1M** | **Fijo 3M** | **Fijo 6M** | **FAP** | **Nov** | **Préstamos** |\n`;
      respuesta += `|---------|-----------|-------------|-------------|-------------|---------|---------|---------------|\n`;
      
      filas.forEach(fila => {
        const mesCapitalizado = fila.mes.charAt(0).toUpperCase() + fila.mes.slice(1);
        respuesta += `| ${mesCapitalizado} | ${fila.vista} | ${fila.fijo1m} | ${fila.fijo3m} | ${fila.fijo6m} | ${fila.fap} | ${fila.nov} | ${fila.prestamos} |\n`;
      });
      
      // Análisis estadístico básico
      const analisisEstadistico = this.calcularAnalisisEstadisticoTasas(filas);
      if (analisisEstadistico) {
        respuesta += `\n${analisisEstadistico}`;
      }
      
      respuesta += `\n💡 **Leyenda**: **—** = dato no disponible\n`;
      
      return respuesta;
      
    } catch (error) {
      console.error('❌ Error formateando tasas mejorada:', error.message);
      return `❌ **Error procesando tasas**: ${error.message}`;
    }
  }

  /**
   * ✅ ANÁLISIS ESTADÍSTICO DE TASAS
   */
  calcularAnalisisEstadisticoTasas(filas) {
    try {
      const extractNumericalValues = (tipo) => {
        return filas
          .map(f => parseFloat(f[tipo].replace('%', '')))
          .filter(n => !isNaN(n) && n > 0);
      };

      const tipos = ['vista', 'fijo1m', 'fijo3m', 'fijo6m', 'prestamos'];
      const estadisticas = [];

      tipos.forEach(tipo => {
        const valores = extractNumericalValues(tipo);
        if (valores.length > 0) {
          const min = Math.min(...valores);
          const max = Math.max(...valores);
          const avg = valores.reduce((a, b) => a + b, 0) / valores.length;
          
          const tipoNombre = {
            'vista': 'Vista',
            'fijo1m': 'Fijo 1M',
            'fijo3m': 'Fijo 3M', 
            'fijo6m': 'Fijo 6M',
            'prestamos': 'Préstamos'
          };

          estadisticas.push(`• **${tipoNombre[tipo]}**: ${min.toFixed(2)}% - ${max.toFixed(2)}% (prom: ${avg.toFixed(2)}%)`);
        }
      });

      if (estadisticas.length === 0) return '';

      return `📊 **ANÁLISIS DE RANGOS**:\n${estadisticas.join('\n')}`;
      
    } catch (error) {
      console.warn('Error calculando estadísticas de tasas:', error.message);
      return '';
    }
  }

  /**
   * ✅ MANEJO DE ERRORES EN CONSULTA DE TASAS
   */
  manejarErrorConsultaTasas(error, anio) {
    if (error.response?.status === 401) {
      return '🔒 **Token expirado**\n\nTu sesión ha expirado. Por favor, inicia sesión nuevamente para consultar las tasas de interés.';
    } else if (error.response?.status === 404) {
      return '❌ **Servicio no disponible**\n\nEl endpoint de consulta de tasas no está disponible temporalmente.';
    } else if (error.response?.status === 400) {
      return `❌ **Año inválido**\n\nEl año ${anio} no es válido o no tiene datos disponibles.`;
    } else if (error.code === 'ECONNABORTED' || error.message.includes('timeout')) {
      return '⏰ **Timeout**\n\nLa consulta tardó demasiado en responder. Intenta nuevamente.';
    } else {
      return `❌ **Error de conexión**\n\n**Detalle**: ${error.message}\n\n💡 **Sugerencia**: Verifica tu conexión e intenta nuevamente.`;
    }
  }

  /**
   * ✅ CONSULTA DE SALDO MEJORADA
   */
  async consultarSaldoUsuario(userToken, userInfo, tipoSist = '', incluirDetalles = true) {
    try {
      if (!userToken || !userInfo) {
        return '❌ **Autenticación requerida**\n\nPara consultar tu saldo necesitas estar autenticado.';
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
        return this.formatearSaldoUsuarioMejorado(response.data, userInfo, incluirDetalles);
      }
      
      return `⚠️ **Sin información de saldo**\n\nNo se pudo obtener información de saldo para el usuario ${cveUsuario}.`;
      
    } catch (error) {
      console.error(`❌ Error consultando saldo:`, error.message);
      return this.manejarErrorConsultaSaldo(error, userInfo);
    }
  }

  /**
   * ✅ FORMATEO MEJORADO DE SALDO DE USUARIO
   */
  formatearSaldoUsuarioMejorado(saldoData, userInfo, incluirDetalles = true) {
    const hoyMX = new Date().toLocaleDateString('es-MX');
    const horaMX = new Date().toLocaleTimeString('es-MX');

    let resultado = `💳 **CONSULTA DE SALDO - NOVA CORPORATION**\n\n`;
    
    // Información del usuario en tabla
    resultado += `| **Campo** | **Valor** |\n`;
    resultado += `|-----------|----------|\n`;
    resultado += `| 👤 Usuario | ${userInfo.nombre || userInfo.usuario} |\n`;
    resultado += `| 🆔 Número de Socio | ${userInfo.usuario} |\n`;
    resultado += `| 📅 Consulta realizada | ${hoyMX} ${horaMX} |\n\n`;

    // Procesar datos de saldo
    let saldos = [];
    if (Array.isArray(saldoData?.info)) saldos = saldoData.info;
    else if (Array.isArray(saldoData?.data)) saldos = saldoData.data;
    else if (Array.isArray(saldoData?.saldos)) saldos = saldoData.saldos;
    else if (Array.isArray(saldoData)) saldos = saldoData;

    if (!saldos.length) {
      resultado += `⚠️ **Sin información de saldo disponible**\n\n`;
      resultado += `Este usuario no tiene información de saldos registrada o visible.`;
      return resultado;
    }

    // Calcular totales y procesar cuentas
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
        tipo: tipo.toString(),
        disponible: disp,
        retenido: ret,
        total: disp + ret
      });
    });

    const totalGeneral = totalDisponible + totalRetenido;

    // Resumen principal con formato mejorado
    resultado += `💰 **RESUMEN CONSOLIDADO**\n\n`;
    resultado += `| **Concepto** | **Monto (MXN)** |\n`;
    resultado += `|--------------|----------------:|\n`;
    resultado += `| 💚 **Total Disponible** | **${totalDisponible.toLocaleString('es-MX', { minimumFractionDigits: 2 })}** |\n`;
    resultado += `| 🔒 Total Retenido | ${totalRetenido.toLocaleString('es-MX', { minimumFractionDigits: 2 })} |\n`;
    resultado += `| 💎 **TOTAL GENERAL** | **${totalGeneral.toLocaleString('es-MX', { minimumFractionDigits: 2 })}** |\n\n`;

    // Detalle por cuenta si se solicita
    if (incluirDetalles && cuentasProcesadas.length > 1) {
      resultado += `📋 **DETALLE POR TIPO DE CUENTA**\n\n`;
      resultado += `| **Tipo de Cuenta** | **Disponible** | **Retenido** | **Total** |\n`;
      resultado += `|--------------------|---------------:|-------------:|----------:|\n`;
      
      cuentasProcesadas
        .sort((a, b) => b.total - a.total) // Ordenar por total descendente
        .forEach(cuenta => {
          resultado += `| ${cuenta.tipo} | ${cuenta.disponible.toLocaleString('es-MX', { minimumFractionDigits: 2 })} | ${cuenta.retenido.toLocaleString('es-MX', { minimumFractionDigits: 2 })} | **${cuenta.total.toLocaleString('es-MX', { minimumFractionDigits: 2 })}** |\n`;
        });
      
      resultado += `\n💡 **Explicación**:\n`;
      resultado += `• **Disponible**: Fondos para uso inmediato\n`;
      resultado += `• **Retenido**: Fondos con restricciones temporales\n`;
    }

    // Análisis adicional
    if (cuentasProcesadas.length > 1) {
      const porcentajeDisponible = (totalDisponible / totalGeneral * 100);
      resultado += `\n📊 **Análisis**:\n`;
      resultado += `• ${porcentajeDisponible.toFixed(1)}% de tus fondos están disponibles\n`;
      resultado += `• Tienes ${cuentasProcesadas.length} tipo(s) de cuenta activa(s)\n`;
    }

    return resultado;
  }

  /**
   * ✅ MANEJO DE ERRORES EN CONSULTA DE SALDO
   */
  manejarErrorConsultaSaldo(error, userInfo) {
    const usuario = userInfo?.usuario || 'Usuario';
    
    if (error.response?.status === 401) {
      return '🔒 **Autorización expirada**\n\nTu token ha expirado. Inicia sesión nuevamente para consultar tu saldo.';
    } else if (error.response?.status === 404) {
      return '❌ **Servicio no encontrado**\n\nEl servicio de consulta de saldos no está disponible.';
    } else if (error.response?.status === 400) {
      return `❌ **Datos inválidos**\n\nNo se pudo procesar la consulta de saldo para ${usuario}.`;
    } else if (error.code === 'ECONNABORTED' || error.message.includes('timeout')) {
      return '⏰ **Timeout en consulta**\n\nLa consulta de saldo tardó demasiado. Intenta nuevamente.';
    } else {
      return `❌ **Error consultando saldo**\n\n**Detalle**: ${error.message}\n\n💡 Contacta a soporte si el problema persiste.`;
    }
  }

  // ==================== MÉTODOS DE UTILIDAD MEJORADOS ====================

  /**
   * ✅ EXTRACCIÓN MEJORADA DE NumRI DEL TOKEN
   */
  extractNumRIFromToken(token) {
    try {
      if (!token) return null;
      
      const clean = token.replace(/^Bearer\s+/, '');
      const parts = clean.split('.');
      if (parts.length !== 3) return null;
      
      const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString());

      // Buscar NumRI en campos conocidos con prioridad
      const priorizedKeys = [
        'NumRI', 'numRI', 'numri',
        'http://schemas.xmlsoap.org/ws/2005/05/identity/claims/nameidentifier',
        'sub', 'user_id', 'employee_id', 'EmployeeId'
      ];
      
      for (const key of priorizedKeys) {
        if (payload[key]) {
          const n = parseInt(payload[key]);
          if (!isNaN(n) && n > 0) return n;
        }
      }
      
      // Buscar en nombre si está disponible
      const nameField = payload['http://schemas.xmlsoap.org/ws/2005/05/identity/claims/name'] ||
        payload.name || payload.preferred_username || payload.unique_name;
        
      if (nameField) {
        const n = parseInt(nameField);
        if (!isNaN(n) && n > 0) return n;
      }
      
      return 7; // Valor por defecto
    } catch (error) {
      console.warn('Error extrayendo NumRI del token:', error.message);
      return 7;
    }
  }

  /**
   * ✅ OBTENER FECHA/HORA MEJORADA
   */
  obtenerFechaHora(formato = 'completo') {
    const ahora = DateTime.now().setZone('America/Mexico_City');
    
    switch (formato) {
      case 'fecha':
        return `📅 **${ahora.toFormat('dd/MM/yyyy')}**`;
      case 'hora':
        return `🕐 **${ahora.toFormat('HH:mm:ss')}**`;
      case 'timestamp':
        return ahora.toISO();
      default:
        return `🕐 **FECHA Y HORA ACTUAL**\n\n` +
               `| **Campo** | **Valor** |\n` +
               `|-----------|----------|\n` +
               `| 📅 Fecha | ${ahora.toFormat('dd/MM/yyyy')} |\n` +
               `| 🕐 Hora | ${ahora.toFormat('HH:mm:ss')} |\n` +
               `| 🌍 Zona horaria | ${ahora.zoneName} |\n` +
               `| 📆 Día de la semana | ${ahora.toFormat('cccc')} |\n` +
               `| 📊 Formato ISO | ${ahora.toISO()} |\n`;
    }
  }

  /**
   * ✅ INFORMACIÓN DE USUARIO MEJORADA
   */
  obtenerInfoUsuario(userInfo, incluirToken = false) {
    if (!userInfo) {
      return '❌ **Sin información de usuario**\n\nNo hay datos de usuario disponibles en el contexto actual.';
    }
    
    let info = `👤 **INFORMACIÓN DEL USUARIO**\n\n`;
    info += `| **Campo** | **Valor** |\n`;
    info += `|-----------|----------|\n`;
    
    if (userInfo.nombre) info += `| 📝 Nombre completo | ${userInfo.nombre} |\n`;
    if (userInfo.usuario) info += `| 🆔 Usuario/Socio | ${userInfo.usuario} |\n`;
    if (userInfo.paterno) info += `| 👨 Apellido paterno | ${userInfo.paterno} |\n`;
    if (userInfo.materno) info += `| 👩 Apellido materno | ${userInfo.materno} |\n`;
    
    // Estado de autenticación
    const tieneToken = !!(userInfo.token && userInfo.token.length > 50);
    info += `| 🔐 Estado | ${tieneToken ? '✅ Autenticado' : '❌ Sin autenticar'} |\n`;
    
    if (incluirToken && userInfo.token) {
      info += `| 🔑 Token (prefijo) | ${userInfo.token.substring(0, 30)}... |\n`;
      info += `| 📏 Longitud token | ${userInfo.token.length} caracteres |\n`;
    }
    
    info += `\n💡 **Nota**: Información extraída del contexto de autenticación de Nova Corporation.`;
    
    // Capacidades disponibles
    if (tieneToken) {
      info += `\n\n🎯 **Servicios disponibles**:\n`;
      info += `• ✅ Consulta de saldos\n`;
      info += `• ✅ Consulta de tasas de interés\n`;
      info += `• ✅ Búsqueda en documentación\n`;
    }
    
    return info;
  }

  // ==================== MANEJO DE ERRORES Y UTILIDADES ====================

  /**
   * ✅ MANEJO INTELIGENTE DE ERRORES
   */
  manejarErrorInteligente(error, userInfo) {
    console.error('Error detallado:', error);
    
    const errorMsg = (error?.message || '').toLowerCase();
    const usuario = userInfo?.usuario || 'Usuario';
    
    let tipoError = '🔧 **Error técnico**';
    let solucion = 'Intenta nuevamente en unos momentos.';
    
    if (errorMsg.includes('insufficient_quota')) {
      tipoError = '💳 **Cuota agotada**';
      solucion = 'El servicio ha alcanzado su límite de uso. Contacta al administrador.';
    } else if (errorMsg.includes('rate_limit')) {
      tipoError = '⏰ **Límite de velocidad**';
      solucion = 'Demasiadas consultas. Espera un momento antes de intentar nuevamente.';
    } else if (errorMsg.includes('invalid_api_key')) {
      tipoError = '🔑 **Clave API inválida**';
      solucion = 'Problema de configuración. Contacta al administrador del sistema.';
    } else if (errorMsg.includes('model_not_found')) {
      tipoError = '🤖 **Modelo no encontrado**';
      solucion = 'El modelo de IA no está disponible. Verifica la configuración.';
    } else if (errorMsg.includes('timeout')) {
      tipoError = '⏰ **Timeout**';
      solucion = 'La consulta tardó demasiado. Intenta con una pregunta más específica.';
    } else if (errorMsg.includes('network') || errorMsg.includes('connection')) {
      tipoError = '🌐 **Error de conexión**';
      solucion = 'Problema de conectividad. Verifica tu conexión a internet.';
    }

    return {
      type: 'text',
      content: `❌ **Error en Nova-AI**\n\n` +
               `${tipoError}\n\n` +
               `**Usuario**: ${usuario}\n` +
               `**Detalle**: ${error.message}\n\n` +
               `💡 **Solución sugerida**: ${solucion}\n\n` +
               `🔧 **ID de sesión**: ${Date.now()}`
    };
  }

  createUnavailableResponse() {
    return {
      type: 'text',
      content: `🤖 **Nova-AI temporalmente no disponible**\n\n` +
               `❌ **Error**: ${this.initializationError || 'Servicio no inicializado'}\n\n` +
               `🔧 **Verificar**:\n` +
               `• Configuración OPENAI_API_KEY\n` +
               `• Configuración OPENAI_ENDPOINT\n` +
               `• Cuota disponible del servicio\n` +
               `• Conectividad de red\n\n` +
               `💡 **Sugerencia**: Contacta al administrador si el problema persiste.`
    };
  }

  // ==================== INFORMACIÓN Y ESTADÍSTICAS ====================

  getServiceStats() {
    const features = {
      basic_conversation: this.openaiAvailable,
      enhanced_message_analysis: true,
      intelligent_strategy_selection: true,
      optimized_rag_integration: this.openaiAvailable && documentService?.isAvailable?.(),
      advanced_tools: this.openaiAvailable,
      conversation_history_optimization: !!cosmosService?.isAvailable?.(),
      error_handling_v2: true,
      performance_monitoring: true,
      financial_services_integration: this.openaiAvailable,
      document_search_integration: this.openaiAvailable && documentService?.isAvailable?.()
    };

    return {
      version: '2.0.0-intelligent-processing',
      initialized: this.initialized,
      available: this.openaiAvailable,
      error: this.initializationError,
      deployment: this.deploymentName,
      apiVersion: this.apiVersion,
      featuresEnabled: features,
      toolsCount: this.tools?.length || 0,
      enabledFeatures: Object.keys(features).filter(key => features[key]),
      integrations: {
        documentService: documentService?.isAvailable?.() || false,
        cosmosService: cosmosService?.isAvailable?.() || false,
        novaAPIs: !!(process.env.NOVA_API_URL_SALDO && process.env.NOVA_API_URL_TASA)
      },
      performance: {
        maxConversationTokens: this.config.maxConversationTokens,
        maxResponseTokens: this.config.maxResponseTokens,
        ragTimeout: this.config.ragIntegrationTimeout,
        retryAttempts: this.config.retryAttempts
      },
      timestamp: new Date().toISOString()
    };
  }

  isAvailable() {
    return this.openaiAvailable && this.initialized;
  }

  cleanup() {
    console.log('🧹 OpenAI Service v2.0 limpiado correctamente');
  }
}

// Crear instancia singleton
const openaiService = new AzureOpenAIService();
module.exports = openaiService;