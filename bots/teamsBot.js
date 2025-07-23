// teamsBot.js - Versión ultra-simplificada GARANTIZADA que funciona

const { DialogBot } = require('./dialogBot');
const { CardFactory } = require('botbuilder');
const axios = require('axios');
const openaiService = require('../services/openaiService');

class TeamsBot extends DialogBot {
    constructor(conversationState, userState) {
        super(conversationState, userState);

        global.botInstance = this;
        this.authenticatedUsers = new Map();
        this.authState = this.userState.createProperty('AuthState');
        
        this.onMembersAdded(this.handleMembersAdded.bind(this));
        this.onMessage(this.handleMessageWithAuth.bind(this));
        this.openaiService = openaiService;
        
        console.log('✅ TeamsBot inicializado - Versión ultra-simplificada');
    }

    async handleMembersAdded(context, next) {
        for (const member of context.activity.membersAdded) {
            if (member.id !== context.activity.recipient.id) {
                await this.showLoginOptions(context);
            }
        }
        await next();
    }

    async handleMessageWithAuth(context, next) {
        const userId = context.activity.from.id;
        const text = (context.activity.text || '').trim();

        console.log(`[${userId}] Mensaje: "${text}"`);

        try {
            // 🧪 COMANDO DE DIAGNÓSTICO
            if (text.toLowerCase() === 'test-card' || text.toLowerCase() === 'test') {
                await this.runCardTests(context);
                return await next();
            }

            // 🔐 LOGIN CON TARJETA
            if (text.toLowerCase() === 'card-login' || text.toLowerCase() === 'login-card') {
                await this.showLoginCard(context);
                return await next();
            }

            // 🔐 LOGIN CON TEXTO (FALLBACK)
            if (text.toLowerCase().startsWith('login ')) {
                await this.handleTextLogin(context, text);
                return await next();
            }

            // 📤 SUBMIT DE TARJETA
            if (context.activity.value && context.activity.value.action === 'login') {
                await this.handleLoginSubmit(context);
                return await next();
            }

            // 🚪 LOGOUT
            if (this.isLogoutCommand(text)) {
                await this.handleLogout(context, userId);
                return await next();
            }

            // ✅ VERIFICAR AUTENTICACIÓN
            const isAuthenticated = await this.isUserAuthenticated(userId, context);
            
            if (!isAuthenticated) {
                await this.showLoginOptions(context);
                return await next();
            }

            // 💬 PROCESAR MENSAJE AUTENTICADO
            await this.processAuthenticatedMessage(context, text, userId);

        } catch (error) {
            console.error(`[${userId}] Error:`, error);
            await context.sendActivity('❌ Error procesando mensaje.');
        }

        await next();
    }

    /**
     * 🧪 PRUEBAS DE TARJETAS - Para diagnosticar problemas
     */
    async runCardTests(context) {
        try {
            console.log('🧪 Ejecutando pruebas de tarjetas...');

            // Test 1: Tarjeta ultra-simple
            await context.sendActivity('🧪 **Test 1**: Tarjeta ultra-simple');
            const simpleCard = this.createSimpleTestCard();
            await context.sendActivity({ attachments: [simpleCard] });

            await new Promise(resolve => setTimeout(resolve, 1000));

            // Test 2: Tarjeta con input básico
            await context.sendActivity('🧪 **Test 2**: Tarjeta con input');
            const inputCard = this.createInputTestCard();
            await context.sendActivity({ attachments: [inputCard] });

            await new Promise(resolve => setTimeout(resolve, 1000));

            // Test 3: Tarjeta de login mínima
            await context.sendActivity('🧪 **Test 3**: Tarjeta de login mínima');
            const loginCard = this.createMinimalLoginCard();
            await context.sendActivity({ attachments: [loginCard] });

            await context.sendActivity(
                '📊 **Diagnóstico completado**\n\n' +
                '✅ Si ves las 3 tarjetas arriba: Las Adaptive Cards funcionan\n' +
                '❌ Si no ves ninguna tarjeta: Problema con Adaptive Cards en tu Teams\n' +
                '⚠️ Si ves algunas pero no todas: Problema de compatibilidad específico\n\n' +
                '**Comandos disponibles:**\n' +
                '• `card-login` - Probar login con tarjeta\n' +
                '• `login usuario:contraseña` - Login alternativo\n' +
                '• `test` - Repetir estas pruebas'
            );

        } catch (error) {
            console.error('❌ Error en pruebas:', error);
            await context.sendActivity(`❌ Error ejecutando pruebas: ${error.message}`);
        }
    }

