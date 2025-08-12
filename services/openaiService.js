// services/openaiService.js - MEJORADO: Con soporte para formato de conversación
const OpenAI = require('openai');
const { DateTime } = require('luxon');
const axios = require('axios');
const { CardFactory } = require('botbuilder');
const cosmosService = require('./cosmosService');
require('dotenv').config();

/**
 * Servicio OpenAI MEJORADO con soporte para formato de conversación OpenAI
 * - Mantiene compatibilidad con historial tradicional
 * - Aprovecha formato de conversación cuando está disponible
 * - Guardado automático en formato OpenAI
 */
class OpenAIService {
    constructor() {
        this.initialized = false;
        this.initializationError = null;
        
        console.log('🚀 Inicializando OpenAI Service con soporte para formato de conversación...');
        this.diagnoseConfiguration();
        this.initializeOpenAI();
        this.tools = this.defineTools();
        
        console.log(`✅ OpenAI Service inicializado - Disponible: ${this.openaiAvailable}`);
        console.log(`🔗 Formato de conversación: ${cosmosService.isAvailable() ? 'Disponible' : 'No disponible'}`);
    }

    /**
     * ✅ Diagnóstico de configuración
     */
    diagnoseConfiguration() {
        console.log('🔍 Diagnosticando configuración OpenAI...');
        
        const config = {
            apiKey: process.env.OPENAI_API_KEY,
            organization: process.env.OPENAI_ORGANIZATION || null,
            baseURL: process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1'
        };

        console.log('📊 Estado de configuración:');
        console.log(`   API Key: ${config.apiKey ? '✅ Configurada' : '❌ Faltante'}`);
        console.log(`   Organization: ${config.organization ? '✅ Configurada' : '⚠️ Opcional'}`);
        console.log(`   Base URL: ${config.baseURL}`);
        
        if (config.apiKey) {
            console.log(`   Key Preview: ${config.apiKey.substring(0, 10)}...${config.apiKey.slice(-4)}`);
        }
    }

    /**
     * ✅ Inicialización del cliente OpenAI
     */
    initializeOpenAI() {
        try {
            const apiKey = process.env.OPENAI_API_KEY;
            
            if (!apiKey) {
                this.initializationError = 'OPENAI_API_KEY no está configurada en las variables de entorno';
                console.error('❌ OpenAI Error:', this.initializationError);
                this.openaiAvailable = false;
                return;
            }

            // Validar formato de la API key
            if (!apiKey.startsWith('sk-') || apiKey.length < 40) {
                this.initializationError = 'OPENAI_API_KEY tiene un formato inválido';
                console.error('❌ OpenAI Error:', this.initializationError);
                this.openaiAvailable = false;
                return;
            }
            
            console.log('🔑 Configurando cliente OpenAI...');
            this.openai = new OpenAI({ 
                apiKey: apiKey,
                organization: process.env.OPENAI_ORGANIZATION || undefined,
                timeout: 45000, // 45 segundos para respuestas complejas
                maxRetries: 3   // 3 reintentos
            });
            
            this.openaiAvailable = true;
            this.initialized = true;
            
            console.log('✅ Cliente OpenAI configurado exitosamente');
            
            // Test básico de conectividad (opcional)
            if (process.env.NODE_ENV !== 'production') {
                this.testConnection();
            }
            
        } catch (error) {
            this.initializationError = `Error inicializando OpenAI: ${error.message}`;
            console.error('❌ Error inicializando OpenAI:', error);
            this.openaiAvailable = false;
        }
    }

