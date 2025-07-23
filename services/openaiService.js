// openaiService.js - Versión simplificada sin Azure/OAuth

const OpenAI = require('openai');
const { DateTime } = require('luxon');
const axios = require('axios');
const { CardFactory } = require('botbuilder');
require('dotenv').config();

/**
 * Servicio OpenAI simplificado
 */
class OpenAIService {
    constructor() {
        this.initialized = false;
        this.initializationError = null;
        
        console.log('🚀 Inicializando OpenAI Service...');
        this.diagnoseConfiguration();
        this.initializeOpenAI();
        this.tools = this.defineTools();
        
        console.log(`✅ OpenAI Service inicializado - Disponible: ${this.openaiAvailable}`);
    }

    /**
     * Diagnostica la configuración
     */
    diagnoseConfiguration() {
        console.log('🔍 Diagnosticando configuración...');
        
        const requiredEnvVars = {
            'OPENAI_API_KEY': process.env.OPENAI_API_KEY
        };

        console.log('📊 Estado de variables de entorno:');
        for (const [key, value] of Object.entries(requiredEnvVars)) {
            const status = value ? '✅ Configurada' : '❌ Faltante';
            const preview = value ? `(${value.substring(0, 10)}...)` : '(no configurada)';
            console.log(`   ${key}: ${status} ${preview}`);
        }
    }

    /**
     * Inicializa cliente OpenAI
     */
    initializeOpenAI() {
        try {
            const apiKey = process.env.OPENAI_API_KEY;
            
            if (!apiKey) {
                this.initializationError = 'OPENAI_API_KEY no está configurada';
                console.error('❌ OpenAI Error:', this.initializationError);
                this.openaiAvailable = false;
                return;
            }

            if (apiKey.length < 20) {
                this.initializationError = 'OPENAI_API_KEY parece ser inválida (muy corta)';
                console.error('❌ OpenAI Error:', this.initializationError);
                this.openaiAvailable = false;
                return;
            }
            
            console.log('🔑 Inicializando cliente OpenAI...');
            this.openai = new OpenAI({ 
                apiKey: apiKey,
                timeout: 30000,
                maxRetries: 2
            });
            
            this.openaiAvailable = true;
            this.initialized = true;
            
            console.log('✅ Cliente OpenAI inicializado correctamente');
            
        } catch (error) {
            this.initializationError = `Error inicializando OpenAI: ${error.message}`;
            console.error('❌ Error inicializando OpenAI:', error);
            this.openaiAvailable = false;
        }
    }

    /**
     * Define herramientas simplificadas
     */
    defineTools() {
        const tools = [
            {
                type: "function",
                function: {
                    name: "FechaHoy",
                    description: "Devuelve la fecha actual en zona horaria de México",
                    parameters: { type: "object", properties: {} }
                }
            },
            {
                type: "function",
                function: {
                    name: "obtener_informacion_usuario",
                    description: "Obtiene información del usuario logueado",
                    parameters: { type: "object", properties: {} }
                }
            },
            {
                type: "function",
                function: {
                    name: "consultar_datos_empleado",
                    description: "Consulta datos específicos del empleado usando el token",
                    parameters: {
                        type: "object",
                        properties: {
                            consulta: {
                                type: "string",
                                description: "Tipo de consulta a realizar"
                            }
                        },
                        required: ["consulta"]
                    }
                }
            }
        ];

        return tools;
    }

    /**
     * Procesa mensaje con OpenAI
     */
    async procesarMensaje(mensaje, historial = [], userToken = null, userInfo = null) {
        try {
            if (!this.openaiAvailable) {
                return this.createUnavailableResponse();
            }

            if (!this.initialized) {
                console.warn('OpenAI no inicializado, reintentando...');
                this.initializeOpenAI();
                
                if (!this.openaiAvailable) {
                    return this.createUnavailableResponse();
                }
            }

            console.log('📝 Procesando mensaje con OpenAI...');
            console.log(`📬 Mensaje del usuario: "${mensaje}"`);
            
            const mensajes = this.formatearHistorial(historial, userInfo);
            mensajes.push({ role: "user", content: mensaje });

            const requestConfig = {
                model: "gpt-4-turbo",
                messages: mensajes,
                temperature: 0.7,
                max_tokens: 3000
            };

            if (!this.esComandoBasico(mensaje)) {
                requestConfig.tools = this.tools;
                requestConfig.tool_choice = "auto";
            }

            console.log('🤖 Enviando request a OpenAI...');
            const response = await this.openai.chat.completions.create(requestConfig);
            
            if (!response || !response.choices || response.choices.length === 0) {
                throw new Error('Respuesta vacía de OpenAI');
            }
            
            const messageResponse = response.choices[0].message;

            if (messageResponse.tool_calls) {
                return await this.procesarHerramientas(messageResponse, mensajes, userToken, userInfo);
            }

            return {
                type: 'text',
                content: messageResponse.content || 'Respuesta vacía de OpenAI'
            };

        } catch (error) {
            console.error('❌ Error en procesarMensaje:', error);
            return this.manejarErrorOpenAI(error);
        }
    }

