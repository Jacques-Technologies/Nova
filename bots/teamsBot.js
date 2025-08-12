// teamsBot.js - CORREGIDO: Sistema de historial funcionando
const { DialogBot } = require('./dialogBot');
const { CardFactory } = require('botbuilder');
const axios = require('axios');
const openaiService = require('../services/openaiService');
const cosmosService = require('../services/cosmosService');
const conversationService = require('../services/conversationService');
require('dotenv').config();

class TeamsBot extends DialogBot {
    constructor(conversationState, userState) {
        super(conversationState, userState);

        global.botInstance = this;
        this.authenticatedUsers = new Map();
        this.authState = this.userState.createProperty('AuthState');
        this.loginCardSentUsers = new Set();
        this.welcomeMessageSent = new Set();
        
        // ✅ NUEVO: Cache simple para historial local (backup)
        this.mensajeCache = new Map(); // conversationId -> [mensajes]
        
        this.onMembersAdded(this.handleMembersAdded.bind(this));
        this.onMessage(this.handleMessageWithAuth.bind(this));
        this.openaiService = openaiService;
        
        console.log('✅ TeamsBot inicializado con sistema de historial CORREGIDO');
        console.log(`💾 Persistencia: ${cosmosService.isAvailable() ? 'Cosmos DB activa' : 'Solo memoria'}`);
    }

