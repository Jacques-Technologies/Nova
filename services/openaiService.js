// services/openaiService.js - VERSIÓN MEJORADA con mejor experiencia conversacional

const OpenAI = require('openai');
const { DateTime } = require('luxon');
const axios = require('axios');
const { CardFactory } = require('botbuilder');
const conversationService = require('./conversationService');
require('dotenv').config();

/**
 * Servicio OpenAI mejorado con mejor manejo conversacional
 */
class OpenAIService {
    constructor() {
        this.initialized = false;
        this.initializationError = null;
        
        console.log('🚀 Inicializando OpenAI Service mejorado...');
        this.diagnoseConfiguration();
        this.initializeOpenAI();
        this.tools = this.defineTools();
        
        console.log(`✅ OpenAI Service inicializado - Disponible: ${this.openaiAvailable}`);
    }

    /**
     * ✅ MEJORADO: Diagnóstico más completo
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
     * ✅ MEJORADO: Inicialización con mejor validación
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
                timeout: 45000, // ✅ AUMENTADO: 45 segundos para respuestas complejas
                maxRetries: 3   // ✅ AUMENTADO: 3 reintentos
            });
            
            this.openaiAvailable = true;
            this.initialized = true;
            
            console.log('✅ Cliente OpenAI configurado exitosamente');
            
            // ✅ NUEVO: Test básico de conectividad (opcional)
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
     * ✅ NUEVO: Test de conectividad básico
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
            }
            
        } catch (error) {
            console.warn('⚠️ Test de conectividad falló:', error.message);
            // No marcamos como no disponible, podría ser temporal
        }
    }

    /**
     * ✅ MEJORADO: Herramientas más útiles y específicas
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
                    name: "generar_resumen_conversacion",
                    description: "Genera un resumen de la conversación actual",
                    parameters: { type: "object", properties: {} }
                }
            }
        ];

        return tools;
    }

    /**
     * ✅ MEJORADO: Procesamiento principal con mejor contexto y historial
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

            console.log(`📝 [${userInfo?.usuario || 'unknown'}] Procesando: "${mensaje}"`);
            
            // ✅ NUEVO: Guardar mensaje del usuario en historial
            if (conversationId && userInfo) {
                await conversationService.saveMessage(mensaje, conversationId, userInfo.usuario);
            }

            // ✅ MEJORADO: Obtener historial reciente si está disponible
            let historialCompleto = historial;
            if (conversationId && (!historial || historial.length === 0)) {
                historialCompleto = await conversationService.getConversationHistory(conversationId, 10);
                console.log(`📚 Historial obtenido: ${historialCompleto.length} mensajes`);
            }

            const mensajes = this.formatearHistorial(historialCompleto, userInfo);
            mensajes.push({ role: "user", content: mensaje });

            // ✅ MEJORADO: Configuración más inteligente del modelo
            const requestConfig = {
                model: this.selectBestModel(mensaje, userInfo),
                messages: mensajes,
                temperature: this.calculateTemperature(mensaje),
                max_tokens: this.calculateMaxTokens(mensaje),
                presence_penalty: 0.1,  // ✅ NUEVO: Evitar repeticiones
                frequency_penalty: 0.1  // ✅ NUEVO: Promover variedad
            };

            // ✅ MEJORADO: Usar herramientas solo cuando sea apropiado
            if (this.shouldUseTools(mensaje)) {
                requestConfig.tools = this.tools;
                requestConfig.tool_choice = "auto";
                console.log('🛠️ Habilitando herramientas para esta consulta');
            }

            console.log(`🤖 Enviando a OpenAI (${requestConfig.model})...`);
            const response = await this.openai.chat.completions.create(requestConfig);
            
            if (!response?.choices?.length) {
                throw new Error('Respuesta vacía de OpenAI');
            }
            
            const messageResponse = response.choices[0].message;
            let finalResponse;

            if (messageResponse.tool_calls) {
                console.log(`🛠️ Ejecutando ${messageResponse.tool_calls.length} herramientas...`);
                finalResponse = await this.procesarHerramientas(
                    messageResponse, 
                    mensajes, 
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

            // ✅ NUEVO: Guardar respuesta del bot en historial
            if (conversationId && finalResponse.content) {
                await conversationService.saveMessage(finalResponse.content, conversationId, 'bot');
            }

            console.log(`✅ [${userInfo?.usuario || 'unknown'}] Respuesta generada exitosamente`);
            return finalResponse;

        } catch (error) {
            console.error('❌ Error en procesarMensaje:', error);
            return this.manejarErrorOpenAI(error, userInfo);
        }
    }

    /**
     * ✅ NUEVO: Seleccionar el mejor modelo según el tipo de consulta
     */
    selectBestModel(mensaje, userInfo) {
        const mensajeLower = mensaje.toLowerCase();
        
        // Para consultas complejas o técnicas, usar GPT-4
        if (mensajeLower.includes('analizar') || 
            mensajeLower.includes('explicar') ||
            mensajeLower.includes('código') ||
            mensajeLower.includes('programar') ||
            mensaje.length > 200) {
            return "gpt-4o-mini"; // ✅ Cambiado a gpt-4o-mini para mejor rendimiento
        }
        
        // Para consultas simples, usar GPT-3.5
        return "gpt-4o-mini";
    }