    /**
     * Procesa herramientas
     */
    async procesarHerramientas(messageResponse, mensajes, userToken, userInfo) {
        const resultados = [];

        for (const call of messageResponse.tool_calls) {
            const { function: fnCall, id } = call;
            const { name, arguments: args } = fnCall;
            
            try {
                const parametros = JSON.parse(args);
                const resultado = await this.ejecutarHerramienta(name, parametros, userToken, userInfo);
                
                resultados.push({
                    tool_call_id: id,
                    content: typeof resultado === 'object' ? 
                        JSON.stringify(resultado, null, 2) : String(resultado)
                });
                
            } catch (error) {
                console.error(`❌ Error ejecutando herramienta ${name}:`, error);
                resultados.push({
                    tool_call_id: id,
                    content: `Error: ${error.message}`
                });
            }
        }

        const finalMessages = [
            ...mensajes,
            messageResponse,
            ...resultados.map(result => ({
                role: "tool",
                tool_call_id: result.tool_call_id,
                content: result.content
            }))
        ];

        const finalResponse = await this.openai.chat.completions.create({
            model: "gpt-4-turbo",
            messages: finalMessages,
            temperature: 0.7,
            max_tokens: 3000
        });

        return {
            type: 'text',
            content: finalResponse.choices[0].message.content || 'Respuesta final vacía'
        };
    }

    /**
     * Ejecuta herramienta específica
     */
    async ejecutarHerramienta(nombre, parametros, userToken, userInfo) {
        switch (nombre) {
            case 'FechaHoy':
                return DateTime.now().setZone('America/Mexico_City').toISODate();

            case 'obtener_informacion_usuario':
                if (!userInfo) {
                    return "Usuario no autenticado";
                }
                return `**Información del Usuario:**\n\n` +
                       `👤 **Nombre**: ${userInfo.nombre}\n` +
                       `📧 **Usuario**: ${userInfo.usuario}\n` +
                       `🔑 **Token**: ${userInfo.token.substring(0, 20)}...\n`;

            case 'consultar_datos_empleado':
                return await this.consultarDatosEmpleado(parametros.consulta, userToken);

            default:
                throw new Error(`Herramienta desconocida: ${nombre}`);
        }
    }

    /**
     * Consulta datos del empleado usando token
     */
    async consultarDatosEmpleado(consulta, userToken) {
        try {
            if (!userToken) {
                return "❌ No hay token de autenticación disponible";
            }

            // Ejemplo de consulta a API con token
            // Aquí puedes agregar llamadas a APIs específicas usando el token
            
            return `📊 **Consulta realizada**: ${consulta}\n\n` +
                   `ℹ️ Para implementar consultas específicas, agrega las URLs de API correspondientes.\n` +
                   `🔑 Token disponible: ${userToken.substring(0, 20)}...`;

        } catch (error) {
            console.error('Error consultando datos empleado:', error);
            return `❌ Error realizando consulta: ${error.message}`;
        }
    }

    /**
     * Verifica si es comando básico
     */
    esComandoBasico(mensaje) {
        const comandos = ['hola', 'hello', 'ayuda', 'help'];
        return comandos.some(cmd => mensaje.toLowerCase().includes(cmd));
    }

    /**
     * Formatea historial para OpenAI
     */
    formatearHistorial(historial, userInfo) {
        const userContext = userInfo ? 
            `Usuario autenticado: ${userInfo.nombre} (${userInfo.usuario})` : 
            'Usuario no autenticado';

        const mensajes = [{
            role: "system",
            content: `Eres un asistente corporativo para Nova. 

Contexto actual: ${userContext}

Ayudas con:
📊 Consultas generales
👤 Información del usuario
📋 Datos corporativos

Fecha actual: ${DateTime.now().setZone('America/Mexico_City').toFormat('dd/MM/yyyy')}`
        }];
        
        if (historial && historial.length > 0) {
            const recientes = historial.slice(-8);
            recientes.forEach(item => {
                if (item.message && item.message.trim()) {
                    mensajes.push({
                        role: item.type === 'user' ? "user" : "assistant",
                        content: item.message
                    });
                }
            });
        }

        return mensajes;
    }

    /**
     * Crea respuesta cuando OpenAI no está disponible
     */
    createUnavailableResponse() {
        let message = '🚫 **El servicio de OpenAI no está disponible actualmente.**\n\n';
        
        if (this.initializationError) {
            message += `**Problema detectado**: ${this.initializationError}\n\n`;
        }
        
        message += '**Posibles soluciones:**\n';
        message += '• Verificar que OPENAI_API_KEY esté configurada\n';
        message += '• Verificar que el archivo .env existe y tiene la configuración correcta\n';
        message += '• Contactar al administrador del sistema\n';

        return {
            type: 'text',
            content: message
        };
    }

    /**
     * Maneja errores de OpenAI
     */
    manejarErrorOpenAI(error) {
        console.error('🚨 Error detallado de OpenAI:', {
            message: error.message,
            code: error.code,
            type: error.type,
            status: error.status
        });

        let message = '❌ **Error procesando con OpenAI**\n\n';

        if (error.code === 'rate_limit_exceeded') {
            message += '**Problema**: Límite de consultas excedido\n';
            message += '**Solución**: Espera un momento e intenta de nuevo\n';
        } else if (error.code === 'insufficient_quota') {
            message += '**Problema**: Cuota de OpenAI agotada\n';
            message += '**Solución**: Contacta al administrador\n';
        } else if (error.code === 'invalid_api_key') {
            message += '**Problema**: API key de OpenAI inválida\n';
            message += '**Solución**: Verificar configuración\n';
        } else {
            message += `**Problema**: ${error.message}\n`;
            message += '**Solución**: Intenta nuevamente\n';
        }

        return {
            type: 'text',
            content: message
        };
    }
}

module.exports = new OpenAIService();