
// services/openaiService.js - MEJORADO: Con soporte para Azure OpenAI, formato de conversación y tracking de tokens
const { OpenAI } = require('openai');
const { DefaultAzureCredential } = require('@azure/identity');
const { DateTime } = require('luxon');
const axios = require('axios');
const { CardFactory } = require('botbuilder');
const cosmosService = require('./cosmosService');
require('dotenv').config();

/**
 * Servicio Azure OpenAI con tracking de tokens (SOLO gpt-5-mini)
 * - Integración exclusiva con el deployment gpt-5-mini en Azure OpenAI
 * - Historial tradicional y formato de conversación compatibles
 * - Guardado automático en formato OpenAI (si usas cosmosService)
 * - Estadísticas y estimación de costos para gpt-5-mini
 */
class AzureOpenAIService {
  constructor() {
    this.initialized = false;
    this.initializationError = null;

    // Tracking de tokens
    this.tokenUsage = {
      total: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
      byUser: new Map(),
      byModel: new Map(),
      byTool: new Map(),
      sessions: [],
      startTime: new Date()
    };

    console.log('🚀 Inicializando Azure OpenAI Service (exclusivo gpt-5-mini) con tracking de tokens...');
    this.diagnoseConfiguration();
    this.initializeAzureOpenAI();
    this.tools = this.defineTools?.() || [];

    console.log(`✅ Azure OpenAI Service inicializado - Disponible: ${this.openaiAvailable}`);
    console.log(`🔗 Formato de conversación: ${cosmosService?.isAvailable?.() ? 'Disponible' : 'No disponible'}`);
    console.log(`📊 Tracking de tokens: Habilitado`);
  }

  /**
   * Metadatos del modelo gpt-5-mini centralizados
   */
  getModelInfo() {
    return {
      modelId: 'gpt-5-mini',
      description: 'Reasoning + Chat Completions + Responses + Herramientas + Texto/Imagen (entrada) → Texto/Imagen',
      // Context Window total y límites típicos (según especificación del usuario)
      contextWindow: 400_000,
      inputLimit: 272_000,
      maxOutputTokens: 128_000,
      trainingDataUpTo: 'October 24, 2024'
    };
  }

  /**
   * Diagnóstico y configuración (exclusivo gpt-5-mini)
   */
  diagnoseConfiguration() {
    console.log('🔍 Diagnosticando configuración Azure OpenAI (solo gpt-5-mini)...');

    const config = {
      apiKey: process.env.OPENAI_API_KEY,
      endpoint: process.env.OPENAI_ENDPOINT,
      // Deployment: puedes sobreescribir con AZURE_OPENAI_DEPLOYMENT; por defecto usamos el nombre del modelo
      deploymentName: 'gpt-5-mini',
      apiVersion: '2024-12-01-preview'
    };

    // Validación dura: sólo permitimos gpt-5-mini
    if (config.deploymentName !== 'gpt-5-mini') {
      console.warn(`⚠️ Se forzará el deployment a 'gpt-5-mini' (valor actual: "${config.deploymentName}").`);
      config.deploymentName = 'gpt-5-mini';
    }

    console.log('📊 Estado de configuración Azure:');
    console.log(`   API Key: ${config.apiKey ? '✅ Configurada' : '❌ Faltante'}`);
    console.log(`   Endpoint: ${config.endpoint ? '✅ Configurado' : '❌ Faltante'}`);
    console.log(`   API Version: ${config.apiVersion}`);
    console.log(`   Deployment: ${config.deploymentName}`);

    if (config.apiKey) {
      console.log(`   Key Preview: ${config.apiKey.substring(0, 10)}...${config.apiKey.slice(-4)}`);
    }
    if (config.endpoint) {
      console.log(`   Endpoint: ${config.endpoint}`);
    }

    this.config = config;
  }

  /**
   * Inicialización del cliente Azure OpenAI (solo gpt-5-mini)
   */
  initializeAzureOpenAI() {
    try {
      const { apiKey, endpoint, apiVersion, deploymentName } = this.config;

      if (!apiKey) {
        this.initializationError = 'OPENAI_API_KEY/AZURE_OPENAI_API_KEY no está configurada';
        console.error('❌ Azure OpenAI Error:', this.initializationError);
        this.openaiAvailable = false;
        return;
      }

      if (!endpoint) {
        this.initializationError = 'OPENAI_ENDPOINT/AZURE_OPENAI_ENDPOINT no está configurado';
        console.error('❌ Azure OpenAI Error:', this.initializationError);
        this.openaiAvailable = false;
        return;
      }

      if (!endpoint.includes('openai.azure.com')) {
        console.warn('⚠️ El endpoint no parece ser de Azure OpenAI');
      }

      console.log('🔑 Configurando cliente Azure OpenAI (gpt-5-mini)...');

      // Config de cliente OpenAI para Azure (ruta de deployments)
      this.openai = new OpenAI({
        apiKey,
        baseURL: `${endpoint}/openai/deployments/${deploymentName}`,
        defaultQuery: { 'api-version': apiVersion },
        defaultHeaders: {
          'Content-Type': 'application/json',
          'api-key': apiKey
        },
        timeout: 45_000,
        maxRetries: 3
      });

      // Guardar datos del deployment/modelo
      const { modelId, maxOutputTokens } = this.getModelInfo();
      this.deploymentName = deploymentName; // nombre del deployment en Azure (igual al modelo)
      this.modelId = modelId;               // id lógico de modelo
      this.apiVersion = apiVersion;
      this.maxOutputTokens = maxOutputTokens;

      this.openaiAvailable = true;
      this.initialized = true;

      console.log('✅ Cliente Azure OpenAI configurado exitosamente');
      console.log(`🎯 Deployment/Model: ${deploymentName}`);
      console.log(`📅 API Version: ${apiVersion}`);

      if (process.env.NODE_ENV !== 'production') {
        this.testConnection();
      }
    } catch (error) {
      this.initializationError = `Error inicializando Azure OpenAI: ${error.message}`;
      console.error('❌ Error inicializando Azure OpenAI:', error);
      this.openaiAvailable = false;
    }
  }

  /**
   * Test básico de conectividad (gpt-5-mini)
   */
  async testConnection() {
    try {
      console.log('🧪 Probando conectividad con Azure OpenAI (gpt-5-mini)...');

      const testResponse = await this.openai.chat.completions.create({
        model: this.deploymentName, // deploymentName en Azure
        messages: [{ role: 'user', content: 'Test' }],
        max_completion_tokens: 5,
        temperature: 0
      });

      if (testResponse?.choices?.length > 0) {
        if (testResponse.usage) {
          this.trackTokenUsage(testResponse.usage, 'test', 'system', this.modelId);
          console.log(`📊 Test tokens: ${testResponse.usage.total_tokens}`);
        }
        console.log('✅ Test de conectividad Azure OpenAI exitoso');
        return { success: true, model: this.deploymentName, usage: testResponse.usage };
      } else {
        console.warn('⚠️ Respuesta de test inválida');
        return { success: false, error: 'Respuesta inválida' };
      }
    } catch (error) {
      console.warn('⚠️ Test de conectividad falló:', error.message);
      return { success: false, error: error.message };
    }
  }

