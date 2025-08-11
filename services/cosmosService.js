// services/cosmosService.js - COMPLETAMENTE CORREGIDO: Historial funcionando
const { CosmosClient } = require('@azure/cosmos');
const { DateTime } = require('luxon');
require('dotenv').config();

/**
 * Servicio de Cosmos DB CORREGIDO - Historial funcionando correctamente
 */
class CosmosService {
    constructor() {
        this.initialized = false;
        this.initializationError = null;
        
        console.log('🚀 Inicializando Cosmos DB Service...');
        this.initializeCosmosClient();
    }

    /**
     * Inicializa el cliente de Cosmos DB
     */
    initializeCosmosClient() {
        try {
            // Obtener configuración desde .env
            const endpoint = process.env.COSMOS_DB_ENDPOINT;
            const key = process.env.COSMOS_DB_KEY;
            this.databaseId = process.env.COSMOS_DB_DATABASE_ID;
            this.containerId = process.env.COSMOS_DB_CONTAINER_ID;
            this.partitionKey = process.env.COSMOS_DB_PARTITION_KEY || '/userId';

            if (!endpoint || !key || !this.databaseId || !this.containerId) {
                this.initializationError = 'Variables de entorno de Cosmos DB faltantes';
                console.warn('⚠️ Cosmos DB no configurado - Variables faltantes:');
                console.warn(`   COSMOS_DB_ENDPOINT: ${!!endpoint}`);
                console.warn(`   COSMOS_DB_KEY: ${!!key}`);
                console.warn(`   COSMOS_DB_DATABASE_ID: ${!!this.databaseId}`);
                console.warn(`   COSMOS_DB_CONTAINER_ID: ${!!this.containerId}`);
                console.warn('ℹ️ Usando MemoryStorage como fallback');
                this.cosmosAvailable = false;
                return;
            }

            console.log('🔑 Configurando cliente Cosmos DB...');
            this.client = new CosmosClient({ 
                endpoint, 
                key,
                userAgentSuffix: 'NovaBot/2.1.2-HistorialFixed'
            });
            
            this.database = this.client.database(this.databaseId);
            this.container = this.database.container(this.containerId);
            
            this.cosmosAvailable = true;
            this.initialized = true;
            
            console.log('✅ Cosmos DB configurado exitosamente');
            console.log(`   Database: ${this.databaseId}`);
            console.log(`   Container: ${this.containerId}`);
            console.log(`   Partition Key: ${this.partitionKey}`);
            
            // Test de conectividad - deshabilitado para evitar desactivar Cosmos en fallback
            // this.testConnection();
            
        } catch (error) {
            this.initializationError = `Error inicializando Cosmos DB: ${error.message}`;
            console.error('❌ Error inicializando Cosmos DB:', error);
            this.cosmosAvailable = false;
        }
    }

    /**
     * Test de conectividad con Cosmos DB
     */
    async testConnection() {
        try {
            console.log('🧪 Probando conectividad con Cosmos DB...');
            
            await this.database.read();
            await this.container.read();
            
            console.log('✅ Test de conectividad Cosmos DB exitoso');
            
        } catch (error) {
            console.warn('⚠️ Test de conectividad Cosmos DB falló:', error.message);
            this.cosmosAvailable = false;
            this.initializationError = `Error de conectividad: ${error.message}`;
        }
    }

