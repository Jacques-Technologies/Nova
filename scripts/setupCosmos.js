// scripts/setupCosmos.js - Script para configurar Cosmos DB automáticamente

const { CosmosClient } = require('@azure/cosmos');
require('dotenv').config();

/**
 * Script para configurar automáticamente Cosmos DB
 * Crea la base de datos y contenedor si no existen
 */
class CosmosSetup {
    constructor() {
        this.endpoint = process.env.COSMOS_DB_ENDPOINT;
        this.key = process.env.COSMOS_DB_KEY;
        this.databaseId = process.env.COSMOS_DB_DATABASE_ID || 'nova_bot_db';
        this.containerId = process.env.COSMOS_DB_CONTAINER_ID || 'conversations';
        this.partitionKey = process.env.COSMOS_DB_PARTITION_KEY || '/userId';
        this.ttl = parseInt(process.env.COSMOS_DB_TTL) || (60 * 60 * 24 * 90); // 90 días
        this.throughput = parseInt(process.env.COSMOS_DB_THROUGHPUT) || 400;
    }

    async validateConfig() {
        console.log('🔍 Validando configuración...');
        
        if (!this.endpoint || !this.key) {
            throw new Error('❌ COSMOS_DB_ENDPOINT y COSMOS_DB_KEY son requeridos');
        }

        if (!this.endpoint.includes('documents.azure.com')) {
            console.warn('⚠️ El endpoint no parece ser de Azure Cosmos DB');
        }

        console.log('✅ Configuración válida:');
        console.log(`   Endpoint: ${this.endpoint}`);
        console.log(`   Database: ${this.databaseId}`);
        console.log(`   Container: ${this.containerId}`);
        console.log(`   Partition Key: ${this.partitionKey}`);
        console.log(`   TTL: ${this.ttl} segundos (${Math.round(this.ttl / 86400)} días)`);
        console.log(`   Throughput: ${this.throughput} RU/s`);
    }

    async initializeClient() {
        console.log('🔑 Inicializando cliente Cosmos DB...');
        
        this.client = new CosmosClient({
            endpoint: this.endpoint,
            key: this.key,
            userAgentSuffix: 'NovaBot-Setup/2.1.0'
        });

        // Test de conectividad
        try {
            await this.client.getDatabaseAccount();
            console.log('✅ Conexión exitosa con Cosmos DB');
        } catch (error) {
            throw new Error(`❌ Error de conectividad: ${error.message}`);
        }
    }

    async createDatabase() {
        console.log(`📁 Creando/verificando base de datos: ${this.databaseId}...`);
        
        try {
            const { database } = await this.client.databases.createIfNotExists({
                id: this.databaseId,
                throughput: this.throughput
            });

            this.database = database;
            console.log(`✅ Base de datos lista: ${this.databaseId}`);
            
            return database;
        } catch (error) {
            throw new Error(`❌ Error creando base de datos: ${error.message}`);
        }
    }

    async createContainer() {
        console.log(`📦 Creando/verificando contenedor: ${this.containerId}...`);
        
        try {
            const containerDef = {
                id: this.containerId,
                partitionKey: this.partitionKey,
                defaultTtl: this.ttl, // TTL automático
                indexingPolicy: {
                    indexingMode: 'consistent',
                    automatic: true,
                    includedPaths: [
                        {
                            path: "/*"
                        }
                    ],
                    excludedPaths: [
                        {
                            path: "/\"_etag\"/?"
                        }
                    ],
                    compositeIndexes: [
                        [
                            {
                                path: "/conversationId",
                                order: "ascending"
                            },
                            {
                                path: "/timestamp",
                                order: "descending"
                            }
                        ],
                        [
                            {
                                path: "/userId",
                                order: "ascending"
                            },
                            {
                                path: "/timestamp",
                                order: "descending"
                            }
                        ]
                    ]
                }
            };

            const { container } = await this.database.containers.createIfNotExists(
                containerDef,
                { offerThroughput: this.throughput }
            );

            this.container = container;
            console.log(`✅ Contenedor listo: ${this.containerId}`);
            
            return container;
        } catch (error) {
            throw new Error(`❌ Error creando contenedor: ${error.message}`);
        }
    }

