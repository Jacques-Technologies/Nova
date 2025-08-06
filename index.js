// index.js - SOLUCION SIMPLE para Tenant ID (sin AuthenticationConfiguration)
const path = require('path');
const restify = require('restify');
const { 
    BotFrameworkAdapter, 
    MemoryStorage, 
    ConversationState, 
    UserState, 
    CosmosDbPartitionedStorage
    // ✅ REMOVIDO: AuthenticationConfiguration (no disponible en todas las versiones)
} = require('botbuilder');

// Importar servicios
const { TeamsBot } = require('./bots/teamsBot');
const cosmosService = require('./services/cosmosService');
const documentService = require('./services/documentService');

// Configurar variables de entorno
require('dotenv').config();

// ✅ VALIDACIÓN: Variables críticas para Bot Framework
const requiredVars = ['MicrosoftAppId', 'MicrosoftAppPassword'];
const missingVars = requiredVars.filter(varName => !process.env[varName]);

if (missingVars.length > 0) {
    console.error('❌ Variables de entorno críticas faltantes:');
    missingVars.forEach(varName => console.error(`   ${varName}`));
    process.exit(1);
}

// ✅ ADVERTENCIA: Tenant ID recomendado
if (!process.env.MicrosoftAppTenantId) {
    console.warn('⚠️ MicrosoftAppTenantId no configurado - puede causar errores de autenticación');
    console.warn('   Agrega MicrosoftAppTenantId a tu archivo .env');
    console.warn('   Esto resuelve errores AADSTS700016');
}

// Crear servidor HTTP
const server = restify.createServer();
server.use(restify.plugins.bodyParser());

server.listen(process.env.port || process.env.PORT || 3978, () => {
    console.log(`\n${server.name} listening on ${server.url}`);
    console.log('\n🚀 Bot Nova con Cosmos DB iniciado');
    console.log('✅ Sistema de login personalizado activo');
    console.log(`💾 Persistencia: ${cosmosService.isAvailable() ? 'Cosmos DB' : 'Memoria temporal'}`);
});

// ✅ SOLUCION SIMPLE: Configurar adaptador con variables de entorno directas
// El Bot Framework Adapter leerá automáticamente MicrosoftAppTenantId del entorno
const adapter = new BotFrameworkAdapter({
    appId: process.env.MicrosoftAppId,
    appPassword: process.env.MicrosoftAppPassword
    // ✅ NOTA: No necesitamos configuración adicional
    // El Bot Framework automáticamente usa MicrosoftAppTenantId si está disponible
});

// ✅ LOG: Mostrar configuración
console.log('🔐 Configuración Bot Framework:');
console.log(`   App ID: ${process.env.MicrosoftAppId ? '✅ Configurado' : '❌ FALTANTE'}`);
console.log(`   App Password: ${process.env.MicrosoftAppPassword ? '✅ Configurado' : '❌ FALTANTE'}`);
console.log(`   Tenant ID: ${process.env.MicrosoftAppTenantId ? '✅ Configurado' : '⚠️ NO CONFIGURADO'}`);

if (process.env.MicrosoftAppTenantId) {
    console.log(`   Tenant: ${process.env.MicrosoftAppTenantId}`);
    console.log('   🎯 Esto debería resolver errores AADSTS700016');
} else {
    console.log('   ⚠️ Sin Tenant ID pueden ocurrir errores AADSTS700016');
}