  /**
   * Tracking de uso de tokens
   */
  trackTokenUsage(usage, operationType, userId = 'unknown', model = null) {
    try {
      if (!usage || typeof usage !== 'object') {
        console.warn('⚠️ Datos de usage inválidos:', usage);
        return;
      }

      const tokenData = {
        prompt_tokens: usage.prompt_tokens || 0,
        completion_tokens: usage.completion_tokens || 0,
        total_tokens: usage.total_tokens || 0,
        timestamp: new Date(),
        operationType,
        userId,
        model: model || this.modelId
      };

      // Totales generales
      this.tokenUsage.total.prompt_tokens += tokenData.prompt_tokens;
      this.tokenUsage.total.completion_tokens += tokenData.completion_tokens;
      this.tokenUsage.total.total_tokens += tokenData.total_tokens;

      // Por usuario
      if (!this.tokenUsage.byUser.has(userId)) {
        this.tokenUsage.byUser.set(userId, {
          prompt_tokens: 0,
          completion_tokens: 0,
          total_tokens: 0,
          requests: 0,
          firstRequest: new Date(),
          lastRequest: new Date()
        });
      }
      const userData = this.tokenUsage.byUser.get(userId);
      userData.prompt_tokens += tokenData.prompt_tokens;
      userData.completion_tokens += tokenData.completion_tokens;
      userData.total_tokens += tokenData.total_tokens;
      userData.requests++;
      userData.lastRequest = new Date();

      // Por modelo (solo gpt-5-mini, pero mantenemos estructura)
      const modelKey = tokenData.model;
      if (!this.tokenUsage.byModel.has(modelKey)) {
        this.tokenUsage.byModel.set(modelKey, {
          prompt_tokens: 0,
          completion_tokens: 0,
          total_tokens: 0,
          requests: 0
        });
      }
      const modelData = this.tokenUsage.byModel.get(modelKey);
      modelData.prompt_tokens += tokenData.prompt_tokens;
      modelData.completion_tokens += tokenData.completion_tokens;
      modelData.total_tokens += tokenData.total_tokens;
      modelData.requests++;

      // Por operación/herramienta
      if (!this.tokenUsage.byTool.has(operationType)) {
        this.tokenUsage.byTool.set(operationType, {
          prompt_tokens: 0,
          completion_tokens: 0,
          total_tokens: 0,
          requests: 0
        });
      }
      const toolData = this.tokenUsage.byTool.get(operationType);
      toolData.prompt_tokens += tokenData.prompt_tokens;
      toolData.completion_tokens += tokenData.completion_tokens;
      toolData.total_tokens += tokenData.total_tokens;
      toolData.requests++;

      // Sesión individual
      this.tokenUsage.sessions.push(tokenData);
      if (this.tokenUsage.sessions.length > 1000) {
        this.tokenUsage.sessions = this.tokenUsage.sessions.slice(-1000);
      }

      console.log(`📊 [${userId}] Tokens registrados: ${tokenData.total_tokens} (${operationType})`);
      console.log(`📈 [${userId}] Total acumulado: ${userData.total_tokens} tokens en ${userData.requests} requests`);
    } catch (error) {
      console.error('❌ Error tracking tokens:', error);
    }
  }

  /**
   * Estadísticas de tokens
   */
  getTokenStatistics(userId = null) {
    try {
      const now = new Date();
      const uptime = Math.round((now - this.tokenUsage.startTime) / 1000 / 60);

      const stats = {
        service: {
          uptime_minutes: uptime,
          start_time: this.tokenUsage.startTime,
          total_requests: this.tokenUsage.sessions.length
        },
        total: { ...this.tokenUsage.total },
        models: Object.fromEntries(this.tokenUsage.byModel),
        operations: Object.fromEntries(this.tokenUsage.byTool),
        model_info: this.getModelInfo(),
        cost_estimate: this.calculateCostEstimate(this.tokenUsage.total)
      };

      if (userId && this.tokenUsage.byUser.has(userId)) {
        const u = this.tokenUsage.byUser.get(userId);
        stats.user = { ...u, cost_estimate: this.calculateCostEstimate(u) };
      } else if (userId) {
        stats.user = { message: `No hay estadísticas registradas para el usuario: ${userId}` };
      }

      if (!userId) {
        const topUsers = Array.from(this.tokenUsage.byUser.entries())
          .sort(([, a], [, b]) => b.total_tokens - a.total_tokens)
          .slice(0, 5)
          .map(([user, data]) => ({
            user: user.substring(0, 3) + '***',
            total_tokens: data.total_tokens,
            requests: data.requests
          }));
        stats.top_users = topUsers;
      }

      return stats;
    } catch (error) {
      console.error('❌ Error obteniendo estadísticas de tokens:', error);
      return { error: error.message };
    }
  }

  /**
   * Estimación de costo (SOLO gpt-5-mini)
   * Puedes ajustar precios con:
   *  - GPT51_MINI_PRICE_INPUT_PER_1K (USD por 1K tokens de entrada)
   *  - GPT51_MINI_PRICE_OUTPUT_PER_1K (USD por 1K tokens de salida)
   */
  calculateCostEstimate(tokenData) {
    try {
      const inputRate =
        parseFloat(process.env.GPT51_MINI_PRICE_INPUT_PER_1K) ||
        0.00015; // valor por defecto (ejemplo) USD / 1K input tokens
      const outputRate =
        parseFloat(process.env.GPT51_MINI_PRICE_OUTPUT_PER_1K) ||
        0.0006; // valor por defecto (ejemplo) USD / 1K output tokens

      const inputCost = (tokenData.prompt_tokens / 1000) * inputRate;
      const outputCost = (tokenData.completion_tokens / 1000) * outputRate;
      const totalCost = inputCost + outputCost;

      return {
        model: this.modelId,
        input_cost_usd: parseFloat(inputCost.toFixed(6)),
        output_cost_usd: parseFloat(outputCost.toFixed(6)),
        total_cost_usd: parseFloat(totalCost.toFixed(6)),
        input_tokens: tokenData.prompt_tokens,
        output_tokens: tokenData.completion_tokens,
        total_tokens: tokenData.total_tokens,
        pricing_applied: {
          input_per_1k: inputRate,
          output_per_1k: outputRate
        }
      };
    } catch (error) {
      console.error('❌ Error calculando costo:', error);
      return { error: error.message };
    }
  }

    /**
     * ✅ Definir herramientas disponibles (sin cambios en la funcionalidad)
     */
    defineTools() {
        const tools = [
            {
                type: "function",
                function: {
                    name: "obtener_fecha_hora_actual",
                    description: "Obtiene la fecha y hora actual en zona horaria de México",
                    parameters: { 
                        type: "object", 
                        properties: {
                            formato: {
                                type: "string",
                                enum: ["completo", "fecha", "hora", "timestamp"],
                                description: "Formato de la fecha/hora a devolver"
                            }
                        }
                    }
                }
            },
            {
                type: "function",
                function: {
                    name: "obtener_informacion_usuario",
                    description: "Obtiene información completa del usuario autenticado",
                    parameters: { 
                        type: "object", 
                        properties: {
                            incluir_token: {
                                type: "boolean",
                                description: "Si incluir información del token (solo preview)"
                            }
                        }
                    }
                }
            },
            {
                type: "function",
                function: {
                    name: "consultar_tasas_interes",
                    description: "Consulta las tasas de interés de Nova para un año específico. Muestra tasas vista, fijo (1,3,6 meses), FAP, Nov y Préstamos por mes.",
                    parameters: {
                        type: "object",
                        properties: {
                            anio: {
                                type: "integer",
                                description: "Año para consultar las tasas (ej: 2025)",
                                minimum: 2020,
                                maximum: 2030
                            }
                        },
                        required: ["anio"]
                    }
                }
            },
            {
                type: "function",
                function: {
                    name: "consultar_saldo_usuario",
                    description: "Consulta el saldo actual del usuario en Nova. Muestra saldo disponible, retenido y total por tipo de cuenta.",
                    parameters: {
                        type: "object",
                        properties: {
                            tipo_sistema: {
                                type: "string",
                                description: "Tipo de sistema a consultar (opcional, se puede dejar vacío para consultar todos)",
                                default: ""
                            },
                            incluir_detalles: {
                                type: "boolean",
                                description: "Si incluir detalles adicionales del saldo",
                                default: true
                            }
                        }
                    }
                }
            },
            {
                type: "function",
                function: {
                    name: "generar_resumen_conversacion",
                    description: "Genera un resumen inteligente de la conversación usando el historial en formato OpenAI cuando esté disponible",
                    parameters: { 
                        type: "object", 
                        properties: {
                            incluir_estadisticas: {
                                type: "boolean",
                                description: "Si incluir estadísticas detalladas"
                            },
                            usar_formato_openai: {
                                type: "boolean",
                                description: "Si usar el formato de conversación OpenAI para mejor análisis"
                            }
                        }
                    }
                }
            },
            {
                type: "function",
                function: {
                    name: "consultar_api_nova",
                    description: "Realiza consultas a APIs de Nova usando el token del usuario",
                    parameters: {
                        type: "object",
                        properties: {
                            endpoint: {
                                type: "string",
                                description: "Endpoint de la API a consultar"
                            },
                            metodo: {
                                type: "string",
                                enum: ["GET", "POST"],
                                description: "Método HTTP a usar"
                            },
                            parametros: {
                                type: "object",
                                description: "Parámetros adicionales para la consulta"
                            }
                        },
                        required: ["endpoint"]
                    }
                }
            },
            {
                type: "function",
                function: {
                    name: "analizar_conversacion_openai",
                    description: "Analiza la conversación completa usando el formato OpenAI para obtener insights detallados",
                    parameters: {
                        type: "object",
                        properties: {
                            tipo_analisis: {
                                type: "string",
                                enum: ["resumen", "sentimientos", "temas", "patrones", "recomendaciones"],
                                description: "Tipo de análisis a realizar"
                            },
                            incluir_sistema: {
                                type: "boolean",
                                description: "Si incluir el mensaje del sistema en el análisis"
                            }
                        },
                        required: ["tipo_analisis"]
                    }
                }
            }
        ];

        console.log(`🛠️ ${tools.length} herramientas definidas para Azure OpenAI (incluyendo consulta de saldos)`);
        return tools;
    }