    async testOperations() {
        console.log('🧪 Ejecutando pruebas básicas...');
        
        try {
            // Test de escritura
            const testDoc = {
                id: 'test_setup_' + Date.now(),
                messageId: 'test_setup_' + Date.now(),
                conversationId: 'test_conversation',
                userId: 'test_user',
                message: 'Test message from setup script',
                messageType: 'system',
                timestamp: new Date().toISOString(),
                partitionKey: 'test_user',
                ttl: 300 // 5 minutos
            };

            console.log('📝 Probando escritura...');
            const { resource: createdDoc } = await this.container.items.create(testDoc);
            console.log(`✅ Escritura exitosa: ${createdDoc.id}`);

            // Test de lectura
            console.log('📖 Probando lectura...');
            const { resource: readDoc } = await this.container.item(createdDoc.id, 'test_user').read();
            console.log(`✅ Lectura exitosa: ${readDoc.message}`);

            // Test de query
            console.log('🔍 Probando consulta...');
            const querySpec = {
                query: 'SELECT * FROM c WHERE c.userId = @userId',
                parameters: [{ name: '@userId', value: 'test_user' }]
            };

            const { resources: queryResults } = await this.container.items
                .query(querySpec, { partitionKey: 'test_user' })
                .fetchAll();

            console.log(`✅ Consulta exitosa: ${queryResults.length} documentos encontrados`);

            // Limpiar documento de prueba
            console.log('🧹 Limpiando datos de prueba...');
            await this.container.item(createdDoc.id, 'test_user').delete();
            console.log('✅ Limpieza completada');

        } catch (error) {
            throw new Error(`❌ Error en pruebas: ${error.message}`);
        }
    }

