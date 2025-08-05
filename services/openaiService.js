// services/openaiService.js
// OpenAI Service mejorado con Cosmos DB y nuevas herramientas
const OpenAI = require('openai');
const { DateTime } = require('luxon');
const axios = require('axios');
const { CardFactory } = require('botbuilder');
const cosmosService = require('./cosmosService');
const documentService = require('./documentService');
require('dotenv').config();

/**
 * Servicio OpenAI mejorado con persistencia en Cosmos DB y herramienta de tasas
 */
class OpenAIService {
    constructor() {
        this.initialized = false;
        this.initializationError = null;
        
        console.log('🚀 Inicializando OpenAI Service con Cosmos DB...');
        this.diagnoseConfiguration();
        this.initializeOpenAI();
        this.tools = this.defineTools();
        
        console.log(`✅ OpenAI Service inicializado - Disponible: ${this.openaiAvailable}`);
    }

    /**
     * ✅ NUEVO: Buscar documentos corporativos
     */
    async buscarDocumentos(consulta, userInfo) {
        try {
            if (!documentService.isAvailable()) {
                return `⚠️ **Servicio de búsqueda de documentos no disponible**\n\n` +
                       `El sistema de búsqueda de documentos corporativos no está configurado.\n\n` +
                       `📋 **Funciones disponibles sin búsqueda:**\n` +
                       `• Información personal (\`mi info\`)\n` +
                       `• Consulta de tasas (\`tasas 2025\`)\n` +
                       `• Chat general con inteligencia artificial`;
            }

            const userId = userInfo?.usuario || 'unknown';
            console.log(`📖 [${userId}] Buscando documentos: "${consulta}"`);

            const resultado = await documentService.buscarDocumentosGenerales(consulta, userId);
            
            return resultado;

        } catch (error) {
            console.error('❌ Error en búsqueda de documentos:', error);
            return `❌ **Error buscando documentos**: ${error.message}`;
        }
    }

    /**
     * ✅ NUEVO: Buscar políticas específicas
     */
    async buscarPoliticas(tipoPolitica, userInfo) {
        try {
            if (!documentService.isAvailable()) {
                return `⚠️ **Servicio de políticas no disponible**\n\n` +
                       `No se puede acceder a las políticas corporativas en este momento.`;
            }

            const userId = userInfo?.usuario || 'unknown';
            console.log(`📋 [${userId}] Buscando política: ${tipoPolitica}`);

            const resultado = await documentService.buscarPoliticas(tipoPolitica, userId);
            
            return `📋 **Política: ${tipoPolitica.charAt(0).toUpperCase() + tipoPolitica.slice(1)}**\n\n${resultado}`;

        } catch (error) {
            console.error('❌ Error buscando políticas:', error);
            return `❌ **Error buscando política de ${tipoPolitica}**: ${error.message}`;
        }
    }

