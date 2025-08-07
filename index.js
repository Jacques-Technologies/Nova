// index.js - SOLUCION COMPLETA para AADSTS700016 y OpenID 404
const path = require('path');
const restify = require('restify');
const axios = require('axios');
const { 
    BotFrameworkAdapter, 
    MemoryStorage, 
    ConversationState, 
    UserState   
} = require('botbuilder');
const { CosmosDbStorage } = require('botbuilder-azure');
// Importar servicios
const { TeamsBot } = require('./bots/teamsBot');
const cosmosService = require('./services/cosmosService');
const documentService = require('./services/documentService');

// Configurar variables de entorno
require('dotenv').config();

// ✅ PASO 1: VALIDACIÓN CRÍTICA
console.log('🔍 DIAGNÓSTICO AZURE AD - AADSTS700016');
console.log('═══════════════════════════════════════');

const appId = process.env.MicrosoftAppId;
const appPassword = process.env.MicrosoftAppPassword;
const tenantId = process.env.MicrosoftAppTenantId;

console.log(`🔑 App ID: ${appId ? '✅ Configurado' : '❌ FALTANTE'}`);
console.log(`🔒 App Password: ${appPassword ? '✅ Configurado' : '❌ FALTANTE'}`);
console.log(`🏢 Tenant ID: ${tenantId ? '✅ Configurado' : '❌ FALTANTE - CAUSA DEL ERROR'}`);

if (appId) {
    console.log(`   App ID Value: ${appId}`);
}
if (tenantId) {
    console.log(`   Tenant ID Value: ${tenantId}`);
} else {
    console.log('   ⚠️ CRITICAL: Tenant ID es REQUERIDO para evitar AADSTS700016');
}

// ✅ PASO 2: VERIFICAR VARIABLES CRÍTICAS
const requiredVars = ['MicrosoftAppId', 'MicrosoftAppPassword'];
const missingVars = requiredVars.filter(varName => !process.env[varName]);

if (missingVars.length > 0) {
    console.error('❌ Variables críticas faltantes:');
    missingVars.forEach(varName => console.error(`   ${varName}`));
    process.exit(1);
}

// ✅ PASO 3: VALIDAR TENANT ID CRÍTICO
if (!tenantId) {
    console.error('\n🚨 ERROR CRÍTICO: MicrosoftAppTenantId FALTANTE');
    console.error('Este es el problema que causa AADSTS700016');
    console.error('\n📋 PASOS PARA SOLUCIONARLO:');
    console.error('1. Ve a: https://portal.azure.com');
    console.error('2. Azure Active Directory > Properties > Tenant ID');
    console.error('3. Agrega a .env: MicrosoftAppTenantId=tu-tenant-id');
    console.error('4. Reinicia: npm start');
    console.error('\n⚠️ El bot NO funcionará sin Tenant ID');
    process.exit(1);
}

// ✅ FUNCIÓN PARA VERIFICAR TENANT ID
async function verifyTenantExists(tenantId) {
    try {
        const openIdUrl = `https://login.microsoftonline.com/${tenantId}/v2.0/.well-known/openid_configuration`;
        
        console.log(`🔍 Verificando OpenID endpoint: ${openIdUrl}`);
        
        const response = await axios.get(openIdUrl, { 
            timeout: 10000,
            validateStatus: (status) => status < 500
        });
        
        if (response.status === 200) {
            console.log(`✅ Tenant ID válido - OpenID config encontrada`);
            console.log(`   Issuer: ${response.data.issuer}`);
            return true;
        } else if (response.status === 404) {
            console.error(`❌ TENANT ID INVÁLIDO - OpenID config no encontrada (404)`);
            console.error(`   URL probada: ${openIdUrl}`);
            console.error(`   El Tenant ID "${tenantId}" no existe o no es accesible`);
            return false;
        } else {
            console.warn(`⚠️ Respuesta inesperada del OpenID endpoint: ${response.status}`);
            return false;
        }
        
    } catch (error) {
        if (error.response?.status === 404) {
            console.error(`❌ TENANT ID "${tenantId}" NO EXISTE`);
            console.error(`   Error 404: OpenID configuration no encontrada`);
            console.error(`   Verifica que el Tenant ID sea correcto en Azure Portal`);
        } else if (error.code === 'ENOTFOUND') {
            console.error(`❌ Error de conectividad verificando Tenant ID`);
            console.error(`   No se puede resolver DNS para login.microsoftonline.com`);
        } else {
            console.error(`⚠️ Error verificando Tenant ID: ${error.message}`);
        }
        return false;
    }
}