    /**
     * ✅ NUEVO: Calcular temperatura según el tipo de mensaje
     */
    calculateTemperature(mensaje) {
        const mensajeLower = mensaje.toLowerCase();
        
        // Temperatura baja para consultas técnicas o de información
        if (mensajeLower.includes('qué es') || 
            mensajeLower.includes('cómo') ||
            mensajeLower.includes('explicar') ||
            mensajeLower.includes('información')) {
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

    /**
     * ✅ NUEVO: Calcular tokens máximos según la consulta
     */
    calculateMaxTokens(mensaje) {
        if (mensaje.length > 500) return 4000;  // Consultas largas
        if (mensaje.length > 200) return 2000;  // Consultas medianas
        return 1500;  // Consultas cortas
    }

    /**
     * ✅ MEJORADO: Decidir si usar herramientas de manera más inteligente
     */
    shouldUseTools(mensaje) {
        const mensajeLower = mensaje.toLowerCase();
        
        const toolKeywords = [
            'fecha', 'hora', 'día', 'hoy', 
            'mi información', 'mis datos', 'perfil',
            'consultar', 'api', 'buscar',
            'resumen', 'historial'
        ];
        
        return toolKeywords.some(keyword => mensajeLower.includes(keyword));
    }

    /**
     * ✅ MEJORADO: Procesamiento de herramientas con mejor logging
     */
    async procesarHerramientas(messageResponse, mensajes, userToken, userInfo, conversationId) {
        const resultados = [];

        for (const call of messageResponse.tool_calls) {
            const { function: fnCall, id } = call;
            const { name, arguments: args } = fnCall;
            
            try {
                console.log(`🔧 Ejecutando herramienta: ${name}`);
                
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
                
                console.log(`✅ Herramienta ${name} ejecutada exitosamente`);
                
            } catch (error) {
                console.error(`❌ Error ejecutando herramienta ${name}:`, error);
                resultados.push({
                    tool_call_id: id,
                    content: `Error ejecutando ${name}: ${error.message}`
                });
            }
        }

        // ✅ MEJORADO: Generar respuesta final con mejor contexto
        const finalMessages = [
            ...mensajes,
            messageResponse,
            ...resultados.map(result => ({
                role: "tool",
                tool_call_id: result.tool_call_id,
                content: result.content
            }))
        ];

        console.log('🔄 Generando respuesta final con resultados de herramientas...');
        
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
     * ✅ MEJORADO: Herramientas más funcionales
     */
    async ejecutarHerramienta(nombre, parametros, userToken, userInfo, conversationId) {
        switch (nombre) {
            case 'obtener_fecha_hora_actual':
                return this.obtenerFechaHora(parametros.formato || 'completo');

            case 'obtener_informacion_usuario':
                return this.obtenerInfoUsuario(userInfo, parametros.incluir_token);

            case 'consultar_api_nova':
                return await this.consultarApiNova(
                    parametros.endpoint, 
                    userToken, 
                    parametros.metodo || 'GET',
                    parametros.parametros
                );

            case 'generar_resumen_conversacion':
                return await this.generarResumenConversacion(conversationId);

            default:
                throw new Error(`Herramienta desconocida: ${nombre}`);
        }
    }

    /**
     * ✅ NUEVO: Obtener fecha/hora con diferentes formatos
     */
    obtenerFechaHora(formato) {
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
                return `📅 **Fecha y Hora Actual**\n\n` +
                       `📅 Fecha: ${ahora.toFormat('dd/MM/yyyy')}\n` +
                       `🕐 Hora: ${ahora.toFormat('HH:mm:ss')}\n` +
                       `🌎 Zona: ${ahora.zoneName}\n` +
                       `📝 Día: ${ahora.toFormat('cccc', { locale: 'es' })}`;
        }
    }

    /**
     * ✅ MEJORADO: Información de usuario más completa
     */
    obtenerInfoUsuario(userInfo, incluirToken = false) {
        if (!userInfo) {
            return "❌ **Error**: Usuario no autenticado";
        }

        let info = `👤 **Información del Usuario**\n\n` +
                   `📝 **Nombre Completo**: ${userInfo.nombre} ${userInfo.paterno || ''} ${userInfo.materno || ''}`.trim() + '\n' +
                   `👤 **Usuario**: ${userInfo.usuario}\n` +
                   `📧 **ID Corporativo**: ${userInfo.usuario}\n`;

        if (incluirToken && userInfo.token) {
            info += `🔑 **Token**: ${userInfo.token.substring(0, 20)}...${userInfo.token.slice(-5)}\n`;
            info += `🔒 **Estado Token**: ✅ Válido\n`;
        }

        info += `\n💼 **Estado**: Autenticado y listo para usar el bot`;

        return info;
    }

    /**
     * ✅ NUEVO: Consultar APIs de Nova usando el token
     */
    async consultarApiNova(endpoint, userToken, metodo = 'GET', parametros = {}) {
        try {
            if (!userToken) {
                return "❌ **Error**: No hay token de autenticación disponible";
            }

            // ✅ Lista de endpoints permitidos (por seguridad)
            const endpointsPermitidos = [
                '/api/user/profile',
                '/api/user/info',
                '/api/empleados/datos',
                '/api/consultas/generales'
            ];

            if (!endpointsPermitidos.some(ep => endpoint.includes(ep))) {
                return `⚠️ **Endpoint no permitido**: ${endpoint}\n\nEndpoints disponibles:\n${endpointsPermitidos.join('\n')}`;
            }

            const baseUrl = 'https://pruebas.nova.com.mx/ApiRestNova';
            const url = `${baseUrl}${endpoint}`;

            console.log(`🌐 Consultando Nova API: ${metodo} ${endpoint}`);

            const config = {
                method: metodo,
                url: url,
                headers: {
                    'Authorization': `Bearer ${userToken}`,
                    'Content-Type': 'application/json'
                },
                timeout: 15000
            };

            if (metodo === 'POST' && parametros) {
                config.data = parametros;
            }

            const response = await axios(config);

            if (response.status === 200) {
                return `✅ **Consulta exitosa a Nova API**\n\n` +
                       `📊 **Endpoint**: ${endpoint}\n` +
                       `📝 **Datos**: ${JSON.stringify(response.data, null, 2)}`;
            } else {
                return `⚠️ **Respuesta inesperada**: Status ${response.status}`;
            }

        } catch (error) {
            console.error('Error consultando Nova API:', error.message);
            
            if (error.response?.status === 401) {
                return "🔒 **Error de autorización**: Tu token puede haber expirado. Intenta cerrar sesión e iniciar nuevamente.";
            } else if (error.response?.status === 404) {
                return `❌ **Endpoint no encontrado**: ${endpoint}`;
            } else {
                return `❌ **Error de conexión**: ${error.message}`;
            }
        }
    }

    /**
     * ✅ NUEVO: Generar resumen de conversación
     */
    async generarResumenConversacion(conversationId) {
        try {
            if (!conversationId) {
                return "⚠️ No hay ID de conversación disponible para generar resumen";
            }

            const historial = await conversationService.getConversationHistory(conversationId, 20);
            
            if (historial.length === 0) {
                return "📝 **Conversación nueva** - Aún no hay mensajes para resumir";
            }

            const mensajesTexto = historial
                .map(msg => `${msg.type === 'user' ? 'Usuario' : 'Bot'}: ${msg.message}`)
                .join('\n');

            return `📋 **Resumen de Conversación**\n\n` +
                   `💬 **Total de mensajes**: ${historial.length}\n` +
                   `🕐 **Última actividad**: ${historial[historial.length - 1]?.timestamp || 'Desconocida'}\n\n` +
                   `📝 **Contenido reciente**:\n${mensajesTexto.substring(0, 500)}${mensajesTexto.length > 500 ? '...' : ''}`;

        } catch (error) {
            console.error('Error generando resumen:', error);
            return `❌ Error generando resumen: ${error.message}`;
        }
    }

    /**
     * ✅ MEJORADO: Formateo de historial con mejor contexto
     */
    formatearHistorial(historial, userInfo) {
        const fechaActual = DateTime.now().setZone('America/Mexico_City');
        
        const userContext = userInfo ? 
            `Usuario autenticado: ${userInfo.nombre} (${userInfo.usuario})` : 
            'Usuario no autenticado';

        const mensajes = [{
            role: "system",
            content: `Eres un asistente corporativo inteligente para Nova Corporation.

🔷 **Contexto del Usuario:**
${userContext}

🔷 **Fecha y Hora Actual:**
${fechaActual.toFormat('dd/MM/yyyy HH:mm:ss')} (${fechaActual.zoneName})

🔷 **Tus Capacidades:**
• Conversación natural e inteligente
• Ayuda con tareas laborales y consultas
• Acceso a información del usuario autenticado
• Consultas a APIs internas de Nova (cuando sea apropiado)
• Análisis y explicaciones detalladas

🔷 **Personalidad:**
• Profesional pero amigable
• Útil y proactivo
• Claro y conciso en respuestas
• Enfocado en productividad corporativa

🔷 **Importante:**
• Siempre mantén la información del usuario segura
• Si no tienes información específica, sugiere cómo obtenerla
• Usa las herramientas disponibles cuando sea apropiado`
        }];
        
        // ✅ MEJORADO: Procesar historial con mejor formato
        if (historial && historial.length > 0) {
            const recientes = historial.slice(-8); // Mantener solo los 8 más recientes
            recientes.forEach(item => {
                if (item.message && item.message.trim()) {
                    const role = item.type === 'user' || item.userId !== 'bot' ? "user" : "assistant";
                    mensajes.push({
                        role: role,
                        content: item.message.trim()
                    });
                }
            });
        }

        return mensajes;
    }

    /**
     * ✅ MEJORADO: Respuesta cuando OpenAI no está disponible
     */
    createUnavailableResponse() {
        let message = '🚫 **El servicio de inteligencia artificial no está disponible**\n\n';
        
        if (this.initializationError) {
            message += `**Problema detectado**: ${this.initializationError}\n\n`;
        }
        
        message += '**Funciones limitadas disponibles:**\n';
        message += '• `mi info` - Ver tu información\n';
        message += '• `logout` - Cerrar sesión\n';
        message += '• `ayuda` - Ver comandos disponibles\n\n';
        message += '**Para restaurar funcionalidad completa:**\n';
        message += '• Contacta al administrador del sistema\n';
        message += '• Verifica la configuración de OpenAI\n';

        return {
            type: 'text',
            content: message
        };
    }

    /**
     * ✅ MEJORADO: Manejo de errores más específico
     */
    manejarErrorOpenAI(error, userInfo) {
        const userId = userInfo?.usuario || 'unknown';
        console.error(`🚨 [${userId}] Error OpenAI:`, {
            message: error.message,
            code: error.code,
            type: error.type,
            status: error.status
        });

        let message = `❌ **Error del asistente de IA**\n\n`;

        if (error.code === 'rate_limit_exceeded') {
            message += '**Problema**: Límite de consultas excedido temporalmente\n';
            message += '**Solución**: Espera 1-2 minutos e intenta nuevamente\n';
        } else if (error.code === 'insufficient_quota') {
            message += '**Problema**: Cuota de OpenAI agotada\n';
            message += '**Solución**: Contacta al administrador del sistema\n';
        } else if (error.code === 'invalid_api_key') {
            message += '**Problema**: Configuración de API inválida\n';
            message += '**Solución**: El administrador debe verificar la configuración\n';
        } else if (error.message?.includes('timeout')) {
            message += '**Problema**: Tiempo de respuesta agotado\n';
            message += '**Solución**: Tu consulta puede ser muy compleja, intenta simplificarla\n';
        } else {
            message += `**Problema**: ${error.message}\n`;
            message += '**Solución**: Intenta reformular tu mensaje o contacta soporte\n';
        }

        message += `\n**Mientras tanto, puedes usar:**\n`;
        message += `• \`mi info\` - Ver tu información\n`;
        message += `• \`ayuda\` - Ver comandos disponibles`;

        return {
            type: 'text',
            content: message
        };
    }

    /**
     * ✅ NUEVO: Estadísticas del servicio
     */
    getServiceStats() {
        return {
            initialized: this.initialized,
            available: this.openaiAvailable,
            error: this.initializationError,
            modelsAvailable: ['gpt-4o-mini'],
            featuresEnabled: {
                tools: true,
                conversation_history: true,
                user_context: true,
                api_integration: true
            },
            timestamp: new Date().toISOString()
        };
    }
}

module.exports = new OpenAIService();