// ✅ MEJORADO: Manejo de errores del adaptador con diagnóstico
adapter.onTurnError = async (context, error) => {
    console.error('❌ Error en bot:', error);
    
    // ✅ DIAGNÓSTICO: Errores específicos de autenticación
    if (error.message && error.message.includes('AADSTS')) {
        console.error('\n🔐 ERROR DE AUTENTICACIÓN AZURE AD DETECTADO:');
        console.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        
        if (error.message.includes('AADSTS700016')) {
            console.error('📋 ERROR AADSTS700016 - Aplicación no encontrada');
            console.error('   Posibles causas:');
            console.error('   • Tenant ID incorrecto o faltante');
            console.error('   • App no registrada en el tenant correcto'); 
            console.error('   • Permisos insuficientes en Azure AD');
            console.error('\n   ✅ SOLUCIÓN:');
            console.error('   1. Obtén tu Tenant ID: Azure Portal > Azure AD > Properties');
            console.error('   2. Agrégalo a .env: MicrosoftAppTenantId=tu-tenant-id');
            console.error('   3. Reinicia el bot');
        } else if (error.message.includes('AADSTS50020')) {
            console.error('📋 ERROR AADSTS50020 - Usuario no existe en tenant');
            console.error('   • Verifica que uses el tenant correcto');
        } else if (error.message.includes('AADSTS90002')) {
            console.error('📋 ERROR AADSTS90002 - Tenant no encontrado');
            console.error('   • Verifica que el Tenant ID sea válido');
        }
        
        console.error(`\n   📊 Configuración actual:`);
        console.error(`   • App ID: ${process.env.MicrosoftAppId?.substring(0,8)}...`);
        console.error(`   • Tenant: ${process.env.MicrosoftAppTenantId || 'NO CONFIGURADO ❌'}`);
        console.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    }
    
    await context.sendActivity('❌ **Error del bot**\n\nOcurrió un error inesperado. Intenta nuevamente.');
    
    // Limpiar estados en caso de error
    try {
        if (conversationState) {
            await conversationState.delete(context);
        }
        if (userState) {
            await userState.delete(context);
        }
    } catch (cleanupError) {
        console.error('⚠️ Error limpiando estados:', cleanupError.message);
    }
};

// Inicializar almacenamiento
let storage;
let conversationState;
let userState;

async function initializeStorage() {
    console.log('📦 Inicializando almacenamiento...');
    
    try {
        if (cosmosService.isAvailable()) {
            console.log('🌐 Configurando Cosmos DB Storage...');
            
            storage = new CosmosDbPartitionedStorage({
                cosmosDbEndpoint: process.env.COSMOS_DB_ENDPOINT,
                authKey: process.env.COSMOS_DB_KEY,
                databaseId: process.env.COSMOS_DB_DATABASE_ID,
                containerId: process.env.COSMOS_DB_CONTAINER_ID,
                compatibilityMode: false
            });
            
            console.log('✅ Cosmos DB Storage configurado exitosamente');
            
        } else {
            console.warn('⚠️ Cosmos DB no disponible, usando MemoryStorage como fallback');
            storage = new MemoryStorage();
        }
        
        conversationState = new ConversationState(storage);
        userState = new UserState(storage);
        
        console.log(`✅ Estados inicializados con ${cosmosService.isAvailable() ? 'Cosmos DB' : 'MemoryStorage'}`);
        
    } catch (error) {
        console.error('❌ Error inicializando Cosmos DB, usando MemoryStorage:', error.message);
        storage = new MemoryStorage();
        conversationState = new ConversationState(storage);
        userState = new UserState(storage);
        console.log('✅ MemoryStorage configurado como fallback');
    }
}

// Inicialización async del storage
initializeStorage().then(() => {
    const bot = new TeamsBot(conversationState, userState);
    
    server.post('/api/messages', async (req, res) => {
        try {
            await adapter.process(req, res, (context) => bot.run(context));
        } catch (error) {
            console.error('❌ Error procesando mensaje:', error);
            res.status(500).send('Error interno del servidor');
        }
    });
    
    console.log('🎯 Bot listo para recibir mensajes');
    
}).catch(error => {
    console.error('💥 Error crítico inicializando bot:', error);
    process.exit(1);
});