// ✅ PASO 4: CREAR SERVIDOR
const server = restify.createServer();
server.use(restify.plugins.bodyParser());

server.listen(process.env.port || process.env.PORT || 3978, () => {
    console.log(`\n${server.name} listening on ${server.url}`);
    console.log('✅ Bot Nova iniciado con configuración Azure AD correcta');
    console.log(`💾 Persistencia: ${cosmosService.isAvailable() ? 'Cosmos DB' : 'Memoria temporal'}`);
});

// ✅ DECLARACIÓN DE VARIABLES DE ALMACENAMIENTO
let storage;
let conversationState;
let userState;

// ✅ PASO 5: INICIALIZAR ALMACENAMIENTO Y BOT FRAMEWORK
async function initializeBot() {
    console.log('📦 Inicializando almacenamiento...');
    
    try {
        if (cosmosService.isAvailable()) {
    console.log('🌐 Configurando Cosmos DB Storage...');

    storage = new CosmosDbStorage({
        serviceEndpoint: process.env.COSMOS_DB_ENDPOINT,
        authKey: process.env.COSMOS_DB_KEY,
        databaseId: process.env.COSMOS_DB_DATABASE_ID,
        containerId: process.env.COSMOS_DB_CONTAINER_ID
    });

    console.log('✅ Cosmos DB Storage configurado exitosamente');

} else {
    console.warn('⚠️ Cosmos DB no disponible, usando MemoryStorage como fallback');
    storage = new MemoryStorage();
}       
        conversationState = new ConversationState(storage);
        userState = new UserState(storage);
        
        console.log(`✅ Estados inicializados con ${cosmosService.isAvailable() ? 'Cosmos DB' : 'MemoryStorage'}`);

        // ✅ CONFIGURAR ADAPTER DESPUÉS DE STORAGE
        console.log('\n🔐 Configurando Bot Framework Adapter...');

        // ✅ VERIFICAR TENANT ID ANTES DE USAR
        let tenantValid = true;
        if (tenantId) {
            console.log(`🔍 Verificando Tenant ID: ${tenantId}`);
            tenantValid = await verifyTenantExists(tenantId);
        }

        // ✅ CONFIGURACIÓN SIMPLIFICADA - Dejar que Bot Framework use endpoints por defecto
        const adapterConfig = {
            appId: appId,
            appPassword: appPassword
        };

        // ✅ SOLO agregar channelAuthTenant si tenemos un Tenant ID válido
        if (tenantId && tenantValid && tenantId !== 'common' && tenantId.length === 36) {
            adapterConfig.channelAuthTenant = tenantId;
            console.log(`✅ Configurando con Tenant específico: ${tenantId}`);
        } else {
            console.log('⚠️ Usando configuración multi-tenant (sin Tenant específico)');
            if (tenantId && !tenantValid) {
                console.warn('⚠️ Tenant ID proporcionado pero no es válido - usando multi-tenant');
            }
        }

        const adapter = new BotFrameworkAdapter(adapterConfig);

        console.log('✅ Adapter configurado:');
        console.log(`   App ID: ${appId}`);
        console.log(`   Has Password: ${!!appPassword}`);
        console.log(`   Channel Auth Tenant: ${adapterConfig.channelAuthTenant || 'multi-tenant'}`);
        console.log(`   OpenID Endpoint: https://login.microsoftonline.com/${adapterConfig.channelAuthTenant || 'common'}/v2.0/.well-known/openid_configuration`);

        // Configurar manejo de errores del adapter
        setupAdapterErrorHandling(adapter);

        // Crear bot
        const bot = new TeamsBot(conversationState, userState);
        
        // Configurar endpoint de mensajes
        server.post('/api/messages', async (req, res) => {
            try {
                await adapter.process(req, res, (context) => bot.run(context));
            } catch (error) {
                console.error('❌ Error procesando mensaje:', error);
                
                // Log adicional para errores de autenticación
                if (error.message && (error.message.includes('AADSTS') || error.message.includes('openID'))) {
                    console.error('🔐 Error de Azure AD en procesamiento de mensaje');
                    await generateDiagnosticReport();
                }
                
                res.status(500).send('Error interno del servidor - Ver logs para diagnóstico detallado');
            }
        });
        
        console.log('🎯 Bot listo para recibir mensajes');
        
    } catch (error) {
        console.error('❌ Error inicializando almacenamiento:', error.message);
        
        // Fallback a MemoryStorage
        storage = new MemoryStorage();
        conversationState = new ConversationState(storage);
        userState = new UserState(storage);
        console.log('✅ MemoryStorage configurado como fallback');
        
        // Continuar con la configuración del bot
        const adapter = new BotFrameworkAdapter({
            appId: appId,
            appPassword: appPassword
        });
        
        setupAdapterErrorHandling(adapter);
        const bot = new TeamsBot(conversationState, userState);
        
        server.post('/api/messages', async (req, res) => {
            try {
                await adapter.process(req, res, (context) => bot.run(context));
            } catch (error) {
                console.error('❌ Error procesando mensaje:', error);
                res.status(500).send('Error interno del servidor');
            }
        });
        
        console.log('🎯 Bot listo para recibir mensajes (con fallback)');
    }
}