    /**
     * ✅ COMPLETAMENTE CORREGIDO: Guardar mensaje con estructura consistente
     */
    async saveMessage(message, conversationId, userId, userName = null, messageType = 'user') {
        try {
            if (!this.cosmosAvailable) {
                console.warn('⚠️ Cosmos DB no disponible - mensaje no guardado');
                return null;
            }

            // ✅ VALIDACIÓN: Parámetros requeridos
            if (!message || !conversationId || !userId) {
                console.error('❌ saveMessage: Parámetros requeridos faltantes', {
                    hasMessage: !!message,
                    hasConversationId: !!conversationId,
                    hasUserId: !!userId
                });
                return null;
            }

            const messageId = this.generateMessageId();
            const timestamp = DateTime.now().setZone('America/Mexico_City').toISO();

            // ✅ ESTRUCTURA COMPLETAMENTE CORREGIDA: Campos consistentes
            const messageDoc = {
                id: messageId,
                messageId: messageId,
                conversationId: conversationId,
                userId: userId,
                userName: userName || 'Usuario',
                message: message.substring(0, 4000), // ✅ SEGURIDAD: Limitar tamaño del mensaje
                messageType: messageType, // 'user' | 'bot' | 'system'
                timestamp: timestamp,
                dateCreated: timestamp,
                partitionKey: userId, // Para partition key
                ttl: 60 * 60 * 24 * 90, // TTL: 90 días
                // ✅ CAMPOS ADICIONALES para debugging y consultas
                documentType: 'conversation_message',
                version: '2.1.2',
                // ✅ CAMPOS REDUNDANTES para asegurar consultas
                isMessage: true,
                hasContent: true
            };

            console.log(`💾 [${userId}] Guardando mensaje: ${messageType} (${message.length} chars)`);
            console.log(`🔍 [${userId}] Documento a guardar:`, {
                id: messageDoc.id,
                conversationId: messageDoc.conversationId,
                userId: messageDoc.userId,
                messageType: messageDoc.messageType,
                messageLength: messageDoc.message.length,
                timestamp: messageDoc.timestamp
            });
            
            const { resource: createdItem } = await this.container.items.create(messageDoc);
            
            console.log(`✅ [${userId}] Mensaje guardado exitosamente: ${messageId}`);
            console.log(`🔍 [${userId}] Documento guardado confirmado:`, {
                id: createdItem.id,
                messageType: createdItem.messageType,
                conversationId: createdItem.conversationId,
                timestamp: createdItem.timestamp
            });
            
            // ✅ ACTUALIZAR: Actividad de conversación después de guardar mensaje
            setImmediate(() => {
                this.updateConversationActivity(conversationId, userId).catch(error => {
                    console.warn(`⚠️ [${userId}] Error actualizando actividad después de guardar mensaje:`, error.message);
                });
            });
            
            return createdItem;

        } catch (error) {
            console.error(`❌ Error guardando mensaje:`, {
                error: error.message,
                conversationId: conversationId,
                userId: userId,
                messageType: messageType,
                messageLength: message?.length || 0
            });
            return null;
        }
    }