    /**
     * 🃏 TARJETA ULTRA-SIMPLE (debería funcionar siempre)
     */
    createSimpleTestCard() {
        const card = {
            type: 'AdaptiveCard',
            version: '1.0',
            body: [
                {
                    type: 'TextBlock',
                    text: '✅ Tarjeta Simple Funciona',
                    weight: 'Bolder'
                }
            ]
        };

        console.log('🃏 Tarjeta simple creada');
        return CardFactory.adaptiveCard(card);
    }

    /**
     * 🃏 TARJETA CON INPUT BÁSICO
     */
    createInputTestCard() {
        const card = {
            type: 'AdaptiveCard',
            version: '1.0',
            body: [
                {
                    type: 'TextBlock',
                    text: 'Prueba de Input',
                    weight: 'Bolder'
                },
                {
                    type: 'Input.Text',
                    id: 'testInput',
                    placeholder: 'Escribe algo'
                }
            ],
            actions: [
                {
                    type: 'Action.Submit',
                    title: 'Probar',
                    data: { action: 'test' }
                }
            ]
        };

        console.log('🃏 Tarjeta con input creada');
        return CardFactory.adaptiveCard(card);
    }

    /**
     * 🔐 TARJETA DE LOGIN MÍNIMA (máxima compatibilidad)
     */
    createMinimalLoginCard() {
        const card = {
            type: 'AdaptiveCard',
            version: '1.0',
            body: [
                {
                    type: 'TextBlock',
                    text: 'Login',
                    weight: 'Bolder'
                },
                {
                    type: 'Input.Text',
                    id: 'username',
                    placeholder: 'Usuario'
                },
                {
                    type: 'Input.Text',
                    id: 'password',
                    placeholder: 'Contraseña',
                    style: 'Password'
                }
            ],
            actions: [
                {
                    type: 'Action.Submit',
                    title: 'Entrar',
                    data: { action: 'login' }
                }
            ]
        };

        console.log('🔐 Tarjeta de login mínima creada');
        return CardFactory.adaptiveCard(card);
    }

    /**
     * 🔐 TARJETA DE LOGIN CON ESTILO (versión mejorada si la mínima funciona)
     */
    createStyledLoginCard() {
        const card = {
            type: 'AdaptiveCard',
            version: '1.0',
            body: [
                {
                    type: 'TextBlock',
                    text: '🔐 Iniciar Sesión',
                    size: 'Large',
                    weight: 'Bolder'
                },
                {
                    type: 'TextBlock',
                    text: 'Ingresa tus credenciales corporativas:',
                    wrap: true
                },
                {
                    type: 'TextBlock',
                    text: 'Usuario:',
                    weight: 'Bolder'
                },
                {
                    type: 'Input.Text',
                    id: 'username',
                    placeholder: 'Ejemplo: 91004'
                },
                {
                    type: 'TextBlock',
                    text: 'Contraseña:',
                    weight: 'Bolder'
                },
                {
                    type: 'Input.Text',
                    id: 'password',
                    placeholder: 'Tu contraseña',
                    style: 'Password'
                },
                {
                    type: 'TextBlock',
                    text: '🔒 Conexión segura',
                    size: 'Small'
                }
            ],
            actions: [
                {
                    type: 'Action.Submit',
                    title: '🚀 Iniciar Sesión',
                    data: { action: 'login' }
                }
            ]
        };

        console.log('🔐 Tarjeta de login con estilo creada');
        return CardFactory.adaptiveCard(card);
    }

    /**
     * 📋 MOSTRAR OPCIONES DE LOGIN
     */
    async showLoginOptions(context) {
        try {
            const message = 
                '🔐 **Bienvenido a Nova Bot**\n\n' +
                '**Opciones de login:**\n\n' +
                '🃏 **Opción 1 (Recomendada)**: Escribe `card-login`\n' +
                '   └ Te mostrará una tarjeta interactiva\n\n' +
                '📝 **Opción 2 (Alternativa)**: Escribe `login usuario:contraseña`\n' +
                '   └ Ejemplo: `login 91004:mipassword`\n\n' +
                '🧪 **Diagnóstico**: Escribe `test` para probar las tarjetas\n\n' +
                '❓ **¿Cuál prefieres?**';

            await context.sendActivity(message);

        } catch (error) {
            console.error('Error mostrando opciones:', error);
            await context.sendActivity('🔐 Para login, escribe: `login usuario:contraseña`');
        }
    }

