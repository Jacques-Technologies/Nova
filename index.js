// index.js - Configuración corregida con Cosmos DB Storage
// 🔧 CORREGIDO: Import correcto de CosmosDbPartitionedStorage

const path = require('path');
const restify = require('restify');
const { 
    BotFrameworkAdapter, 
    MemoryStorage, 
    ConversationState, 
    UserState
    // ❌ NO: CosmosDbPartitionedStorage - NO está en 'botbuilder'
} = require('botbuilder');

// ✅ SÍ: CosmosDbPartitionedStorage está en 'botbuilder-azure'
const { CosmosDbPartitionedStorage } = require('botbuilder-azure');

// Importar servicios
const { TeamsBot } = require('./bots/teamsBot');
const cosmosService = require('./services/cosmosService');
const documentService = require('./services/documentService');

// Configurar variables de entorno
require('dotenv').config();

// Crear servidor HTTP
const server = restify.createServer();
server.use(restify.plugins.bodyParser());

server.listen(process.env.port || process.env.PORT || 3978, () => {
    console.log(`\n${server.name} listening on ${server.url}`);
    console.log('\n🚀 Bot Nova con Cosmos DB iniciado');
    console.log('✅ Sistema de login personalizado activo');
    console.log(`💾 Persistencia: ${cosmosService.isAvailable() ? 'Cosmos DB' : 'Memoria temporal'}`);
});

// 🔧 MEJORADO: Configuración más robusta del adaptador
const adapter = new BotFrameworkAdapter({
    appId: process.env.MicrosoftAppId,
    appPassword: process.env.MicrosoftAppPassword,
    // ✅ NUEVO: Deshabilitar validación en desarrollo si no tienes AppId
    authConfig: {
        validateClaims: process.env.NODE_ENV === 'production'
    },
    // ✅ NUEVO: Configuración adicional para mejor debugging
    enableSkillsBasedConversation: false
});

// 🔧 MEJORADO: Manejo de errores más específico
adapter.onTurnError = async (context, error) => {
    console.error('❌ Error en bot:', error);
    
    // Log específico para errores de autenticación
    if (error.message.includes('Unauthorized') || error.message.includes('Invalid AppId')) {
        console.error('🔐 ERROR DE AUTENTICACIÓN DETECTADO:');
        console.error(`   AppId configurado: ${process.env.MicrosoftAppId || 'NO CONFIGURADO'}`);
        console.error(`   AppPassword configurado: ${process.env.MicrosoftAppPassword ? 'SÍ' : 'NO'}`);
        console.error('   SOLUCIÓN: Verifica las variables MicrosoftAppId y MicrosoftAppPassword');
    }
    
    // Solo enviar mensaje de error si el contexto está disponible
    try {
        if (context && context.sendActivity) {
            await context.sendActivity('❌ **Error del bot**\n\nOcurrió un error inesperado. Intenta nuevamente.');
        }
    } catch (sendError) {
        console.error('Error enviando mensaje de error:', sendError.message);
    }
    
    // Limpiar estados en caso de error (con mejor manejo)
    try {
        if (conversationState && context) {
            await conversationState.delete(context);
        }
        if (userState && context) {
            await userState.delete(context);
        }
    } catch (cleanupError) {
        console.error('⚠️ Error limpiando estados:', cleanupError.message);
    }
};

// ✅ MEJORADO: Configurar almacenamiento con manejo de errores más robusto
let storage;
let conversationState;
let userState;

