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

        console.log('📊 Obteniendo estadísticas de Cosmos DB...');

        // ✅ FIX: Usar múltiples consultas simples en lugar de CASE WHEN
        const queries = {
            total: {
                query: "SELECT VALUE COUNT(1) FROM c"
            },
            conversations: {
                query: "SELECT VALUE COUNT(1) FROM c WHERE c.documentType = 'conversation_info'"
            },
            userMessages: {
                query: "SELECT VALUE COUNT(1) FROM c WHERE c.messageType = 'user'"
            },
            botMessages: {
                query: "SELECT VALUE COUNT(1) FROM c WHERE c.messageType = 'bot'"
            }
        };

        const results = {};
        
        // Ejecutar cada consulta por separado
        for (const [key, query] of Object.entries(queries)) {
            try {
                console.log(`🔍 Ejecutando consulta: ${key}`);
                const { resources } = await this.container.items
                    .query(query)
                    .fetchAll();
                
                results[key] = resources[0] || 0;
                
            } catch (queryError) {
                console.warn(`⚠️ Error en consulta ${key}:`, queryError.message);
                results[key] = 0;
            }
        }

        console.log('✅ Estadísticas de Cosmos DB obtenidas exitosamente');

        return {
            available: true,
            initialized: this.initialized,
            database: this.databaseId,
            container: this.containerId,
            partitionKey: this.partitionKey,
            stats: {
                totalDocuments: results.total,
                conversations: results.conversations,
                userMessages: results.userMessages,
                botMessages: results.botMessages
            },
            timestamp: new Date().toISOString()
        };

    } catch (error) {
        console.error('❌ Error obteniendo estadísticas de Cosmos DB:', error);
        return {
            available: false,
            error: error.message
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