    /**
     * 🔐 MOSTRAR TARJETA DE LOGIN
     */
    async showLoginCard(context) {
        try {
            console.log('🔐 Intentando mostrar tarjeta de login...');

            // Primero el texto
            await context.sendActivity('🔐 **Formulario de Login**');

            // Intentar tarjeta mínima primero
            const loginCard = this.createMinimalLoginCard();
            
            console.log('🔐 Enviando tarjeta...', JSON.stringify(loginCard.content, null, 2));
            
            await context.sendActivity({ 
                attachments: [loginCard]
            });

            console.log('✅ Tarjeta enviada exitosamente');

            // Instrucciones adicionales
            await context.sendActivity(
                '📝 **Alternativa**: Si no ves la tarjeta, escribe:\n' +
                '`login tu_usuario:tu_contraseña`'
            );

        } catch (error) {
            console.error('❌ Error enviando tarjeta de login:', error);
            
            // Fallback completo
            await context.sendActivity(
                '❌ **Error con la tarjeta**\n\n' +
                '🔄 **Usa el método alternativo:**\n' +
                'Escribe: `login usuario:contraseña`\n\n' +
                'Ejemplo: `login 91004:mipassword`'
            );
        }
    }

    /**
     * 📝 LOGIN CON TEXTO (método alternativo)
     */
    async handleTextLogin(context, text) {
        const userId = context.activity.from.id;
        
        try {
            console.log(`[${userId}] Login con texto: ${text}`);

            // Extraer credenciales del formato: login usuario:contraseña
            const loginPart = text.substring(6).trim(); // Remover "login "
            const [username, password] = loginPart.split(':');

            if (!username || !password) {
                await context.sendActivity(
                    '❌ **Formato incorrecto**\n\n' +
                    '✅ **Formato correcto**: `login usuario:contraseña`\n' +
                    '📝 **Ejemplo**: `login 91004:mipassword`'
                );
                return;
            }

            console.log(`[${userId}] Credenciales extraídas - Usuario: ${username}`);

            // Procesar login
            await context.sendActivity({ type: 'typing' });
            const loginResponse = await this.authenticateWithNova(username.trim(), password.trim());

            if (loginResponse.success) {
                await this.setUserAuthenticated(userId, loginResponse.userInfo, context);
                
                await context.sendActivity(
                    `✅ **¡Login exitoso!**\n\n` +
                    `👋 Bienvenido, **${loginResponse.userInfo.nombre}**\n` +
                    `👤 Usuario: ${loginResponse.userInfo.usuario}\n` +
                    `🔑 Token: ${loginResponse.userInfo.token.substring(0, 20)}...\n\n` +
                    `💬 Ya puedes usar el bot normalmente.`
                );
            } else {
                await context.sendActivity(
                    `❌ **Error de autenticación**\n\n` +
                    `${loginResponse.message}\n\n` +
                    `🔄 Intenta nuevamente con el formato correcto.`
                );
            }

        } catch (error) {
            console.error(`[${userId}] Error en login con texto:`, error);
            await context.sendActivity('❌ Error procesando login.');
        }
    }

    /**
     * 📤 MANEJAR SUBMIT DE TARJETA
     */
    async handleLoginSubmit(context) {
        const userId = context.activity.from.id;
        
        try {
            console.log(`[${userId}] Submit de tarjeta recibido:`, JSON.stringify(context.activity.value, null, 2));

            const value = context.activity.value || {};
            const { username, password, action } = value;

            // Verificar que es el submit correcto
            if (action !== 'login') {
                console.log(`[${userId}] Submit ignorado - acción: ${action}`);
                return;
            }

            if (!username || !password) {
                await context.sendActivity(
                    '❌ **Campos incompletos**\n\n' +
                    'Por favor, completa usuario y contraseña.'
                );
                await this.showLoginCard(context);
                return;
            }

            console.log(`[${userId}] Procesando login desde tarjeta - Usuario: ${username}`);

            await context.sendActivity({ type: 'typing' });
            const loginResponse = await this.authenticateWithNova(username.trim(), password.trim());

            if (loginResponse.success) {
                await this.setUserAuthenticated(userId, loginResponse.userInfo, context);
                
                await context.sendActivity(
                    `✅ **¡Login exitoso desde tarjeta!**\n\n` +
                    `👋 Bienvenido, **${loginResponse.userInfo.nombre}**\n` +
                    `👤 Usuario: ${loginResponse.userInfo.usuario}\n` +
                    `🔑 Token: ${loginResponse.userInfo.token.substring(0, 20)}...\n\n` +
                    `💬 Ya puedes usar el bot normalmente.`
                );
            } else {
                await context.sendActivity(
                    `❌ **Error de autenticación**\n\n` +
                    `${loginResponse.message}\n\n` +
                    `🔄 Intenta nuevamente.`
                );
                await this.showLoginCard(context);
            }

        } catch (error) {
            console.error(`[${userId}] Error en submit de tarjeta:`, error);
            await context.sendActivity('❌ Error procesando tarjeta de login.');
        }
    }