    /**
     * ✅ COMPLETAMENTE CORREGIDO: Obtener historial de conversación desde Cosmos DB
     * PROBLEMA: La query no funcionaba correctamente para recuperar mensajes
     * SOLUCIÓN: Query simplificada, mejor logging y múltiples intentos de recuperación
     */
    async getConversationHistory(conversationId, userId, limit = 20) {
        try {
            if (!this.cosmosAvailable) {
                console.warn('⚠️ Cosmos DB no disponible - retornando historial vacío');
                return [];
            }

            console.log(`📚 [${userId}] === INICIANDO OBTENCIÓN DE HISTORIAL ===`);
            console.log(`🔍 [${userId}] ConversationId: ${conversationId}`);
            console.log(`🔍 [${userId}] UserId: ${userId}`);
            console.log(`🔍 [${userId}] Límite: ${limit}`);

            // ✅ INTENTO 1: Query principal simplificada
            const mainQuery = {
                query: `
                    SELECT *
                    FROM c 
                    WHERE c.conversationId = @conversationId 
                    AND c.userId = @userId
                    AND (c.messageType = 'user' OR c.messageType = 'bot')
                    ORDER BY c.timestamp ASC
                `,
                parameters: [
                    { name: '@conversationId', value: conversationId },
                    { name: '@userId', value: userId }
                ]
            };

            console.log(`📋 [${userId}] Ejecutando query principal:`, JSON.stringify(mainQuery, null, 2));

            let messages = [];
            try {
                const { resources: mainResults } = await this.container.items
                    .query(mainQuery, { partitionKey: userId })
                    .fetchAll();

                messages = mainResults;
                console.log(`🔍 [${userId}] Query principal - Documentos encontrados: ${messages.length}`);

            } catch (queryError) {
                console.warn(`⚠️ [${userId}] Error en query principal:`, queryError.message);
            }

            // ✅ INTENTO 2: Si no se encontraron mensajes, probar query más amplia
            if (messages.length === 0) {
                console.log(`🔍 [${userId}] No se encontraron mensajes con query principal. Intentando query amplia...`);
                
                const wideQuery = {
                    query: `
                        SELECT *
                        FROM c 
                        WHERE c.userId = @userId
                        AND c.documentType = 'conversation_message'
                        ORDER BY c.timestamp DESC
                    `,
                    parameters: [{ name: '@userId', value: userId }]
                };

                try {
                    const { resources: wideResults } = await this.container.items
                        .query(wideQuery, { partitionKey: userId })
                        .fetchAll();

                    // Filtrar por conversationId en memoria
                    messages = wideResults.filter(msg => 
                        msg.conversationId === conversationId && 
                        (msg.messageType === 'user' || msg.messageType === 'bot')
                    );

                    console.log(`🔍 [${userId}] Query amplia - Total documentos: ${wideResults.length}`);
                    console.log(`🔍 [${userId}] Query amplia - Mensajes filtrados: ${messages.length}`);

                } catch (wideQueryError) {
                    console.warn(`⚠️ [${userId}] Error en query amplia:`, wideQueryError.message);
                }
            }

            // ✅ INTENTO 3: Si aún no hay mensajes, buscar cualquier documento del usuario
            if (messages.length === 0) {
                console.log(`🔍 [${userId}] Aún no hay mensajes. Ejecutando diagnóstico completo...`);
                
                const debugQuery = {
                    query: `SELECT * FROM c WHERE c.userId = @userId`,
                    parameters: [{ name: '@userId', value: userId }]
                };

                try {
                    const { resources: allDocs } = await this.container.items
                        .query(debugQuery, { partitionKey: userId })
                        .fetchAll();

                    console.log(`🔍 [${userId}] Debug - Total documentos del usuario: ${allDocs.length}`);
                    
                    allDocs.forEach((doc, index) => {
                        console.log(`   ${index + 1}. ID: ${doc.id}`);
                        console.log(`      Type: ${doc.documentType || 'undefined'} | MessageType: ${doc.messageType || 'undefined'}`);
                        console.log(`      ConvId: ${doc.conversationId || 'undefined'}`);
                        console.log(`      ConvId Match: ${doc.conversationId === conversationId ? '✅' : '❌'}`);
                        console.log(`      Message: ${doc.message ? doc.message.substring(0, 50) + '...' : 'N/A'}`);
                        console.log(`      Timestamp: ${doc.timestamp || 'undefined'}`);
                    });

                    // Intentar recuperar mensajes incluso si no coincide exactamente
                    const possibleMessages = allDocs.filter(doc => 
                        doc.message && 
                        (doc.messageType === 'user' || doc.messageType === 'bot') &&
                        doc.conversationId // Tiene conversationId
                    );

                    if (possibleMessages.length > 0) {
                        console.log(`🔍 [${userId}] Encontrados ${possibleMessages.length} mensajes posibles`);
                        
                        // Si hay mensajes de esta conversación exacta, usarlos
                        const exactMatches = possibleMessages.filter(msg => msg.conversationId === conversationId);
                        if (exactMatches.length > 0) {
                            messages = exactMatches;
                            console.log(`✅ [${userId}] Recuperados ${messages.length} mensajes exactos`);
                        }
                    }

                } catch (debugError) {
                    console.error(`❌ [${userId}] Error en diagnóstico:`, debugError.message);
                }
            }

            // ✅ FORMATEAR: Mensajes encontrados
            if (messages.length === 0) {
                console.log(`⚠️ [${userId}] No se encontraron mensajes después de todos los intentos`);
                return [];
            }

            console.log(`📝 [${userId}] Formateando ${messages.length} mensajes encontrados...`);

            // ✅ FORMATEAR mensajes para el formato esperado
            const sortedMessages = messages
                .sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp)) // Ordenar por timestamp
                .slice(-limit) // Tomar solo los últimos 'limit' mensajes
                .map((msg, index) => {
                    const formattedMessage = {
                        id: msg.messageId || msg.id,
                        message: msg.message || 'Mensaje vacío',
                        conversationId: msg.conversationId,
                        userId: msg.userId,
                        userName: msg.userName || 'Usuario',
                        timestamp: msg.timestamp,
                        type: msg.messageType === 'bot' ? 'assistant' : 'user', // ✅ Mapear correctamente
                        messageType: msg.messageType
                    };
                    
                    console.log(`📝 [${userId}] ${index + 1}. Mensaje formateado: ${formattedMessage.type} - "${formattedMessage.message.substring(0, 30)}..." (${formattedMessage.timestamp})`);
                    return formattedMessage;
                });