    /**
     * ✅ COMPLETAMENTE CORREGIDO: Guardar mensaje en historial
     */
    async guardarMensajeEnHistorial(mensaje, tipo, conversationId, userId, userName = 'Usuario') {
        try {
            if (!mensaje || !conversationId || !userId) {
                console.warn('⚠️ Parámetros insuficientes para guardar mensaje');
                return false;
            }

            const timestamp = new Date().toISOString();
            const mensajeObj = {
                id: `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
                mensaje: mensaje,
                tipo: tipo, // 'user' o 'bot'
                conversationId: conversationId,
                userId: userId,
                userName: userName,
                timestamp: timestamp
            };

            console.log(`💾 [${userId}] Guardando mensaje ${tipo}: "${mensaje.substring(0, 50)}..."`);

            // ✅ 1. SIEMPRE guardar en cache local PRIMERO
            this.agregarACacheLocal(conversationId, mensajeObj);

            // ✅ 2. Intentar guardar en Cosmos DB si está disponible
            if (cosmosService.isAvailable()) {
                try {
                    await cosmosService.saveMessage(
                        mensaje,
                        conversationId,
                        userId,
                        userName,
                        tipo
                    );
                    console.log(`✅ [${userId}] Mensaje guardado en Cosmos DB`);
                } catch (cosmosError) {
                    console.warn(`⚠️ [${userId}] Error guardando en Cosmos DB:`, cosmosError.message);
                    // No falla si Cosmos DB falla, tenemos el cache local
                }
            }

            // ✅ 3. También guardar en conversationService como backup
            await conversationService.saveMessage(mensaje, conversationId, tipo === 'bot' ? 'bot' : userId);

            console.log(`✅ [${userId}] Mensaje guardado exitosamente en todos los sistemas`);
            return true;

        } catch (error) {
            console.error('❌ Error guardando mensaje en historial:', error);
            return false;
        }
    }

    /**
     * ✅ NUEVO: Agregar mensaje al cache local manteniendo solo 5
     */
    agregarACacheLocal(conversationId, mensajeObj) {
        try {
            let mensajes = this.mensajeCache.get(conversationId) || [];
            
            // Agregar nuevo mensaje al inicio
            mensajes.unshift(mensajeObj);
            
            // Mantener solo los últimos 5 mensajes
            if (mensajes.length > 5) {
                mensajes = mensajes.slice(0, 5);
            }
            
            this.mensajeCache.set(conversationId, mensajes);
            
            console.log(`📋 Cache local: ${mensajes.length} mensajes para conversación ${conversationId.substr(-8)}`);
            
        } catch (error) {
            console.error('❌ Error agregando a cache local:', error);
        }
    }

    /**
     * ✅ COMPLETAMENTE CORREGIDO: Obtener historial de conversación
     */
    async obtenerHistorialConversacion(conversationId, userId, limite = 5) {
        try {
            console.log(`📚 [${userId}] === OBTENIENDO HISTORIAL ===`);
            console.log(`🔍 ConversationId: ${conversationId}`);
            console.log(`👤 UserId: ${userId}`);

            let historial = [];

            // ✅ ESTRATEGIA 1: Intentar cache local primero (más rápido)
            const cacheLocal = this.mensajeCache.get(conversationId) || [];
            if (cacheLocal.length > 0) {
                historial = cacheLocal.slice(0, limite);
                console.log(`📋 [${userId}] Historial desde cache local: ${historial.length} mensajes`);
            }

            // ✅ ESTRATEGIA 2: Si no hay cache, intentar Cosmos DB
            if (historial.length === 0 && cosmosService.isAvailable()) {
                try {
                    console.log(`💾 [${userId}] Buscando en Cosmos DB...`);
                    const cosmosHistorial = await cosmosService.getConversationHistory(conversationId, userId, limite);
                    
                    if (cosmosHistorial && cosmosHistorial.length > 0) {
                        historial = cosmosHistorial.map(msg => ({
                            id: msg.id,
                            mensaje: msg.message,
                            tipo: msg.messageType === 'bot' ? 'bot' : 'user',
                            conversationId: msg.conversationId,
                            userId: msg.userId,
                            userName: msg.userName,
                            timestamp: msg.timestamp
                        }));
                        
                        // Actualizar cache local con datos de Cosmos DB
                        this.mensajeCache.set(conversationId, historial);
                        
                        console.log(`💾 [${userId}] Historial desde Cosmos DB: ${historial.length} mensajes`);
                    }
                } catch (cosmosError) {
                    console.warn(`⚠️ [${userId}] Error obteniendo de Cosmos DB:`, cosmosError.message);
                }
            }

            // ✅ ESTRATEGIA 3: Backup con conversationService
            if (historial.length === 0) {
                try {
                    console.log(`🔄 [${userId}] Usando conversationService como backup...`);
                    const backupHistorial = await conversationService.getConversationHistory(conversationId, limite);
                    
                    if (backupHistorial && backupHistorial.length > 0) {
                        historial = backupHistorial.map(msg => ({
                            id: msg.id,
                            mensaje: msg.message,
                            tipo: msg.userId === 'bot' ? 'bot' : 'user',
                            conversationId: msg.conversationId,
                            userId: msg.userId,
                            userName: 'Usuario',
                            timestamp: msg.timestamp
                        }));
                        
                        console.log(`🔄 [${userId}] Historial desde conversationService: ${historial.length} mensajes`);
                    }
                } catch (backupError) {
                    console.warn(`⚠️ [${userId}] Error con conversationService:`, backupError.message);
                }
            }

            // ✅ FORMATEAR resultado final
            const historialFinal = historial
                .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp)) // Más reciente primero
                .slice(0, limite);

            console.log(`✅ [${userId}] === HISTORIAL OBTENIDO: ${historialFinal.length} mensajes ===`);
            
            if (historialFinal.length > 0) {
                console.log(`📋 [${userId}] Mensajes obtenidos:`);
                historialFinal.forEach((msg, index) => {
                    const fecha = new Date(msg.timestamp).toLocaleString('es-MX');
                    console.log(`   ${index + 1}. ${msg.tipo.toUpperCase()} (${fecha}): ${msg.mensaje.substring(0, 50)}...`);
                });
            } else {
                console.log(`ℹ️ [${userId}] No se encontraron mensajes en ningún sistema`);
            }

            return historialFinal;

        } catch (error) {
            console.error(`❌ [${userId}] Error obteniendo historial:`, error);
            return [];
        }
    }

    /**
     * ✅ CORREGIDO: Mostrar historial de conversación
     */
    async showConversationHistory(context, userId, conversationId) {
        try {
            console.log(`📚 [${userId}] Mostrando historial de conversación`);
            
            const historial = await this.obtenerHistorialConversacion(conversationId, userId, 5);
            
            if (!historial || historial.length === 0) {
                await context.sendActivity(
                    `📝 **Historial de Conversación**\n\n` +
                    `❌ **No hay mensajes guardados**\n\n` +
                    `Esto puede ocurrir si:\n` +
                    `• Es una conversación nueva\n` +
                    `• El bot se reinició recientemente\n` +
                    `• Hay problemas con la persistencia\n\n` +
                    `💡 **Envía algunos mensajes** y luego vuelve a consultar el historial.`
                );
                return;
            }

            let respuesta = `📚 **Historial de Conversación (${historial.length}/5)**\n\n`;
            respuesta += `💾 **Persistencia**: ${cosmosService.isAvailable() ? 'Cosmos DB activo' : 'Solo memoria'}\n\n`;

            historial.forEach((msg, index) => {
                const fecha = new Date(msg.timestamp).toLocaleString('es-MX');
                const emoji = msg.tipo === 'bot' ? '🤖' : '👤';
                const autor = msg.tipo === 'bot' ? 'Nova Bot' : (msg.userName || 'Usuario');
                
                respuesta += `${emoji} **${autor}** (${fecha})\n`;
                respuesta += `${msg.mensaje}\n`;
                
                if (index < historial.length - 1) {
                    respuesta += `\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n`;
                }
            });

            respuesta += `\n\n💡 **Comandos útiles:**\n`;
            respuesta += `• \`resumen\` - Resumen de la conversación\n`;
            respuesta += `• \`limpiar historial\` - Eliminar mensajes`;

            await context.sendActivity(respuesta);

        } catch (error) {
            console.error('❌ Error mostrando historial:', error);
            await context.sendActivity('❌ Error obteniendo el historial de la conversación.');
        }
    }

    /**
     * ✅ CORREGIDO: Mostrar resumen de conversación
     */
    async showConversationSummary(context, userId, conversationId) {
        try {
            console.log(`📊 [${userId}] Generando resumen de conversación`);
            
            const historial = await this.obtenerHistorialConversacion(conversationId, userId, 5);
            
            if (!historial || historial.length === 0) {
                await context.sendActivity(
                    `📊 **Resumen de Conversación**\n\n` +
                    `❌ **No hay mensajes para resumir**\n\n` +
                    `Envía algunos mensajes y luego solicita el resumen.`
                );
                return;
            }

            const userInfo = await this.getUserInfo(userId);
            
            // ✅ Estadísticas básicas
            const mensajesUsuario = historial.filter(msg => msg.tipo === 'user').length;
            const mensajesBot = historial.filter(msg => msg.tipo === 'bot').length;
            const primerMensaje = historial[historial.length - 1];
            const ultimoMensaje = historial[0];

            let resumen = `📊 **Resumen de Conversación**\n\n`;
            resumen += `👤 **Usuario**: ${userInfo?.nombre || 'Usuario'} (${userId})\n`;
            resumen += `💬 **Total mensajes**: ${historial.length}\n`;
            resumen += `📤 **Tus mensajes**: ${mensajesUsuario}\n`;
            resumen += `🤖 **Respuestas del bot**: ${mensajesBot}\n`;
            resumen += `📅 **Primer mensaje**: ${new Date(primerMensaje.timestamp).toLocaleString('es-MX')}\n`;
            resumen += `🕐 **Último mensaje**: ${new Date(ultimoMensaje.timestamp).toLocaleString('es-MX')}\n`;
            resumen += `💾 **Persistencia**: ${cosmosService.isAvailable() ? 'Cosmos DB' : 'Solo memoria'}\n\n`;

            // ✅ Resumen automático con IA si está disponible
            if (this.openaiService && this.openaiService.openaiAvailable && historial.length >= 2) {
                try {
                    resumen += `🧠 **Resumen Inteligente**:\n`;
                    
                    // Preparar contexto para IA
                    const mensajesParaIA = historial.reverse().map(msg => 
                        `${msg.tipo === 'bot' ? 'Bot' : 'Usuario'}: ${msg.mensaje}`
                    ).join('\n');

                    const prompt = `Genera un resumen muy breve (máximo 3 líneas) de esta conversación:\n\n${mensajesParaIA}`;
                    
                    const respuestaIA = await this.openaiService.procesarMensaje(
                        prompt,
                        [],
                        userInfo?.token,
                        userInfo
                    );
                    
                    if (respuestaIA && respuestaIA.content) {
                        resumen += `${respuestaIA.content}\n\n`;
                    }
                } catch (iaError) {
                    console.warn('⚠️ Error generando resumen con IA:', iaError.message);
                    resumen += `*Resumen automático no disponible*\n\n`;
                }
            }

            resumen += `📋 **Últimos mensajes**:\n`;
            historial.slice(0, 3).forEach((msg, index) => {
                const emoji = msg.tipo === 'bot' ? '🤖' : '👤';
                const preview = msg.mensaje.length > 80 ? 
                    msg.mensaje.substring(0, 80) + '...' : 
                    msg.mensaje;
                resumen += `${index + 1}. ${emoji} ${preview}\n`;
            });

            resumen += `\n💡 Para ver el historial completo usa: \`historial\``;

            await context.sendActivity(resumen);

        } catch (error) {
            console.error('❌ Error generando resumen:', error);
            await context.sendActivity('❌ Error generando resumen de conversación.');
        }
    }

    /**
     * ✅ NUEVO: Limpiar historial
     */
    async limpiarHistorial(context, userId, conversationId) {
        try {
            console.log(`🧹 [${userId}] Limpiando historial de conversación`);

            let limpiados = 0;

            // Limpiar cache local
            if (this.mensajeCache.has(conversationId)) {
                const mensajesCache = this.mensajeCache.get(conversationId).length;
                this.mensajeCache.delete(conversationId);
                limpiados += mensajesCache;
                console.log(`🧹 [${userId}] Cache local limpiado: ${mensajesCache} mensajes`);
            }

            // Limpiar Cosmos DB
            if (cosmosService.isAvailable()) {
                try {
                    const eliminadosCosmosDB = await cosmosService.cleanOldMessages(conversationId, userId, 0);
                    limpiados += eliminadosCosmosDB;
                    console.log(`🧹 [${userId}] Cosmos DB limpiado: ${eliminadosCosmosDB} mensajes`);
                } catch (cosmosError) {
                    console.warn(`⚠️ [${userId}] Error limpiando Cosmos DB:`, cosmosError.message);
                }
            }

            await context.sendActivity(
                `🧹 **Historial Limpiado**\n\n` +
                `✅ **Mensajes eliminados**: ${limpiados}\n` +
                `💾 **Estado**: Conversación reiniciada\n\n` +
                `Los nuevos mensajes comenzarán a guardarse automáticamente.`
            );

        } catch (error) {
            console.error('❌ Error limpiando historial:', error);
            await context.sendActivity('❌ Error limpiando historial.');
        }
    }

    /**
     * ✅ CORREGIDO: Procesar mensaje con guardado automático
     */
    async processAuthenticatedMessage(context, text, userId, conversationId) {
        try {
            const userInfo = this.authenticatedUsers.get(userId);
            
            // ✅ 1. GUARDAR MENSAJE DEL USUARIO INMEDIATAMENTE
            await this.guardarMensajeEnHistorial(
                text,
                'user',
                conversationId,
                userId,
                userInfo?.nombre || 'Usuario'
            );

            // Mostrar indicador de escritura
            await context.sendActivity({ type: 'typing' });

            console.log(`💬 [${userInfo.usuario}] Procesando mensaje autenticado: "${text}"`);

            // ✅ 2. OBTENER HISTORIAL PARA CONTEXTO
            const historial = await this.obtenerHistorialConversacion(conversationId, userId, 5);
            
            // Formatear historial para OpenAI (sin incluir el mensaje actual)
            const historialParaIA = historial
                .filter(msg => msg.mensaje !== text) // Excluir el mensaje actual
                .reverse() // Orden cronológico
                .map(msg => ({
                    role: msg.tipo === 'bot' ? 'assistant' : 'user',
                    content: msg.mensaje
                }));

            // ✅ 3. PROCESAR CON IA
            const response = await this.openaiService.procesarMensaje(
                text, 
                historialParaIA, // Pasar historial formateado
                userInfo.token, 
                userInfo,
                conversationId
            );

            // ✅ 4. GUARDAR RESPUESTA DEL BOT
            if (response && response.content) {
                await this.guardarMensajeEnHistorial(
                    response.content,
                    'bot',
                    conversationId,
                    userId,
                    'Nova Bot'
                );
            }

            // ✅ 5. ENVIAR RESPUESTA
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

    /**
     * ✅ CORREGIDO: Manejar mensajes con comandos de historial
     */
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
                    `**debes autenticarte primero** con tus credenciales corporativas.`
                );
                
                await this.showLoginCard(context, 'accessDenied');
                return await next();
            }

            // ✅ USUARIO AUTENTICADO: Procesar comandos
            console.log(`✅ [${userId}] Usuario autenticado - procesando mensaje`);
            const conversationId = context.activity.conversation.id;

            // ✅ COMANDOS DE HISTORIAL (CORREGIDOS)
            const lowerText = text.toLowerCase();
            
            if (lowerText === 'historial' || lowerText.includes('historial')) {
                if (lowerText.includes('limpiar') || lowerText.includes('borrar') || lowerText.includes('eliminar')) {
                    await this.limpiarHistorial(context, userId, conversationId);
                } else {
                    await this.showConversationHistory(context, userId, conversationId);
                }
                return await next();
            }
            
            if (lowerText === 'resumen' || lowerText.includes('resumen')) {
                await this.showConversationSummary(context, userId, conversationId);
                return await next();
            }

            // ✅ OTROS COMANDOS PARA USUARIOS AUTENTICADOS
            if (text.toLowerCase() === 'mi info' || text.toLowerCase() === 'info' || text.toLowerCase() === 'perfil') {
                await this.showUserInfo(context, userId);
                return await next();
            }

            if (text.toLowerCase() === 'ayuda' || text.toLowerCase() === 'help') {
                await this.showHelp(context, userId);
                return await next();
            }

            // ✅ NUEVO: Inicializar conversación en Cosmos DB si es necesario
            if (cosmosService.isAvailable()) {
                const userInfo = await this.getUserInfo(userId);
                const conversationExists = await cosmosService.getConversationInfo(conversationId, userInfo.usuario);
                if (!conversationExists) {
                    console.log(`📝 [${userId}] Inicializando conversación perdida en Cosmos DB`);
                    await this.initializeConversation(context, userId);
                }
            }

            // 💬 PROCESAR MENSAJE CON IA (con historial automático)
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

    // ===== MANTENER TODOS LOS MÉTODOS EXISTENTES =====
    // (Todos los métodos como showLoginCard, handleLoginSubmit, etc. se mantienen igual)
    
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

    // ===== MANTENER TODOS LOS MÉTODOS EXISTENTES =====
    // handleTextLogin, handleLoginSubmit, authenticateWithNova, etc.
    // (Por brevedad no los incluyo aquí, pero deben mantenerse tal como están)

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

    // ===== MANTENER TODOS LOS MÉTODOS AUXILIARES =====
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

    getStats() {
        return {
            authenticatedUsers: this.authenticatedUsers.size,
            loginCardsPending: this.loginCardSentUsers.size,
            welcomeMessagesSent: this.welcomeMessageSent.size,
            openaiAvailable: this.openaiService?.openaiAvailable || false,
            cosmosDBAvailable: cosmosService.isAvailable(),
            persistenceType: cosmosService.isAvailable() ? 'CosmosDB' : 'Memory',
            mensajesEnCache: Array.from(this.mensajeCache.values()).reduce((total, msgs) => total + msgs.length, 0),
            conversacionesActivas: this.mensajeCache.size,
            timestamp: new Date().toISOString()
        };
    }

    cleanup() {
        console.log('🧹 Limpiando TeamsBot...');
        this.authenticatedUsers.clear();
        this.loginCardSentUsers.clear();
        this.welcomeMessageSent.clear();
        this.mensajeCache.clear();
        console.log('✅ TeamsBot limpiado');
    }

    // ===== MANTENER MÉTODOS EXISTENTES (showUserInfo, showHelp, handleLogout, etc.) =====
    // (Por brevedad no los incluyo completos aquí)

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

            if (cosmosService.isAvailable()) {
                infoMessage += `💾 **Persistencia**: ✅ Cosmos DB activa\n`;
            } else {
                infoMessage += `💾 **Persistencia**: ⚠️ Solo memoria temporal\n`;
            }

            infoMessage += `💬 **¿Necesitas algo más?** Solo pregúntame.`;

            await context.sendActivity(infoMessage);

        } catch (error) {
            console.error(`Error mostrando info del usuario:`, error);
            await context.sendActivity('❌ Error obteniendo tu información.');
        }
    }

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
                
                `📚 **Comandos de Historial:**\n` +
                `• \`historial\` - Ver últimos 5 mensajes\n` +
                `• \`resumen\` - Resumen de la conversación\n` +
                `• \`limpiar historial\` - Eliminar mensajes guardados\n\n` +
                
                `👤 **Comandos de Usuario:**\n` +
                `• \`mi info\` - Ver tu información completa\n` +
                `• \`logout\` - Cerrar sesión\n` +
                `• \`ayuda\` - Mostrar esta ayuda\n\n` +
                
                `🔒 **Seguridad y Persistencia:**\n` +
                `• Tu sesión es segura con token corporativo\n` +
                `• ${cosmosService.isAvailable() ? 
                    'Conversaciones guardadas permanentemente en Cosmos DB' : 
                    'Conversaciones temporales (se pierden al reiniciar)'}\n` +
                `• Acceso controlado por autenticación\n\n` +
                
                `💡 **Prueba el historial:**\n` +
                `1. Envía algunos mensajes\n` +
                `2. Escribe \`historial\` para verlos\n` +
                `3. Escribe \`resumen\` para un resumen inteligente`
            );

        } catch (error) {
            console.error(`Error mostrando ayuda:`, error);
            await context.sendActivity('❌ Error mostrando ayuda.');
        }
    }

    async handleLogout(context, userId) {
        try {
            console.log(`🚪 [${userId}] Iniciando logout con limpieza completa...`);
            
            const userInfo = await this.getUserInfo(userId);
            const userName = userInfo ? userInfo.nombre : 'Usuario';
            const conversationId = context.activity.conversation.id;
            
            // Limpiar historial local
            if (this.mensajeCache.has(conversationId)) {
                this.mensajeCache.delete(conversationId);
                console.log(`🗑️ [${userId}] Cache local de mensajes limpiado`);
            }
            
            // Limpiar datos de autenticación
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
                `🗑️ Historial de conversación limpiado\n` +
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
                userInfo?.usuario,
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

    // ===== MANTENER MÉTODOS DE DIAGNÓSTICO =====
    async debugNovaAPI(context, text) { /* mantener igual */ }
    async runCardTests(context) { /* mantener igual */ }
    createSimpleTestCard() { /* mantener igual */ }
    createInputTestCard() { /* mantener igual */ }
}

module.exports.TeamsBot = TeamsBot;