    async getStats() {
    try {
        if (!this.cosmosAvailable) {
            return {
                available: false,
                error: this.initializationError
            };
        }

        console.log('📊 Obteniendo estadísticas de Cosmos DB (corregido)...');

        // ✅ ESTADÍSTICAS BÁSICAS CON QUERIES SEPARADAS
        const statsResults = {
            totalDocuments: 0,
            conversations: 0,
            userMessages: 0,
            botMessages: 0,
            systemMessages: 0
        };

        // ✅ Query 1: Total de documentos
        try {
            const totalQuery = {
                query: "SELECT VALUE COUNT(1) FROM c"
            };
            
            const { resources: totalResults } = await this.container.items
                .query(totalQuery)
                .fetchAll();
                
            statsResults.totalDocuments = totalResults[0] || 0;
            console.log(`📊 Total documentos: ${statsResults.totalDocuments}`);
            
        } catch (error) {
            console.warn('⚠️ Error contando documentos totales:', error.message);
        }

        // ✅ Query 2: Documentos de conversación
        try {
            const conversationQuery = {
                query: "SELECT VALUE COUNT(1) FROM c WHERE c.documentType = 'conversation_info'"
            };
            
            const { resources: conversationResults } = await this.container.items
                .query(conversationQuery)
                .fetchAll();
                
            statsResults.conversations = conversationResults[0] || 0;
            console.log(`📊 Conversaciones: ${statsResults.conversations}`);
            
        } catch (error) {
            console.warn('⚠️ Error contando conversaciones:', error.message);
        }

        // ✅ Query 3: Mensajes de usuario
        try {
            const userMessageQuery = {
                query: "SELECT VALUE COUNT(1) FROM c WHERE c.messageType = 'user'"
            };
            
            const { resources: userResults } = await this.container.items
                .query(userMessageQuery)
                .fetchAll();
                
            statsResults.userMessages = userResults[0] || 0;
            console.log(`📊 Mensajes usuario: ${statsResults.userMessages}`);
            
        } catch (error) {
            console.warn('⚠️ Error contando mensajes de usuario:', error.message);
        }

        // ✅ Query 4: Mensajes del bot
        try {
            const botMessageQuery = {
                query: "SELECT VALUE COUNT(1) FROM c WHERE c.messageType = 'bot'"
            };
            
            const { resources: botResults } = await this.container.items
                .query(botMessageQuery)
                .fetchAll();
                
            statsResults.botMessages = botResults[0] || 0;
            console.log(`📊 Mensajes bot: ${statsResults.botMessages}`);
            
        } catch (error) {
            console.warn('⚠️ Error contando mensajes del bot:', error.message);
        }

        // ✅ Query 5: Mensajes del sistema
        try {
            const systemMessageQuery = {
                query: "SELECT VALUE COUNT(1) FROM c WHERE c.messageType = 'system'"
            };
            
            const { resources: systemResults } = await this.container.items
                .query(systemMessageQuery)
                .fetchAll();
                
            statsResults.systemMessages = systemResults[0] || 0;
            console.log(`📊 Mensajes sistema: ${statsResults.systemMessages}`);
            
        } catch (error) {
            console.warn('⚠️ Error contando mensajes del sistema:', error.message);
        }

        // ✅ ESTADÍSTICAS ADICIONALES (OPCIONAL)
        let recentActivity = null;
        try {
            const recentQuery = {
                query: "SELECT TOP 1 c.timestamp FROM c WHERE c.messageType != null ORDER BY c.timestamp DESC"
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

        console.log('✅ Estadísticas de Cosmos DB obtenidas exitosamente');
        console.log('📊 Resumen:', {
            total: statsResults.totalDocuments,
            conversaciones: statsResults.conversations,
            mensajesUsuario: statsResults.userMessages,
            mensajesBot: statsResults.botMessages
        });

        return {
            available: true,
            initialized: this.initialized,
            database: this.databaseId,
            container: this.containerId,
            partitionKey: this.partitionKey,
            stats: {
                totalDocuments: statsResults.totalDocuments,
                conversations: statsResults.conversations,
                userMessages: statsResults.userMessages,
                botMessages: statsResults.botMessages,
                systemMessages: statsResults.systemMessages,
                totalMessages: statsResults.userMessages + statsResults.botMessages + statsResults.systemMessages,
                recentActivity: recentActivity
            },
            timestamp: new Date().toISOString(),
            note: 'Estadísticas obtenidas con queries separadas (compatible con Cosmos DB SQL)'
        };

    } catch (error) {
        console.error('❌ Error obteniendo estadísticas de Cosmos DB:', error);
        
        // ✅ ERROR ESPECÍFICO PARA SINTAXIS
        if (error.message && error.message.includes('Syntax error')) {
            console.error('🔧 Error de sintaxis SQL - Usando método de fallback básico');
            
            // Fallback: solo contar documentos totales
            try {
                const fallbackQuery = {
                    query: "SELECT VALUE COUNT(1) FROM c"
                };
                
                const { resources: fallbackResults } = await this.container.items
                    .query(fallbackQuery)
                    .fetchAll();
                
                return {
                    available: true,
                    initialized: this.initialized,
                    database: this.databaseId,
                    container: this.containerId,
                    partitionKey: this.partitionKey,
                    stats: {
                        totalDocuments: fallbackResults[0] || 0,
                        conversations: 'N/A - Query compleja falló',
                        userMessages: 'N/A - Query compleja falló',
                        botMessages: 'N/A - Query compleja falló',
                        note: 'Fallback mode - Solo total de documentos disponible'
                    },
                    timestamp: new Date().toISOString(),
                    warning: 'Usando modo de fallback por error de sintaxis SQL'
                };
                
            } catch (fallbackError) {
                console.error('❌ Incluso el fallback falló:', fallbackError.message);
            }
        }

        return {
            available: false,
            error: error.message,
            timestamp: new Date().toISOString()
        };
    }
}

    async run() {
        console.log('🚀 ===== CONFIGURACIÓN COSMOS DB =====');
        console.log('🔧 Nova Bot - Cosmos DB Setup Script');
        console.log('======================================\n');

        try {
            await this.validateConfig();
            await this.initializeClient();
            await this.createDatabase();
            await this.createContainer();
            await this.testOperations();
            await this.getStats();

            console.log('\n✅ ===== CONFIGURACIÓN COMPLETADA =====');
            console.log('🎉 Cosmos DB está listo para Nova Bot');
            console.log('📝 Puedes ejecutar el bot con: npm start');
            console.log('🔍 Verificar salud: npm run health');
            console.log('======================================');

            return true;

        } catch (error) {
            console.error('\n❌ ===== ERROR EN CONFIGURACIÓN =====');
            console.error('💥 Error:', error.message);
            console.error('\n🔧 Posibles soluciones:');
            console.error('• Verifica las variables de entorno en .env');
            console.error('• Confirma que tienes permisos en Azure Cosmos DB');
            console.error('• Revisa la conectividad de red');
            console.error('• Verifica que la cuenta de Cosmos DB esté activa');
            console.error('======================================');

            return false;
        }
    }
}

// Ejecutar setup si se llama directamente
if (require.main === module) {
    const setup = new CosmosSetup();
    
    setup.run().then(success => {
        process.exit(success ? 0 : 1);
    }).catch(error => {
        console.error('💥 Error crítico:', error);
        process.exit(1);
    });
}

module.exports = CosmosSetup;