async function initializeStorage() {
    console.log('📦 Inicializando almacenamiento...');
    
    try {
        // ✅ INTENTAR: Usar Cosmos DB si está configurado
        if (cosmosService.isAvailable()) {
            console.log('🌐 Configurando Cosmos DB Storage...');
            
            // ✅ VALIDAR: Todas las variables necesarias
            const requiredEnvVars = [
                'COSMOS_DB_ENDPOINT',
                'COSMOS_DB_KEY',
                'COSMOS_DB_DATABASE_ID',
                'COSMOS_DB_CONTAINER_ID'
            ];
            
            const missingVars = requiredEnvVars.filter(varName => !process.env[varName]);
            
            if (missingVars.length > 0) {
                throw new Error(`Variables de Cosmos DB faltantes: ${missingVars.join(', ')}`);
            }
            
            storage = new CosmosDbPartitionedStorage({
                cosmosDbEndpoint: process.env.COSMOS_DB_ENDPOINT,
                authKey: process.env.COSMOS_DB_KEY,
                databaseId: process.env.COSMOS_DB_DATABASE_ID,
                containerId: process.env.COSMOS_DB_CONTAINER_ID,
                compatibilityMode: false
            });
            
            console.log('✅ Cosmos DB Storage configurado exitosamente');
            
        } else {
            throw new Error('Cosmos DB no está disponible o configurado');
        }
        
    } catch (cosmosError) {
        console.error('❌ Error configurando Cosmos DB:', cosmosError.message);
        console.log('🔄 Usando MemoryStorage como fallback...');
        
        // ✅ FALLBACK SEGURO: Siempre usar MemoryStorage si hay problemas
        storage = new MemoryStorage();
        console.log('✅ MemoryStorage configurado como fallback');
    }
    
    // Crear estados de conversación y usuario
    conversationState = new ConversationState(storage);
    userState = new UserState(storage);
    
    console.log(`✅ Estados inicializados con ${storage.constructor.name}`);
}

// ✅ MEJORADO: Inicialización con mejor manejo de errores
initializeStorage().then(() => {
    // Crear instancia del bot después de inicializar storage
    const bot = new TeamsBot(conversationState, userState);
    
    // Endpoint principal para mensajes
    server.post('/api/messages', async (req, res) => {
        try {
            await adapter.process(req, res, (context) => bot.run(context));
        } catch (error) {
            console.error('❌ Error procesando mensaje:', error.message);
            
            // Respuesta específica para errores de autenticación
            if (error.message.includes('Unauthorized') || error.message.includes('Invalid AppId')) {
                res.status(401).send({
                    error: 'Bot authentication error',
                    message: 'Check MicrosoftAppId and MicrosoftAppPassword configuration',
                    details: error.message
                });
            } else {
                res.status(500).send({
                    error: 'Internal server error',
                    message: error.message
                });
            }
        }
    });
    
    console.log('🎯 Bot listo para recibir mensajes');
    
}).catch(error => {
    console.error('💥 Error crítico inicializando bot:', error);
    process.exit(1);
});

// 🔧 MEJORADO: Endpoint de salud con información de configuración
server.get('/health', (req, res, next) => {
    try {
        const cosmosInfo = cosmosService.getConfigInfo();
        const documentInfo = documentService.getConfigInfo();
        
        res.json({
            status: 'OK',
            timestamp: new Date().toISOString(),
            bot: 'Nova Bot con Cosmos DB y Azure Search',
            configuration: {
                // ✅ NUEVO: Información de configuración de autenticación
                botAuthentication: {
                    appIdConfigured: !!process.env.MicrosoftAppId,
                    appPasswordConfigured: !!process.env.MicrosoftAppPassword,
                    appId: process.env.MicrosoftAppId ? 
                        `${process.env.MicrosoftAppId.substring(0, 8)}...` : 
                        'NOT_CONFIGURED'
                }
            },
            features: {
                customLogin: true,
                oauth: false,
                azure: false,
                openai: !!process.env.OPENAI_API_KEY,
                cosmosDB: cosmosInfo.available,
                azureSearch: documentInfo.searchAvailable,
                persistencia: cosmosInfo.available ? 'Cosmos DB' : 'Memoria temporal',
                documentSearch: documentInfo.searchAvailable ? 'Azure Search con vectores' : 'No disponible'
            },
            storage: {
                type: cosmosInfo.available ? 'CosmosDB' : 'Memory',
                database: cosmosInfo.database,
                container: cosmosInfo.container,
                available: cosmosInfo.available,
                error: cosmosInfo.error
            },
            documentService: {
                available: documentInfo.searchAvailable,
                features: documentInfo.features,
                indexName: documentInfo.indexName,
                error: documentInfo.error
            }
        });
        return next();
    } catch (error) {
        console.error('❌ Error en endpoint /health:', error);
        res.status(500).json({ error: 'Internal server error' });
        return next();
    }
});