    /**
     * ✅ NUEVO: Obtener días feriados
     */
    async obtenerDiasFeriados(anio, userInfo) {
        try {
            if (!documentService.isAvailable()) {
                return `⚠️ **Información de feriados no disponible**\n\n` +
                       `No se puede acceder al calendario de días feriados.`;
            }

            const userId = userInfo?.usuario || 'unknown';
            const añoConsulta = anio || new Date().getFullYear();
            console.log(`📅 [${userId}] Obteniendo feriados para ${añoConsulta}`);

            const resultado = await documentService.obtenerDiasFeriados(añoConsulta, userId);
            
            return `📅 **Días Feriados ${añoConsulta}**\n\n${resultado}`;

        } catch (error) {
            console.error('❌ Error obteniendo feriados:', error);
            return `❌ **Error obteniendo feriados para ${anio || 'año actual'}**: ${error.message}`;
        }
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
        console.log(`   Cosmos DB: ${cosmosService.isAvailable() ? '✅ Disponible' : '⚠️ No disponible'}`);
        console.log(`   Document Search: ${documentService.isAvailable() ? '✅ Disponible' : '⚠️ No disponible'}`);
        
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
        }
    }

    /**
     * ✅ MEJORADO: Herramientas con nueva herramienta de tasas y documentos
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
                    name: "buscar_documentos",
                    description: "Busca documentos corporativos usando Azure Search con búsqueda vectorial. Incluye políticas, manuales, procedimientos y documentación interna.",
                    parameters: {
                        type: "object",
                        properties: {
                            consulta: {
                                type: "string",
                                description: "Términos de búsqueda o pregunta sobre documentos corporativos"
                            }
                        },
                        required: ["consulta"]
                    }
                }
            },
            {
                type: "function",
                function: {
                    name: "buscar_politicas",
                    description: "Busca políticas corporativas específicas como vacaciones, código de vestimenta, horarios, prestaciones, etc.",
                    parameters: {
                        type: "object",
                        properties: {
                            tipo_politica: {
                                type: "string",
                                enum: ["vacaciones", "codigo vestimenta", "horario", "home office", "prestaciones", "codigo conducta", "seguridad", "capacitacion", "nomina", "rh", "confidencialidad"],
                                description: "Tipo de política a buscar"
                            }
                        },
                        required: ["tipo_politica"]
                    }
                }
            },
            {
                type: "function",
                function: {
                    name: "obtener_dias_feriados",
                    description: "Consulta los días feriados oficiales de la empresa para un año específico",
                    parameters: {
                        type: "object",
                        properties: {
                            anio: {
                                type: "integer",
                                description: "Año para consultar feriados (default: año actual)",
                                minimum: 2020,
                                maximum: 2030
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
     * ✅ MEJORADO: Procesamiento principal con Cosmos DB
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
            
            // ✅ NUEVO: Guardar mensaje del usuario en Cosmos DB
            if (conversationId && userInfo && cosmosService.isAvailable()) {
                await cosmosService.saveMessage(
                    mensaje, 
                    conversationId, 
                    userInfo.usuario, 
                    userInfo.nombre, 
                    'user'
                );
                
                // Actualizar actividad de conversación
                await cosmosService.updateConversationActivity(conversationId, userInfo.usuario);
            }

            // ✅ MEJORADO: Obtener historial desde Cosmos DB si está disponible
            let historialCompleto = historial;
            if (conversationId && userInfo && cosmosService.isAvailable() && (!historial || historial.length === 0)) {
                historialCompleto = await cosmosService.getConversationHistory(conversationId, userInfo.usuario, 10);
                console.log(`📚 Historial desde Cosmos DB: ${historialCompleto.length} mensajes`);
            }

            const mensajes = this.formatearHistorial(historialCompleto, userInfo);
            mensajes.push({ role: "user", content: mensaje });

            // ✅ MEJORADO: Configuración más inteligente del modelo
            const requestConfig = {
                model: this.selectBestModel(mensaje, userInfo),
                messages: mensajes,
                temperature: this.calculateTemperature(mensaje),
                max_tokens: this.calculateMaxTokens(mensaje),
                presence_penalty: 0.1,
                frequency_penalty: 0.1
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

            // ✅ NUEVO: Guardar respuesta del bot en Cosmos DB
            if (conversationId && userInfo && finalResponse.content && cosmosService.isAvailable()) {
                await cosmosService.saveMessage(
                    finalResponse.content, 
                    conversationId, 
                    userInfo.usuario, 
                    'Nova Bot', 
                    'bot'
                );
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
            mensajeLower.includes('tasas') ||
            mensaje.length > 200) {
            return "gpt-4o-mini";
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
            mensajeLower.includes('información') ||
            mensajeLower.includes('tasas')) {
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
     * ✅ MEJORADO: Decidir si usar herramientas con nuevas herramientas de documentos
     */
    shouldUseTools(mensaje) {
        const mensajeLower = mensaje.toLowerCase();
        
        const toolKeywords = [
            'fecha', 'hora', 'día', 'hoy', 
            'mi información', 'mis datos', 'perfil',
            'consultar', 'api', 'buscar',
            'resumen', 'historial',
            'tasas', 'tasa', 'interes', 'interés', 'préstamo', 'crédito',
            'vista', 'fijo', 'fap', 'nov',
            // Nuevas palabras clave para documentos
            'documento', 'documentos', 'política', 'políticas', 'politica', 'politicas',
            'manual', 'procedimiento', 'procedimientos', 'normativa', 'normas',
            'vacaciones', 'feriados', 'festivos', 'dias libres',
            'horario', 'horarios', 'jornada', 'trabajo',
            'vestimenta', 'uniforme', 'dress code',
            'prestaciones', 'beneficios', 'compensaciones', 'aguinaldo',
            'seguridad', 'higiene', 'riesgos', 'protección',
            'capacitación', 'entrenamiento', 'cursos', 'formación',
            'código de conducta', 'ética', 'comportamiento',
            'recursos humanos', 'rh', 'personal', 'contratación',
            'nómina', 'salarios', 'pagos', 'descuentos'
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
     * ✅ MEJORADO: Herramientas con nuevas funciones de documentos
     */
    async ejecutarHerramienta(nombre, parametros, userToken, userInfo, conversationId) {
        switch (nombre) {
            case 'obtener_fecha_hora_actual':
                return this.obtenerFechaHora(parametros.formato || 'completo');

            case 'obtener_informacion_usuario':
                return this.obtenerInfoUsuario(userInfo, parametros.incluir_token);

            case 'consultar_tasas_interes':
                return await this.consultarTasasInteres(parametros.anio, userToken, userInfo);

            case 'buscar_documentos':
                return await this.buscarDocumentos(parametros.consulta, userInfo);

            case 'buscar_politicas':
                return await this.buscarPoliticas(parametros.tipo_politica, userInfo);

            case 'obtener_dias_feriados':
                return await this.obtenerDiasFeriados(parametros.anio, userInfo);

            case 'consultar_api_nova':
                return await this.consultarApiNova(
                    parametros.endpoint, 
                    userToken, 
                    parametros.metodo || 'GET',
                    parametros.parametros
                );

            case 'generar_resumen_conversacion':
                return await this.generarResumenConversacion(conversationId, userInfo);

            default:
                throw new Error(`Herramienta desconocida: ${nombre}`);
        }
    }

    /**
     * ✅ NUEVO: Consultar tasas de interés de Nova
     */
    async consultarTasasInteres(anio, userToken, userInfo) {
        try {
            if (!userToken || !userInfo) {
                return "❌ **Error**: Usuario no autenticado para consultar tasas";
            }

            // Extraer información del token/userInfo
            const cveUsuario = userInfo.usuario;
            const numRI = this.extractNumRIFromToken(userToken) || "7"; // Default "7" si no se encuentra

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

            const response = await axios.post(
                'https://pruebas.nova.com.mx/ApiRestNova/api/ConsultaTasa/consultaTasa',
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
     * ✅ NUEVO: Extraer NumRI del token JWT
     */
    extractNumRIFromToken(token) {
        try {
            if (!token || typeof token !== 'string') {
                return null;
            }

            // Remover 'Bearer ' si está presente
            const cleanToken = token.replace(/^Bearer\s+/, '');

            // Verificar formato JWT
            const tokenParts = cleanToken.split('.');
            if (tokenParts.length !== 3) {
                return null;
            }

            // Decodificar payload
            const payload = JSON.parse(Buffer.from(tokenParts[1], 'base64').toString());
            
            // Buscar NumRI en diferentes posibles campos
            const numRI = payload.NumRI || 
                         payload.numRI || 
                         payload.RI || 
                         payload.ri || 
                         payload.region ||
                         "7"; // Default

            console.log(`🔍 NumRI extraído del token: ${numRI}`);
            return numRI;

        } catch (error) {
            console.warn('⚠️ Error extrayendo NumRI del token:', error.message);
            return "7"; // Default value
        }
    }

    /**
     * ✅ NUEVO: Formatear tabla de tasas para mostrar
     */
    formatearTablaTasas(tasasData, anio, usuario) {
        try {
            if (!tasasData || !Array.isArray(tasasData)) {
                return "❌ **Error**: Datos de tasas inválidos";
            }

            let tabla = `📊 **Tasas de Interés Nova - ${anio}**\n`;
            tabla += `👤 **Usuario**: ${usuario}\n\n`;

            // Crear encabezado de tabla
            tabla += `| Mes | Vista | Fijo 1M | Fijo 3M | Fijo 6M | FAP | Nov | Préstamos |\n`;
            tabla += `|-----|-------|---------|---------|---------|-----|-----|----------|\n`;

            // Procesar cada mes
            tasasData.forEach(mes => {
                if (mes.Mes) {
                    const vista = mes.vista !== undefined ? `${mes.vista}%` : '-';
                    const fijo1 = mes.fijo1 !== undefined ? `${mes.fijo1}%` : '-';
                    const fijo3 = mes.fijo3 !== undefined ? `${mes.fijo3}%` : '-';
                    const fijo6 = mes.fijo6 !== undefined ? `${mes.fijo6}%` : '-';
                    const fap = mes.FAP !== undefined ? `${mes.FAP}%` : '-';
                    const nov = mes.Nov !== undefined ? `${mes.Nov}%` : '-';
                    const prestamos = mes.Prestamos !== undefined ? `${mes.Prestamos}%` : '-';

                    tabla += `| ${mes.Mes} | ${vista} | ${fijo1} | ${fijo3} | ${fijo6} | ${fap} | ${nov} | ${prestamos} |\n`;
                }
            });

            tabla += `\n📝 **Leyenda**:\n`;
            tabla += `• **Vista**: Cuenta de ahorros vista\n`;
            tabla += `• **Fijo 1M/3M/6M**: Depósitos a plazo fijo (1, 3, 6 meses)\n`;
            tabla += `• **FAP**: Fondo de Ahorro y Préstamo\n`;
            tabla += `• **Nov**: Novación\n`;
            tabla += `• **Préstamos**: Tasa de préstamos\n`;

            // Encontrar tasas más altas para destacar
            const tasasConDatos = tasasData.filter(mes => mes.vista !== undefined);
            if (tasasConDatos.length > 0) {
                const ultimasTasas = tasasConDatos[tasasConDatos.length - 1];
                tabla += `\n💡 **Tasas actuales más competitivas**:\n`;
                if (ultimasTasas.fijo6) tabla += `• Depósito 6 meses: **${ultimasTasas.fijo6}%**\n`;
                if (ultimasTasas.FAP) tabla += `• FAP: **${ultimasTasas.FAP}%**\n`;
                if (ultimasTasas.Prestamos) tabla += `• Préstamos: **${ultimasTasas.Prestamos}%**\n`;
            }

            return tabla;

        } catch (error) {
            console.error('❌ Error formateando tabla de tasas:', error);
            return `❌ **Error formateando tasas**: ${error.message}`;
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
            
            // Mostrar NumRI si está disponible
            const numRI = this.extractNumRIFromToken(userInfo.token);
            if (numRI) {
                info += `🏦 **Región/RI**: ${numRI}\n`;
            }
        }

        info += `\n💼 **Estado**: Autenticado y listo para usar el bot`;
        info += `\n💾 **Persistencia**: ${cosmosService.isAvailable() ? '✅ Cosmos DB activo' : '⚠️ Solo memoria'}`;

        return info;
    }

    /**
     * ✅ MEJORADO: Consultar APIs de Nova usando el token
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
     * ✅ MEJORADO: Generar resumen de conversación con Cosmos DB
     */
    async generarResumenConversacion(conversationId, userInfo) {
        try {
            if (!conversationId || !userInfo) {
                return "⚠️ No hay información de conversación disponible para generar resumen";
            }

            let historial = [];
            let estadisticas = {};

            if (cosmosService.isAvailable()) {
                console.log(`📊 Generando resumen desde Cosmos DB para ${userInfo.usuario}`);
                
                historial = await cosmosService.getConversationHistory(conversationId, userInfo.usuario, 50);
                
                // Obtener información adicional de la conversación
                const conversationInfo = await cosmosService.getConversationInfo(conversationId, userInfo.usuario);
                
                estadisticas = {
                    totalMensajes: historial.length,
                    ultimaActividad: conversationInfo?.lastActivity || 'Desconocida',
                    conversacionCreada: conversationInfo?.createdAt || 'Desconocida',
                    persistencia: 'Cosmos DB'
                };
            } else {
                return "⚠️ Cosmos DB no disponible - No se puede generar resumen completo";
            }
            
            if (historial.length === 0) {
                return "📝 **Conversación nueva** - Aún no hay mensajes para resumir";
            }

            // Analizar tipos de mensajes
            const mensajesUsuario = historial.filter(msg => msg.type === 'user').length;
            const mensajesBot = historial.filter(msg => msg.type === 'bot').length;

            // Crear resumen
            let resumen = `📋 **Resumen de Conversación**\n\n`;
            resumen += `👤 **Usuario**: ${userInfo.nombre} (${userInfo.usuario})\n`;
            resumen += `💬 **Total de mensajes**: ${estadisticas.totalMensajes}\n`;
            resumen += `📤 **Mensajes del usuario**: ${mensajesUsuario}\n`;
            resumen += `🤖 **Respuestas del bot**: ${mensajesBot}\n`;
            resumen += `🕐 **Última actividad**: ${estadisticas.ultimaActividad}\n`;
            resumen += `📅 **Conversación iniciada**: ${estadisticas.conversacionCreada}\n`;
            resumen += `💾 **Persistencia**: ${estadisticas.persistencia}\n\n`;

            // Mostrar últimos mensajes
            const ultimosMensajes = historial.slice(-6);
            resumen += `📝 **Últimos mensajes**:\n`;
            ultimosMensajes.forEach((msg, index) => {
                const tipo = msg.type === 'user' ? '👤 Usuario' : '🤖 Bot';
                const preview = msg.message.length > 100 ? 
                    msg.message.substring(0, 100) + '...' : 
                    msg.message;
                resumen += `${index + 1}. ${tipo}: ${preview}\n`;
            });

            return resumen;

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

        const persistenciaInfo = cosmosService.isAvailable() ? 
            'Persistencia: Cosmos DB activa' : 
            'Persistencia: Solo memoria temporal';

        const documentosInfo = documentService.isAvailable() ?
            'Búsqueda de Documentos: Azure Search activo con embeddings vectoriales' :
            'Búsqueda de Documentos: No disponible';

        const mensajes = [{
            role: "system",
            content: `Eres un asistente corporativo inteligente para Nova Corporation.

🔷 **Contexto del Usuario:**
${userContext}

🔷 **Fecha y Hora Actual:**
${fechaActual.toFormat('dd/MM/yyyy HH:mm:ss')} (${fechaActual.zoneName})

🔷 **Estado del Sistema:**
${persistenciaInfo}
${documentosInfo}

🔷 **Tus Capacidades:**
• Conversación natural e inteligente con persistencia
• Consulta de tasas de interés de Nova (herramienta especializada)
• Búsqueda de documentos corporativos con IA vectorial
• Consulta de políticas empresariales (vacaciones, horarios, prestaciones, etc.)
• Información de días feriados oficiales
• Acceso a información del usuario autenticado
• Consultas a APIs internas de Nova
• Análisis y explicaciones detalladas
• Historial de conversaciones (${cosmosService.isAvailable() ? 'persistente' : 'temporal'})

🔷 **Herramientas Especiales:**
• Consulta de tasas de interés por año
• Búsqueda vectorial de documentos corporativos
• Políticas específicas (RH, seguridad, prestaciones)
• Calendario de días feriados
• Información de usuario completa
• Resumen de conversaciones
• Consultas a APIs de Nova

🔷 **Personalidad:**
• Profesional pero amigable
• Útil y proactivo para temas financieros
• Claro y conciso en respuestas
• Enfocado en productividad corporativa y servicios financieros

🔷 **Importante:**
• Siempre mantén la información del usuario segura
• Para consultas de tasas, usa la herramienta especializada
• Si no tienes información específica, sugiere cómo obtenerla
• Las conversaciones se guardan ${cosmosService.isAvailable() ? 'permanentemente' : 'temporalmente'}`
        }];
        
        // Procesar historial
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
        
        if (cosmosService.isAvailable()) {
            message += '✅ **Persistencia activa**: Tus conversaciones se guardan en Cosmos DB\n\n';
        } else {
            message += '⚠️ **Solo memoria temporal**: Las conversaciones no se guardan\n\n';
        }
        
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
        message += `• \`ayuda\` - Ver comandos disponibles\n`;
        
        if (cosmosService.isAvailable()) {
            message += `• Tu historial se mantiene guardado en Cosmos DB`;
        }

        return {
            type: 'text',
            content: message
        };
    }

    /**
     * ✅ MEJORADO: Estadísticas del servicio con Cosmos DB y DocumentService
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
                api_integration: true,
                tasas_interes: true,
                document_search: documentService.isAvailable(),
                vector_search: documentService.isAvailable() && documentService.getConfigInfo().features.vectorSearch,
                policy_search: documentService.isAvailable(),
                holiday_search: documentService.isAvailable(),
                cosmos_persistence: cosmosService.isAvailable()
            },
            cosmosDB: cosmosService.getConfigInfo(),
            documentService: documentService.getConfigInfo(),
            timestamp: new Date().toISOString()
        };
    }
}

module.exports = new OpenAIService();
