// teamsBot.js - VERSIÓN MEJORADA con mejor manejo de autenticación

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
        this.loginCardSentUsers = new Set();
        this.welcomeMessageSent = new Set(); // ✅ NUEVO: Evitar mensajes de bienvenida duplicados
        
        this.onMembersAdded(this.handleMembersAdded.bind(this));
        this.onMessage(this.handleMessageWithAuth.bind(this));
        this.openaiService = openaiService;
        
        console.log('✅ TeamsBot inicializado - Versión mejorada');
    }

    async handleMembersAdded(context, next) {
        for (const member of context.activity.membersAdded) {
            if (member.id !== context.activity.recipient.id) {
                const userId = context.activity.from.id;
                
                // ✅ MEJORA: Verificar si ya está autenticado antes de mostrar login
                const isAuthenticated = await this.isUserAuthenticated(userId, context);
                
                if (isAuthenticated) {
                    await this.sendWelcomeBackMessage(context, userId);
                } else {
                    await this.sendInitialWelcome(context, userId);
                }
            }
        }
        await next();
    }

    /**
     * ✅ NUEVO: Mensaje de bienvenida para usuarios ya autenticados
     */
    async sendWelcomeBackMessage(context, userId) {
        if (this.welcomeMessageSent.has(userId)) return;
        
        try {
            const userInfo = await this.getUserInfo(userId);
            
            await context.sendActivity(
                `👋 **¡Hola de nuevo, ${userInfo.nombre}!**\n\n` +
                `✅ Ya estás autenticado como: **${userInfo.usuario}**\n\n` +
                `💬 Puedes comenzar a chatear conmigo. ¿En qué puedo ayudarte hoy?`
            );
            
            this.welcomeMessageSent.add(userId);
            
            // Limpiar después de 1 minuto
            setTimeout(() => this.welcomeMessageSent.delete(userId), 60000);
            
        } catch (error) {
            console.error('Error enviando mensaje de bienvenida:', error);
            await this.sendInitialWelcome(context, userId);
        }
    }

    /**
     * ✅ MEJORADO: Mensaje de bienvenida inicial con fallback robusto
     */
    async sendInitialWelcome(context, userId) {
        if (this.welcomeMessageSent.has(userId)) return;
        
        try {
            await context.sendActivity(
                `🤖 **¡Bienvenido a Nova Bot!**\n\n` +
                `Soy tu asistente corporativo con inteligencia artificial.\n\n` +
                `🔐 **Para comenzar, necesitas autenticarte...**`
            );
            
            // Pequeña pausa para que el mensaje llegue primero
            await new Promise(resolve => setTimeout(resolve, 1000));
            
            await this.showLoginCard(context, 'initialWelcome');
            
            this.welcomeMessageSent.add(userId);
            
            // Limpiar después de 2 minutos
            setTimeout(() => this.welcomeMessageSent.delete(userId), 120000);
            
        } catch (error) {
            console.error('Error enviando bienvenida inicial:', error);
            await context.sendActivity(
                '🤖 **¡Bienvenido a Nova Bot!**\n\n' +
                'Para iniciar sesión, escribe: `login usuario:contraseña`\n\n' +
                'Ejemplo: `login 91004:mipassword`'
            );
        }
    }

    async handleMessageWithAuth(context, next) {
        const userId = context.activity.from.id;
        const text = (context.activity.text || '').trim();

        console.log(`[${userId}] Mensaje: "${text}"`);

        try {
            // 🧪 COMANDOS DE DIAGNÓSTICO (mantener)
            if (text.toLowerCase() === 'test-card' || text.toLowerCase() === 'test') {
                await this.runCardTests(context);
                return await next();
            }

            if (text.toLowerCase().startsWith('debug-api ')) {
                await this.debugNovaAPI(context, text);
                return await next();
            }

            if (text.toLowerCase() === 'clear-protection') {
                this.loginCardSentUsers.clear();
                this.welcomeMessageSent.clear();
                await context.sendActivity('🧹 **Protección limpiada** - Puedes probar login nuevamente');
                return await next();
            }

            // 🔐 COMANDOS DE LOGIN
            if (text.toLowerCase() === 'card-login' || text.toLowerCase() === 'login-card') {
                await this.showLoginCard(context, 'manualRequest');
                return await next();
            }

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

            // ✅ VERIFICAR AUTENTICACIÓN - MEJORADO
            const isAuthenticated = await this.isUserAuthenticated(userId, context);
            
            if (!isAuthenticated) {
                console.log(`🔒 [${userId}] Usuario no autenticado`);
                
                // ✅ MEJORA: Mensaje más claro cuando no está autenticado
                await context.sendActivity(
                    `🔒 **Necesitas autenticarte primero**\n\n` +
                    `Para usar el bot, debes iniciar sesión con tus credenciales corporativas.\n\n` +
                    `**Opciones:**\n` +
                    `• Usar la tarjeta de login (recomendado)\n` +
                    `• Escribir: \`login usuario:contraseña\``
                );
                
                await this.showLoginCard(context, 'authRequired');
                return await next();
            }

            // ✅ MEJORADO: Comandos informativos para usuarios autenticados
            if (text.toLowerCase() === 'mi info' || text.toLowerCase() === 'info' || text.toLowerCase() === 'perfil') {
                await this.showUserInfo(context, userId);
                return await next();
            }

            if (text.toLowerCase() === 'ayuda' || text.toLowerCase() === 'help') {
                await this.showHelp(context, userId);
                return await next();
            }

            // 💬 PROCESAR MENSAJE AUTENTICADO
            await this.processAuthenticatedMessage(context, text, userId);

        } catch (error) {
            console.error(`[${userId}] Error:`, error);
            await context.sendActivity(
                '❌ **Error procesando mensaje**\n\n' +
                'Ocurrió un error inesperado. Si el problema persiste, ' +
                'intenta cerrar sesión (`logout`) y volver a autenticarte.'
            );
        }

        await next();
    }

    /**
     * ✅ NUEVO: Mostrar información del usuario autenticado
     */
    async showUserInfo(context, userId) {
        try {
            const userInfo = await this.getUserInfo(userId);
            
            if (!userInfo) {
                await context.sendActivity('❌ No se pudo obtener tu información.');
                return;
            }

            const infoCard = this.createUserInfoCard(userInfo);
            
            await context.sendActivity(
                `👤 **Tu Información Corporativa**\n\n` +
                `📝 **Nombre**: ${userInfo.nombre}\n` +
                `👤 **Usuario**: ${userInfo.usuario}\n` +
                `🏢 **Apellido Paterno**: ${userInfo.paterno || 'N/A'}\n` +
                `🏢 **Apellido Materno**: ${userInfo.materno || 'N/A'}\n` +
                `🔑 **Token**: ${userInfo.token.substring(0, 30)}...\n` +
                `📅 **Última autenticación**: Hace unos momentos\n\n` +
                `💬 **¿Necesitas algo más?** Solo pregúntame.`
            );

        } catch (error) {
            console.error(`Error mostrando info del usuario:`, error);
            await context.sendActivity('❌ Error obteniendo tu información.');
        }
    }

    /**
     * ✅ NUEVO: Mostrar ayuda contextual
     */
    async showHelp(context, userId) {
        try {
            const userInfo = await this.getUserInfo(userId);
            
            await context.sendActivity(
                `📚 **Ayuda - Nova Bot**\n\n` +
                `👋 Hola **${userInfo.nombre}**, aquí tienes todo lo que puedo hacer:\n\n` +
                
                `🤖 **Chat Inteligente:**\n` +
                `• Escribe cualquier pregunta o mensaje\n` +
                `• Uso inteligencia artificial GPT-4 para ayudarte\n` +
                `• Puedo ayudarte con tareas, análisis, consultas, etc.\n\n` +
                
                `👤 **Comandos Útiles:**\n` +
                `• \`mi info\` - Ver tu información corporativa\n` +
                `• \`logout\` - Cerrar sesión\n` +
                `• \`ayuda\` - Mostrar esta ayuda\n\n` +
                
                `🔒 **Seguridad:**\n` +
                `• Tu sesión es temporal y segura\n` +
                `• Tu token se mantiene privado\n` +
                `• Puedes cerrar sesión en cualquier momento\n\n` +
                
                `💡 **Ejemplos de uso:**\n` +
                `• "¿Qué puedes hacer?"\n` +
                `• "Ayúdame a escribir un email"\n` +
                `• "Explícame sobre IA"\n` +
                `• "¿Cuál es la fecha de hoy?"`
            );

        } catch (error) {
            console.error(`Error mostrando ayuda:`, error);
            await context.sendActivity('❌ Error mostrando ayuda.');
        }
    }

    /**
     * ✅ MEJORADO: Tarjeta de información de usuario
     */
    createUserInfoCard(userInfo) {
        const card = {
            type: 'AdaptiveCard',
            version: '1.0',
            body: [
                {
                    type: 'TextBlock',
                    text: '👤 Tu Información',
                    size: 'Large',
                    weight: 'Bolder'
                },
                {
                    type: 'FactSet',
                    facts: [
                        { title: 'Nombre:', value: userInfo.nombre },
                        { title: 'Usuario:', value: userInfo.usuario },
                        { title: 'Paterno:', value: userInfo.paterno || 'N/A' },
                        { title: 'Materno:', value: userInfo.materno || 'N/A' }
                    ]
                }
            ],
            actions: [
                {
                    type: 'Action.Submit',
                    title: '❓ Ayuda',
                    data: { action: 'help' }
                }
            ]
        };

        return CardFactory.adaptiveCard(card);
    }

    /**
     * ✅ MEJORADO: Manejo de logout con confirmación
     */
    async handleLogout(context, userId) {
        try {
            console.log(`🚪 [${userId}] Iniciando logout...`);
            
            const userInfo = await this.getUserInfo(userId);
            const userName = userInfo ? userInfo.nombre : 'Usuario';
            
            // Limpiar datos
            this.authenticatedUsers.delete(userId);
            const authData = await this.authState.get(context, {});
            delete authData[userId];
            await this.authState.set(context, authData);
            await this.userState.saveChanges(context);
            
            // Limpiar protecciones
            this.loginCardSentUsers.delete(userId);
            this.welcomeMessageSent.delete(userId);
            
            await context.sendActivity(
                `👋 **¡Hasta luego, ${userName}!**\n\n` +
                `✅ Tu sesión ha sido cerrada correctamente.\n\n` +
                `🔒 Para volver a usar el bot, necesitarás autenticarte nuevamente.`
            );
            
            // Pequeña pausa antes de mostrar login
            await new Promise(resolve => setTimeout(resolve, 2000));
            
            await context.sendActivity('🔐 **¿Quieres iniciar sesión nuevamente?**');
            await this.showLoginCard(context, 'postLogout');
            
        } catch (error) {
            console.error(`Error en logout:`, error);
            await context.sendActivity('❌ Error cerrando sesión, pero tu sesión ha sido terminada.');
        }
    }

    /**
     * ✅ MEJORADO: Procesamiento de mensajes autenticados con mejor contexto
     */
    async processAuthenticatedMessage(context, text, userId) {
        try {
            const userInfo = this.authenticatedUsers.get(userId);
            
            // Mostrar indicador de escritura
            await context.sendActivity({ type: 'typing' });

            console.log(`💬 [${userInfo.usuario}] Procesando mensaje: "${text}"`);

            const response = await this.openaiService.procesarMensaje(
                text, 
                [], // Historial - podrías implementar esto si quieres mantener contexto
                userInfo.token, 
                userInfo
            );

            await this.sendResponse(context, response);

        } catch (error) {
            console.error(`Error procesando mensaje autenticado:`, error);
            
            if (error.message.includes('token') || error.message.includes('auth')) {
                await context.sendActivity(
                    '🔒 **Problema de autenticación**\n\n' +
                    'Tu sesión puede haber expirado. Por favor, cierra sesión e inicia nuevamente.\n\n' +
                    'Escribe `logout` para cerrar sesión.'
                );
            } else {
                await context.sendActivity('❌ Error procesando tu mensaje. Intenta nuevamente.');
            }
        }
    }

    // ===== MANTENER MÉTODOS EXISTENTES =====
    // (authenticateWithNova, handleLoginSubmit, showLoginCard, etc.)
    // ... [resto de métodos sin cambios]

    /**
     * ✅ MEJORADO: Debug más completo
     */
    getStats() {
        return {
            authenticatedUsers: this.authenticatedUsers.size,
            loginCardsPending: this.loginCardSentUsers.size,
            welcomeMessagesSent: this.welcomeMessageSent.size,
            openaiAvailable: this.openaiService?.openaiAvailable || false,
            timestamp: new Date().toISOString()
        };
    }

    // ===== MANTENER MÉTODOS EXISTENTES - IMPLEMENTACIÓN COMPLETA =====

    /**
     * 🧪 DEBUG DE LA API NOVA
     */
    async debugNovaAPI(context, text) {
        try {
            // Extraer credenciales del formato: debug-api usuario:contraseña
            const debugPart = text.substring(10).trim(); // Remover "debug-api "
            const [username, password] = debugPart.split(':');

            if (!username || !password) {
                await context.sendActivity(
                    '🧪 **Debug API Nova**\n\n' +
                    '✅ **Formato**: `debug-api usuario:contraseña`\n' +
                    '📝 **Ejemplo**: `debug-api 111111:password`\n\n' +
                    'Esto probará la API sin procesar el login.'
                );
                return;
            }

            await context.sendActivity('🧪 **Probando API Nova directamente...**');
            await context.sendActivity({ type: 'typing' });

            console.log(`\n🧪 ===== DEBUG API NOVA =====`);
            console.log(`Usuario: ${username}`);
            console.log(`Password: ${'*'.repeat(password.length)}`);

            const result = await this.authenticateWithNova(username.trim(), password.trim());

            console.log(`Resultado:`, result);
            console.log(`===== FIN DEBUG API =====\n`);

            if (result.success) {
                await context.sendActivity(
                    `✅ **API Nova - ÉXITO**\n\n` +
                    `👤 **Usuario**: ${result.userInfo.usuario}\n` +
                    `👋 **Nombre**: ${result.userInfo.nombre}\n` +
                    `🔑 **Token**: ${result.userInfo.token.substring(0, 30)}...\n` +
                    `💬 **Mensaje**: ${result.userInfo.mensaje}\n\n` +
                    `🎯 **La API funciona correctamente. El problema podría estar en:**\n` +
                    `• El submit de la tarjeta\n` +
                    `• El procesamiento de datos\n` +
                    `• La interfaz de Teams`
                );
            } else {
                await context.sendActivity(
                    `❌ **API Nova - ERROR**\n\n` +
                    `📝 **Mensaje**: ${result.message}\n\n` +
                    `🔍 **Verifica**:\n` +
                    `• Credenciales correctas\n` +
                    `• Conexión a internet\n` +
                    `• Servidor Nova disponible`
                );
            }

        } catch (error) {
            console.error('Error en debug API:', error);
            await context.sendActivity(`❌ **Error en debug**: ${error.message}`);
        }
    }

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

    createMinimalLoginCard() {
        const card = {
            type: 'AdaptiveCard',
            version: '1.0',
            body: [
                {
                    type: 'TextBlock',
                    text: 'Iniciar Sesión',
                    size: 'Large',
                    weight: 'Bolder'
                },
                {
                    type: 'TextBlock',
                    text: 'Ingresa tus credenciales corporativas:',
                    wrap: true
                },
                {
                    type: 'Input.Text',
                    id: 'username',
                    placeholder: 'Usuario (ej: 91004)'
                },
                {
                    type: 'Input.Text',
                    id: 'password',
                    placeholder: 'Contraseña',
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

        console.log('🔐 Tarjeta de login mínima creada');
        return CardFactory.adaptiveCard(card);
    }

    async showLoginCard(context, caller = 'unknown') {
        const userId = context.activity.from.id;
        
        try {
            console.log(`\n🔐 [${userId}] ===== INICIO showLoginCard =====`);
            console.log(`📞 [${userId}] Llamado desde: ${caller}`);
            console.log(`🔍 [${userId}] Usuario ya tiene tarjeta pendiente: ${this.loginCardSentUsers.has(userId)}`);

            // ✅ PROTECCIÓN: No enviar tarjeta si ya se envió recientemente
            if (this.loginCardSentUsers.has(userId)) {
                console.log(`⚠️ [${userId}] Tarjeta ya enviada recientemente, saltando...`);
                return;
            }

            console.log('🔐 Intentando mostrar tarjeta de login...');

            // Tarjeta de login
            const loginCard = this.createMinimalLoginCard();
            
            console.log('🔐 Enviando tarjeta...');
            
            await context.sendActivity({ 
                attachments: [loginCard]
            });

            // ✅ MARCAR: Usuario tiene tarjeta pendiente
            this.loginCardSentUsers.add(userId);
            
            // ✅ LIMPIAR: Después de 30 segundos permitir nueva tarjeta
            setTimeout(() => {
                this.loginCardSentUsers.delete(userId);
                console.log(`🧹 [${userId}] Protección anti-duplicados limpiada`);
            }, 30000);

            console.log(`✅ [${userId}] Tarjeta enviada exitosamente`);
            console.log(`🏁 [${userId}] ===== FIN showLoginCard =====\n`);

        } catch (error) {
            console.error(`❌ [${userId}] Error enviando tarjeta de login:`, error);
            
            // ✅ LIMPIAR: En caso de error, permitir reintento
            this.loginCardSentUsers.delete(userId);
            
            // Fallback completo
            await context.sendActivity(
                '🔐 **Bienvenido a Nova Bot**\n\n' +
                '❌ **Error con la tarjeta**\n\n' +
                '🔄 **Usa el método alternativo:**\n' +
                'Escribe: `login usuario:contraseña`\n\n' +
                'Ejemplo: `login 91004:mipassword`'
            );
        }
    }

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
                // ✅ LIMPIAR: Usuario logueado exitosamente
                this.loginCardSentUsers.delete(userId);
                
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

    async handleLoginSubmit(context) {
        const userId = context.activity.from.id;
        
        try {
            console.log(`\n🎯 [${userId}] ===== SUBMIT DE TARJETA RECIBIDO =====`);
            console.log(`📋 Activity value:`, JSON.stringify(context.activity.value, null, 2));

            const value = context.activity.value || {};
            const { username, password, action } = value;

            console.log(`🔍 Datos extraídos:`, {
                username: username ? `"${username}" (${username.length} chars)` : 'undefined',
                password: password ? `"${'*'.repeat(password.length)}" (${password.length} chars)` : 'undefined',
                action: action
            });

            // Verificar que es el submit correcto
            if (action !== 'login') {
                console.log(`⚠️ [${userId}] Submit ignorado - acción esperada: 'login', recibida: '${action}'`);
                return;
            }

            if (!username || !password) {
                console.log(`❌ [${userId}] Campos incompletos - username: ${!!username}, password: ${!!password}`);
                await context.sendActivity(
                    '❌ **Campos incompletos**\n\n' +
                    'Por favor, completa usuario y contraseña.'
                );
                await this.showLoginCard(context, 'handleLoginSubmit-incompletos');
                return;
            }

            console.log(`🚀 [${userId}] Procesando login desde tarjeta - Usuario: "${username}"`);

            await context.sendActivity({ type: 'typing' });
            
            console.log(`📡 [${userId}] Llamando a Nova API...`);
            const loginResponse = await this.authenticateWithNova(username.trim(), password.trim());
            
            console.log(`📨 [${userId}] Respuesta de autenticación:`, {
                success: loginResponse.success,
                message: loginResponse.message,
                hasUserInfo: !!loginResponse.userInfo
            });

            if (loginResponse.success) {
                console.log(`✅ [${userId}] Login exitoso, estableciendo autenticación...`);
                
                // ✅ LIMPIAR: Usuario logueado exitosamente
                this.loginCardSentUsers.delete(userId);
                
                const authResult = await this.setUserAuthenticated(userId, loginResponse.userInfo, context);
                console.log(`🔐 [${userId}] Autenticación establecida: ${authResult}`);
                
                await context.sendActivity(
                    `✅ **¡Login exitoso desde tarjeta!**\n\n` +
                    `👋 Bienvenido, **${loginResponse.userInfo.nombre}**\n` +
                    `👤 Usuario: ${loginResponse.userInfo.usuario}\n` +
                    `🔑 Token: ${loginResponse.userInfo.token.substring(0, 20)}...\n\n` +
                    `💬 Ya puedes usar el bot normalmente.`
                );
                
                console.log(`🎉 [${userId}] Login completado exitosamente`);
            } else {
                console.log(`❌ [${userId}] Login fallido: ${loginResponse.message}`);
                
                await context.sendActivity(
                    `❌ **Error de autenticación**\n\n` +
                    `${loginResponse.message}\n\n` +
                    `🔄 Intenta nuevamente.`
                );
                await this.showLoginCard(context, 'handleLoginSubmit-fallido');
            }

            console.log(`🏁 [${userId}] ===== FIN SUBMIT DE TARJETA =====\n`);

        } catch (error) {
            console.error(`💥 [${userId}] Error crítico en submit de tarjeta:`, error);
            await context.sendActivity('❌ Error procesando tarjeta de login.');
        }
    }

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

            console.log(`📡 Respuesta Nova (${response.status}):`, JSON.stringify(response.data, null, 2));
            console.log(`🔍 Tipo de respuesta:`, typeof response.data);

            // ✅ CORRECCIÓN: Parsear JSON si viene como string
            let parsedData = response.data;
            
            if (typeof response.data === 'string') {
                console.log(`🔧 Parseando JSON string...`);
                try {
                    parsedData = JSON.parse(response.data);
                    console.log(`✅ JSON parseado exitosamente:`, parsedData);
                } catch (parseError) {
                    console.error(`❌ Error parseando JSON:`, parseError.message);
                    return {
                        success: false,
                        message: 'Error procesando respuesta del servidor'
                    };
                }
            }

            if (parsedData && parsedData.info && parsedData.info.length > 0) {
                const rawUserInfo = parsedData.info[0];
                
                console.log(`🔍 Datos del usuario:`, {
                    EsValido: rawUserInfo.EsValido,
                    HasToken: !!rawUserInfo.Token,
                    TokenLength: rawUserInfo.Token ? rawUserInfo.Token.length : 0,
                    Mensaje: rawUserInfo.Mensaje,
                    CveUsuario: rawUserInfo.CveUsuario
                });
                
                // ✅ CORRECCIÓN: Limpiar datos y verificar correctamente
                if (rawUserInfo.EsValido === 0 && rawUserInfo.Token && rawUserInfo.Token.trim().length > 0) {
                    const cleanUserInfo = {
                        usuario: rawUserInfo.CveUsuario ? rawUserInfo.CveUsuario.toString().trim() : username,
                        nombre: rawUserInfo.Nombre ? rawUserInfo.Nombre.replace(/\t/g, '').trim() : 'Usuario',
                        paterno: rawUserInfo.Paterno ? rawUserInfo.Paterno.replace(/\t/g, '').trim() : '',
                        materno: rawUserInfo.Materno ? rawUserInfo.Materno.replace(/\t/g, '').trim() : '',
                        token: rawUserInfo.Token.trim(),
                        mensaje: rawUserInfo.Mensaje ? rawUserInfo.Mensaje.trim() : 'Login exitoso'
                    };
                    
                    console.log(`✅ Datos limpiados:`, cleanUserInfo);
                    
                    return {
                        success: true,
                        userInfo: cleanUserInfo
                    };
                } else {
                    console.log(`❌ Login fallido - EsValido: ${rawUserInfo.EsValido}, Token: ${!!rawUserInfo.Token}`);
                    return {
                        success: false,
                        message: rawUserInfo.Mensaje || 'Credenciales inválidas'
                    };
                }
            } else {
                console.log('❌ Respuesta sin datos válidos - parsedData:', parsedData);
                return {
                    success: false,
                    message: 'Respuesta inesperada del servidor'
                };
            }

        } catch (error) {
            console.error('❌ Error Nova API:', error.message);
            
            if (error.response) {
                console.error('❌ Response error:', error.response.status, error.response.data);
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

    // ===== MÉTODOS AUXILIARES =====

    isLogoutCommand(text) {
        return ['logout', 'cerrar sesion', 'cerrar sesión', 'salir'].includes(text.toLowerCase());
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