// index.js - CORREGIDO con Tenant ID
const path = require('path');
const restify = require('restify');
const { 
    BotFrameworkAdapter, 
    MemoryStorage, 
    ConversationState, 
    UserState, 
    CosmosDbPartitionedStorage,
    AuthenticationConfiguration // ✅ IMPORTANTE para tenant ID
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

// ✅ CORREGIDO: Crear adaptador del Bot Framework con Tenant ID
const adapterConfig = {
    appId: process.env.MicrosoftAppId,
    appPassword: process.env.MicrosoftAppPassword
};

// ✅ NUEVO: Agregar Tenant ID si está disponible
if (process.env.MicrosoftAppTenantId) {
    // Opción 1: Usar AuthenticationConfiguration (recomendado)
    adapterConfig.authConfig = new AuthenticationConfiguration([], {
        requiredEndorsements: [],
        claimsValidation: {},
        tenantId: process.env.MicrosoftAppTenantId
    });
    
    console.log(`🔐 Tenant ID configurado: ${process.env.MicrosoftAppTenantId}`);
} else {
    console.warn('⚠️ Tenant ID no configurado - usando configuración básica');
}

const adapter = new BotFrameworkAdapter(adapterConfig);

// ✅ MEJORADO: Manejo de errores del adaptador con información de Tenant
adapter.onTurnError = async (context, error) => {
    console.error('❌ Error en bot:', error);
    
    // ✅ DIAGNÓSTICO: Errores específicos de autenticación
    if (error.message && error.message.includes('AADSTS')) {
        console.error('🔐 Error de autenticación Azure AD detectado:');
        console.error('   Posibles causas:');
        console.error('   • Tenant ID incorrecto o faltante');
        console.error('   • App no registrada en el tenant correcto'); 
        console.error('   • Permisos insuficientes en Azure AD');
        console.error(`   • Verificar configuración: AppId=${process.env.MicrosoftAppId?.substring(0,8)}...`);
        console.error(`   • Tenant configurado: ${process.env.MicrosoftAppTenantId || 'NO CONFIGURADO'}`);
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

// ===== RESTO DEL CÓDIGO MANTENER IGUAL =====

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

// ✅ MEJORADO: Endpoint de salud con información de configuración
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

// ===== MANTENER RESTO DE ENDPOINTS IGUAL =====

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
                hasTenantId: !!process.env.MicrosoftAppTenantId, // ✅ NUEVO
                nodeVersion: process.version,
                cosmosConfigured: !!process.env.COSMOS_DB_ENDPOINT,
                azureSearchConfigured: !!(process.env.AZURE_SEARCH_ENDPOINT || process.env.SERVICE_ENDPOINT)
            },
            botFramework: { // ✅ NUEVO
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

// ===== MANTENER RESTO DEL CÓDIGO =====

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

// ✅ MEJORADO: Información de configuración con Tenant ID
console.log('\n═══════════════════════════════════════');
console.log('📋 CONFIGURACIÓN NOVA BOT');
console.log('═══════════════════════════════════════');
console.log('🔐 Login: Tarjeta personalizada con usuario/contraseña');
console.log('🌐 API Nova: https://pruebas.nova.com.mx/ApiRestNova/api/Auth/login');
console.log('🤖 OpenAI: ' + (process.env.OPENAI_API_KEY ? '✅ Configurado' : '❌ No configurado'));

// ✅ INFORMACIÓN DE BOT FRAMEWORK
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
}