// teamsBot.js - Versión corregida con tarjetas adaptativas que funcionan

const { DialogBot } = require('./dialogBot');
const { CardFactory } = require('botbuilder');
const axios = require('axios');
const openaiService = require('../services/openaiService');

/**
 * TeamsBot - Versión corregida con tarjetas adaptativas compatibles
 */
class TeamsBot extends DialogBot {
    constructor(conversationState, userState) {
        super(conversationState, userState);

        // Registrar instancia globalmente
        global.botInstance = this;

        // Estados de usuarios autenticados
        this.authenticatedUsers = new Map();
        this.authState = this.userState.createProperty('AuthState');
        
        // Configurar manejadores
        this.onMembersAdded(this.handleMembersAdded.bind(this));
        this.onMessage(this.handleMessageWithAuth.bind(this));

        // Inicializar servicios
        this.openaiService = openaiService;
        
        console.log('✅ TeamsBot inicializado con autenticación personalizada');
    }

    /**
     * Maneja nuevos miembros - Mostrar tarjeta de login
     */
    async handleMembersAdded(context, next) {
        for (const member of context.activity.membersAdded) {
            if (member.id !== context.activity.recipient.id) {
                await this.showLoginCard(context);
            }
        }
        await next();
    }

    /**
     * Maneja mensajes con autenticación personalizada
     */
    async handleMessageWithAuth(context, next) {
        const userId = context.activity.from.id;
        const text = (context.activity.text || '').trim();

        console.log(`[${userId}] Mensaje recibido: "${text}"`);

        try {
            // Verificar si es submit de tarjeta de login
            if (context.activity.value && context.activity.value.action === 'login') {
                await this.handleLoginSubmit(context);
                return await next();
            }

            // Verificar si es comando de logout
            if (this.isLogoutCommand(text)) {
                await this.handleLogout(context, userId);
                return await next();
            }

            // Verificar autenticación
            const isAuthenticated = await this.isUserAuthenticated(userId, context);
            
            if (!isAuthenticated) {
                // Usuario no autenticado - mostrar tarjeta de login
                await this.showLoginCard(context);
                return await next();
            }

            // Usuario autenticado - procesar mensaje normal
            await this.processAuthenticatedMessage(context, text, userId);

        } catch (error) {
            console.error(`[${userId}] Error en handleMessageWithAuth:`, error);
            await context.sendActivity('❌ Error procesando mensaje. Intenta nuevamente.');
        }

        await next();
    }

    /**
     * Muestra tarjeta de login - VERSIÓN CORREGIDA
     */
    async showLoginCard(context) {
        try {
            console.log('🃏 Creando tarjeta de login...');
            
            // Crear la tarjeta con versión compatible
            const loginCard = this.createLoginCard();
            
            // Enviar mensaje de texto primero
            await context.sendActivity('🔐 **Bienvenido a Nova Bot**\n\nPor favor, ingresa tus credenciales para continuar:');
            
            // Luego enviar la tarjeta como attachment separado
            await context.sendActivity({ 
                attachments: [loginCard]
            });
            
            console.log('✅ Tarjeta de login enviada');
            
        } catch (error) {
            console.error('❌ Error enviando tarjeta de login:', error);
            
            // Fallback: mostrar formulario en texto si la tarjeta falla
            await context.sendActivity(
                '🔐 **Bienvenido a Nova Bot**\n\n' +
                '⚠️ Error mostrando tarjeta de login.\n\n' +
                '**Formato alternativo:**\n' +
                'Escribe tu credencial en el formato:\n' +
                '`login usuario:contraseña`\n\n' +
                'Ejemplo: `login 91004:mipassword`'
            );
        }
    }

    /**
     * Crea tarjeta de login con versión compatible - VERSIÓN CORREGIDA
     */
    createLoginCard() {
        try {
            const card = {
                type: 'AdaptiveCard',
                $schema: 'http://adaptivecards.io/schemas/adaptive-card.json',
                version: '1.2', // ✅ Cambio a versión más compatible
                body: [
                    {
                        type: 'TextBlock',
                        text: '🔐 Iniciar Sesión',
                        size: 'Large',
                        weight: 'Bolder',
                        color: 'Accent'
                        // ❌ Removido horizontalAlignment que puede causar problemas
                    },
                    {
                        type: 'TextBlock',
                        text: 'Ingresa tus credenciales corporativas:',
                        wrap: true,
                        spacing: 'Medium'
                    },
                    {
                        type: 'Input.Text',
                        id: 'username',
                        placeholder: 'Usuario (ej: 91004)',
                        isRequired: true,
                        label: 'Usuario:' // ✅ Agregado label para mejor compatibilidad
                    },
                    {
                        type: 'Input.Text',
                        id: 'password',
                        placeholder: 'Contraseña',
                        style: 'Password',
                        isRequired: true,
                        label: 'Contraseña:' // ✅ Agregado label
                    },
                    {
                        type: 'TextBlock',
                        text: '🔒 Tus credenciales se envían de forma segura',
                        size: 'Small',
                        color: 'Good',
                        spacing: 'Medium'
                    }
                ],
                actions: [
                    {
                        type: 'Action.Submit',
                        title: '🚀 Iniciar Sesión',
                        data: {
                            action: 'login'
                        }
                        // ❌ Removido style: 'positive' que puede no ser compatible
                    }
                ]
            };

            console.log('🃏 Tarjeta creada:', JSON.stringify(card, null, 2));
            return CardFactory.adaptiveCard(card);
            
        } catch (error) {
            console.error('❌ Error creando tarjeta:', error);
            throw error;
        }
    }