// ✅ ENDPOINT: Salud con información de configuración
server.get('/health', (req, res, next) => {
    try {
        const cosmosInfo = cosmosService.getConfigInfo();
        const documentInfo = documentService.getConfigInfo();
        
        res.json({
            status: 'OK',
            timestamp: new Date().toISOString(),
            bot: 'Nova Bot con Cosmos DB y Azure Search',
            configuration: {
                appId: process.env.MicrosoftAppId ? 'Configurado' : 'Faltante',
                appPassword: process.env.MicrosoftAppPassword ? 'Configurado' : 'Faltante',
                tenantId: process.env.MicrosoftAppTenantId ? 'Configurado' : 'NO CONFIGURADO ⚠️',
                tenantValue: process.env.MicrosoftAppTenantId || 'none'
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

// ✅ ENDPOINT: Diagnóstico completo
server.get('/diagnostic', async (req, res) => {
    try {
        let cosmosStats = null;
        if (cosmosService.isAvailable()) {
            try {
                cosmosStats = await cosmosService.getStats();
            } catch (error) {
                console.warn('⚠️ Error obteniendo stats de Cosmos DB:', error.message);
            }
        }

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
            memory: {
                used: Math.round(process.memoryUsage().heapUsed / 1024 / 1024) + ' MB',
                total: Math.round(process.memoryUsage().heapTotal / 1024 / 1024) + ' MB'
            },
            uptime: Math.round(process.uptime()) + ' segundos',
            environment: {
                hasOpenAI: !!process.env.OPENAI_API_KEY,
                hasBotId: !!process.env.MicrosoftAppId,
                hasTenantId: !!process.env.MicrosoftAppTenantId,
                nodeVersion: process.version,
                cosmosConfigured: !!process.env.COSMOS_DB_ENDPOINT,
                azureSearchConfigured: !!(process.env.AZURE_SEARCH_ENDPOINT || process.env.SERVICE_ENDPOINT)
            },
            botFramework: {
                appId: process.env.MicrosoftAppId ? 'Configurado' : 'Faltante',
                appPassword: process.env.MicrosoftAppPassword ? 'Configurado' : 'Faltante',
                tenantId: process.env.MicrosoftAppTenantId ? 'Configurado' : 'Faltante',
                tenantValue: process.env.MicrosoftAppTenantId || 'No configurado'
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

// ✅ ENDPOINT: Stats de Cosmos DB
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

// ✅ DESARROLLO: Endpoint de limpieza (solo en desarrollo)
if (process.env.NODE_ENV === 'development') {
    server.post('/dev/cleanup', async (req, res) => {
        try {
            console.log('🧹 Iniciando limpieza de desarrollo...');
            
            let results = {
                memory_cleared: false,
                cosmos_available: cosmosService.isAvailable()
            };
            
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

// ✅ INFORMACIÓN DE CONFIGURACIÓN COMPLETA
console.log('\n═══════════════════════════════════════');
console.log('📋 CONFIGURACIÓN NOVA BOT');
console.log('═══════════════════════════════════════');
console.log('🔐 Login: Tarjeta personalizada con usuario/contraseña');
console.log('🌐 API Nova: https://pruebas.nova.com.mx/ApiRestNova/api/Auth/login');
console.log('🤖 OpenAI: ' + (process.env.OPENAI_API_KEY ? '✅ Configurado' : '❌ No configurado'));

// Bot Framework info
console.log('🔐 Bot Framework:');
console.log(`   App ID: ${process.env.MicrosoftAppId ? '✅ Configurado' : '❌ FALTANTE'}`);
console.log(`   App Password: ${process.env.MicrosoftAppPassword ? '✅ Configurado' : '❌ FALTANTE'}`);
console.log(`   Tenant ID: ${process.env.MicrosoftAppTenantId ? '✅ Configurado' : '⚠️ NO CONFIGURADO'}`);

if (process.env.MicrosoftAppTenantId) {
    console.log(`   Tenant: ${process.env.MicrosoftAppTenantId}`);
} else {
    console.log('   ⚠️ ADVERTENCIA: Sin Tenant ID pueden ocurrir errores AADSTS700016');
}

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

// ✅ VALIDACIÓN FINAL: Advertencias críticas
const criticalMissing = [];
if (!process.env.MicrosoftAppId) criticalMissing.push('MicrosoftAppId');
if (!process.env.MicrosoftAppPassword) criticalMissing.push('MicrosoftAppPassword');

if (criticalMissing.length > 0) {
    console.error('\n🚨 CONFIGURACIÓN CRÍTICA FALTANTE:');
    criticalMissing.forEach(varName => console.error(`   ❌ ${varName}`));
    console.error('\n   El bot NO funcionará sin estas variables.\n');
}

if (!process.env.MicrosoftAppTenantId) {
    console.warn('\n⚠️  TENANT ID NO CONFIGURADO:');
    console.warn('   Esto puede causar errores AADSTS700016');
    console.warn('   Agrega MicrosoftAppTenantId a tu .env');
    console.warn('   Obtén el Tenant ID desde Azure Portal > Azure AD > Properties\n');
    console.warn('✅ SOLUCIÓN RÁPIDA:');
    console.warn('   1. Ve a: https://portal.azure.com');
    console.warn('   2. Azure Active Directory > Properties > Tenant ID');
    console.warn('   3. Agrega a .env: MicrosoftAppTenantId=tu-tenant-id');
    console.warn('   4. Reinicia: npm start\n');
} else {
    console.log('\n✅ CONFIGURACIÓN COMPLETA - Bot listo para funcionar\n');
}