    /**
     * ✅ MÉTODO PRINCIPAL MEJORADO: Procesar mensaje con Azure OpenAI
     */
    async procesarMensaje(mensaje, historial = [], userToken = null, userInfo = null, conversationId = null) {
        try {
            if (!this.openaiAvailable) {
                return this.createUnavailableResponse();
            }

            if (!this.initialized) {
                console.warn('⚠️ Azure OpenAI no inicializado, reintentando...');
                this.initializeAzureOpenAI();
                
                if (!this.openaiAvailable) {
                    return this.createUnavailableResponse();
                }
            }

            console.log(`📝 [${userInfo?.usuario || 'unknown'}] Procesando: "${mensaje.substring(0, 50)}..."`);
            console.log(`📚 [${userInfo?.usuario || 'unknown'}] Historial recibido: ${historial.length} mensajes`);

            // ✅ DECISIÓN INTELIGENTE: Usar formato de conversación OpenAI si está disponible
            let mensajesParaIA = [];
            let usingOpenAIFormat = false;

            if (cosmosService.isAvailable() && conversationId) {
                try {
                    console.log(`🤖 [${userInfo?.usuario || 'unknown'}] Intentando usar formato de conversación OpenAI...`);
                    
                    const openaiConversation = await cosmosService.getConversationForOpenAI(
                        conversationId,
                        userInfo?.usuario || 'unknown',
                        true // incluir mensaje del sistema
                    );

                    if (openaiConversation && openaiConversation.length > 0) {
                        mensajesParaIA = [...openaiConversation];
                        usingOpenAIFormat = true;
                        console.log(`✅ [${userInfo?.usuario || 'unknown'}] Usando formato de conversación OpenAI: ${mensajesParaIA.length} mensajes`);
                    } else {
                        console.log(`⚠️ [${userInfo?.usuario || 'unknown'}] Formato OpenAI vacío, fallback a historial tradicional`);
                    }
                } catch (openaiFormatError) {
                    console.warn(`⚠️ [${userInfo?.usuario || 'unknown'}] Error obteniendo formato OpenAI:`, openaiFormatError.message);
                }
            }

            // ✅ FALLBACK: Usar historial tradicional si formato OpenAI no está disponible
            if (!usingOpenAIFormat) {
                console.log(`📋 [${userInfo?.usuario || 'unknown'}] Usando historial tradicional formateado`);
                mensajesParaIA = this.formatearHistorialTradicional(historial, userInfo);
            }

            // ✅ AGREGAR: Mensaje actual del usuario
            mensajesParaIA.push({ role: "user", content: mensaje });

            // ✅ Configuración para Azure OpenAI
            const requestConfig = {
                model: this.deploymentName, // Usar deployment name
                messages: mensajesParaIA,
                temperature: this.calculateTemperature(mensaje),
                max_completion_tokens: this.calculateMaxTokens(mensaje)
            };

            // ✅ Usar herramientas solo cuando sea apropiado
            if (this.shouldUseTools(mensaje)) {
                requestConfig.tools = this.tools;
                requestConfig.tool_choice = "auto";
                console.log(`🛠️ [${userInfo?.usuario || 'unknown'}] Habilitando herramientas para esta consulta`);
            }

            console.log(`🤖 [${userInfo?.usuario || 'unknown'}] Enviando a Azure OpenAI (${requestConfig.model}, formato: ${usingOpenAIFormat ? 'OpenAI' : 'tradicional'})...`);
            const response = await this.openai.chat.completions.create(requestConfig);
            
            if (!response?.choices?.length) {
                throw new Error('Respuesta vacía de Azure OpenAI');
            }
            
            const messageResponse = response.choices[0].message;
            let finalResponse;

            if (messageResponse.tool_calls) {
                console.log(`🛠️ [${userInfo?.usuario || 'unknown'}] Ejecutando ${messageResponse.tool_calls.length} herramientas...`);
                finalResponse = await this.procesarHerramientas(
                    messageResponse, 
                    mensajesParaIA, 
                    userToken, 
                    userInfo,
                    conversationId
                );
            } else {
                finalResponse = {
                    type: 'text',
                    content: messageResponse.content || 'Respuesta vacía de Azure OpenAI'
                };
            }

            console.log(`✅ [${userInfo?.usuario || 'unknown'}] Respuesta generada exitosamente`);
            
            // ✅ METADATA: Agregar información sobre el formato usado
            finalResponse.metadata = {
                formatUsed: usingOpenAIFormat ? 'openai-conversation' : 'traditional-history',
                messagesProcessed: mensajesParaIA.length,
                modelUsed: requestConfig.model,
                toolsUsed: !!messageResponse.tool_calls,
                azureDeployment: this.deploymentName,
                apiVersion: this.apiVersion,
                usage: response.usage // Información de uso de tokens
            };
            
            return finalResponse;

        } catch (error) {
            console.error('❌ Error en procesarMensaje:', error);
            return this.manejarErrorOpenAI(error, userInfo);
        }
    }

