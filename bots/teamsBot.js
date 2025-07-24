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
}