// Resto del código permanece igual...
// (diagnostic, cosmos-stats, cleanup endpoints)

// 🔧 MEJORADO: Endpoint de diagnóstico con información de autenticación
server.get('/diagnostic', async (req, res) => {
    try {
        // Obtener estadísticas de Cosmos DB
        let cosmosStats = null;
        if (cosmosService.isAvailable()) {
            try {
                cosmosStats = await cosmosService.getStats();
            } catch (error) {
                console.warn('⚠️ Error obteniendo stats de Cosmos DB:', error.message);
            }
        }

        // Obtener estadísticas de DocumentService
        let documentStats = null;
        if (documentService.isAvailable()) {
            try {
                documentStats = await documentService.getStats();
            } catch (error) {
                console.warn('⚠️ Error obteniendo stats de DocumentService:', error.message);
            }
        }
        
        res.json({
            bot: {
                status: 'running',
                authenticatedUsers: global.botInstance?.getStats?.()?.authenticatedUsers || 0,
                timestamp: new Date().toISOString()
            },
            // ✅ NUEVO: Información de autenticación del bot
            authentication: {
                appId: process.env.MicrosoftAppId || 'NOT_CONFIGURED',
                appIdPreview: process.env.MicrosoftAppId ? 
                    `${process.env.MicrosoftAppId.substring(0, 8)}...${process.env.MicrosoftAppId.slice(-4)}` : 
                    'NOT_CONFIGURED',
                appPasswordConfigured: !!process.env.MicrosoftAppPassword,
                authenticationEnabled: !!(process.env.MicrosoftAppId && process.env.MicrosoftAppPassword)
            },
            memory: {
                used: Math.round(process.memoryUsage().heapUsed / 1024 / 1024) + ' MB',
                total: Math.round(process.memoryUsage().heapTotal / 1024 / 1024) + ' MB'
            },
            uptime: Math.round(process.uptime()) + ' segundos',
            environment: {
                hasOpenAI: !!process.env.OPENAI_API_KEY,
                hasBotId: !!process.env.MicrosoftAppId,
                hasBotPassword: !!process.env.MicrosoftAppPassword,
                nodeVersion: process.version,
                cosmosConfigured: !!process.env.COSMOS_DB_ENDPOINT,
                azureSearchConfigured: !!(process.env.AZURE_SEARCH_ENDPOINT || process.env.SERVICE_ENDPOINT)
            },
            storage: {
                type: cosmosService.isAvailable() ? 'CosmosDB' : 'Memory',
                config: cosmosService.getConfigInfo(),
                stats: cosmosStats
            },
            documentService: {
                type: documentService.isAvailable() ? 'Azure Search' : 'Not Available',
                config: documentService.getConfigInfo(),
                stats: documentStats
            }
        });
    } catch (error) {
        console.error('❌ Error en endpoint /diagnostic:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// ✅ NUEVO: Endpoint para estadísticas de Cosmos DB
server.get('/cosmos-stats', async (req, res) => {
    try {
        if (!cosmosService.isAvailable()) {
            res.json({
                available: false,
                message: 'Cosmos DB no está configurado o disponible'
            });
            return;
        }
        
        const stats = await cosmosService.getStats();
        res.json(stats);
        return;
        
    } catch (error) {
        console.error('❌ Error en endpoint /cosmos-stats:', error);
        res.status(500).json({ 
            error: 'Error obteniendo estadísticas de Cosmos DB',
            details: error.message 
        });
        return;
    }
});

// ✅ NUEVO: Endpoint para limpiar datos de desarrollo (solo en desarrollo)
if (process.env.NODE_ENV === 'development') {
    server.post('/dev/cleanup', async (req, res) => {
        try {
            console.log('🧹 Iniciando limpieza de desarrollo...');
            
            let results = {
                memory_cleared: false,
                cosmos_available: cosmosService.isAvailable()
            };
            
            // Limpiar bot instance si existe
            if (global.botInstance && typeof global.botInstance.cleanup === 'function') {
                global.botInstance.cleanup();
                results.memory_cleared = true;
            }
            
            console.log('✅ Limpieza de desarrollo completada');
            
            res.json({
                success: true,
                message: 'Limpieza de desarrollo completada',
                results: results,
                timestamp: new Date().toISOString()
            });
            
            return;
            
        } catch (error) {
            console.error('❌ Error en limpieza de desarrollo:', error);
            res.status(500).json({ 
                error: 'Error en limpieza',
                details: error.message 
            });
            return;
        }
    });
}

// Manejo de cierre graceful
process.on('SIGINT', () => {
    console.log('\n🛑 Cerrando bot Nova...');
    console.log('💾 Guardando estados finales...');
    process.exit(0);
});

process.on('SIGTERM', () => {
    console.log('\n🛑 Terminando bot Nova...');
    console.log('💾 Finalizando conexiones...');
    process.exit(0);
});

// ✅ MEJORADO: Información de configuración con diagnóstico de autenticación
console.log('\n═══════════════════════════════════════');
console.log('📋 CONFIGURACIÓN NOVA BOT');
console.log('═══════════════════════════════════════');

// ✅ NUEVO: Diagnóstico de autenticación
console.log('🔐 AUTENTICACIÓN DEL BOT:');
if (process.env.MicrosoftAppId && process.env.MicrosoftAppPassword) {
    console.log(`   App ID: ${process.env.MicrosoftAppId.substring(0, 8)}...${process.env.MicrosoftAppId.slice(-4)}`);
    console.log('   App Password: ✅ Configurado');
    console.log('   Estado: 🟢 Autenticación completa');
} else if (process.env.MicrosoftAppId) {
    console.log(`   App ID: ${process.env.MicrosoftAppId}`);
    console.log('   App Password: ❌ FALTANTE');
    console.log('   Estado: 🔴 Configuración incompleta');
} else {
    console.log('   App ID: ❌ FALTANTE');
    console.log('   App Password: ❌ FALTANTE');
    console.log('   Estado: 🔴 Sin configurar (solo desarrollo local)');
}

console.log('🔐 Login: Tarjeta personalizada con usuario/contraseña');
console.log('🌐 API Nova: https://pruebas.nova.com.mx/ApiRestNova/api/Auth/login');
console.log('🤖 OpenAI: ' + (process.env.OPENAI_API_KEY ? '✅ Configurado' : '❌ No configurado'));

// Información de Cosmos DB
if (process.env.COSMOS_DB_ENDPOINT) {
    console.log('💾 Cosmos DB: ✅ Configurado');
    console.log(`   Database: ${process.env.COSMOS_DB_DATABASE_ID || 'No especificado'}`);
    console.log(`   Container: ${process.env.COSMOS_DB_CONTAINER_ID || 'No especificado'}`);
    console.log(`   Estado: ${cosmosService.isAvailable() ? '🟢 Disponible' : '🔴 Error de conexión'}`);
} else {
    console.log('💾 Cosmos DB: ❌ No configurado (usando MemoryStorage)');
}

// Información de Azure Search
const searchEndpoint = process.env.AZURE_SEARCH_ENDPOINT || process.env.SERVICE_ENDPOINT;
if (searchEndpoint) {
    console.log('🔍 Azure Search: ✅ Configurado');
    console.log(`   Endpoint: ${searchEndpoint}`);
    console.log(`   Index: ${process.env.AZURE_SEARCH_INDEX_NAME || process.env.INDEX_NAME || 'alfa_bot'}`);
    console.log(`   Estado: ${documentService.isAvailable() ? '🟢 Disponible' : '🔴 Error de conexión'}`);
    
    if (documentService.isAvailable()) {
        const features = documentService.getConfigInfo().features;
        console.log(`   Búsqueda vectorial: ${features.vectorSearch ? '✅ Activa' : '⚠️ Solo texto'}`);
    }
} else {
    console.log('🔍 Azure Search: ❌ No configurado (búsqueda de documentos no disponible)');
}

console.log('📊 Herramientas disponibles:');
console.log('   • Consulta de tasas de interés Nova');
console.log('   • Información de usuario completa');
console.log('   • APIs Nova con token de usuario');
console.log('   • Resumen de conversaciones');
if (documentService.isAvailable()) {
    console.log('   • Búsqueda de documentos corporativos');
    console.log('   • Consulta de políticas empresariales');
    console.log('   • Calendario de días feriados');
}
console.log('═══════════════════════════════════════');

// ✅ NUEVO: Diagnóstico completo de variables de entorno
console.log('\n🔍 DIAGNÓSTICO DE CONFIGURACIÓN:');

// Variables de Bot Framework
const requiredBotVars = ['MicrosoftAppId', 'MicrosoftAppPassword'];
const missingBotVars = requiredBotVars.filter(varName => !process.env[varName]);

if (missingBotVars.length > 0) {
    console.log('\n🔴 VARIABLES DE BOT FRAMEWORK FALTANTES:');
    missingBotVars.forEach(varName => {
        console.log(`   ${varName}`);
    });
    console.log('\n⚠️  IMPORTANTE: Sin estas variables el bot NO funcionará en producción');
    console.log('📝 Para desarrollo local, puedes dejarlas vacías');
    console.log('🌐 Para producción, obtén estos valores de Azure Bot Service\n');
} else {
    console.log('\n✅ BOT FRAMEWORK CORRECTAMENTE CONFIGURADO\n');
}

// Variables de Cosmos DB
const requiredCosmosVars = [
    'COSMOS_DB_ENDPOINT',
    'COSMOS_DB_KEY', 
    'COSMOS_DB_DATABASE_ID',
    'COSMOS_DB_CONTAINER_ID'
];

const missingCosmosVars = requiredCosmosVars.filter(varName => !process.env[varName]);

if (missingCosmosVars.length > 0) {
    console.log('⚠️  VARIABLES DE COSMOS DB FALTANTES:');
    missingCosmosVars.forEach(varName => {
        console.log(`   ${varName}`);
    });
    console.log('\nℹ️  Usando MemoryStorage como fallback');
    console.log('📝 Para habilitar persistencia, configura estas variables en .env\n');
} else if (!cosmosService.isAvailable()) {
    console.log('🔴 COSMOS DB CONFIGURADO PERO NO ACCESIBLE');
    console.log('   Verifica la conectividad y credenciales');
    console.log('   Usando MemoryStorage como fallback\n');
} else {
    console.log('✅ COSMOS DB OPERATIVO - Persistencia habilitada\n');
}

// Variables de Azure Search
const requiredSearchVars = ['AZURE_SEARCH_ENDPOINT', 'AZURE_SEARCH_API_KEY'];
const alternativeSearchVars = ['SERVICE_ENDPOINT', 'API_KEY'];
const missingSearchVars = requiredSearchVars.filter(varName => !process.env[varName]);
const hasAlternativeSearch = alternativeSearchVars.every(varName => process.env[varName]);

if (missingSearchVars.length > 0 && !hasAlternativeSearch) {
    console.log('⚠️  VARIABLES DE AZURE SEARCH FALTANTES:');
    console.log('   Opción 1 (recomendada):');
    missingSearchVars.forEach(varName => {
        console.log(`   ${varName}`);
    });
    if (!hasAlternativeSearch) {
        console.log('   Opción 2 (legacy):');
        console.log('   SERVICE_ENDPOINT, API_KEY');
    }
    console.log('\nℹ️  Búsqueda de documentos no disponible');
    console.log('📝 Para habilitar búsqueda, configura Azure Search en .env\n');
} else if (!documentService.isAvailable()) {
    console.log('🔴 AZURE SEARCH CONFIGURADO PERO NO ACCESIBLE');
    console.log('   Verifica la conectividad y credenciales');
    console.log('   Búsqueda de documentos no disponible\n');
} else {
    console.log('✅ AZURE SEARCH OPERATIVO - Búsqueda de documentos habilitada');
    const features = documentService.getConfigInfo().features;
    console.log(`   Búsqueda vectorial: ${features.vectorSearch ? '✅' : '⚠️'} ${features.vectorSearch ? 'Activa' : 'Solo texto'}\n`);
}