    /**
     * ✅ Test de conectividad básico
     */
    async testConnection() {
        try {
            console.log('🧪 Probando conectividad con OpenAI...');
            
            const testResponse = await this.openai.chat.completions.create({
                model: "gpt-4o-mini",
                messages: [{ role: "user", content: "Test" }],
                max_tokens: 5,
                temperature: 0
            });
            
            if (testResponse?.choices?.length > 0) {
                console.log('✅ Test de conectividad OpenAI exitoso');
                return { success: true, model: testResponse.model };
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
     * ✅ Definir herramientas disponibles
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
            // ✅ NUEVA HERRAMIENTA: Trabajar con formato de conversación
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

        console.log(`🛠️ ${tools.length} herramientas definidas para OpenAI (incluyendo análisis de conversación)`);
        return tools;
    }

    /**
     * ✅ MÉTODO PRINCIPAL MEJORADO: Procesar mensaje con soporte para formato de conversación
     */
    async procesarMensaje(mensaje, historial = [], userToken = null, userInfo = null, conversationId = null) {
        try {
            if (!this.openaiAvailable) {
                return this.createUnavailableResponse();
            }

            if (!this.initialized) {
                console.warn('⚠️ OpenAI no inicializado, reintentando...');
                this.initializeOpenAI();
                
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

            // ✅ Configuración inteligente del modelo
            const requestConfig = {
                model: this.selectBestModel(mensaje, userInfo),
                messages: mensajesParaIA,
                temperature: this.calculateTemperature(mensaje),
                max_tokens: this.calculateMaxTokens(mensaje),
                presence_penalty: 0.1,
                frequency_penalty: 0.1
            };

            // ✅ Usar herramientas solo cuando sea apropiado
            if (this.shouldUseTools(mensaje)) {
                requestConfig.tools = this.tools;
                requestConfig.tool_choice = "auto";
                console.log(`🛠️ [${userInfo?.usuario || 'unknown'}] Habilitando herramientas para esta consulta`);
            }

            console.log(`🤖 [${userInfo?.usuario || 'unknown'}] Enviando a OpenAI (${requestConfig.model}, formato: ${usingOpenAIFormat ? 'OpenAI' : 'tradicional'})...`);
            const response = await this.openai.chat.completions.create(requestConfig);
            
            if (!response?.choices?.length) {
                throw new Error('Respuesta vacía de OpenAI');
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
                    content: messageResponse.content || 'Respuesta vacía de OpenAI'
                };
            }

            console.log(`✅ [${userInfo?.usuario || 'unknown'}] Respuesta generada exitosamente`);
            
            // ✅ METADATA: Agregar información sobre el formato usado
            finalResponse.metadata = {
                formatUsed: usingOpenAIFormat ? 'openai-conversation' : 'traditional-history',
                messagesProcessed: mensajesParaIA.length,
                modelUsed: requestConfig.model,
                toolsUsed: !!messageResponse.tool_calls
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
            content: `Eres un asistente corporativo inteligente para Nova Corporation con memoria de conversación.

🔷 **Contexto del Usuario:**
${userContext}

🔷 **Fecha y Hora Actual:**
${fechaActual.toFormat('dd/MM/yyyy HH:mm:ss')} (${fechaActual.zoneName})

🔷 **Historial de Conversación:**
${historial.length > 0 ? 
  `Tienes acceso a los últimos ${historial.length} mensajes de esta conversación.` : 
  'Esta es una conversación nueva.'
}

🔷 **Tus Capacidades:**
• Conversación natural e inteligente con memoria contextual
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
                        role: item.role, // ya viene como 'user' o 'assistant'
                        content: item.content.trim()
                    });
                    console.log(`   ${index + 1}. ${item.role}: ${item.content.substring(0, 30)}...`);
                }
            });
        }

        return mensajes;
    }

    /**
     * ✅ Procesamiento de herramientas con mejoras para análisis de conversación
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

        // ✅ Generar respuesta final con mejor contexto
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
            model: "gpt-4o-mini",
            messages: finalMessages,
            temperature: 0.7,
            max_tokens: 3000
        });

        return {
            type: 'text',
            content: finalResponse.choices[0].message.content || 'No se pudo generar respuesta final'
        };
    }

    /**
     * ✅ MEJORADO: Ejecutar herramientas con nueva funcionalidad de análisis
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

            // ✅ NUEVA HERRAMIENTA: Análisis de conversación OpenAI
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
                max_tokens: 2000
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
            resumen += `• Escribe \`conversacion openai\` - Ver formato OpenAI\n`;
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
            if (!tasasData || !Array.isArray(tasasData)) {
                return "❌ **Error**: Datos de tasas inválidos";
            }

            let tabla = `💰 **TASAS DE INTERÉS NOVA CORPORATION ${anio}**\n\n`;
            tabla += `👤 **Usuario**: ${usuario}  📅 **Año**: ${anio}  🕐 **Actualizado**: ${new Date().toLocaleDateString('es-MX')}\n\n`;

            tabla += `📊 **DETALLE POR MES:**\n\n`;
            
            tasasData.forEach((mes, index) => {
                if (mes.Mes) {
                    tabla += `🗓️ **${mes.Mes.toUpperCase()}**\n`;
                    tabla += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
                    
                    const vista = mes.vista !== undefined ? `${mes.vista}%` : 'N/A';
                    tabla += `💳 **Cuenta Vista (Ahorros):** ${vista}\n`;
                    
                    tabla += `📈 **Depósitos a Plazo Fijo:**\n`;
                    const fijo1 = mes.fijo1 !== undefined ? `${mes.fijo1}%` : 'N/A';
                    const fijo3 = mes.fijo3 !== undefined ? `${mes.fijo3}%` : 'N/A';
                    const fijo6 = mes.fijo6 !== undefined ? `${mes.fijo6}%` : 'N/A';
                    tabla += `   🔸 1 mes: ${fijo1}    🔸 3 meses: ${fijo3}    🔸 6 meses: ${fijo6}\n`;
                    
                    const fap = mes.FAP !== undefined ? `${mes.FAP}%` : 'N/A';
                    const nov = mes.Nov !== undefined ? `${mes.Nov}%` : 'N/A';
                    const prestamos = mes.Prestamos !== undefined ? `${mes.Prestamos}%` : 'N/A';
                    
                    tabla += `🏦 **FAP (Fondo Ahorro):** ${fap}    🔄 **Novación:** ${nov}\n`;
                    tabla += `💸 **Préstamos:** ${prestamos}\n`;
                    
                    if (index < tasasData.length - 1) {
                        tabla += `\n`;
                    }
                }
            });

            tabla += `\n\n💡 **ANÁLISIS Y RECOMENDACIONES**\n`;
            tabla += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;

            const tasasConDatos = tasasData.filter(mes => 
                mes.vista !== undefined || mes.fijo6 !== undefined
            );
            
            if (tasasConDatos.length > 0) {
                const ultimasTasas = tasasConDatos[tasasConDatos.length - 1];
                
                tabla += `⭐ **MEJORES OPCIONES ACTUALES (${ultimasTasas.Mes || 'Último mes'}):**\n\n`;
                
                const tasasAhorro = [
                    { tipo: 'Depósito 6 meses', tasa: ultimasTasas.fijo6, emoji: '🏆' },
                    { tipo: 'FAP Empleados', tasa: ultimasTasas.FAP, emoji: '💼' },
                    { tipo: 'Depósito 3 meses', tasa: ultimasTasas.fijo3, emoji: '📊' },
                    { tipo: 'Cuenta Vista', tasa: ultimasTasas.vista, emoji: '💳' }
                ].filter(item => item.tasa !== undefined)
                 .sort((a, b) => b.tasa - a.tasa);

                if (tasasAhorro.length > 0) {
                    tabla += `${tasasAhorro[0].emoji} **MEJOR PARA AHORRAR:** ${tasasAhorro[0].tipo} - **${tasasAhorro[0].tasa}%**\n`;
                    
                    if (tasasAhorro.length > 1) {
                        tabla += `${tasasAhorro[1].emoji} **SEGUNDA OPCIÓN:** ${tasasAhorro[1].tipo} - **${tasasAhorro[1].tasa}%**\n`;
                    }
                }
                
                if (ultimasTasas.Prestamos) {
                    tabla += `💸 **PRÉSTAMOS:** ${ultimasTasas.Prestamos}% - `;
                    if (ultimasTasas.Prestamos < 13) {
                        tabla += `✅ Tasa competitiva\n`;
                    } else {
                        tabla += `⚠️ Considera comparar opciones\n`;
                    }
                }
            }

            tabla += `\n💬 **¿Necesitas asesoría personalizada?** Pregúntame sobre cualquier producto específico.`;

            return tabla;

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
        return 0.7;
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
            
            // Tasas de interés - PALABRAS CLAVE ESPECÍFICAS
            'tasas', 'tasa', 'interes', 'interés', 'préstamo', 'crédito',
            'vista', 'fijo', 'fap', 'nov', 'depósito', 'depósitos',
            'ahorro', 'ahorros', 'inversión', 'rendimiento',
            
            // Resúmenes y análisis
            'resumen', 'resumir', 'análisis', 'analizar',
            'reporte', 'informe',
            
            // ✅ NUEVOS: Análisis de conversación
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
     * ✅ MEJORADO: Estadísticas del servicio con información de conversación
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
                tasas_interes: true,
                api_integration: true,
                openai_conversation_format: cosmosService.isAvailable(), // ✅ NUEVA
                conversation_analysis: cosmosService.isAvailable()       // ✅ NUEVA
            },
            toolsCount: this.tools?.length || 0,
            conversationFormatSupport: {
                available: cosmosService.isAvailable(),
                analysisTypes: ['resumen', 'sentimientos', 'temas', 'patrones', 'recomendaciones'],
                intelligentSummary: true,
                statisticsCalculation: true
            },
            timestamp: new Date().toISOString(),
            version: '2.1.3-conversation-format'
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
const openaiService = new OpenAIService();

module.exports = openaiService;