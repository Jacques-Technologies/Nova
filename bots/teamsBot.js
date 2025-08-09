// teamsBot.js - VERSIÓN CON COSMOS DB y lógica "sin token = sin conversación"

const { DialogBot } = require('./dialogBot');
const { CardFactory } = require('botbuilder');
const axios = require('axios');
const openaiService = require('../services/openaiService');
const cosmosService = require('../services/cosmosService');
const conversationService = require('../services/conversationService'); // ✅ nuevo
require('dotenv').config();

class TeamsBot extends DialogBot {
    constructor(conversationState, userState) {
        super(conversationState, userState);

        global.botInstance = this;
        this.authenticatedUsers = new Map();
        this.authState = this.userState.createProperty('AuthState');
        this.loginCardSentUsers = new Set();
        this.welcomeMessageSent = new Set();
        
        this.onMembersAdded(this.handleMembersAdded.bind(this));
        this.onMessage(this.handleMessageWithAuth.bind(this));
        this.openaiService = openaiService;
        
        console.log('✅ TeamsBot inicializado con Cosmos DB');
        console.log(`💾 Persistencia: ${cosmosService.isAvailable() ? 'Cosmos DB activa' : 'Solo memoria'}`);
    }

    /**
     * Muestra el historial de conversación al usuario.
     * Cuando el usuario escribe "historial", se presenta una lista de los últimos
     * 5 mensajes de la conversación actual. Se utiliza Cosmos DB si está
     * disponible; de lo contrario, se utiliza el almacenamiento en memoria
     * proporcionado por conversationService.
     * @param {TurnContext} context Contexto de la conversación
     * @param {string} userId Identificador del usuario
     * @param {string} conversationId Identificador de la conversación
     */
    async showConversationHistory(context, userId, conversationId) {
        try {
            const userInfo = await this.getUserInfo(userId);
            const pk = userInfo.usuario; // ✅ partition key consistente
            let historial = [];
            
            if (cosmosService.isAvailable()) {
                historial = await cosmosService.getConversationHistory(conversationId, pk, 5);
            } else {
                historial = await conversationService.getConversationHistory(conversationId, 5);
            }

            if (!historial || historial.length === 0) {
                await context.sendActivity('📝 **No hay historial**\n\nAún no hay mensajes en esta conversación.');
                return;
            }

            const lines = historial.map(m => {
                const who = m.type === 'user' ? '👤' : '🤖';
                const text = (m.message || '').slice(0, 200);
                return `${who} ${text}`;
            });

            await context.sendActivity(`🗂️ **Últimos 5 mensajes**\n\n${lines.join('\n')}`);
            
        } catch (error) {
            console.error('Error mostrando historial de conversación:', error);
            await context.sendActivity('❌ Error obteniendo el historial de la conversación.');
        }
    }

    async handleMembersAdded(context, next) {
        for (const member of context.activity.membersAdded) {
            if (member.id !== context.activity.recipient.id) {
                const userId = context.activity.from.id;
                
                console.log(`👋 [${userId}] Nuevo miembro agregado`);
                
                // ✅ REGLA: Verificar autenticación antes de cualquier conversación
                const isAuthenticated = await this.isUserAuthenticated(userId, context);
                
                if (isAuthenticated) {
                    await this.sendWelcomeBackMessage(context, userId);
                    // ✅ NUEVO: Inicializar conversación en Cosmos DB para usuario autenticado
                    await this.initializeConversation(context, userId);
                } else {
                    await this.sendAuthRequiredMessage(context, userId);
                }
            }
        }
        await next();
    }

    /**
     * ✅ NUEVO: Mensaje claro indicando que se requiere autenticación
     */
    async sendAuthRequiredMessage(context, userId) {
        if (this.welcomeMessageSent.has(userId)) return;
        
        try {
            await context.sendActivity(
                `🔒 **Autenticación Requerida**\n\n` +
                `Para usar Nova Bot y acceder a las funciones de inteligencia artificial, ` +
                `primero debes autenticarte con tus credenciales corporativas.\n\n` +
                `${cosmosService.isAvailable() ? 
                    '💾 **Una vez autenticado**: Tus conversaciones se guardarán de forma persistente.' : 
                    '⚠️ **Nota**: Las conversaciones solo se mantendrán en memoria temporal.'}\n\n` +
                `🔐 **Ingresa tus credenciales para comenzar...**`
            );
            
            await new Promise(resolve => setTimeout(resolve, 1000));
            await this.showLoginCard(context, 'authRequired');
            
            this.welcomeMessageSent.add(userId);
            setTimeout(() => this.welcomeMessageSent.delete(userId), 120000);
            
        } catch (error) {
            console.error('Error enviando mensaje de autenticación requerida:', error);
            await context.sendActivity(
                '🔒 **Autenticación requerida**\n\n' +
                'Para usar el bot, escribe: `login usuario:contraseña`'
            );
        }
    }