    /**
     * Maneja el submit de la tarjeta de login - CON VALIDACIÓN MEJORADA
     */
    async handleLoginSubmit(context) {
        const userId = context.activity.from.id;
        
        try {
            console.log(`[${userId}] Datos recibidos del submit:`, JSON.stringify(context.activity.value, null, 2));
            
            const { username, password } = context.activity.value;

            // Validación mejorada
            if (!username || !password || username.trim() === '' || password.trim() === '') {
                await context.sendActivity('❌ **Error**: Debes completar todos los campos.');
                await this.showLoginCard(context);
                return;
            }

            console.log(`[${userId}] Intento de login - Usuario: ${username}`);

            // Mostrar mensaje de procesamiento
            await context.sendActivity({ type: 'typing' });

            // Llamar a API de Nova
            const loginResponse = await this.authenticateWithNova(username.trim(), password.trim());

            if (loginResponse.success) {
                // Login exitoso
                await this.setUserAuthenticated(userId, loginResponse.userInfo, context);
                
                await context.sendActivity(
                    `✅ **¡Bienvenido, ${loginResponse.userInfo.nombre}!**\n\n` +
                    `🎉 Login exitoso\n` +
                    `👤 Usuario: ${loginResponse.userInfo.usuario}\n` +
                    `🔑 Token: ${loginResponse.userInfo.token.substring(0, 30)}...\n\n` +
                    `💬 Ya puedes usar todas las funciones del bot.`
                );
            } else {
                // Login fallido
                await context.sendActivity(
                    `❌ **Error de autenticación**\n\n` +
                    `${loginResponse.message}\n\n` +
                    `Por favor, verifica tus credenciales e intenta nuevamente.`
                );
                await this.showLoginCard(context);
            }

        } catch (error) {
            console.error(`[${userId}] Error en login:`, error);
            await context.sendActivity(
                '❌ **Error del servidor**\n\n' +
                'No se pudo conectar con el servicio de autenticación. Intenta nuevamente.'
            );
            await this.showLoginCard(context);
        }
    }

    /**
     * Autentica con API de Nova - CON MEJOR MANEJO DE ERRORES
     */
    async authenticateWithNova(username, password) {
        try {
            console.log(`🔐 Autenticando usuario: ${username}`);
            
            const response = await axios.post(
                'https://pruebas.nova.com.mx/ApiRestNova/api/Auth/login',
                {
                    cveUsuario: username,
                    password: password
                },
                {
                    headers: {
                        'Content-Type': 'application/json',
                        'Accept': 'application/json'
                    },
                    timeout: 15000 // ✅ Aumentado timeout
                }
            );

            console.log(`📡 Respuesta de Nova API (status: ${response.status}):`, response.data);

            if (response.data && response.data.info && response.data.info.length > 0) {
                const userInfo = response.data.info[0];
                
                // ✅ Verificación mejorada
                if (userInfo.EsValido === 0 && userInfo.Token) { 
                    return {
                        success: true,
                        userInfo: {
                            usuario: userInfo.CveUsuario,
                            nombre: userInfo.Nombre,
                            paterno: userInfo.Paterno,
                            materno: userInfo.Materno,
                            token: userInfo.Token,
                            mensaje: userInfo.Mensaje
                        }
                    };
                } else {
                    return {
                        success: false,
                        message: userInfo.Mensaje || 'Credenciales inválidas'
                    };
                }
            } else {
                return {
                    success: false,
                    message: 'Respuesta inesperada del servidor'
                };
            }

        } catch (error) {
            console.error('Error autenticando con Nova:', error.message);
            
            if (error.response) {
                console.error('Response error:', error.response.status, error.response.data);
                return {
                    success: false,
                    message: `Error del servidor: ${error.response.status}`
                };
            } else if (error.code === 'ECONNREFUSED') {
                return {
                    success: false,
                    message: 'No se pudo conectar con el servidor'
                };
            } else if (error.code === 'ECONNABORTED') {
                return {
                    success: false,
                    message: 'Timeout - El servidor tardó demasiado en responder'
                };
            } else {
                return {
                    success: false,
                    message: 'Error de conexión'
                };
            }
        }
    }

    /**
     * Verifica si es comando de logout
     */
    isLogoutCommand(text) {
        return ['logout', 'cerrar sesion', 'cerrar sesión', 'salir'].includes(text.toLowerCase());
    }