    /**
     * ✅ NUEVO: Formatear historial tradicional cuando no hay formato OpenAI
     */
    formatearHistorialTradicional(historial, userInfo) {
        const fechaActual = DateTime.now().setZone('America/Mexico_City');
        
        const userContext = userInfo ? 
            `Usuario autenticado: ${userInfo.nombre} (${userInfo.usuario})` : 
            'Usuario no autenticado';

        const mensajes = [{
            role: "system",
            content: `
        // ✅ AQUÍ VAN LAS INSTRUCCIONES DEL PROMPT ✅
        
        Tu nombre es Nova-AI, y eres un Asistente virtual inteligente para la institución financiera Nova.
        
        DIRECTRICES GENERALES:
        - Responde únicamente en español
        - Si te dan las gracias, responde que es un gusto ayudar y si hay algo más en lo que puedas asistirlos
        - Utiliza el historial de la conversación como referencia
        - Utiliza sólo la información de referencia brindada
        - Si tu respuesta incluye algo que no se encuentre en la información de referencia brindada, añade en negritas 'Esta información no proviene de los documentos internos de Nova'
        - No respondas preguntas que no sean de Nova y sus servicios financieros
        - Nunca te disculpes por confusiones en la conversación
        - Si no conoces la respuesta menciona que no cuentas con esa información
        - Utiliza de manera preferente la información de referencia con más exactitud y apego a la pregunta
        - Responde con mucho detalle, busca hacer listados y presentar la información de una manera útil y accesible
        - Siempre que puedas haz listados para organizar tu respuesta, usando bullets, negritas, dando respuestas largas y estructuradas

        ALCANCE DE CONOCIMIENTOS:
        Si te preguntan acerca de tu alcance, información que conoces, qué sabes hacer o tu base de conocimientos, responde que conoces los servicios financieros de Nova así como los procedimientos principales.

        Algunos ejemplos de la información que conoces son: consultas de saldos, procedimientos de retiro de ahorros, transferencias entre tipos de ahorro, tasas de interés para ahorros y préstamos, gestión de cuotas de ahorro, tipos de ahorro disponibles, horarios de operaciones, tipos de préstamos disponibles, lineamientos para préstamos, procedimientos para solicitar préstamos, préstamos hipotecarios, pagos de préstamos, guías de uso de APP y portal web, recuperación de facturas en garantía, liberación de hipotecas, préstamos con garantía de inversión, entre muchos otros servicios financieros.

🔷 **Contexto del Usuario:**
${userContext}

🔷 **Fecha y Hora Actual:**
${fechaActual.toFormat('dd/MM/yyyy HH:mm:ss')} (${fechaActual.zoneName})

🔷 **Historial de Conversación:**
${historial.length > 0 ? 
  `Tienes acceso a los últimos ${historial.length} mensajes de esta conversación.` : 
  'Esta es una conversación nueva.'
}

🔷 **Tus Capacidades (Azure OpenAI):**
• Conversación natural e inteligente con memoria contextual
• Consulta de saldos del usuario autenticado
• Consulta de tasas de interés de Nova (herramienta especializada)
• Información del usuario autenticado
• Consultas a APIs internas de Nova
• Análisis y explicaciones detalladas
• Generación de resúmenes de conversación

🔷 **Personalidad:**
• Profesional pero amigable
• Útil y proactivo para temas financieros y corporativos
• Claro y conciso en respuestas
• Usa la memoria de conversación para dar respuestas más contextuales
• Enfocado en productividad corporativa y servicios financieros

🔷 **Importante:**
• Siempre mantén la información del usuario segura
• Para consultas de saldos, usa la herramienta especializada
• Para consultas de tasas, usa la herramienta especializada
• Usa el historial de conversación para dar respuestas más personalizadas
• Si el usuario se refiere a algo anterior, busca en el historial proporcionado`
        }];
        
        // ✅ Procesar historial tradicional
        if (historial && historial.length > 0) {
            console.log(`📚 Formateando ${historial.length} mensajes del historial tradicional...`);
            
            historial.forEach((item, index) => {
                if (item.content && item.content.trim()) {
                    mensajes.push({
                        role: item.role,
                        content: item.content.trim()
                    });
                    console.log(`   ${index + 1}. ${item.role}: ${item.content.substring(0, 30)}...`);
                }
            });
        }

        return mensajes;
    }