    /**
     * ✅ MEJORADO: Mensaje de bienvenida para usuarios autenticados
     */
    async sendWelcomeBackMessage(context, userId) {
        if (this.welcomeMessageSent.has(userId)) return;
        
        try {
            const userInfo = await this.getUserInfo(userId);
            
            await context.sendActivity(
                `👋 **¡Hola de nuevo, ${userInfo.nombre}!**\n\n` +
                `✅ Ya estás autenticado como: **${userInfo.usuario}**\n` +
                `${cosmosService.isAvailable() ? 
                    '💾 **Persistencia activa**: Tus conversaciones se guardan en Cosmos DB' : 
                    '⚠️ **Solo memoria**: Las conversaciones no se guardan permanentemente'}\n\n` +
                `🤖 **Funciones disponibles**:\n` +
                `• Chat inteligente con IA\n` +
                `• Consulta de tasas de interés Nova\n` +
                `• Información de tu perfil\n` +
                `• Historial de conversaciones\n\n` +
                `💬 ¿En qué puedo ayudarte hoy?`
            );
            
            this.welcomeMessageSent.add(userId);
            setTimeout(() => this.welcomeMessageSent.delete(userId), 60000);
            
        } catch (error) {
            console.error('Error enviando mensaje de bienvenida:', error);
            await this.sendAuthRequiredMessage(context, userId);
        }
    }

    /**
     * ✅ NUEVO: Inicializar conversación en Cosmos DB
     */
    async initializeConversation(context, userId) {
        try {
            if (!cosmosService.isAvailable()) {
                console.log(`ℹ️ [${userId}] Cosmos DB no disponible - conversación solo en memoria`);
                return;
            }

            const conversationId = context.activity.conversation.id;
            const userInfo = await this.getUserInfo(userId);
            
            console.log(`💾 [${userId}] Inicializando conversación en Cosmos DB: ${conversationId}`);
            
            await cosmosService.saveConversationInfo(
                conversationId,
                userInfo?.usuario, // ✅ usar usuario corporativo como partition key
                userInfo?.nombre || 'Usuario',
                {
                    userInfo: userInfo,
                    channelId: context.activity.channelId,
                    serviceUrl: context.activity.serviceUrl
                }
            );
            
            console.log(`✅ [${userId}] Conversación inicializada en Cosmos DB`);
            
        } catch (error) {
            console.error(`❌ Error inicializando conversación en Cosmos DB:`, error);
        }
    }