    /**
     * Maneja logout
     */
    async handleLogout(context, userId) {
        try {
            console.log(`[${userId}] Iniciando logout...`);
            
            // Limpiar estado de memoria
            this.authenticatedUsers.delete(userId);
            
            // Limpiar estado persistente
            const authData = await this.authState.get(context, {});
            delete authData[userId];
            await this.authState.set(context, authData);
            await this.userState.saveChanges(context);
            
            await context.sendActivity(
                '✅ **Sesión cerrada exitosamente**\n\n' +
                'Hasta luego. Para volver a usar el bot, necesitarás autenticarte nuevamente.'
            );
            
            // Mostrar tarjeta de login nuevamente
            await this.showLoginCard(context);
            
        } catch (error) {
            console.error(`[${userId}] Error en logout:`, error);
            await context.sendActivity('❌ Error al cerrar sesión.');
        }
    }

    /**
     * Verifica si un usuario está autenticado
     */
    async isUserAuthenticated(userId, context) {
        try {
            // Verificar memoria
            const memoryAuth = this.authenticatedUsers.has(userId);
            
            // Verificar estado persistente
            const authData = await this.authState.get(context, {});
            const persistentAuth = authData[userId]?.authenticated === true;
            
            // Sincronizar si hay inconsistencia
            if (memoryAuth && !persistentAuth) {
                await this.syncPersistentAuth(userId, context);
                return true;
            } else if (!memoryAuth && persistentAuth) {
                await this.syncMemoryAuth(userId, context, authData[userId]);
                return true;
            }
            
            return memoryAuth && persistentAuth;
            
        } catch (error) {
            console.error(`[${userId}] Error verificando autenticación:`, error);
            return false;
        }
    }

    /**
     * Sincroniza autenticación persistente
     */
    async syncPersistentAuth(userId, context) {
        try {
            const userInfo = this.authenticatedUsers.get(userId);
            if (userInfo) {
                const authData = await this.authState.get(context, {});
                authData[userId] = {
                    authenticated: true,
                    ...userInfo,
                    lastAuthenticated: new Date().toISOString()
                };
                await this.authState.set(context, authData);
                await this.userState.saveChanges(context);
            }
        } catch (error) {
            console.error(`[${userId}] Error sincronizando persistente:`, error);
        }
    }

    /**
     * Sincroniza autenticación en memoria
     */
    async syncMemoryAuth(userId, context, authData) {
        try {
            if (authData && authData.authenticated) {
                this.authenticatedUsers.set(userId, {
                    usuario: authData.usuario,
                    nombre: authData.nombre,
                    token: authData.token
                });
            }
        } catch (error) {
            console.error(`[${userId}] Error sincronizando memoria:`, error);
        }
    }

    /**
     * Marca usuario como autenticado
     */
    async setUserAuthenticated(userId, userInfo, context) {
        try {
            console.log(`[${userId}] Estableciendo autenticación...`);
            
            // Almacenar en memoria
            this.authenticatedUsers.set(userId, userInfo);

            // Almacenar persistentemente
            const authData = await this.authState.get(context, {});
            authData[userId] = {
                authenticated: true,
                ...userInfo,
                lastAuthenticated: new Date().toISOString()
            };
            await this.authState.set(context, authData);
            await this.userState.saveChanges(context);

            console.log(`[${userId}] Autenticación completada exitosamente`);
            return true;
            
        } catch (error) {
            console.error(`[${userId}] Error en setUserAuthenticated:`, error);
            return false;
        }
    }

    /**
     * Procesa mensajes de usuarios autenticados
     */
    async processAuthenticatedMessage(context, text, userId) {
        try {
            await context.sendActivity({ type: 'typing' });

            // Obtener información del usuario
            const userInfo = this.authenticatedUsers.get(userId);
            const userToken = userInfo?.token;

            // Procesar con OpenAI
            const response = await this.openaiService.procesarMensaje(
                text, 
                [], // historial vacío por simplicidad
                userToken, 
                userInfo
            );

            // Enviar respuesta
            await this.sendResponse(context, response);

        } catch (error) {
            console.error(`[${userId}] Error procesando mensaje:`, error);
            await context.sendActivity('❌ Error al procesar tu mensaje.');
        }
    }

    /**
     * Envía respuesta al usuario
     */
    async sendResponse(context, response) {
        try {
            if (response.type === 'card') {
                if (response.content) {
                    await context.sendActivity(response.content);
                }
                if (response.card) {
                    await context.sendActivity({ attachments: [response.card] });
                }
            } else {
                const responseContent = response.content || response;
                await context.sendActivity(responseContent);
            }
        } catch (error) {
            console.error('Error enviando respuesta:', error);
        }
    }

    /**
     * Obtiene token del usuario
     */
    async getUserToken(userId) {
        const userInfo = this.authenticatedUsers.get(userId);
        return userInfo?.token || null;
    }

    /**
     * Obtiene información del usuario
     */
    async getUserInfo(userId) {
        return this.authenticatedUsers.get(userId) || null;
    }

    /**
     * Método para depuración - obtener estadísticas
     */
    getStats() {
        return {
            authenticatedUsers: this.authenticatedUsers.size,
            isInitialized: this.isInitialized(),
            timestamp: new Date().toISOString()
        };
    }
}

module.exports.TeamsBot = TeamsBot;