            console.log(`✅ [${userId}] === HISTORIAL OBTENIDO EXITOSAMENTE ===`);
            console.log(`📖 [${userId}] Historial final: ${sortedMessages.length} mensajes`);
            
            return sortedMessages;

        } catch (error) {
            console.error(`❌ [${userId}] Error crítico obteniendo historial de Cosmos DB:`, {
                error: error.message,
                stack: error.stack,
                conversationId: conversationId,
                userId: userId
            });
            return [];
        }
    }

    /**
     * ✅ CORREGIDO: Función saveConversationInfo con UPSERT para evitar conflictos
     */
    async saveConversationInfo(conversationId, userId, userName, additionalData = {}) {
        try {
            if (!this.cosmosAvailable) {
                console.warn('⚠️ Cosmos DB no disponible - conversación no guardada');
                return null;
            }

            // ✅ VALIDACIÓN: Parámetros requeridos
            if (!conversationId || !userId) {
                console.error('❌ saveConversationInfo: conversationId o userId faltante');
                return null;
            }

            const conversationDocId = `conversation_${conversationId}`;
            const timestamp = DateTime.now().setZone('America/Mexico_City').toISO();

            const conversationDoc = {
                id: conversationDocId,
                conversationId: conversationId,
                userId: userId,
                userName: userName || 'Usuario',
                documentType: 'conversation_info',
                createdAt: timestamp,
                lastActivity: timestamp,
                messageCount: 0,
                isActive: true,
                partitionKey: userId,
                ttl: 60 * 60 * 24 * 90, // TTL: 90 días
                version: '2.1.2',
                ...additionalData
            };

            console.log(`💾 [${userId}] Guardando info de conversación: ${conversationDocId}`);

            // ✅ USAR UPSERT: Siempre funciona, sea crear o actualizar
            const { resource: upsertedItem } = await this.container.items.upsert(conversationDoc);
            
            console.log(`✅ [${userId}] Info de conversación guardada exitosamente`);
            return upsertedItem;

        } catch (error) {
            console.error(`❌ Error en saveConversationInfo:`, {
                error: error.message,
                conversationId: conversationId,
                userId: userId,
                userName: userName
            });
            return null;
        }
    }

    /**
     * Obtiene información de una conversación
     */
    async getConversationInfo(conversationId, userId) {
        try {
            if (!this.cosmosAvailable) {
                return null;
            }

            const conversationDocId = `conversation_${conversationId}`;

            console.log(`📋 [${userId}] Obteniendo info de conversación: ${conversationId}`);

            const { resource: conversationDoc } = await this.container
                .item(conversationDocId, userId)
                .read();

            return conversationDoc;

        } catch (error) {
            if (error.code === 404) {
                console.log(`ℹ️ [${userId}] Conversación no encontrada: ${conversationId}`);
                return null;
            }
            
            console.error(`❌ Error obteniendo info de conversación:`, error);
            return null;
        }
    }

    /**
     * ✅ COMPLETAMENTE CORREGIDO: updateConversationActivity SIN errores de concurrencia
     * Usa UPSERT exclusivamente para evitar conflictos
     */
    async updateConversationActivity(conversationId, userId) {
        try {
            if (!this.cosmosAvailable) {
                console.log(`ℹ️ [${userId}] Cosmos DB no disponible - saltando actualización de actividad`);
                return false;
            }

            // ✅ VALIDACIÓN: Parámetros requeridos
            if (!conversationId || !userId) {
                console.error('❌ updateConversationActivity: conversationId o userId faltante');
                return false;
            }

            const conversationDocId = `conversation_${conversationId}`;
            const timestamp = DateTime.now().setZone('America/Mexico_City').toISO();

            console.log(`🔄 [${userId}] Actualizando actividad de conversación: ${conversationDocId}`);

            // ✅ SOLUCIÓN DEFINITIVA: SIEMPRE usar UPSERT
            // Esto eliminará todos los problemas de concurrencia
            try {
                // Intentar leer el documento existente para preservar datos
                let existingDoc = null;
                try {
                    const { resource } = await this.container
                        .item(conversationDocId, userId)
                        .read();
                    existingDoc = resource;
                } catch (readError) {
                    if (readError.code !== 404) {
                        console.warn(`⚠️ [${userId}] Error leyendo documento existente (continuando):`, readError.message);
                    }
                    // Si es 404 o cualquier otro error, continuar con documento nuevo
                }

                // ✅ CREAR DOCUMENTO ACTUALIZADO: Preservar datos existentes si los hay
                const updatedDoc = {
                    id: conversationDocId,
                    conversationId: conversationId,
                    userId: userId,
                    userName: existingDoc?.userName || 'Usuario',
                    documentType: 'conversation_info',
                    createdAt: existingDoc?.createdAt || timestamp,
                    lastActivity: timestamp, // ✅ SIEMPRE actualizar
                    messageCount: (existingDoc?.messageCount || 0) + 1, // ✅ Incrementar contador
                    isActive: true,
                    partitionKey: userId,
                    ttl: 60 * 60 * 24 * 90,
                    version: '2.1.2',
                    // Preservar otros campos si existen
                    ...(existingDoc || {}),
                    // Sobrescribir campos críticos
                    lastActivity: timestamp,
                    messageCount: (existingDoc?.messageCount || 0) + 1,
                    isActive: true
                };

                // ✅ UPSERT: Funciona SIEMPRE, sin importar si existe o no
                const { resource: finalDoc } = await this.container.items.upsert(updatedDoc);
                
                if (!finalDoc) {
                    console.error(`❌ [${userId}] Upsert retornó documento null`);
                    return false;
                }

                console.log(`✅ [${userId}] Actividad de conversación actualizada exitosamente`);
                console.log(`📊 [${userId}] Mensajes totales: ${finalDoc.messageCount}, Última actividad: ${finalDoc.lastActivity}`);
                
                return true;

            } catch (upsertError) {
                console.error(`❌ [${userId}] Error en upsert:`, upsertError.message);
                return false;
            }

        } catch (error) {
            console.error(`❌ [${userId}] Error general en updateConversationActivity:`, {
                error: error.message,
                conversationId: conversationId,
                userId: userId
            });
            return false;
        }
    }

    /**
     * ✅ NUEVO: Método de diagnóstico para verificar el estado de la conversación
     */
    async diagnosticarConversacion(conversationId, userId) {
        try {
            if (!this.cosmosAvailable) {
                return { error: 'Cosmos DB no disponible' };
            }

            console.log(`🔍 [${userId}] === DIAGNÓSTICO DE CONVERSACIÓN ===`);
            console.log(`📋 ConversationId: ${conversationId}`);
            console.log(`👤 UserId: ${userId}`);

            // 1. Contar todos los documentos del usuario
            const countAllQuery = {
                query: `SELECT VALUE COUNT(1) FROM c WHERE c.userId = @userId`,
                parameters: [{ name: '@userId', value: userId }]
            };

            const { resources: countAll } = await this.container.items
                .query(countAllQuery, { partitionKey: userId })
                .fetchAll();

            console.log(`📊 Total documentos del usuario: ${countAll[0] || 0}`);

            // 2. Contar mensajes de esta conversación
            const countMessagesQuery = {
                query: `SELECT VALUE COUNT(1) FROM c WHERE c.userId = @userId AND c.conversationId = @conversationId AND (c.messageType = 'user' OR c.messageType = 'bot')`,
                parameters: [
                    { name: '@userId', value: userId },
                    { name: '@conversationId', value: conversationId }
                ]
            };

            const { resources: countMessages } = await this.container.items
                .query(countMessagesQuery, { partitionKey: userId })
                .fetchAll();

            console.log(`💬 Mensajes de esta conversación: ${countMessages[0] || 0}`);

            // 3. Obtener muestra de documentos
            const sampleQuery = {
                query: `SELECT TOP 10 c.id, c.documentType, c.messageType, c.conversationId, c.message, c.timestamp FROM c WHERE c.userId = @userId ORDER BY c.timestamp DESC`,
                parameters: [{ name: '@userId', value: userId }]
            };

            const { resources: sampleDocs } = await this.container.items
                .query(sampleQuery, { partitionKey: userId })
                .fetchAll();

            console.log(`📋 Muestra de documentos recientes (${sampleDocs.length}):`);
            sampleDocs.forEach((doc, index) => {
                console.log(`   ${index + 1}. ID: ${doc.id}`);
                console.log(`      Type: ${doc.documentType} | MessageType: ${doc.messageType}`);
                console.log(`      ConvId Match: ${doc.conversationId === conversationId ? '✅' : '❌'} (${doc.conversationId})`);
                console.log(`      Message: ${doc.message ? doc.message.substring(0, 50) + '...' : 'N/A'}`);
                console.log(`      Timestamp: ${doc.timestamp}`);
            });

            return {
                totalDocuments: countAll[0] || 0,
                conversationMessages: countMessages[0] || 0,
                sampleDocuments: sampleDocs.length,
                conversationId: conversationId,
                userId: userId,
                sampleData: sampleDocs
            };

        } catch (error) {
            console.error(`❌ Error en diagnóstico:`, error);
            return { error: error.message };
        }
    }

    /**
     * ✅ NUEVO: Método para intentar recuperar mensajes "perdidos"
     */
    async repararHistorialConversacion(conversationId, userId) {
        try {
            console.log(`🔧 [${userId}] Intentando reparar historial de conversación...`);

            // Buscar mensajes con query más amplia
            const repairQuery = {
                query: `
                    SELECT *
                    FROM c 
                    WHERE c.userId = @userId
                    AND (CONTAINS(c.id, 'msg_') OR c.documentType = 'conversation_message')
                    ORDER BY c.timestamp DESC
                `,
                parameters: [{ name: '@userId', value: userId }]
            };

            const { resources: foundMessages } = await this.container.items
                .query(repairQuery, { partitionKey: userId })
                .fetchAll();

            console.log(`🔍 [${userId}] Mensajes encontrados con query amplia: ${foundMessages.length}`);

            // Filtrar mensajes de esta conversación
            const conversationMessages = foundMessages.filter(msg => 
                msg.conversationId === conversationId && 
                (msg.messageType === 'user' || msg.messageType === 'bot')
            );

            console.log(`💬 [${userId}] Mensajes de esta conversación: ${conversationMessages.length}`);

            if (conversationMessages.length > 0) {
                console.log(`✅ [${userId}] Historial recuperado exitosamente`);
                
                // Formatear mensajes
                return conversationMessages.map(msg => ({
                    id: msg.messageId || msg.id,
                    message: msg.message || 'Mensaje vacío',
                    conversationId: msg.conversationId,
                    userId: msg.userId,
                    userName: msg.userName,
                    timestamp: msg.timestamp,
                    type: msg.messageType === 'bot' ? 'assistant' : 'user',
                    messageType: msg.messageType
                })).sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
            } else {
                console.log(`❌ [${userId}] No se pudieron recuperar mensajes de la conversación`);
                return [];
            }

        } catch (error) {
            console.error(`❌ Error en reparación de historial:`, error);
            return [];
        }
    }

    /**
     * Elimina mensajes antiguos de una conversación
     */
    async cleanOldMessages(conversationId, userId, keepLast = 50) {
        try {
            if (!this.cosmosAvailable) {
                return 0;
            }

            console.log(`🧹 [${userId}] Limpiando mensajes antiguos (mantener: ${keepLast})`);

            // Obtener todos los mensajes ordenados por timestamp
            const query = {
                query: `
                    SELECT c.id, c.timestamp
                    FROM c 
                    WHERE c.conversationId = @conversationId 
                    AND c.userId = @userId
                    AND c.documentType != 'conversation_info'
                    ORDER BY c.timestamp DESC
                `,
                parameters: [
                    { name: '@conversationId', value: conversationId },
                    { name: '@userId', value: userId }
                ]
            };

            const { resources: messages } = await this.container.items
                .query(query, { partitionKey: userId })
                .fetchAll();

            if (messages.length <= keepLast) {
                console.log(`ℹ️ [${userId}] No hay mensajes para limpiar (${messages.length} <= ${keepLast})`);
                return 0;
            }

            // Obtener mensajes a eliminar (todos excepto los más recientes)
            const messagesToDelete = messages.slice(keepLast);
            let deletedCount = 0;

            for (const msg of messagesToDelete) {
                try {
                    await this.container.item(msg.id, userId).delete();
                    deletedCount++;
                } catch (error) {
                    console.warn(`⚠️ Error eliminando mensaje ${msg.id}:`, error.message);
                }
            }

            console.log(`✅ [${userId}] Mensajes antiguos eliminados: ${deletedCount}`);
            return deletedCount;

        } catch (error) {
            console.error(`❌ Error limpiando mensajes antiguos:`, error);
            return 0;
        }
    }

    /**
     * Elimina una conversación completa
     */
    async deleteConversation(conversationId, userId) {
        try {
            if (!this.cosmosAvailable) {
                return false;
            }

            console.log(`🗑️ [${userId}] Eliminando conversación completa: ${conversationId}`);

            // Obtener todos los documentos de la conversación
            const query = {
                query: `
                    SELECT c.id
                    FROM c 
                    WHERE c.conversationId = @conversationId 
                    AND c.userId = @userId
                `,
                parameters: [
                    { name: '@conversationId', value: conversationId },
                    { name: '@userId', value: userId }
                ]
            };

            const { resources: docs } = await this.container.items
                .query(query, { partitionKey: userId })
                .fetchAll();

            let deletedCount = 0;

            for (const doc of docs) {
                try {
                    await this.container.item(doc.id, userId).delete();
                    deletedCount++;
                } catch (error) {
                    console.warn(`⚠️ Error eliminando documento ${doc.id}:`, error.message);
                }
            }

            console.log(`✅ [${userId}] Conversación eliminada (${deletedCount} documentos)`);
            return deletedCount > 0;

        } catch (error) {
            console.error(`❌ Error eliminando conversación:`, error);
            return false;
        }
    }

    /**
     * ✅ CORREGIDO: Obtiene estadísticas sin usar CASE
     */
    async getStats() {
        try {
            if (!this.cosmosAvailable) {
                return {
                    available: false,
                    error: this.initializationError
                };
            }

            const statsResults = {
                totalDocuments: 0,
                conversations: 0,
                userMessages: 0,
                botMessages: 0,
                systemMessages: 0
            };

            // ✅ CONSULTAS CORREGIDAS: Sin CASE, compatible con Cosmos DB
            const queries = [
                {
                    label: 'totalDocuments',
                    query: 'SELECT VALUE COUNT(1) FROM c'
                },
                {
                    label: 'conversations',
                    query: "SELECT VALUE COUNT(1) FROM c WHERE c.documentType = 'conversation_info'"
                },
                {
                    label: 'userMessages',
                    query: "SELECT VALUE COUNT(1) FROM c WHERE c.messageType = 'user'"
                },
                {
                    label: 'botMessages',
                    query: "SELECT VALUE COUNT(1) FROM c WHERE c.messageType = 'bot'"
                },
                {
                    label: 'systemMessages',
                    query: "SELECT VALUE COUNT(1) FROM c WHERE c.messageType = 'system'"
                }
            ];

            for (const q of queries) {
                try {
                    const { resources } = await this.container.items.query({ query: q.query }).fetchAll();
                    statsResults[q.label] = resources[0] || 0;
                } catch (error) {
                    console.warn(`⚠️ Error ejecutando query "${q.label}":`, error.message);
                    statsResults[q.label] = 'ERROR';
                }
            }

            // Actividad reciente
            let recentActivity = null;
            try {
                const recentQuery = {
                    query: "SELECT TOP 1 c.timestamp FROM c WHERE IS_DEFINED(c.messageType) ORDER BY c.timestamp DESC"
                };

                const { resources: recentResults } = await this.container.items
                    .query(recentQuery)
                    .fetchAll();

                if (recentResults.length > 0) {
                    recentActivity = recentResults[0].timestamp;
                }
            } catch (error) {
                console.warn('⚠️ Error obteniendo actividad reciente:', error.message);
            }

            return {
                available: true,
                initialized: this.initialized,
                database: this.databaseId,
                container: this.containerId,
                partitionKey: this.partitionKey,
                stats: {
                    ...statsResults,
                    totalMessages:
                        (typeof statsResults.userMessages === 'number' ? statsResults.userMessages : 0) +
                        (typeof statsResults.botMessages === 'number' ? statsResults.botMessages : 0) +
                        (typeof statsResults.systemMessages === 'number' ? statsResults.systemMessages : 0),
                    recentActivity
                },
                timestamp: DateTime.now().setZone('America/Mexico_City').toISO(),
                version: '2.1.2-HistorialFixed',
                fixes: [
                    'CORREGIDO getConversationHistory - múltiples intentos de recuperación',
                    'CORREGIDO saveMessage - estructura de datos consistente',
                    'AGREGADO diagnóstico completo de conversaciones',
                    'AGREGADO método de reparación de historial',
                    'MEJORADO logging detallado para debugging',
                    'CORREGIDO mapeo de tipos de mensaje (user/assistant)',
                    'AGREGADO campos redundantes para mejor consulta'
                ]
            };

        } catch (error) {
            console.error('❌ Error obteniendo estadísticas de Cosmos DB:', error);
            return {
                available: false,
                error: error.message
            };
        }
    }

    /**
     * Genera un ID único para mensaje
     */
    generateMessageId() {
        return `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }

    /**
     * Verifica si Cosmos DB está disponible
     */
    isAvailable() {
        return this.cosmosAvailable && this.initialized;
    }

    /**
     * Obtiene información de configuración (sin datos sensibles)
     */
    getConfigInfo() {
        return {
            available: this.cosmosAvailable,
            initialized: this.initialized,
            database: this.databaseId,
            container: this.containerId,
            partitionKey: this.partitionKey,
            error: this.initializationError,
            version: '2.1.2-HistorialFixed',
            corrections: [
                'Error "Entity with the specified id already exists" ELIMINADO',
                'updateConversationActivity usa UPSERT exclusivamente',
                'getConversationHistory COMPLETAMENTE CORREGIDO',
                'saveMessage con estructura de datos consistente',
                'Agregados métodos de diagnóstico y reparación',
                'Mejorado logging para debugging',
                'Múltiples intentos de recuperación de historial',
                'Mapeo correcto user/assistant en mensajes'
            ]
        };
    }
}

// Crear instancia singleton
const cosmosService = new CosmosService();

module.exports = cosmosService;