    async handleMessageWithAuth(context, next) {
        const userId = context.activity.from.id;
        const text = (context.activity.text || '').trim();

        console.log(`[${userId}] Mensaje recibido: "${text}"`);

        try {
            // 🧪 COMANDOS DE DIAGNÓSTICO (mantener para desarrollo)
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

            // ✅ REGLA PRINCIPAL: Sin token = Sin conversación
            const isAuthenticated = await this.isUserAuthenticated(userId, context);
            
            if (!isAuthenticated) {
                console.log(`🔒 [${userId}] ACCESO DENEGADO - Usuario no autenticado`);
                
                await context.sendActivity(
                    `🔒 **Acceso Denegado**\n\n` +
                    `❌ **Sin autenticación, no hay conversación**\n\n` +
                    `Para acceder a las funciones del bot, incluida la conversación con IA, ` +
                    `**debes autenticarte primero** con tus credenciales corporativas.\n\n` +
                    `${cosmosService.isAvailable() ? 
                        '💾 **Beneficio**: Una vez autenticado, tus conversaciones se guardarán permanentemente.' : 
                        '⚠️ **Nota**: Las conversaciones se mantendrán solo durante la sesión.'}\n\n` +
                    `🔐 **¿Listo para autenticarte?**`
                );
                
                await this.showLoginCard(context, 'accessDenied');
                return await next();
            }

            // ✅ USUARIO AUTENTICADO: Procesar mensaje con conversación completa
            console.log(`✅ [${userId}] Usuario autenticado - procesando mensaje`);

            // ✅ NUEVO: Asegurar que la conversación esté inicializada en Cosmos DB
            const conversationId = context.activity.conversation.id;
            const userInfo = await this.getUserInfo(userId);
            const pk = userInfo.usuario; // ✅ partition key consistente
            
            if (cosmosService.isAvailable()) {
                const conversationExists = await cosmosService.getConversationInfo(conversationId, pk);
                if (!conversationExists) {
                    console.log(`📝 [${userId}] Inicializando conversación perdida en Cosmos DB`);
                    await this.initializeConversation(context, userId);
                }
            }

            // ✅ COMANDOS PARA USUARIOS AUTENTICADOS
            if (text.toLowerCase() === 'mi info' || text.toLowerCase() === 'info' || text.toLowerCase() === 'perfil') {
                await this.showUserInfo(context, userId);
                return await next();
            }

            if (text.toLowerCase() === 'ayuda' || text.toLowerCase() === 'help') {
                await this.showHelp(context, userId);
                return await next();
            }

            // Comandos de historial y resumen
            const lowerText = text.toLowerCase();
            if (lowerText.includes('historial') && !lowerText.includes('resumen')) {
                await this.showConversationHistory(context, userId, conversationId);
                return await next();
            }
            if (lowerText.includes('resumen')) {
                await this.showConversationSummary(context, userId, conversationId);
                return await next();
            }

            // 💬 PROCESAR MENSAJE CON IA (solo para usuarios autenticados)
            await this.processAuthenticatedMessage(context, text, userId, conversationId);

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
     * ✅ NUEVO: Mostrar resumen de conversación
     */
    async showConversationSummary(context, userId, conversationId) {
        try {
            const userInfo = await this.getUserInfo(userId);
            
            if (!cosmosService.isAvailable()) {
                await context.sendActivity(
                    `📋 **Resumen de Conversación**\n\n` +
                    `👤 **Usuario**: ${userInfo.nombre} (${userInfo.usuario})\n` +
                    `💾 **Estado**: Solo memoria temporal - No hay historial persistente\n\n` +
                    `⚠️ Para tener historial persistente, configura Cosmos DB en el sistema.`
                );
                return;
            }

            console.log(`📊 [${userId}] Generando resumen de conversación...`);
            
            // Usar OpenAI para generar resumen inteligente
            const response = await this.openaiService.procesarMensaje(
                'Genera un resumen de mi conversación actual',
                [],
                userInfo.token,
                userInfo,
                conversationId
            );

            await this.sendResponse(context, response);
            
        } catch (error) {
            console.error(`Error mostrando resumen:`, error);
            await context.sendActivity('❌ Error generando resumen de conversación.');
        }
    }

    /**
     * ✅ MEJORADO: Mostrar información del usuario con estadísticas de Cosmos DB
     */
    async showUserInfo(context, userId) {
        try {
            const userInfo = await this.getUserInfo(userId);
            
            if (!userInfo) {
                await context.sendActivity('❌ No se pudo obtener tu información.');
                return;
            }

            let infoMessage = `👤 **Tu Información Corporativa**\n\n` +
                             `📝 **Nombre**: ${userInfo.nombre}\n` +
                             `👤 **Usuario**: ${userInfo.usuario}\n` +
                             `🏢 **Apellido Paterno**: ${userInfo.paterno || 'N/A'}\n` +
                             `🏢 **Apellido Materno**: ${userInfo.materno || 'N/A'}\n` +
                             `🔑 **Token**: ${userInfo.token.substring(0, 30)}...\n` +
                             `📅 **Última autenticación**: Hace unos momentos\n\n`;

            // ✅ NUEVO: Información de Cosmos DB si está disponible
            if (cosmosService.isAvailable()) {
                try {
                    const conversationId = context.activity.conversation.id;
                    const pk = userInfo.usuario; // ✅ partition key consistente
                    const conversationInfo = await cosmosService.getConversationInfo(conversationId, pk);
                    const historial = await cosmosService.getConversationHistory(conversationId, pk, 100);
                    
                    infoMessage += `💾 **Persistencia**: ✅ Cosmos DB activa\n`;
                    infoMessage += `📊 **Mensajes guardados**: ${historial.length}\n`;
                    infoMessage += `📅 **Conversación iniciada**: ${conversationInfo?.createdAt ? new Date(conversationInfo.createdAt).toLocaleString('es-MX') : 'Desconocida'}\n`;
                    infoMessage += `🕐 **Última actividad**: ${conversationInfo?.lastActivity ? new Date(conversationInfo.lastActivity).toLocaleString('es-MX') : 'Ahora'}\n\n`;
                } catch (cosmosError) {
                    console.warn('⚠️ Error obteniendo info de Cosmos DB:', cosmosError.message);
                    infoMessage += `💾 **Persistencia**: ⚠️ Cosmos DB con problemas\n\n`;
                }
            } else {
                infoMessage += `💾 **Persistencia**: ⚠️ Solo memoria temporal\n\n`;
            }

            infoMessage += `💬 **¿Necesitas algo más?** Solo pregúntame.`;

            await context.sendActivity(infoMessage);

        } catch (error) {
            console.error(`Error mostrando info del usuario:`, error);
            await context.sendActivity('❌ Error obteniendo tu información.');
        }
    }

    /**
     * ✅ MEJORADO: Ayuda con información específica de Cosmos DB
     */
    async showHelp(context, userId) {
        try {
            const userInfo = await this.getUserInfo(userId);
            
            await context.sendActivity(
                `📚 **Ayuda - Nova Bot**\n\n` +
                `👋 Hola **${userInfo.nombre}**, aquí tienes todo lo que puedo hacer:\n\n` +
                
                `🤖 **Chat Inteligente:**\n` +
                `• Conversación natural con IA GPT-4\n` +
                `• Respuestas contextuales y memoria de conversación\n` +
                `• ${cosmosService.isAvailable() ? 'Historial persistente en Cosmos DB' : 'Historial temporal en memoria'}\n\n` +
                
                `💰 **Consultas Financieras:**\n` +
                `• \`tasas 2025\` - Ver tasas de interés por año\n` +
                `• \`consultar tasas\` - Información de productos financieros\n` +
                `• Análisis financiero personalizado\n\n` +
                
                `👤 **Comandos de Usuario:**\n` +
                `• \`mi info\` - Ver tu información completa\n` +
                `• \`historial\` - Resumen de tu conversación\n` +
                `• \`logout\` - Cerrar sesión\n` +
                `• \`ayuda\` - Mostrar esta ayuda\n\n` +
                
                `🔒 **Seguridad y Persistencia:**\n` +
                `• Tu sesión es segura con token corporativo\n` +
                `• ${cosmosService.isAvailable() ? 
                    'Conversaciones guardadas permanentemente en Cosmos DB' : 
                    'Conversaciones temporales (se pierden al reiniciar)'}\n` +
                `• Acceso controlado por autenticación\n\n` +
                
                `💡 **Ejemplos de uso:**\n` +
                `• "Muestra las tasas de 2025"\n` +
                `• "¿Cuál es la mejor opción de inversión?"\n` +
                `• "Analiza mi historial de conversación"\n` +
                `• "Explícame sobre depósitos a plazo fijo"`
            );

        } catch (error) {
            console.error(`Error mostrando ayuda:`, error);
            await context.sendActivity('❌ Error mostrando ayuda.');
        }
    }

    /**
     * ✅ MEJORADO: Logout con limpieza de Cosmos DB
     */
    async handleLogout(context, userId) {
        try {
            console.log(`🚪 [${userId}] Iniciando logout con limpieza completa...`);
            
            const userInfo = await this.getUserInfo(userId);
            const userName = userInfo ? userInfo.nombre : 'Usuario';
            
            // ✅ NUEVO: Limpiar datos de Cosmos DB si está disponible
            if (cosmosService.isAvailable()) {
                try {
                    const conversationId = context.activity.conversation.id;
                    console.log(`🗑️ [${userId}] Limpiando datos de Cosmos DB...`);
                    
                    // Opción 1: Eliminar conversación completa (descomenta si quieres eliminar todo)
                    // await cosmosService.deleteConversation(conversationId, userId);
                    
                    // Opción 2: Solo limpiar mensajes antiguos manteniendo info básica
                    await cosmosService.cleanOldMessages(conversationId, userId, 0); // 0 = eliminar todo
                    
                    console.log(`✅ [${userId}] Datos de Cosmos DB limpiados`);
                } catch (cosmosError) {
                    console.warn(`⚠️ [${userId}] Error limpiando Cosmos DB:`, cosmosError.message);
                }
            }
            
            // Limpiar datos en memoria
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
                `✅ Tu sesión ha sido cerrada correctamente.\n` +
                `${cosmosService.isAvailable() ? 
                    '🗑️ Datos de conversación limpiados de Cosmos DB\n' : 
                    '💾 Datos temporales eliminados\n'}\n` +
                `🔒 Para volver a usar el bot, necesitarás autenticarte nuevamente.`
            );
            
            await new Promise(resolve => setTimeout(resolve, 2000));
            
            await context.sendActivity('🔐 **¿Quieres iniciar sesión nuevamente?**');
            await this.showLoginCard(context, 'postLogout');
            
        } catch (error) {
            console.error(`Error en logout:`, error);
            await context.sendActivity('❌ Error cerrando sesión, pero tu sesión ha sido terminada.');
        }
    }

    /**
     * ✅ MEJORADO: Procesamiento con Cosmos DB
     */
    async processAuthenticatedMessage(context, text, userId, conversationId) {
        try {
            const userInfo = this.authenticatedUsers.get(userId);
            
            // Mostrar indicador de escritura
            await context.sendActivity({ type: 'typing' });

            console.log(`💬 [${userInfo.usuario}] Procesando mensaje autenticado: "${text}"`);

            // ✅ NUEVO: Usar Cosmos DB para historial si está disponible
            const response = await this.openaiService.procesarMensaje(
                text, 
                [], // El historial lo maneja OpenAI Service internamente desde Cosmos DB
                userInfo.token, 
                userInfo,
                conversationId // ✅ Pasar conversationId para persistencia
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
    // (showLoginCard, handleLoginSubmit, authenticateWithNova, etc.)

    /**
     * ✅ MEJORADO: Estadísticas con información de Cosmos DB
     */
    getStats() {
        return {
            authenticatedUsers: this.authenticatedUsers.size,
            loginCardsPending: this.loginCardSentUsers.size,
            welcomeMessagesSent: this.welcomeMessageSent.size,
            openaiAvailable: this.openaiService?.openaiAvailable || false,
            cosmosDBAvailable: cosmosService.isAvailable(),
            persistenceType: cosmosService.isAvailable() ? 'CosmosDB' : 'Memory',
            timestamp: new Date().toISOString()
        };
    }

    /**
     * ✅ NUEVO: Cleanup para desarrollo
     */
    cleanup() {
        console.log('🧹 Limpiando TeamsBot...');
        this.authenticatedUsers.clear();
        this.loginCardSentUsers.clear();
        this.welcomeMessageSent.clear();
        console.log('✅ TeamsBot limpiado');
    }

    // ===== MANTENER TODOS LOS MÉTODOS EXISTENTES =====
    // (Los métodos existentes como showLoginCard, handleLoginSubmit, etc. se mantienen igual)

    async showLoginCard(context, caller = 'unknown') {
        const userId = context.activity.from.id;
        
        try {
            console.log(`\n🔐 [${userId}] ===== INICIO showLoginCard =====`);
            console.log(`📞 [${userId}] Llamado desde: ${caller}`);
            console.log(`🔍 [${userId}] Usuario ya tiene tarjeta pendiente: ${this.loginCardSentUsers.has(userId)}`);

            if (this.loginCardSentUsers.has(userId)) {
                console.log(`⚠️ [${userId}] Tarjeta ya enviada recientemente, saltando...`);
                return;
            }

            console.log('🔐 Intentando mostrar tarjeta de login...');

            const loginCard = this.createMinimalLoginCard();
            
            console.log('🔐 Enviando tarjeta...');
            
            await context.sendActivity({ 
                attachments: [loginCard]
            });

            this.loginCardSentUsers.add(userId);
            
            setTimeout(() => {
                this.loginCardSentUsers.delete(userId);
                console.log(`🧹 [${userId}] Protección anti-duplicados limpiada`);
            }, 30000);

            console.log(`✅ [${userId}] Tarjeta enviada exitosamente`);
            console.log(`🏁 [${userId}] ===== FIN showLoginCard =====\n`);

        } catch (error) {
            console.error(`❌ [${userId}] Error enviando tarjeta de login:`, error);
            
            this.loginCardSentUsers.delete(userId);
            
            await context.sendActivity(
                '🔐 **Bienvenido a Nova Bot**\n\n' +
                '❌ **Error con la tarjeta**\n\n' +
                '🔄 **Usa el método alternativo:**\n' +
                'Escribe: `login usuario:contraseña`\n\n' +
                'Ejemplo: `login 91004:mipassword`'
            );
        }
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

    async handleTextLogin(context, text) {
        const userId = context.activity.from.id;
        
        try {
            console.log(`[${userId}] Login con texto: ${text}`);

            const loginPart = text.substring(6).trim();
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

            await context.sendActivity({ type: 'typing' });
            const loginResponse = await this.authenticateWithNova(username.trim(), password.trim());

            if (loginResponse.success) {
                this.loginCardSentUsers.delete(userId);
                
                await this.setUserAuthenticated(userId, loginResponse.userInfo, context);
                
                // ✅ NUEVO: Inicializar conversación en Cosmos DB tras login exitoso
                await this.initializeConversation(context, userId);
                
                await context.sendActivity(
                    `✅ **¡Login exitoso!**\n\n` +
                    `👋 Bienvenido, **${loginResponse.userInfo.nombre}**\n` +
                    `👤 Usuario: ${loginResponse.userInfo.usuario}\n` +
                    `🔑 Token: ${loginResponse.userInfo.token.substring(0, 20)}...\n` +
                    `${cosmosService.isAvailable() ? 
                        '💾 **Persistencia activada**: Conversaciones guardadas en Cosmos DB\n' : 
                        '⚠️ **Solo memoria**: Conversaciones temporales\n'}\n` +
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
                
                this.loginCardSentUsers.delete(userId);
                
                const authResult = await this.setUserAuthenticated(userId, loginResponse.userInfo, context);
                console.log(`🔐 [${userId}] Autenticación establecida: ${authResult}`);
                
                // ✅ NUEVO: Inicializar conversación en Cosmos DB
                await this.initializeConversation(context, userId);
                
                await context.sendActivity(
                    `✅ **¡Login exitoso desde tarjeta!**\n\n` +
                    `👋 Bienvenido, **${loginResponse.userInfo.nombre}**\n` +
                    `👤 Usuario: ${loginResponse.userInfo.usuario}\n` +
                    `🔑 Token: ${loginResponse.userInfo.token.substring(0, 20)}...\n` +
                    `${cosmosService.isAvailable() ? 
                        '💾 **Persistencia activada**: Conversaciones guardadas en Cosmos DB\n' : 
                        '⚠️ **Solo memoria**: Conversaciones temporales\n'}\n` +
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
            const url = process.env.NOVA_API_URL || 'https://pruebas.nova.com.mx/ApiRestNova/api/Auth/login';
            const response = await axios.post(
               url,
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

    // ===== MÉTODOS AUXILIARES EXISTENTES =====
    
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

    // ===== MÉTODOS DE DIAGNÓSTICO (mantener para desarrollo) =====
    
    async debugNovaAPI(context, text) {
        try {
            const debugPart = text.substring(10).trim();
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
                    `🎯 **La API funciona correctamente.**`
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

            await context.sendActivity('🧪 **Test 1**: Tarjeta ultra-simple');
            const simpleCard = this.createSimpleTestCard();
            await context.sendActivity({ attachments: [simpleCard] });

            await new Promise(resolve => setTimeout(resolve, 1000));

            await context.sendActivity('🧪 **Test 2**: Tarjeta con input');
            const inputCard = this.createInputTestCard();
            await context.sendActivity({ attachments: [inputCard] });

            await new Promise(resolve => setTimeout(resolve, 1000));

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
}

module.exports.TeamsBot = TeamsBot;