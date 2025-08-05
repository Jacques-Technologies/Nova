// services/openaiService.js
// OpenAI Service COMPLETO CORREGIDO con Cosmos DB y mejores formatos
const OpenAI = require('openai');
const { DateTime } = require('luxon');
const axios = require('axios');
const { CardFactory } = require('botbuilder');
const cosmosService = require('./cosmosService');
const documentService = require('./documentService');
require('dotenv').config();

/**
 * Servicio OpenAI mejorado con persistencia en Cosmos DB y formato corregido
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
     * ✅ CORREGIDO: Búsqueda de documentos con mejor integración
     */
    async buscarDocumentos(consulta, userInfo) {
        try {
            const userId = userInfo?.usuario || 'unknown';
            console.log(`📖 [${userId}] Iniciando búsqueda de documentos: "${consulta}"`);

            // ✅ VERIFICACIÓN MEJORADA: Estado del servicio
            if (!documentService.isAvailable()) {
                console.warn(`⚠️ [${userId}] DocumentService no disponible`);
                
                const configInfo = documentService.getConfigInfo();
                console.log(`📊 Estado del servicio:`, {
                    searchAvailable: configInfo.searchAvailable,
                    error: configInfo.error,
                    endpoint: configInfo.endpoint,
                    indexName: configInfo.indexName
                });

                return `⚠️ **Servicio de búsqueda no disponible**\n\n` +
                       `**Estado**: ${configInfo.error || 'No configurado'}\n\n` +
                       `**Para habilitar búsqueda de documentos:**\n` +
                       `• Configurar Azure Search en las variables de entorno\n` +
                       `• Verificar conectividad con el servicio\n` +
                       `• Contactar al administrador del sistema\n\n` +
                       `**Funciones disponibles:**\n` +
                       `• Consulta de tasas: \`tasas 2025\`\n` +
                       `• Información personal: \`mi info\`\n` +
                       `• Chat general con IA`;
            }

            // ✅ BÚSQUEDA MEJORADA: Con logging detallado
            console.log(`🔍 [${userId}] DocumentService disponible, ejecutando búsqueda...`);
            
            // Llamar al método de búsqueda del DocumentService
            const resultado = await documentService.buscarDocumentos(consulta, userId);
            
            console.log(`📊 [${userId}] Búsqueda completada, resultado obtenido`);
            
            // ✅ VALIDACIÓN: Verificar que obtuvimos resultado válido
            if (!resultado || typeof resultado !== 'string') {
                console.warn(`⚠️ [${userId}] Resultado inválido de DocumentService:`, typeof resultado);
                return `❌ **Error en búsqueda**: No se obtuvo resultado válido del servicio de documentos`;
            }

            // ✅ DETECCIÓN: Si no se encontraron documentos específicos
            if (resultado.includes('No se encontraron documentos') || 
                resultado.includes('❌ No se encontraron')) {
                
                console.log(`💡 [${userId}] No se encontraron documentos, ofreciendo alternativas`);
                
                // Para el caso específico de "ajustes.docx"
                if (consulta.toLowerCase().includes('ajustes.docx') || 
                    consulta.toLowerCase().includes('ajustes')) {
                    
                    return `🔍 **Búsqueda: "${consulta}"**\n\n` +
                           `❌ **Documento "ajustes.docx" no encontrado**\n\n` +
                           `**Posibles causas:**\n` +
                           `• El archivo no está indexado en Azure Search\n` +
                           `• El documento no existe en el sistema\n` +
                           `• El nombre del archivo es diferente\n\n` +
                           `**Alternativas de búsqueda:**\n` +
                           `• Busca por contenido: "configuración sistema"\n` +
                           `• Busca por tema: "ajustes configuración"\n` +
                           `• Busca documentos similares: "parámetros sistema"\n\n` +
                           `**Otras opciones:**\n` +
                           `• \`buscar políticas\` - Ver políticas corporativas\n` +
                           `• \`obtener feriados\` - Consultar días feriados\n` +
                           `• Describir qué información necesitas del documento`;
                }
            }

            // ✅ ÉXITO: Retornar resultado de la búsqueda
            console.log(`✅ [${userId}] Búsqueda exitosa, retornando resultado`);
            return resultado;

        } catch (error) {
            const userId = userInfo?.usuario || 'unknown';
            console.error(`❌ [${userId}] Error en búsqueda de documentos:`, error);
            
            // ✅ DIAGNÓSTICO: Información detallada del error
            let errorMessage = `❌ **Error buscando documentos**\n\n`;
            errorMessage += `**Consulta**: "${consulta}"\n`;
            errorMessage += `**Error**: ${error.message}\n\n`;
            
            // ✅ CLASIFICACIÓN: Tipo de error
            if (error.message.includes('ENOTFOUND') || error.message.includes('getaddrinfo')) {
                errorMessage += `**Tipo**: Error de conectividad con Azure Search\n`;
                errorMessage += `**Solución**: Verificar configuración de red y endpoint\n`;
            } else if (error.message.includes('403') || error.message.includes('Forbidden')) {
                errorMessage += `**Tipo**: Error de permisos\n`;
                errorMessage += `**Solución**: Verificar API Key de Azure Search\n`;
            } else if (error.message.includes('404') || error.message.includes('Not Found')) {
                errorMessage += `**Tipo**: Servicio o índice no encontrado\n`;
                errorMessage += `**Solución**: Verificar endpoint e índice en Azure Search\n`;
            } else {
                errorMessage += `**Tipo**: Error interno del servicio\n`;
                errorMessage += `**Solución**: Contactar soporte técnico\n`;
            }
            
            errorMessage += `\n**Funciones disponibles:**\n`;
            errorMessage += `• Consulta de tasas: \`tasas 2025\`\n`;
            errorMessage += `• Información personal: \`mi info\`\n`;
            errorMessage += `• Chat general con IA`;
            
            return errorMessage;
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
     * ✅ MEJORADO: Decidir si usar herramientas con detección mejorada
     */
    shouldUseTools(mensaje) {
        const mensajeLower = mensaje.toLowerCase();
        
        const toolKeywords = [
            // Fecha y hora
            'fecha', 'hora', 'día', 'hoy', 'cuando', 'qué día',
            
            // Información personal
            'mi información', 'mis datos', 'perfil', 'mi info', 'quien soy',
            
            // APIs y consultas
            'consultar', 'api', 'buscar',
            
            // Historial
            'resumen', 'historial', 'conversación',
            
            // Tasas de interés - PALABRAS CLAVE MEJORADAS
            'tasas', 'tasa', 'interes', 'interés', 'préstamo', 'crédito',
            'vista', 'fijo', 'fap', 'nov', 'depósito', 'depósitos',
            'ahorro', 'ahorros', 'inversión', 'rendimiento',
            
            // Documentos - DETECCIÓN MEJORADA
            'documento', 'documentos', 'archivo', 'archivos',
            'política', 'políticas', 'politica', 'politicas',
            'manual', 'manuales', 'procedimiento', 'procedimientos',
            'normativa', 'normas', 'reglamento', 'guía', 'guias',
            
            // Nombres específicos de archivos
            'ajustes.docx', 'ajustes', '.docx', '.pdf', '.doc',
            
            // Políticas específicas
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
        
        const usarHerramientas = toolKeywords.some(keyword => mensajeLower.includes(keyword));
        
        if (usarHerramientas) {
            console.log(`🛠️ Herramientas habilitadas para: "${mensaje}"`);
            console.log(`   Palabras clave detectadas: ${toolKeywords.filter(k => mensajeLower.includes(k)).join(', ')}`);
        }
        
        return usarHerramientas;
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
     * ✅ CORREGIDO: Herramientas con mejor detección de documentos
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

            case 'buscar_documentos':
                console.log(`📖 [${userId}] Buscando documentos: "${parametros.consulta}"`);
                return await this.buscarDocumentos(parametros.consulta, userInfo);

            case 'buscar_politicas':
                console.log(`📋 [${userId}] Buscando política: ${parametros.tipo_politica}`);
                return await this.buscarPoliticas(parametros.tipo_politica, userInfo);

            case 'obtener_dias_feriados':
                console.log(`📅 [${userId}] Obteniendo feriados para: ${parametros.anio || 'año actual'}`);
                return await this.obtenerDiasFeriados(parametros.anio, userInfo);

            case 'consultar_api_nova':
                console.log(`🌐 [${userId}] Consultando API Nova: ${parametros.endpoint}`);
                return await this.consultarApiNova(
                    parametros.endpoint, 
                    userToken, 
                    parametros.metodo || 'GET',
                    parametros.parametros
                );

            case 'generar_resumen_conversacion':
                console.log(`📊 [${userId}] Generando resumen de conversación`);
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
     * ✅ NUEVO: Formatear tabla de tasas COMPLETAMENTE REDISEÑADO para Teams
     * Formato simple, limpio y totalmente compatible
     */
    formatearTablaTasas(tasasData, anio, usuario) {
        try {
            if (!tasasData || !Array.isArray(tasasData)) {
                return "❌ **Error**: Datos de tasas inválidos";
            }

            // Encabezado principal estilizado pero simple
            let tabla = `💰 **TASAS DE INTERÉS NOVA CORPORATION ${anio}**\n\n`;
            tabla += `👤 **Usuario**: ${usuario}  📅 **Año**: ${anio}  🕐 **Actualizado**: ${new Date().toLocaleDateString('es-MX')}\n\n`;

            // Procesar cada mes con formato limpio
            tabla += `📊 **DETALLE POR MES:**\n\n`;
            
            tasasData.forEach((mes, index) => {
                if (mes.Mes) {
                    // Encabezado del mes con separador visual
                    tabla += `🗓️ **${mes.Mes.toUpperCase()}**\n`;
                    tabla += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
                    
                    // Cuenta Vista
                    const vista = mes.vista !== undefined ? `${mes.vista}%` : 'N/A';
                    tabla += `💳 **Cuenta Vista (Ahorros):** ${vista}\n`;
                    
                    // Depósitos a Plazo Fijo
                    tabla += `📈 **Depósitos a Plazo Fijo:**\n`;
                    const fijo1 = mes.fijo1 !== undefined ? `${mes.fijo1}%` : 'N/A';
                    const fijo3 = mes.fijo3 !== undefined ? `${mes.fijo3}%` : 'N/A';
                    const fijo6 = mes.fijo6 !== undefined ? `${mes.fijo6}%` : 'N/A';
                    tabla += `   🔸 1 mes: ${fijo1}    🔸 3 meses: ${fijo3}    🔸 6 meses: ${fijo6}\n`;
                    
                    // Otros productos financieros
                    const fap = mes.FAP !== undefined ? `${mes.FAP}%` : 'N/A';
                    const nov = mes.Nov !== undefined ? `${mes.Nov}%` : 'N/A';
                    const prestamos = mes.Prestamos !== undefined ? `${mes.Prestamos}%` : 'N/A';
                    
                    tabla += `🏦 **FAP (Fondo Ahorro):** ${fap}    🔄 **Novación:** ${nov}\n`;
                    tabla += `💸 **Préstamos:** ${prestamos}\n`;
                    
                    // Espaciado entre meses
                    if (index < tasasData.length - 1) {
                        tabla += `\n`;
                    }
                }
            });

            // Sección de análisis y recomendaciones
            tabla += `\n\n💡 **ANÁLISIS Y RECOMENDACIONES**\n`;
            tabla += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;

            // Encontrar mejores tasas del último mes
            const tasasConDatos = tasasData.filter(mes => 
                mes.vista !== undefined || mes.fijo6 !== undefined
            );
            
            if (tasasConDatos.length > 0) {
                const ultimasTasas = tasasConDatos[tasasConDatos.length - 1];
                
                tabla += `⭐ **MEJORES OPCIONES ACTUALES (${ultimasTasas.Mes || 'Último mes'}):**\n\n`;
                
                // Destacar la mejor tasa para ahorro
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
                
                // Información sobre préstamos
                if (ultimasTasas.Prestamos) {
                    tabla += `💸 **PRÉSTAMOS:** ${ultimasTasas.Prestamos}% - `;
                    if (ultimasTasas.Prestamos < 13) {
                        tabla += `✅ Tasa competitiva\n`;
                    } else {
                        tabla += `⚠️ Considera comparar opciones\n`;
                    }
                }
            }

            // Análisis de tendencia (si hay suficientes datos)
            if (tasasData.length >= 2) {
                const primerMes = tasasData[0];
                const ultimoMes = tasasData[tasasData.length - 1];
                
                tabla += `\n📊 **TENDENCIA DEL AÑO ${anio}:**\n`;
                
                if (primerMes.fijo6 && ultimoMes.fijo6) {
                    const diferencia = ultimoMes.fijo6 - primerMes.fijo6;
                    const tendencia = diferencia > 0 ? '📈 Subieron' : diferencia < 0 ? '📉 Bajaron' : '➡️ Estables';
                    tabla += `🔸 **Depósitos 6 meses:** ${tendencia} (${diferencia > 0 ? '+' : ''}${diferencia.toFixed(2)}%)\n`;
                }
                
                if (primerMes.Prestamos && ultimoMes.Prestamos) {
                    const diferencia = ultimoMes.Prestamos - primerMes.Prestamos;
                    const tendencia = diferencia > 0 ? '📈 Subieron' : diferencia < 0 ? '📉 Bajaron' : '➡️ Estables';
                    tabla += `🔸 **Préstamos:** ${tendencia} (${diferencia > 0 ? '+' : ''}${diferencia.toFixed(2)}%)\n`;
                }
            }

            // Descripción de productos (más concisa)
            tabla += `\n📋 **TIPOS DE PRODUCTOS:**\n`;
            tabla += `💳 **Vista:** Disponibilidad inmediata  📈 **Depósitos:** Tasa fija garantizada\n`;
            tabla += `🏦 **FAP:** Fondo empleados  🔄 **Novación:** Renovación automática  💸 **Préstamos:** Créditos personales\n`;

            // Call to action
            tabla += `\n💬 **¿Necesitas asesoría personalizada?** Pregúntame sobre cualquier producto específico.`;

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

    /**
     * ✅ NUEVO: Diagnóstico del estado de servicios
     */
    async diagnosticarServicios() {
        const estado = {
            openai: {
                disponible: this.openaiAvailable,
                error: this.initializationError
            },
            cosmosDB: {
                disponible: cosmosService.isAvailable(),
                config: cosmosService.getConfigInfo()
            },
            documentService: {
                disponible: documentService.isAvailable(),
                config: documentService.getConfigInfo()
            }
        };

        return estado;
    }
}

module.exports = new OpenAIService();