// ✅ CONFIGURAR MANEJO DE ERRORES DEL ADAPTER
function setupAdapterErrorHandling(adapter) {
    adapter.onTurnError = async (context, error) => {
        console.error('\n❌ ===== ERROR BOT FRAMEWORK =====');
        console.error('Error:', error.message);
        console.error('Stack:', error.stack);
        
        // ✅ DIAGNÓSTICO ESPECÍFICO PARA ERROR OPENID 404
        if (error.message && error.message.includes('Failed to load openID config')) {
            console.error('\n🔐 ERROR OPENID CONFIG DETECTADO:');
            console.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
            console.error('📋 ERROR: Failed to load openID config: 404');
            console.error('\n🔍 POSIBLES CAUSAS:');
            console.error('   1. Tenant ID incorrecto o no existe');
            console.error('   2. Endpoint OpenID no accesible');
            console.error('   3. Problemas de conectividad');
            console.error('   4. Tenant deshabilitado o eliminado');
            
            console.error('\n✅ PASOS PARA RESOLVER:');
            console.error('   1. Verifica que el Tenant ID sea correcto');
            console.error('   2. Prueba el endpoint manualmente:');
            console.error(`      https://login.microsoftonline.com/${tenantId || 'TU-TENANT-ID'}/v2.0/.well-known/openid_configuration`);
            console.error('   3. Si el endpoint no funciona, el Tenant ID es incorrecto');
            console.error('   4. Obtén el Tenant ID correcto desde Azure Portal');
            console.error('   5. Ejecuta: npm run verify-tenant');
        }
        
        // ✅ DIAGNÓSTICO ESPECÍFICO PARA ERRORES AZURE AD
        else if (error.message && error.message.includes('AADSTS')) {
            console.error('\n🔐 ERROR DE AZURE AD DETECTADO:');
            console.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
            
            if (error.message.includes('AADSTS700016')) {
                console.error('📋 ERROR AADSTS700016 - ANÁLISIS DETALLADO:');
                console.error(`   App ID configurado: ${appId}`);
                console.error(`   Tenant configurado: ${tenantId}`);
                console.error('\n🔍 POSIBLES CAUSAS:');
                console.error('   1. App no registrada en este Tenant');
                console.error('   2. App registrada en otro Tenant');
                console.error('   3. App eliminada o deshabilitada');
                console.error('   4. Permisos de consentimiento faltantes');
                
            } else if (error.message.includes('AADSTS50020')) {
                console.error('📋 ERROR AADSTS50020 - Usuario no existe en tenant');
                console.error('   Verifica que uses el tenant correcto');
            } else if (error.message.includes('AADSTS90002')) {
                console.error('📋 ERROR AADSTS90002 - Tenant no encontrado');
                console.error('   Verifica que el Tenant ID sea válido');
            }
            
            console.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
            
            // ✅ GENERAR REPORTE DE DIAGNÓSTICO
            await generateDiagnosticReport();
        }
        
        // Responder al usuario
        try {
            await context.sendActivity(
                '❌ **Error de autenticación del bot**\n\n' +
                'Hay un problema con la configuración de Azure AD. ' +
                'Por favor contacta al administrador del sistema.\n\n' +
                '**Error técnico**: ' + (error.message.includes('openID') ? 
                    'OpenID Config no encontrada - Tenant ID inválido' : 
                    'Error de autenticación Azure AD')
            );
        } catch (sendError) {
            console.error('Error enviando mensaje de error:', sendError);
        }
        
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
}

// ✅ FUNCIÓN DE DIAGNÓSTICO COMPLETO
async function generateDiagnosticReport() {
    console.log('\n📊 ===== REPORTE DE DIAGNÓSTICO AZURE AD =====');
    
    const report = {
        timestamp: new Date().toISOString(),
        configuration: {
            appId: appId,
            hasAppPassword: !!appPassword,
            tenantId: tenantId,
            nodeVersion: process.version,
            environment: process.env.NODE_ENV || 'development'
        },
        endpoints: {
            oauthEndpoint: `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`,
            openIdMetadata: `https://login.microsoftonline.com/${tenantId}/v2.0/.well-known/openid_configuration`,
            azurePortalApp: `https://portal.azure.com/#blade/Microsoft_AAD_RegisteredApps/ApplicationMenuBlade/Overview/appId/${appId}/isMSAApp/`
        },
        recommendations: [
            'Verifica que la aplicación existe en Azure Portal',
            'Confirma que el Tenant ID es correcto',
            'Asegúrate de que la app tiene permisos de Bot Framework',
            'Verifica que no haya sido eliminada la aplicación'
        ]
    };
    
    console.log('📋 Configuración actual:');
    console.log(JSON.stringify(report.configuration, null, 2));
    
    console.log('\n🔗 Enlaces útiles:');
    console.log(`   Azure Portal App: ${report.endpoints.azurePortalApp}`);
    console.log(`   OAuth Endpoint: ${report.endpoints.oauthEndpoint}`);
    
    console.log('\n📝 Recomendaciones:');
    report.recommendations.forEach((rec, index) => {
        console.log(`   ${index + 1}. ${rec}`);
    });
    
    console.log('════════════════════════════════════════════════\n');
    
    return report;
}

// ✅ INICIALIZACIÓN ASYNC DEL BOT
initializeBot().then(() => {
    console.log('🎉 Inicialización completada exitosamente');
}).catch(error => {
    console.error('💥 Error crítico inicializando bot:', error);
    process.exit(1);
});

// ✅ ENDPOINTS DE SALUD Y DIAGNÓSTICO
server.get('/health', (req, res, next) => {
    try {
        const cosmosInfo = cosmosService.getConfigInfo();
        const documentInfo = documentService.getConfigInfo();
        
        res.json({
            status: 'OK',
            timestamp: new Date().toISOString(),
            bot: 'Nova Bot con Diagnóstico Azure AD',
            azureAdConfig: {
                appId: appId ? 'Configurado' : 'Faltante',
                appPassword: appPassword ? 'Configurado' : 'Faltante',
                tenantId: tenantId ? 'Configurado' : 'FALTANTE - CRÍTICO',
                tenantValue: tenantId || 'none',
                channelAuthTenant: tenantId ? 'Configurado' : 'FALTANTE',
                oauthEndpoint: tenantId ? `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token` : 'No configurado'
            },
            diagnosticUrls: {
                azurePortalApp: appId ? `https://portal.azure.com/#blade/Microsoft_AAD_RegisteredApps/ApplicationMenuBlade/Overview/appId/${appId}/isMSAApp/` : 'No disponible',
                azureTenant: tenantId ? `https://portal.azure.com/#blade/Microsoft_AAD_IAM/ActiveDirectoryMenuBlade/Properties/directoryId/${tenantId}` : 'No disponible'
            },
            features: {
                customLogin: true,
                oauth: false,
                azure: true,
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

// ✅ ENDPOINT DE DIAGNÓSTICO AZURE AD ESPECÍFICO
server.get('/azure-diagnostic', async (req, res) => {
    try {
        console.log('📊 Ejecutando diagnóstico Azure AD...');
        
        const diagnosticReport = await generateDiagnosticReport();
        
        // ✅ AGREGAR VERIFICACIÓN DE OPENID ENDPOINT
        if (tenantId) {
            try {
                const openIdUrl = `https://login.microsoftonline.com/${tenantId}/v2.0/.well-known/openid_configuration`;
                const openIdResponse = await axios.get(openIdUrl, { 
                    timeout: 10000,
                    validateStatus: (status) => status < 500
                });
                
                diagnosticReport.openIdTest = {
                    url: openIdUrl,
                    status: openIdResponse.status,
                    accessible: openIdResponse.status === 200,
                    issuer: openIdResponse.data?.issuer || 'Unknown'
                };
                
                if (openIdResponse.status === 200) {
                    console.log('✅ OpenID config accesible');
                } else {
                    console.error(`❌ OpenID config error: ${openIdResponse.status}`);
                }
                
            } catch (openIdError) {
                diagnosticReport.openIdTest = {
                    url: `https://login.microsoftonline.com/${tenantId}/v2.0/.well-known/openid_configuration`,
                    status: openIdError.response?.status || 0,
                    accessible: false,
                    error: openIdError.message,
                    recommendation: openIdError.response?.status === 404 ? 
                        'Tenant ID es incorrecto o no existe' : 
                        'Problema de conectividad'
                };
                console.error(`❌ Error probando OpenID: ${openIdError.message}`);
            }
        } else {
            diagnosticReport.openIdTest = {
                accessible: false,
                error: 'No Tenant ID configured',
                recommendation: 'Configure MicrosoftAppTenantId en .env'
            };
        }
        
        res.json(diagnosticReport);
    } catch (error) {
        console.error('❌ Error en endpoint /azure-diagnostic:', error);
        res.status(500).json({ 
            error: 'Error generating diagnostic report',
            details: error.message 
        });
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
            azureAD: {
                configured: !!tenantId,
                appId: appId,
                tenantId: tenantId,
                hasPassword: !!appPassword,
                oauthEndpoint: tenantId ? `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token` : null,
                portalUrl: appId ? `https://portal.azure.com/#blade/Microsoft_AAD_RegisteredApps/ApplicationMenuBlade/Overview/appId/${appId}/isMSAApp/` : null
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
                tenantId: process.env.MicrosoftAppTenantId ? 'Configurado' : 'FALTANTE - CAUSA AADSTS700016',
                tenantValue: process.env.MicrosoftAppTenantId || 'No configurado - CRÍTICO'
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

// ✅ INFORMACIÓN FINAL CON DIAGNÓSTICO AZURE AD
console.log('\n═══════════════════════════════════════');
console.log('📋 CONFIGURACIÓN NOVA BOT - DIAGNÓSTICO COMPLETO');
console.log('═══════════════════════════════════════');

console.log('🔐 Azure AD Bot Framework:');
console.log(`   App ID: ${appId ? '✅ Configurado' : '❌ FALTANTE'}`);
console.log(`   App Password: ${appPassword ? '✅ Configurado' : '❌ FALTANTE'}`);
console.log(`   Tenant ID: ${tenantId ? '✅ Configurado' : '❌ FALTANTE - CAUSA AADSTS700016'}`);
console.log(`   Channel Auth Tenant: ${tenantId ? '✅ Configurado' : '❌ FALTANTE'}`);

if (appId) {
    console.log(`   Azure Portal: https://portal.azure.com/#blade/Microsoft_AAD_RegisteredApps/ApplicationMenuBlade/Overview/appId/${appId}/isMSAApp/`);
}

console.log('🤖 Login: Tarjeta personalizada con usuario/contraseña');
console.log('🌐 API Nova: https://pruebas.nova.com.mx/ApiRestNova/api/Auth/login');
console.log('🤖 OpenAI: ' + (process.env.OPENAI_API_KEY ? '✅ Configurado' : '❌ No configurado'));

// Información de servicios
if (process.env.COSMOS_DB_ENDPOINT) {
    console.log('💾 Cosmos DB: ✅ Configurado');
    console.log(`   Estado: ${cosmosService.isAvailable() ? '🟢 Disponible' : '🔴 Error de conexión'}`);
} else {
    console.log('💾 Cosmos DB: ❌ No configurado (usando MemoryStorage)');
}

const searchEndpoint = process.env.AZURE_SEARCH_ENDPOINT || process.env.SERVICE_ENDPOINT;
if (searchEndpoint) {
    console.log('🔍 Azure Search: ✅ Configurado');
    console.log(`   Estado: ${documentService.isAvailable() ? '🟢 Disponible' : '🔴 Error de conexión'}`);
} else {
    console.log('🔍 Azure Search: ❌ No configurado');
}

console.log('📊 Endpoints disponibles:');
console.log('   GET /health - Estado general');
console.log('   GET /diagnostic - Diagnóstico completo');
console.log('   GET /azure-diagnostic - Diagnóstico específico Azure AD');
console.log('   GET /cosmos-stats - Estadísticas Cosmos DB');

console.log('═══════════════════════════════════════');

// ✅ VALIDACIÓN FINAL CRÍTICA
if (!tenantId) {
    console.error('\n🚨 CONFIGURACIÓN INCOMPLETA - BOT NO FUNCIONARÁ');
    console.error('El error AADSTS700016 seguirá ocurriendo sin MicrosoftAppTenantId');
    console.error('Agrega el Tenant ID al archivo .env y reinicia el bot');
} else {
    console.log('\n✅ CONFIGURACIÓN AZURE AD COMPLETA - Bot listo para funcionar\n');
}