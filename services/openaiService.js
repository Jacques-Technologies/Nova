// services/openaiService.js - CÓDIGO COMPLETO CORREGIDO
// OpenAI Service simplificado que trabaja con el nuevo sistema de historial de TeamsBot
const OpenAI = require('openai');
const { DateTime } = require('luxon');
const axios = require('axios');
const { CardFactory } = require('botbuilder');
require('dotenv').config();

/**
 * Servicio OpenAI COMPLETO Y CORREGIDO
 * - Se enfoca solo en procesamiento de mensajes
 * - Recibe historial formateado desde TeamsBot
 * - No maneja guardado (TeamsBot lo hace automáticamente)
 * - Incluye herramientas esenciales para funcionalidad corporativa
 */
class OpenAIService {
    constructor() {
        this.initialized = false;
        this.initializationError = null;
        
        console.log('🚀 Inicializando OpenAI Service COMPLETO...');
        this.diagnoseConfiguration();
        this.initializeOpenAI();
        this.tools = this.defineTools();
        
        console.log(`✅ OpenAI Service inicializado - Disponible: ${this.openaiAvailable}`);
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
                    description: "Genera un resumen inteligente de la conversación actual usando el historial disponible",
                    parameters: { 
                        type: "object", 
                        properties: {
                            incluir_estadisticas: {
                                type: "boolean",
                                description: "Si incluir estadísticas detalladas"
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
            }
        ];

        console.log(`🛠️ ${tools.length} herramientas definidas para OpenAI`);
        return tools;
    }

    /**
     * ✅ MÉTODO PRINCIPAL: Procesar mensaje (CORREGIDO)
     * Ya no maneja guardado - TeamsBot lo hace automáticamente
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

            // ✅ IMPORTANTE: Ya no manejamos guardado aquí - TeamsBot lo hace automáticamente
            // Solo procesamos el mensaje con el historial que nos proporcionan

            // ✅ Formatear mensajes para OpenAI
            const mensajes = this.formatearHistorialParaOpenAI(historial, userInfo);
            mensajes.push({ role: "user", content: mensaje });

            // ✅ Configuración inteligente del modelo
            const requestConfig = {
                model: this.selectBestModel(mensaje, userInfo),
                messages: mensajes,
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

            console.log(`🤖 [${userInfo?.usuario || 'unknown'}] Enviando a OpenAI (${requestConfig.model})...`);
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

            console.log(`✅ [${userInfo?.usuario || 'unknown'}] Respuesta generada exitosamente`);
            return finalResponse;

        } catch (error) {
            console.error('❌ Error en procesarMensaje:', error);
            return this.manejarErrorOpenAI(error, userInfo);
        }
    }

    /**
     * ✅ Formatear historial para OpenAI (MEJORADO)
     */
    formatearHistorialParaOpenAI(historial, userInfo) {
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
        
        // ✅ Procesar historial (ya viene en el formato correcto desde TeamsBot)
        if (historial && historial.length > 0) {
            console.log(`📚 Formateando ${historial.length} mensajes del historial...`);
            
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
     * ✅ Seleccionar el mejor modelo según el tipo de consulta
     */
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

    /**
     * ✅ Calcular temperatura según el tipo de mensaje
     */
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

    /**
     * ✅ Calcular tokens máximos según la consulta
     */
    calculateMaxTokens(mensaje) {
        if (mensaje.length > 500) return 4000;  // Consultas largas
        if (mensaje.length > 200) return 2000;  // Consultas medianas
        return 1500;  // Consultas cortas
    }

    /**
     * ✅ Decidir si usar herramientas con detección mejorada
     */
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
     * ✅ Procesamiento de herramientas con mejor logging
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
     * ✅ Ejecutar herramientas disponibles
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
                return await this.generarResumenConversacion(conversationId, userInfo, parametros.incluir_estadisticas);

            case 'consultar_api_nova':
                console.log(`🌐 [${userId}] Consultando API Nova: ${parametros.endpoint}`);
                return await this.consultarApiNova(
                    parametros.endpoint, 
                    userToken, 
                    parametros.metodo || 'GET',
                    parametros.parametros
                );

            default:
                throw new Error(`Herramienta desconocida: ${nombre}`);
        }
    }

    /**
     * ✅ Obtener fecha/hora con diferentes formatos
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
     * ✅ Información de usuario más completa
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
            
            const numRI = this.extractNumRIFromToken(userInfo.token);
            if (numRI) {
                info += `🏦 **Región/RI**: ${numRI}\n`;
            }
        }

        info += `\n💼 **Estado**: Autenticado y listo para usar el bot`;

        return info;
    }

    /**
     * ✅ Consultar tasas de interés de Nova
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
     * ✅ Extraer NumRI del token JWT
     */
    extractNumRIFromToken(token) {
        try {
            if (!token || typeof token !== 'string') {
                return null;
            }

            const cleanToken = token.replace(/^Bearer\s+/, '');
            const tokenParts = cleanToken.split('.');
            if (tokenParts.length !== 3) {
                return null;
            }

            const payload = JSON.parse(Buffer.from(tokenParts[1], 'base64').toString());
            
            const numRI = payload.NumRI || 
                         payload.numRI || 
                         payload.RI || 
                         payload.ri || 
                         payload.region ||
                         "7";

            console.log(`🔍 NumRI extraído del token: ${numRI}`);
            return numRI;

        } catch (error) {
            console.warn('⚠️ Error extrayendo NumRI del token:', error.message);
            return "7";
        }
    }

    /**
     * ✅ Formatear tabla de tasas COMPLETAMENTE REDISEÑADO para Teams
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
     * ✅ Generar resumen de conversación (MEJORADO)
     */
    async generarResumenConversacion(conversationId, userInfo, incluirEstadisticas = true) {
        try {
            if (!conversationId || !userInfo) {
                return "⚠️ No hay información de conversación disponible para generar resumen";
            }

            // ✅ NOTA: El historial lo maneja TeamsBot, aquí solo generamos un resumen básico
            // En una implementación real, TeamsBot pasaría el historial como parámetro

            let resumen = `📊 **Resumen de Conversación**\n\n`;
            resumen += `👤 **Usuario**: ${userInfo.nombre} (${userInfo.usuario})\n`;
            resumen += `📅 **Fecha**: ${DateTime.now().setZone('America/Mexico_City').toFormat('dd/MM/yyyy HH:mm')}\n`;
            
            if (incluirEstadisticas) {
                resumen += `💾 **Persistencia**: Activada\n`;
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
     * ✅ Consultar APIs de Nova usando el token
     */
    async consultarApiNova(endpoint, userToken, metodo = 'GET', parametros = {}) {
        try {
            if (!userToken) {
                return "❌ **Error**: No hay token de autenticación disponible";
            }

            const endpointsPermitidos = [
                '/api/user/profile',
                '/api/user/info',
                '/api/empleados/datos',
                '/api/consultas/generales',
                '/api/ConsultaTasa/consultaTasa'
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
     * ✅ Respuesta cuando OpenAI no está disponible
     */
    createUnavailableResponse() {
        let message = '🚫 **El servicio de inteligencia artificial no está disponible**\n\n';
        
        if (this.initializationError) {
            message += `**Problema detectado**: ${this.initializationError}\n\n`;
        }
        
        message += '**Funciones limitadas disponibles:**\n';
        message += '• `mi info` - Ver tu información\n';
        message += '• `historial` - Ver conversaciones anteriores\n';
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
     * ✅ Manejo de errores más específico
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
        message += `• \`historial\` - Ver conversaciones anteriores\n`;
        message += `• \`ayuda\` - Ver comandos disponibles\n`;

        return {
            type: 'text',
            content: message
        };
    }

    /**
     * ✅ Estadísticas del servicio
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
                api_integration: true
            },
            toolsCount: this.tools?.length || 0,
            timestamp: new Date().toISOString(),
            version: '2.1.0-historial-completo'
        };
    }

    /**
     * ✅ Verificar disponibilidad
     */
    isAvailable() {
        return this.openaiAvailable && this.initialized;
    }

    /**
     * ✅ Procesar mensaje simple (método alternativo para casos especiales)
     */
    async procesarMensajeSimple(mensaje, userInfo = null) {
        try {
            if (!this.isAvailable()) {
                return this.createUnavailableResponse();
            }

            const mensajes = [
                {
                    role: "system",
                    content: `Eres un asistente corporativo de Nova Corporation. 
                    ${userInfo ? `Usuario: ${userInfo.nombre} (${userInfo.usuario})` : 'Usuario no identificado'}
                    Responde de forma profesional, clara y concisa.`
                },
                {
                    role: "user",
                    content: mensaje
                }
            ];

            const response = await this.openai.chat.completions.create({
                model: "gpt-4o-mini",
                messages: mensajes,
                temperature: 0.7,
                max_tokens: 1500
            });

            return {
                type: 'text',
                content: response.choices[0].message.content || 'Sin respuesta'
            };

        } catch (error) {
            console.error('❌ Error en procesarMensajeSimple:', error);
            return this.manejarErrorOpenAI(error, userInfo);
        }
    }

    /**
     * ✅ Limpiar servicio (para desarrollo)
     */
    cleanup() {
        console.log('🧹 Limpiando OpenAI Service...');
        // No hay mucho que limpiar en este servicio simplificado
        console.log('✅ OpenAI Service limpiado');
    }
}

// Crear instancia singleton
const openaiService = new OpenAIService();

module.exports = openaiService;