    /**
     * ✅ Procesamiento de herramientas con Azure OpenAI
     */
    async procesarHerramientas(messageResponse, mensajes, userToken, userInfo, conversationId) {
        const resultados = [];

        for (const call of messageResponse.tool_calls) {
            const { function: fnCall, id } = call;
            const { name, arguments: args } = fnCall;
            
            try {
                console.log(`🔧 [${userInfo?.usuario || 'unknown'}] Ejecutando herramienta: ${name}`);
                
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
                    content: typeof resultado === 'object' ? 
                        JSON.stringify(resultado, null, 2) : String(resultado)
                });
                
                console.log(`✅ [${userInfo?.usuario || 'unknown'}] Herramienta ${name} ejecutada exitosamente`);
                
            } catch (error) {
                console.error(`❌ Error ejecutando herramienta ${name}:`, error);
                resultados.push({
                    tool_call_id: id,
                    content: `Error ejecutando ${name}: ${error.message}`
                });
            }
        }

        // ✅ Generar respuesta final con Azure OpenAI
        const finalMessages = [
            ...mensajes,
            messageResponse,
            ...resultados.map(result => ({
                role: "tool",
                tool_call_id: result.tool_call_id,
                content: result.content
            }))
        ];

        console.log(`🔄 [${userInfo?.usuario || 'unknown'}] Generando respuesta final con resultados de herramientas...`);
        
        const finalResponse = await this.openai.chat.completions.create({
            model: this.deploymentName, // Usar deployment name
            messages: finalMessages,
            temperature: 1.0,
            max_completion_tokens: 3000
        });

        return {
            type: 'text',
            content: finalResponse.choices[0].message.content || 'No se pudo generar respuesta final'
        };
    }

    /**
     * ✅ MEJORADO: Ejecutar herramientas con nueva funcionalidad de saldos
     */
    async ejecutarHerramienta(nombre, parametros, userToken, userInfo, conversationId) {
        const userId = userInfo?.usuario || 'unknown';
        console.log(`🔧 [${userId}] Ejecutando herramienta: ${nombre}`);
        console.log(`📋 [${userId}] Parámetros:`, parametros);

        switch (nombre) {
            case 'obtener_fecha_hora_actual':
                return this.obtenerFechaHora(parametros.formato || 'completo');

            case 'obtener_informacion_usuario':
                return this.obtenerInfoUsuario(userInfo, parametros.incluir_token);

            case 'consultar_tasas_interes':
                console.log(`💰 [${userId}] Consultando tasas para año: ${parametros.anio}`);
                return await this.consultarTasasInteres(parametros.anio, userToken, userInfo);

            // ✅ NUEVA HERRAMIENTA: Consultar saldo del usuario
            case 'consultar_saldo_usuario':
                console.log(`💳 [${userId}] Consultando saldo del usuario`);
                return await this.consultarSaldoUsuario(
                    userToken, 
                    userInfo, 
                    parametros.tipo_sistema || "",
                    parametros.incluir_detalles !== false
                );

            case 'generar_resumen_conversacion':
                console.log(`📊 [${userId}] Generando resumen de conversación`);
                return await this.generarResumenConversacion(
                    conversationId, 
                    userInfo, 
                    parametros.incluir_estadisticas,
                    parametros.usar_formato_openai
                );

            case 'consultar_api_nova':
                console.log(`🌐 [${userId}] Consultando API Nova: ${parametros.endpoint}`);
                return await this.consultarApiNova(
                    parametros.endpoint, 
                    userToken, 
                    parametros.metodo || 'GET',
                    parametros.parametros
                );

            case 'analizar_conversacion_openai':
                console.log(`🔍 [${userId}] Analizando conversación OpenAI: ${parametros.tipo_analisis}`);
                return await this.analizarConversacionOpenAI(
                    conversationId,
                    userInfo,
                    parametros.tipo_analisis,
                    parametros.incluir_sistema
                );

            default:
                throw new Error(`Herramienta desconocida: ${nombre}`);
        }
    }

    /**
     * ✅ NUEVA HERRAMIENTA: Consultar saldo del usuario
     */
    async consultarSaldoUsuario(userToken, userInfo, tipoSist = "", incluirDetalles = true) {
        try {
            if (!userToken || !userInfo) {
                return "❌ **Error**: Usuario no autenticado para consultar saldo";
            }

            const cveUsuario = userInfo.usuario;
            console.log(`💳 [${cveUsuario}] Consultando saldo del usuario...`);

            const requestBody = {
                usuarioActual: {
                    CveUsuario: cveUsuario
                },
                data: {
                    NumSocio: cveUsuario,
                    TipoSist: tipoSist
                }
            };

            console.log('📡 Request body para saldo:', JSON.stringify(requestBody, null, 2));
            const url = process.env.NOVA_API_URL_SALDO || 'https://pruebas.nova.com.mx/ApiRestNova/api/ConsultaSaldo/ObtSaldo';
            
            const response = await axios.post(
                url,
                requestBody,
                {
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${userToken}`,
                        'Accept': 'application/json'
                    },
                    timeout: 15000
                }
            );

            console.log(`📊 Respuesta saldo (${response.status}):`, JSON.stringify(response.data, null, 2));

            if (response.status === 200 && response.data) {
                return this.formatearSaldoUsuario(response.data, userInfo, incluirDetalles);
            } else {
                return `⚠️ **Respuesta inesperada al consultar saldo**: Status ${response.status}`;
            }

        } catch (error) {
            console.error('❌ Error consultando saldo del usuario:', error.message);
            
            if (error.response?.status === 401) {
                return "🔒 **Error de autorización**: Tu token puede haber expirado. Intenta cerrar sesión e iniciar nuevamente.";
            } else if (error.response?.status === 404) {
                return "❌ **Servicio no encontrado**: El servicio de consulta de saldos no está disponible.";
            } else if (error.response?.status === 400) {
                return `❌ **Datos inválidos**: Error en los parámetros de consulta.`;
            } else {
                return `❌ **Error consultando saldo**: ${error.message}`;
            }
        }
    }

    /**
     * ✅ NUEVO: Formatear información de saldo del usuario
     */
    formatearSaldoUsuario(saldoData, userInfo, incluirDetalles = true) {
        try {
            const hoyMX = new Date().toLocaleDateString('es-MX');
            const horaMX = new Date().toLocaleTimeString('es-MX');

            let resultado = `💳 **CONSULTA DE SALDO - NOVA CORPORATION**\n\n`;
            resultado += `👤 **Usuario**: ${userInfo.nombre || userInfo.usuario}\n`;
            resultado += `🆔 **Número de Socio**: ${userInfo.usuario}\n`;
            resultado += `📅 **Consulta**: ${hoyMX} ${horaMX}\n\n`;

            // ✅ Verificar si hay datos de saldo
            if (!saldoData || (!saldoData.info && !saldoData.data && !saldoData.saldos)) {
                resultado += `⚠️ **Sin información de saldo disponible**\n`;
                resultado += `Esto puede suceder por:\n`;
                resultado += `• No tienes cuentas de ahorro activas\n`;
                resultado += `• El sistema está en mantenimiento\n`;
                resultado += `• Error temporal en la consulta\n\n`;
                resultado += `💡 Intenta consultar nuevamente en unos minutos o contacta a soporte.`;
                return resultado;
            }

            // ✅ Procesar datos de saldo (adaptable a diferentes estructuras de respuesta)
            let saldos = [];
            
            if (saldoData.info && Array.isArray(saldoData.info)) {
                saldos = saldoData.info;
            } else if (saldoData.data && Array.isArray(saldoData.data)) {
                saldos = saldoData.data;
            } else if (saldoData.saldos && Array.isArray(saldoData.saldos)) {
                saldos = saldoData.saldos;
            } else if (Array.isArray(saldoData)) {
                saldos = saldoData;
            }

            if (saldos.length === 0) {
                resultado += `⚠️ **No se encontraron cuentas de ahorro**\n`;
                resultado += `• Verifica que tengas productos de ahorro activos en Nova\n`;
                resultado += `• Si acabas de abrir una cuenta, puede tardar unos minutos en aparecer`;
                return resultado;
            }

            // ✅ Calcular totales
            let totalDisponible = 0;
            let totalRetenido = 0;
            let totalGeneral = 0;

            saldos.forEach(cuenta => {
                const disponible = parseFloat(cuenta.saldoDisponible || cuenta.disponible || cuenta.SaldoDisponible || 0);
                const retenido = parseFloat(cuenta.saldoRetenido || cuenta.retenido || cuenta.SaldoRetenido || 0);
                
                totalDisponible += disponible;
                totalRetenido += retenido;
                totalGeneral += disponible + retenido;
            });

            // ✅ Resumen de saldos
            resultado += `📊 **RESUMEN DE SALDOS**\n`;
            resultado += `💰 **Total Disponible**: $${totalDisponible.toLocaleString('es-MX', {minimumFractionDigits: 2})}\n`;
            resultado += `🔒 **Total Retenido**: $${totalRetenido.toLocaleString('es-MX', {minimumFractionDigits: 2})}\n`;
            resultado += `💎 **Total General**: $${totalGeneral.toLocaleString('es-MX', {minimumFractionDigits: 2})}\n\n`;

            // ✅ Detalle por cuenta (si se solicita)
            if (incluirDetalles && saldos.length > 0) {
                resultado += `📋 **DETALLE POR CUENTA**\n\n`;

                saldos.forEach((cuenta, index) => {
                    const tipoCuenta = cuenta.tipoCuenta || cuenta.tipo || cuenta.TipoCuenta || `Cuenta ${index + 1}`;
                    const disponible = parseFloat(cuenta.saldoDisponible || cuenta.disponible || cuenta.SaldoDisponible || 0);
                    const retenido = parseFloat(cuenta.saldoRetenido || cuenta.retenido || cuenta.SaldoRetenido || 0);
                    const total = disponible + retenido;

                    resultado += `🏦 **${tipoCuenta}**\n`;
                    resultado += `   💰 Disponible: $${disponible.toLocaleString('es-MX', {minimumFractionDigits: 2})}\n`;
                    resultado += `   🔒 Retenido: $${retenido.toLocaleString('es-MX', {minimumFractionDigits: 2})}\n`;
                    resultado += `   💎 Total: $${total.toLocaleString('es-MX', {minimumFractionDigits: 2})}\n`;

                    // Información adicional si está disponible
                    if (cuenta.numeroCuenta || cuenta.numero || cuenta.NumeroCuenta) {
                        resultado += `   🔢 Número: ${cuenta.numeroCuenta || cuenta.numero || cuenta.NumeroCuenta}\n`;
                    }
                    if (cuenta.fechaUltimoMovimiento || cuenta.ultimoMovimiento) {
                        resultado += `   📅 Último mov.: ${cuenta.fechaUltimoMovimiento || cuenta.ultimoMovimiento}\n`;
                    }

                    resultado += `\n`;
                });
            }

            // ✅ Información adicional
            resultado += `💡 **Información Importante**\n`;
            resultado += `• **Saldo Disponible**: Dinero que puedes retirar inmediatamente\n`;
            resultado += `• **Saldo Retenido**: Fondos en proceso o con restricciones temporales\n`;
            resultado += `• Los saldos se actualizan en tiempo real durante horario bancario\n`;
            resultado += `• Para movimientos, consulta el historial en tu app Nova\n\n`;
            resultado += `🕐 **Horarios de disposición**: Lunes a viernes 8:00 - 18:00 hrs`;

            return resultado;

        } catch (error) {
            console.error('❌ Error formateando saldo:', error);
            return `❌ **Error formateando información de saldo**: ${error.message}`;
        }
    }

    /**
     * ✅ NUEVA HERRAMIENTA: Analizar conversación en formato OpenAI
     */
    async analizarConversacionOpenAI(conversationId, userInfo, tipoAnalisis, incluirSistema = true) {
        try {
            if (!cosmosService.isAvailable() || !conversationId) {
                return "❌ **Error**: Análisis no disponible. Se requiere Cosmos DB y conversación activa.";
            }

            const userId = userInfo?.usuario || 'unknown';
            console.log(`🔍 [${userId}] Iniciando análisis de conversación: ${tipoAnalisis}`);

            // Obtener conversación en formato OpenAI
            const conversacion = await cosmosService.getConversationForOpenAI(
                conversationId,
                userId,
                incluirSistema
            );

            if (!conversacion || conversacion.length === 0) {
                return "❌ **No hay conversación en formato OpenAI para analizar**\n\nLa conversación debe tener mensajes guardados en formato OpenAI.";
            }

            console.log(`📊 [${userId}] Analizando ${conversacion.length} mensajes (tipo: ${tipoAnalisis})`);

            // Crear prompt específico para el tipo de análisis
            const promptAnalisis = this.crearPromptAnalisis(tipoAnalisis, conversacion, userInfo);

            // Usar OpenAI para analizar la conversación
            const analisisResponse = await this.openai.chat.completions.create({
                model: "gpt-4o-mini",
                messages: [
                    {
                        role: "system",
                        content: "Eres un analista experto en conversaciones corporativas. Proporciona análisis precisos, estructurados y útiles."
                    },
                    {
                        role: "user",
                        content: promptAnalisis
                    }
                ],
                temperature: 0.3,
                max_completion_tokens: 2000
            });

            const analisis = analisisResponse.choices[0].message.content;

            // Formatear resultado
            let resultado = `🔍 **Análisis de Conversación: ${tipoAnalisis.toUpperCase()}**\n\n`;
            resultado += `👤 **Usuario**: ${userInfo?.nombre || 'Usuario'} (${userId})\n`;
            resultado += `📊 **Mensajes analizados**: ${conversacion.length}\n`;
            resultado += `🤖 **Formato**: OpenAI Chat API\n`;
            resultado += `📅 **Análisis generado**: ${new Date().toLocaleString('es-MX')}\n\n`;
            resultado += `**Resultado del análisis:**\n\n${analisis}`;

            return resultado;

        } catch (error) {
            console.error(`❌ Error en análisis de conversación:`, error);
            return `❌ **Error en análisis**: ${error.message}`;
        }
    }

    /**
     * ✅ NUEVO: Crear prompt específico para cada tipo de análisis
     */
    crearPromptAnalisis(tipoAnalisis, conversacion, userInfo) {
        const conversacionTexto = JSON.stringify(conversacion, null, 2);
        
        const prompts = {
            resumen: `Analiza la siguiente conversación y proporciona un resumen ejecutivo:

${conversacionTexto}

Proporciona:
1. Resumen de los temas principales discutidos
2. Conclusiones o decisiones alcanzadas
3. Acciones pendientes o recomendaciones
4. Puntos clave destacados

Formato: Profesional y estructurado para uso corporativo.`,

            sentimientos: `Analiza el tono y sentimientos en esta conversación corporativa:

${conversacionTexto}

Evalúa:
1. Tono general de la conversación (profesional, amigable, formal, etc.)
2. Nivel de satisfacción del usuario
3. Puntos de fricción o confusión
4. Momentos de mayor engagement
5. Recomendaciones para mejorar la experiencia

Enfoque: Análisis objetivo para mejorar el servicio al cliente.`,

            temas: `Identifica y categoriza los temas tratados en esta conversación:

${conversacionTexto}

Identifica:
1. Temas principales (categorías de productos/servicios)
2. Subtemas específicos
3. Frecuencia de cada tema
4. Temas relacionados entre sí
5. Temas que requieren seguimiento

Organiza por relevancia e importancia para Nova Corporation.`,

            patrones: `Analiza patrones de comunicación en esta conversación:

${conversacionTexto}

Busca:
1. Patrones en las preguntas del usuario
2. Efectividad de las respuestas del asistente
3. Flujo de la conversación
4. Puntos donde se requirió clarificación
5. Oportunidades de optimización

Objetivo: Mejorar la calidad del servicio automatizado.`,

            recomendaciones: `Basándote en esta conversación, proporciona recomendaciones estratégicas:

${conversacionTexto}

Usuario: ${userInfo?.nombre || 'Cliente'} (${userInfo?.usuario || 'N/A'})

Proporciona:
1. Recomendaciones de productos/servicios Nova relevantes
2. Acciones de seguimiento recomendadas
3. Oportunidades de venta cruzada
4. Mejoras en el proceso de atención
5. Personalización futura para este usuario

Enfoque: Estratégico y orientado a resultados comerciales.`
        };

        return prompts[tipoAnalisis] || prompts.resumen;
    }

    /**
     * ✅ MEJORADO: Generar resumen con opción de formato OpenAI
     */
    async generarResumenConversacion(conversationId, userInfo, incluirEstadisticas = true, usarFormatoOpenAI = true) {
        try {
            if (!conversationId || !userInfo) {
                return "⚠️ No hay información de conversación disponible para generar resumen";
            }

            const userId = userInfo?.usuario || 'unknown';
            let resumen = `📊 **Resumen de Conversación**\n\n`;
            resumen += `👤 **Usuario**: ${userInfo.nombre} (${userInfo.usuario})\n`;
            resumen += `📅 **Fecha**: ${DateTime.now().setZone('America/Mexico_City').toFormat('dd/MM/yyyy HH:mm')}\n`;

            // ✅ INTENTAR: Usar formato OpenAI si está disponible y solicitado
            if (usarFormatoOpenAI && cosmosService.isAvailable()) {
                try {
                    console.log(`🤖 [${userId}] Generando resumen usando formato OpenAI...`);
                    
                    const conversacionOpenAI = await cosmosService.getConversationMessages(conversationId, userId);
                    
                    if (conversacionOpenAI && conversacionOpenAI.length > 0) {
                        resumen += `🤖 **Formato**: OpenAI Chat API (${conversacionOpenAI.length} mensajes)\n`;
                        
                        if (incluirEstadisticas) {
                            const stats = this.calcularEstadisticasConversacion(conversacionOpenAI);
                            resumen += `📊 **Estadísticas**:\n`;
                            resumen += `   • Mensajes del sistema: ${stats.system}\n`;
                            resumen += `   • Mensajes del usuario: ${stats.user}\n`;
                            resumen += `   • Respuestas del asistente: ${stats.assistant}\n`;
                            resumen += `   • Promedio palabras por mensaje: ${stats.avgWords}\n`;
                        }
                        
                        // Usar IA para generar resumen inteligente
                        const resumenIA = await this.analizarConversacionOpenAI(
                            conversationId,
                            userInfo,
                            'resumen',
                            false // sin mensaje del sistema para el resumen
                        );
                        
                        resumen += `\n**Resumen inteligente**:\n${resumenIA}`;
                        
                        return resumen;
                    }
                } catch (openaiError) {
                    console.warn(`⚠️ [${userId}] Error usando formato OpenAI para resumen:`, openaiError.message);
                }
            }

            // ✅ FALLBACK: Resumen básico
            if (incluirEstadisticas) {
                resumen += `💾 **Persistencia**: ${cosmosService.isAvailable() ? 'Cosmos DB' : 'Solo memoria'}\n`;
                resumen += `🤖 **IA**: OpenAI GPT-4o-mini\n`;
            }
            
            resumen += `\n💡 **Para ver el historial completo**:\n`;
            resumen += `• Escribe \`historial\` - Ver últimos 5 mensajes\n`;
            resumen += `• El resumen detallado se genera automáticamente por TeamsBot\n`;

            return resumen;

        } catch (error) {
            console.error('Error generando resumen:', error);
            return `❌ Error generando resumen: ${error.message}`;
        }
    }

    /**
     * ✅ NUEVO: Calcular estadísticas de conversación en formato OpenAI
     */
    calcularEstadisticasConversacion(conversacion) {
        const stats = {
            system: 0,
            user: 0,
            assistant: 0,
            totalWords: 0,
            avgWords: 0
        };

        conversacion.forEach(msg => {
            stats[msg.role]++;
            const words = msg.content.split(' ').length;
            stats.totalWords += words;
        });

        stats.avgWords = Math.round(stats.totalWords / conversacion.length);

        return stats;
    }

    /**
     * ✅ Obtiene fecha y hora actual
     */
    obtenerFechaHora(formato = 'completo') {
        const ahora = DateTime.now().setZone('America/Mexico_City');
        
        switch (formato) {
            case 'fecha':
                return ahora.toFormat('dd/MM/yyyy');
            case 'hora':
                return ahora.toFormat('HH:mm:ss');
            case 'timestamp':
                return ahora.toISO();
            case 'completo':
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

    /**
     * ✅ Obtiene información del usuario
     */
    obtenerInfoUsuario(userInfo, incluirToken = false) {
        if (!userInfo) {
            return 'No hay información de usuario disponible';
        }

        let info = `👤 **Información del Usuario:**\n\n`;
        info += `📝 **Nombre**: ${userInfo.nombre}\n`;
        info += `👤 **Usuario**: ${userInfo.usuario}\n`;
        info += `🏢 **Apellido Paterno**: ${userInfo.paterno || 'N/A'}\n`;
        info += `🏢 **Apellido Materno**: ${userInfo.materno || 'N/A'}\n`;

        if (incluirToken && userInfo.token) {
            info += `🔑 **Token**: ${userInfo.token.substring(0, 50)}...\n`;
            info += `📊 **Token válido**: ${userInfo.token.length > 100 ? 'Sí' : 'Posiblemente no'}\n`;
        }

        info += `\n💡 Esta información se extrae del token de autenticación de Nova.`;

        return info;
    }

    /**
     * ✅ Consulta tasas de interés de Nova
     */
    async consultarTasasInteres(anio, userToken, userInfo) {
        try {
            if (!userToken || !userInfo) {
                return "❌ **Error**: Usuario no autenticado para consultar tasas";
            }

            const cveUsuario = userInfo.usuario;
            const numRI = this.extractNumRIFromToken(userToken) || "7";

            console.log(`💰 [${cveUsuario}] Consultando tasas para año ${anio}`);

            const requestBody = {
                usuarioActual: {
                    CveUsuario: cveUsuario
                },
                data: {
                    NumRI: numRI,
                    Anio: anio
                }
            };

            console.log('📡 Request body para tasas:', JSON.stringify(requestBody, null, 2));
            const url = process.env.NOVA_API_URL_TASA || 'https://pruebas.nova.com.mx/ApiRestNova/api/ConsultaTasa/consultaTasa';
            
            const response = await axios.post(
                url,
                requestBody,
                {
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${userToken}`,
                        'Accept': 'application/json'
                    },
                    timeout: 15000
                }
            );

            console.log(`📊 Respuesta tasas (${response.status}):`, JSON.stringify(response.data, null, 2));

            if (response.status === 200 && response.data?.info) {
                return this.formatearTablaTasas(response.data.info, anio, cveUsuario);
            } else {
                return `⚠️ **Respuesta inesperada al consultar tasas**: Status ${response.status}`;
            }

        } catch (error) {
            console.error('❌ Error consultando tasas de interés:', error.message);
            
            if (error.response?.status === 401) {
                return "🔒 **Error de autorización**: Tu token puede haber expirado. Intenta cerrar sesión e iniciar nuevamente.";
            } else if (error.response?.status === 404) {
                return "❌ **Servicio no encontrado**: El servicio de consulta de tasas no está disponible.";
            } else if (error.response?.status === 400) {
                return `❌ **Datos inválidos**: Verifica que el año ${anio} sea válido.`;
            } else {
                return `❌ **Error consultando tasas**: ${error.message}`;
            }
        }
    }

    /**
     * ✅ Extrae NumRI del token JWT
     */
    extractNumRIFromToken(token) {
        try {
            if (!token) {
                console.warn('Token vacío para extraer NumRI');
                return null;
            }

            // Limpiar token
            const cleanToken = token.replace(/^Bearer\s+/, '');
            
            // Separar partes del JWT
            const parts = cleanToken.split('.');
            if (parts.length !== 3) {
                console.warn('Token no tiene formato JWT válido');
                return null;
            }

            // Decodificar payload
            const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString());
            console.log('🔍 Payload del token:', Object.keys(payload));

            // Buscar NumRI en diferentes posibles ubicaciones
            const possibleKeys = [
                'NumRI',
                'numRI', 
                'numri',
                'http://schemas.xmlsoap.org/ws/2005/05/identity/claims/nameidentifier',
                'sub',
                'user_id',
                'employee_id'
            ];

            for (const key of possibleKeys) {
                if (payload[key]) {
                    const numRI = parseInt(payload[key]);
                    if (!isNaN(numRI)) {
                        console.log(`✅ NumRI encontrado en '${key}': ${numRI}`);
                        return numRI;
                    }
                }
            }

            // Si no se encuentra, intentar con el usuario
            const cveUsuario = payload['http://schemas.xmlsoap.org/ws/2005/05/identity/claims/name'] || payload.name || payload.preferred_username;
            if (cveUsuario) {
                const numRI = parseInt(cveUsuario);
                if (!isNaN(numRI)) {
                    console.log(`✅ NumRI extraído del usuario: ${numRI}`);
                    return numRI;
                }
            }

            console.warn('⚠️ No se pudo extraer NumRI del token');
            console.log('📋 Campos disponibles en payload:', Object.keys(payload));
            return null;

        } catch (error) {
            console.error('❌ Error extrayendo NumRI del token:', error.message);
            return null;
        }
    }

    /**
     * ✅ Formatea tabla de tasas de interés
     */
    formatearTablaTasas(tasasData, anio, usuario) {
    try {
        if (!tasasData || !Array.isArray(tasasData) || tasasData.length === 0) {
            return "❌ **Error**: Datos de tasas inválidos o vacíos";
        }

        const hoyMX = new Date().toLocaleDateString('es-MX');

        // Normaliza texto y ordena meses Ene..Dic (tolera acentos/casos)
        const norm = (s) => (s ?? '').toString().toLowerCase()
            .normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
        const monthIdx = {
            'enero':1,'febrero':2,'marzo':3,'abril':4,'mayo':5,'junio':6,
            'julio':7,'agosto':8,'septiembre':9,'setiembre':9,'octubre':10,'noviembre':11,'diciembre':12
        };

        const pct = (v) => {
            if (v === undefined || v === null || v === '') return '—';
            const n = Number(v);
            return Number.isFinite(n) ? `${n}%` : String(v);
        };

        // Ordenar por mes
        const filas = [...tasasData].sort((a, b) => {
            const ai = monthIdx[norm(a.Mes)] ?? 99;
            const bi = monthIdx[norm(b.Mes)] ?? 99;
            return ai - bi;
        }).map(m => ({
            Mes: (m.Mes || '').toString(),
            Vista: pct(m.vista),
            Fijo1m: pct(m.fijo1),
            Fijo3m: pct(m.fijo3),
            Fijo6m: pct(m.fijo6),
            FAP: pct(m.FAP),
            Nov: pct(m.Nov),
            Prestamos: pct(m.Prestamos)
        }));

        // Calcular anchos de columnas para tabla monoespaciada
        const headers = ['Mes','Vista','Fijo 1m','Fijo 3m','Fijo 6m','FAP','Nov','Préstamos'];
        const allRows = [headers, ...filas.map(f => [
            f.Mes, f.Vista, f.Fijo1m, f.Fijo3m, f.Fijo6m, f.FAP, f.Nov, f.Prestamos
        ])];

        const widths = headers.map((_, col) =>
            Math.max(...allRows.map(r => (r[col] ?? '').toString().length))
        );

        const pad = (txt, i) => (txt ?? '').toString().padEnd(widths[i], ' ');
        const sep = ' | ';

        const headerLine = headers.map((h, i) => pad(h, i)).join(sep);
        const divider = widths.map(w => ''.padEnd(w, '─')).join('─┼─');

        const bodyLines = filas.map(r =>
            [r.Mes, r.Vista, r.Fijo1m, r.Fijo3m, r.Fijo6m, r.FAP, r.Nov, r.Prestamos]
            .map((c, i) => pad(c, i)).join(sep)
        );

        let out = `💰 **TASAS DE INTERÉS NOVA CORPORATION ${anio}**\n\n`;
        out += `👤 **Usuario**: ${usuario}   📅 **Año**: ${anio}   🕐 **Actualizado**: ${hoyMX}\n\n`;
        out += `📊 **Detalle mes por mes**\n`;
        out += '```text\n';
        out += headerLine + '\n';
        out += divider + '\n';
        out += bodyLines.join('\n') + '\n';
        out += '```\n';
        out += `\nLeyenda: **—** sin dato.\n`;

        return out;

    } catch (error) {
        console.error('❌ Error formateando tabla de tasas:', error);
        return `❌ **Error formateando tasas**: ${error.message}`;
    }
}

    /**
     * ✅ Consulta API Nova genérica
     */
    async consultarApiNova(endpoint, userToken, metodo = 'GET', parametros = {}) {
        try {
            if (!userToken) {
                return '❌ Token de usuario requerido para consultar API Nova';
            }

            const baseUrl = 'https://pruebas.nova.com.mx/ApiRestNova/api';
            const url = endpoint.startsWith('http') ? endpoint : `${baseUrl}/${endpoint.replace(/^\//, '')}`;

            console.log(`🌐 Consultando API Nova: ${metodo} ${url}`);

            const config = {
                method: metodo,
                url: url,
                headers: {
                    'Authorization': `Bearer ${userToken}`,
                    'Content-Type': 'application/json',
                    'Accept': 'application/json'
                },
                timeout: 15000
            };

            if (metodo === 'POST' && parametros) {
                config.data = parametros;
            } else if (metodo === 'GET' && parametros) {
                config.params = parametros;
            }

            const response = await axios(config);

            if (response.status === 200) {
                return {
                    success: true,
                    data: response.data,
                    status: response.status,
                    message: 'Consulta exitosa'
                };
            } else {
                return {
                    success: false,
                    status: response.status,
                    message: `Respuesta inesperada: ${response.status}`
                };
            }

        } catch (error) {
            console.error('❌ Error consultando API Nova:', error.message);

            if (error.response) {
                return {
                    success: false,
                    status: error.response.status,
                    message: `Error ${error.response.status}: ${error.response.data?.message || 'Error del servidor'}`,
                    data: error.response.data
                };
            } else {
                return {
                    success: false,
                    message: `Error de conexión: ${error.message}`
                };
            }
        }
    }

    /**
     * ✅ Crea respuesta cuando OpenAI no está disponible
     */
    createUnavailableResponse() {
        return {
            type: 'text',
            content: `🤖 **Servicio OpenAI no disponible**\n\n` +
                    `❌ **Error**: ${this.initializationError}\n\n` +
                    `💡 **Posibles soluciones**:\n` +
                    `• Verificar configuración de OPENAI_API_KEY\n` +
                    `• Comprobar conectividad a internet\n` +
                    `• Verificar cuota de OpenAI\n\n` +
                    `⚠️ **Nota**: Algunas funciones del bot están limitadas sin OpenAI.`
        };
    }

    /**
     * ✅ Maneja errores de OpenAI
     */
    manejarErrorOpenAI(error, userInfo) {
        const userId = userInfo?.usuario || 'unknown';
        console.error(`❌ [${userId}] Error OpenAI:`, error.message);

        let errorMessage = '❌ **Error del servicio OpenAI**\n\n';

        if (error.message.includes('insufficient_quota')) {
            errorMessage += '💳 **Cuota agotada**: La cuota de OpenAI se ha agotado.';
        } else if (error.message.includes('rate_limit')) {
            errorMessage += '⏰ **Límite de velocidad**: Demasiadas solicitudes. Intenta en unos momentos.';
        } else if (error.message.includes('invalid_api_key')) {
            errorMessage += '🔑 **API Key inválida**: Problema de configuración.';
        } else if (error.message.includes('model_not_found')) {
            errorMessage += '🤖 **Modelo no encontrado**: El modelo solicitado no está disponible.';
        } else if (error.message.includes('timeout')) {
            errorMessage += '⏰ **Timeout**: El servidor tardó demasiado en responder.';
        } else {
            errorMessage += `🔧 **Error técnico**: ${error.message}`;
        }

        errorMessage += '\n\n💡 Intenta nuevamente en unos momentos.';

        return {
            type: 'text',
            content: errorMessage
        };
    }

    selectBestModel(mensaje, userInfo) {
        const mensajeLower = mensaje.toLowerCase();
        
        // Para consultas complejas o técnicas, usar GPT-4
        if (mensajeLower.includes('analizar') || 
            mensajeLower.includes('explicar') ||
            mensajeLower.includes('código') ||
            mensajeLower.includes('programar') ||
            mensajeLower.includes('tasas') ||
            mensajeLower.includes('saldo') ||
            mensajeLower.includes('resumen') ||
            mensaje.length > 200) {
            return "gpt-4o-mini";
        }
        
        // Para consultas simples, también usar GPT-4o-mini (es eficiente)
        return "gpt-4o-mini";
    }

    calculateTemperature(mensaje) {
        const mensajeLower = mensaje.toLowerCase();
        
        // Temperatura baja para consultas técnicas o de información
        if (mensajeLower.includes('qué es') || 
            mensajeLower.includes('cómo') ||
            mensajeLower.includes('explicar') ||
            mensajeLower.includes('información') ||
            mensajeLower.includes('tasas') ||
            mensajeLower.includes('saldo') ||
            mensajeLower.includes('resumen')) {
            return 0.3;
        }
        
        // Temperatura alta para creatividad
        if (mensajeLower.includes('crear') ||
            mensajeLower.includes('escribe') ||
            mensajeLower.includes('idea')) {
            return 0.8;
        }
        
        // Temperatura media por defecto
        return 1.0;
    }

    calculateMaxTokens(mensaje) {
        if (mensaje.length > 500) return 4000;  // Consultas largas
        if (mensaje.length > 200) return 2000;  // Consultas medianas
        return 1500;  // Consultas cortas
    }

    shouldUseTools(mensaje) {
        const mensajeLower = mensaje.toLowerCase();
        
        const toolKeywords = [
            // Fecha y hora
            'fecha', 'hora', 'día', 'hoy', 'cuando', 'qué día',
            
            // Información personal
            'mi información', 'mis datos', 'perfil', 'mi info', 'quien soy',
            
            // ✅ NUEVAS: Palabras clave para saldos
            'saldo', 'saldos', 'cuánto tengo', 'cuanto tengo', 'dinero',
            'cuenta', 'cuentas', 'disponible', 'retenido', 'balance',
            'mi dinero', 'mi saldo', 'consultar saldo', 'ver saldo',
            
            // Tasas de interés - PALABRAS CLAVE ESPECÍFICAS
            'tasas', 'tasa', 'interes', 'interés', 'préstamo', 'crédito',
            'vista', 'fijo', 'fap', 'nov', 'depósito', 'depósitos',
            'ahorro', 'ahorros', 'inversión', 'rendimiento',
            
            // Resúmenes y análisis
            'resumen', 'resumir', 'análisis', 'analizar',
            'reporte', 'informe',
            
            // Análisis de conversación
            'analizar conversacion', 'analisis conversacion', 'patrones',
            'sentimientos', 'temas', 'recomendaciones',
            
            // APIs y consultas
            'consultar', 'api', 'buscar'
        ];
        
        const usarHerramientas = toolKeywords.some(keyword => mensajeLower.includes(keyword));
        
        if (usarHerramientas) {
            console.log(`🛠️ Herramientas habilitadas para: "${mensaje.substring(0, 50)}..."`);
            console.log(`   Palabras clave detectadas: ${toolKeywords.filter(k => mensajeLower.includes(k)).join(', ')}`);
        }
        
        return usarHerramientas;
    }

    /**
     * ✅ MEJORADO: Estadísticas del servicio con información de saldos
     */
    getServiceStats() {
        return {
            initialized: this.initialized,
            available: this.openaiAvailable,
            error: this.initializationError,
            modelsAvailable: ['gpt-4o-mini'],
            featuresEnabled: {
                basic_conversation: true,
                tools: true,
                conversation_history: true,
                user_context: true,
                saldo_consultation: true,              // ✅ NUEVA
                tasas_interes: true,
                api_integration: true,
                openai_conversation_format: cosmosService.isAvailable(),
                conversation_analysis: cosmosService.isAvailable()
            },
            toolsCount: this.tools?.length || 0,
            conversationFormatSupport: {
                available: cosmosService.isAvailable(),
                analysisTypes: ['resumen', 'sentimientos', 'temas', 'patrones', 'recomendaciones'],
                intelligentSummary: true,
                statisticsCalculation: true
            },
            timestamp: new Date().toISOString(),
            version: '2.2.0-saldos-support'             // ✅ NUEVA VERSIÓN
        };
    }

    isAvailable() {
        return this.openaiAvailable && this.initialized;
    }

    /**
     * ✅ NUEVO: Método para procesar conversación completa
     */
    async procesarConversacionCompleta(conversationId, userId, userInfo) {
        try {
            if (!cosmosService.isAvailable() || !conversationId) {
                return null;
            }

            console.log(`🔄 [${userId}] Procesando conversación completa...`);

            const conversacion = await cosmosService.getConversationForOpenAI(
                conversationId,
                userId,
                true
            );

            if (!conversacion || conversacion.length === 0) {
                return null;
            }

            return {
                messages: conversacion,
                stats: this.calcularEstadisticasConversacion(conversacion),
                readyForAPI: true,
                timestamp: new Date().toISOString()
            };

        } catch (error) {
            console.error(`❌ Error procesando conversación completa:`, error);
            return null;
        }
    }

    cleanup() {
        console.log('🧹 Limpiando OpenAI Service...');
        console.log('✅ OpenAI Service limpiado');
    }
}

// Crear instancia singleton
const openaiService = new AzureOpenAIService();

module.exports = openaiService;