    /**
     * 🌐 AUTENTICAR CON NOVA API
     */
    async authenticateWithNova(username, password) {
        try {
            console.log(`🔐 Autenticando: ${username}`);
            
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
                    timeout: 15000
                }
            );

            console.log(`📡 Respuesta Nova (${response.status}):`, response.data);

            if (response.data && response.data.info && response.data.info.length > 0) {
                const userInfo = response.data.info[0];
                
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
            console.error('Error Nova API:', error.message);
            
            if (error.response) {
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
                    message: 'Timeout - servidor lento'
                };
            } else {
                return {
                    success: false,
                    message: 'Error de conexión'
                };
            }
        }
    }

    // ===== MÉTODOS AUXILIARES (mantenidos igual) =====

    isLogoutCommand(text) {
        return ['logout', 'cerrar sesion', 'cerrar sesión', 'salir'].includes(text.toLowerCase());
    }

    async handleLogout(context, userId) {
        try {
            this.authenticatedUsers.delete(userId);
            const authData = await this.authState.get(context, {});
            delete authData[userId];
            await this.authState.set(context, authData);
            await this.userState.saveChanges(context);
            
            await context.sendActivity('✅ **Sesión cerrada**\n\nHasta luego!');
            await this.showLoginOptions(context);
            
        } catch (error) {
            console.error(`Error en logout:`, error);
            await context.sendActivity('❌ Error cerrando sesión.');
        }
    }

    async isUserAuthenticated(userId, context) {
        try {
            const memoryAuth = this.authenticatedUsers.has(userId);
            const authData = await this.authState.get(context, {});
            const persistentAuth = authData[userId]?.authenticated === true;
            
            if (memoryAuth && !persistentAuth) {
                await this.syncPersistentAuth(userId, context);
                return true;
            } else if (!memoryAuth && persistentAuth) {
                await this.syncMemoryAuth(userId, context, authData[userId]);
                return true;
            }
            
            return memoryAuth && persistentAuth;
            
        } catch (error) {
            console.error(`Error verificando auth:`, error);
            return false;
        }
    }

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
            console.error(`Error sync persistente:`, error);
        }
    }

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
            console.error(`Error sync memoria:`, error);
        }
    }

    async setUserAuthenticated(userId, userInfo, context) {
        try {
            this.authenticatedUsers.set(userId, userInfo);

            const authData = await this.authState.get(context, {});
            authData[userId] = {
                authenticated: true,
                ...userInfo,
                lastAuthenticated: new Date().toISOString()
            };
            await this.authState.set(context, authData);
            await this.userState.saveChanges(context);

            console.log(`[${userId}] Autenticación establecida`);
            return true;
            
        } catch (error) {
            console.error(`Error estableciendo auth:`, error);
            return false;
        }
    }

    async processAuthenticatedMessage(context, text, userId) {
        try {
            await context.sendActivity({ type: 'typing' });

            const userInfo = this.authenticatedUsers.get(userId);
            const userToken = userInfo?.token;

            const response = await this.openaiService.procesarMensaje(
                text, 
                [],
                userToken, 
                userInfo
            );

            await this.sendResponse(context, response);

        } catch (error) {
            console.error(`Error procesando mensaje:`, error);
            await context.sendActivity('❌ Error al procesar tu mensaje.');
        }
    }

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

    async getUserToken(userId) {
        const userInfo = this.authenticatedUsers.get(userId);
        return userInfo?.token || null;
    }

    async getUserInfo(userId) {
        return this.authenticatedUsers.get(userId) || null;
    }
}

module.exports.TeamsBot = TeamsBot;