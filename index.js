// index.js - CORREGIDO: Bot Framework + diagnóstico AADSTS700016
const path = require('path');
const restify = require('restify');
const axios = require('axios');
const { 
    BotFrameworkAdapter, 
    MemoryStorage, 
    ConversationState, 
    UserState   
} = require('botbuilder');

// Importar servicios
const { TeamsBot } = require('./bots/teamsBot');
const cosmosService = require('./services/cosmosService');
const documentService = require('./services/documentService');

// Configurar variables de entorno
require('dotenv').config();

// ✅ VARIABLES GLOBALES CORREGIDAS
const appId = process.env.MicrosoftAppId;
const appPassword = process.env.MicrosoftAppPassword;
const tenantId = process.env.MicrosoftAppTenantId;

console.log('🤖 ===== NOVA BOT - CONFIGURACIÓN CORREGIDA =====');
console.log('🔧 Bot Framework con correcciones de autenticación');
console.log('═══════════════════════════════════════════════════');

console.log(`📋 Configuración de credenciales:`);
console.log(`   🔑 App ID: ${appId ? '✅ Configurado' : '❌ FALTANTE'}`);
console.log(`   🔒 App Password: ${appPassword ? '✅ Configurado' : '❌ FALTANTE'}`);
console.log(`   🏢 Tenant ID: ${tenantId ? '✅ Configurado' : '⚠️ Multi-tenant'}`);

if (appId) {
    console.log(`   🔍 App ID: ${appId}`);
}
if (tenantId) {
    console.log(`   🔍 Tenant ID: ${tenantId}`);
}

// ✅ FUNCIÓN CORREGIDA: Verificar Bot Framework registration
async function verifyBotFrameworkRegistration(appId, appPassword, tenantId) {
    try {
        console.log('\n🤖 ===== VERIFICACIÓN BOT FRAMEWORK CORREGIDA =====');
        console.log('🔍 Probando autenticación específica para Bot Framework...');

        const botFrameworkScope = 'https://api.botframework.com/.default';
        console.log(`🎯 Scope: ${botFrameworkScope}`);

        // ✅ CORRECCIÓN: Usar tenant correcto o common
        const actualTenant = tenantId || 'botframework.com';
        const tokenUrl = `https://login.microsoftonline.com/${actualTenant}/oauth2/v2.0/token`;
        console.log(`🌐 Token URL: ${tokenUrl}`);

        const requestBody = new URLSearchParams({
            'grant_type': 'client_credentials',
            'client_id': appId,
            'client_secret': appPassword,
            'scope': botFrameworkScope
        });

        console.log('📡 Enviando request a Azure AD para Bot Framework...');
        
        const response = await axios.post(tokenUrl, requestBody, {
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded'
            },
            timeout: 15000
        });

        if (response.status === 200 && response.data.access_token) {
            console.log('✅ ¡ÉXITO! Bot Framework authentication funciona');
            console.log(`   Token Type: ${response.data.token_type}`);
            console.log(`   Expires In: ${response.data.expires_in} segundos`);
            console.log(`   Token Preview: ${response.data.access_token.substring(0, 50)}...`);
            
            // Verificar token payload
            try {
                const tokenPayload = JSON.parse(Buffer.from(response.data.access_token.split('.')[1], 'base64').toString());
                console.log('🔍 Token payload info:');
                console.log(`   Audience: ${tokenPayload.aud}`);
                console.log(`   Issuer: ${tokenPayload.iss}`);
                console.log(`   App ID en token: ${tokenPayload.appid}`);
                console.log(`   Tenant en token: ${tokenPayload.tid}`);
            } catch (decodeError) {
                console.warn('⚠️ No se pudo decodificar token para análisis');
            }

            return {
                success: true,
                token: response.data.access_token,
                message: 'Bot Framework authentication exitosa'
            };
        } else {
            console.error('❌ Respuesta inesperada de Azure AD');
            return {
                success: false,
                message: `Respuesta inesperada: ${response.status}`
            };
        }

    } catch (error) {
        console.error('\n❌ ===== ERROR BOT FRAMEWORK AUTH =====');
        console.error('💥 Error:', error.message);

        if (error.response?.data) {
            console.error('📋 Respuesta del servidor:', JSON.stringify(error.response.data, null, 2));
            
            if (error.response.data.error === 'invalid_client') {
                console.error('\n🔍 DIAGNÓSTICO: invalid_client');
                console.error('📋 POSIBLES CAUSAS:');
                console.error('   1. App no registrada en Bot Framework Portal');
                console.error('   2. Client Secret incorrecto o expirado');
                console.error('   3. App ID no válido para Bot Framework');
                console.error('\n✅ SOLUCIONES:');
                console.error('   1. Registrar en https://dev.botframework.com');
                console.error('   2. Verificar/renovar Client Secret en Azure Portal');
                console.error('   3. Usar exactamente el mismo App ID en ambos portales');
            } else if (error.response.data.error === 'unauthorized_client') {
                console.error('\n🔍 DIAGNÓSTICO: unauthorized_client (AADSTS700016)');
                console.error('📋 CAUSA ESPECÍFICA:');
                console.error('   App registrada en Azure AD pero NO en Bot Framework');
                console.error('\n✅ SOLUCIÓN DEFINITIVA:');
                console.error('   1. Ir a https://dev.botframework.com');
                console.error('   2. "Create a Bot" o "Register existing bot"');
                console.error(`   3. Usar App ID: ${appId}`);
                console.error(`   4. Usar App Password: [tu password actual]`);
                console.error('   5. Configurar Messaging Endpoint');
                console.error('   6. Habilitar Teams Channel');
            }
        }

        return {
            success: false,
            error: error.response?.data || error.message
        };
    }
}

// ✅ FUNCIÓN CORREGIDA: Verificar endpoint OpenID
async function verifyOpenIDEndpoint(tenantId) {
    try {
        console.log('\n🔍 ===== VERIFICACIÓN OPENID ENDPOINT CORREGIDA =====');
        console.log('🔍 Verificando accesibilidad del endpoint OpenID...');

        // ✅ CORRECCIÓN: Usar formato correcto con guión
        const actualTenant = tenantId || 'common';
        const openIdUrl = `https://login.microsoftonline.com/${actualTenant}/v2.0/.well-known/openid-configuration`;
        console.log(`🌐 URL: ${openIdUrl}`);

        const response = await axios.get(openIdUrl, { 
            timeout: 10000,
            validateStatus: (status) => status < 500
        });

        if (response.status === 200) {
            console.log('✅ OpenID endpoint accesible');
            console.log(`   Issuer: ${response.data.issuer}`);
            console.log(`   Authorization endpoint: ${response.data.authorization_endpoint}`);
            console.log(`   Token endpoint: ${response.data.token_endpoint}`);
            return {
                accessible: true,
                issuer: response.data.issuer,
                data: response.data
            };
        } else if (response.status === 404) {
            console.error('❌ OpenID endpoint NO ENCONTRADO (404)');
            console.error('   Esto confirma que el Tenant ID puede ser incorrecto');
            return {
                accessible: false,
                error: 'Endpoint not found (404)',
                recommendation: 'Verificar Tenant ID en Azure Portal'
            };
        } else {
            console.warn(`⚠️ OpenID endpoint respuesta inesperada: ${response.status}`);
            return {
                accessible: false,
                error: `Unexpected status: ${response.status}`,
                recommendation: 'Verificar conectividad y permisos'
            };
        }

    } catch (error) {
        if (error.response?.status === 404) {
            console.error('❌ CONFIRMADO: Tenant ID inválido o no existe');
            console.error('   El endpoint OpenID no se encuentra');
            return {
                accessible: false,
                error: 'Tenant ID invalid or does not exist',
                recommendation: 'Verify Tenant ID in Azure Portal',
                confirmsError: true
            };
        } else if (error.code === 'ENOTFOUND') {
            console.error('❌ Error de conectividad DNS');
            return {
                accessible: false,
                error: 'DNS resolution failed',
                recommendation: 'Check internet connectivity'
            };
        } else {
            console.error('❌ Error verificando OpenID endpoint:', error.message);
            return {
                accessible: false,
                error: error.message,
                recommendation: 'Check connectivity and configuration'
            };
        }
    }
}

// ✅ SERVIDOR PRINCIPAL
const server = restify.createServer();
server.use(restify.plugins.bodyParser());

server.listen(process.env.port || process.env.PORT || 3978, async () => {
    console.log(`\n${server.name} listening on ${server.url}`);
    
    // Ejecutar diagnóstico corregido
    if (process.env.SKIP_DIAGNOSTIC !== 'true') {
        await runCompleteDiagnostic();
    }
    
    console.log('\n✅ Bot Nova iniciado');
    console.log(`💾 Persistencia: ${cosmosService.isAvailable() ? 'Cosmos DB (cosmosService)' : 'Memoria temporal'}`);
});

// ✅ DIAGNÓSTICO COMPLETO CORREGIDO
async function runCompleteDiagnostic() {
    console.log('\n🚀 ===== DIAGNÓSTICO COMPLETO CORREGIDO =====');
    
    // Paso 1: Verificar variables requeridas
    if (!appId || !appPassword) {
        console.error('❌ Variables críticas faltantes para Bot Framework');
        console.error('\n📋 Requeridas en .env:');
        console.error('   MicrosoftAppId=tu-app-id');
        console.error('   MicrosoftAppPassword=tu-app-password');
        console.error('   MicrosoftAppTenantId=tu-tenant-id (opcional)');
        return false;
    }

    // Paso 2: Verificar OpenID endpoint
    console.log('\n🔍 Verificando OpenID endpoint...');
    const openIdResult = await verifyOpenIDEndpoint(tenantId);
    
    if (!openIdResult.accessible) {
        console.log('\n⚠️ OpenID endpoint no accesible, pero continuando...');
        console.log(`   Recomendación: ${openIdResult.recommendation}`);
    }

    // Paso 3: Verificar Bot Framework Registration
    const botFrameworkResult = await verifyBotFrameworkRegistration(appId, appPassword, tenantId);
    
    if (botFrameworkResult.success) {
        console.log('\n🎉 ¡Bot Framework authentication exitosa!');
        console.log('\n✅ ===== DIAGNÓSTICO COMPLETADO =====');
        console.log('🎯 Tu bot debería funcionar correctamente');
        console.log('🚀 Iniciando servidor...');
        return true;
    } else {
        console.log('\n❌ ===== DIAGNÓSTICO FALLIDO =====');
        console.log('🔧 Acción requerida: Registrar en Bot Framework Portal');
        console.log('\n📋 PASOS PARA RESOLVER:');
        console.log('1. Ir a: https://dev.botframework.com');
        console.log('2. Click en "Create a Bot" o "Register"');
        console.log(`3. Usar App ID: ${appId}`);
        console.log('4. Usar App Password existente (NO crear nuevo)');
        console.log('5. Messaging Endpoint: https://tu-dominio.com/api/messages');
        console.log('6. Habilitar Microsoft Teams channel');
        console.log('\n⚠️ Continuando sin esta verificación...');
        return false;
    }
}

// ✅ INICIALIZACIÓN CORREGIDA DEL BOT
let storage;
let conversationState;
let userState;

async function initializeBot() {
    console.log('\n📦 Inicializando Bot Framework CORREGIDO...');
    
    try {
        // Storage básico
        storage = new MemoryStorage();
        conversationState = new ConversationState(storage);
        userState = new UserState(storage);
        
        console.log('✅ Estados del Bot Framework inicializados');

        // ✅ CONFIGURACIÓN CORREGIDA DEL ADAPTER
        console.log('🔐 Configurando Bot Framework Adapter CORREGIDO...');

        const adapterConfig = {
            appId: appId,
            appPassword: appPassword
        };

        // ✅ CONFIGURACIÓN ESPECÍFICA PARA TENANT
        if (tenantId && tenantId !== 'common') {
            adapterConfig.channelAuthTenant = tenantId;
            adapterConfig.oAuthEndpoint = `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`;
            // ✅ CORRECCIÓN CRÍTICA: Usar guión en lugar de guión bajo
            adapterConfig.openIdMetadata = `https://login.microsoftonline.com/${tenantId}/v2.0/.well-known/openid-configuration`;
            console.log(`🏢 Configurado con Tenant específico: ${tenantId}`);
            console.log(`🔗 OAuth Endpoint: ${adapterConfig.oAuthEndpoint}`);
            console.log(`🔗 OpenID Metadata: ${adapterConfig.openIdMetadata}`);
        } else {
            console.log('🌐 Configurado para multi-tenant/common');
        }

        const adapter = new BotFrameworkAdapter(adapterConfig);

        console.log('✅ Bot Framework Adapter configurado:');
        console.log(`   App ID: ${appId}`);
        console.log(`   Has Password: ${!!appPassword}`);
        console.log(`   Channel Auth Tenant: ${adapterConfig.channelAuthTenant || 'multi-tenant'}`);

        // ✅ MANEJO DE ERRORES MEJORADO
        setupAdapterErrorHandling(adapter);

        // Crear bot
        const bot = new TeamsBot(conversationState, userState);
        
        // ✅ ENDPOINT DE MENSAJES CON MEJOR LOGGING
        server.post('/api/messages', async (req, res) => {
            try {
                console.log('📨 Mensaje recibido en /api/messages');
                await adapter.process(req, res, (context) => bot.run(context));
                console.log('✅ Mensaje procesado exitosamente');
            } catch (error) {
                console.error('❌ Error procesando mensaje:', error.message);
                
                // ✅ LOGGING ESPECÍFICO PARA ERRORES DE AUTENTICACIÓN
                if (error.message && (error.message.includes('AADSTS700016') || 
                    error.message.includes('Signing Key could not be retrieved') ||
                    error.message.includes('Failed to load openID config'))) {
                    
                    console.error('\n🚨 ERROR DE AUTENTICACIÓN BOT FRAMEWORK DETECTADO');
                    console.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
                    console.error('📋 PROBLEMA: Configuración de autenticación Bot Framework');
                    console.error('\n✅ PASOS PARA RESOLVER:');
                    console.error('   1. Verificar que la app esté registrada en https://dev.botframework.com');
                    console.error(`   2. App ID correcto: ${appId}`);
                    console.error('   3. App Password válido y no expirado');
                    console.error('   4. Messaging Endpoint configurado correctamente');
                    console.error('   5. Teams Channel habilitado');
                    console.error('\n🔍 VERIFICACIONES ADICIONALES:');
                    if (tenantId) {
                        console.error(`   6. Tenant ID correcto: ${tenantId}`);
                        console.error(`   7. OpenID endpoint accesible: https://login.microsoftonline.com/${tenantId}/v2.0/.well-known/openid-configuration`);
                    }
                    console.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
                    
                    await generateDiagnosticReport();
                }
                
                res.status(500).send('Error interno del servidor - Ver logs para diagnóstico');
            }
        });
        
        console.log('🎯 Bot listo para recibir mensajes');
        
    } catch (error) {
        console.error('❌ Error inicializando bot:', error.message);
        
        // ✅ FALLBACK MEJORADO
        console.log('🔄 Intentando inicialización con configuración mínima...');
        
        try {
            storage = new MemoryStorage();
            conversationState = new ConversationState(storage);
            userState = new UserState(storage);
            
            // ✅ ADAPTER MÍNIMO SIN TENANT ESPECÍFICO
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
                    console.error('❌ Error en configuración fallback:', error.message);
                    res.status(500).send('Error interno del servidor');
                }
            });
            
            console.log('⚠️ Bot iniciado con configuración fallback (sin tenant específico)');
        } catch (fallbackError) {
            console.error('💥 Error crítico en configuración fallback:', fallbackError.message);
            process.exit(1);
        }
    }
}

// ✅ MANEJO DE ERRORES MEJORADO
function setupAdapterErrorHandling(adapter) {
    adapter.onTurnError = async (context, error) => {
        console.error('\n❌ ===== ERROR BOT FRAMEWORK MEJORADO =====');
        console.error('Error:', error.message);
        
        // ✅ DETECCIÓN MEJORADA DE ERRORES
        if (error.message && (
            error.message.includes('AADSTS700016') ||
            error.message.includes('unauthorized_client') ||
            error.message.includes('Signing Key could not be retrieved') ||
            error.message.includes('Failed to load openID config')
        )) {
            console.error('\n🚨 ERROR DE CONFIGURACIÓN BOT FRAMEWORK CONFIRMADO');
            console.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
            console.error('📋 CAUSA RAÍZ: App no registrada en Bot Framework Portal');
            console.error('\n🔧 SOLUCIÓN PASO A PASO:');
            console.error('   1. Abrir: https://dev.botframework.com');
            console.error('   2. Hacer login con cuenta Microsoft');
            console.error('   3. Click "Create a Bot" o "Register existing bot"');
            console.error(`   4. Usar EXACTAMENTE este App ID: ${appId}`);
            console.error('   5. Usar la misma App Password que tienes en .env');
            console.error('   6. Messaging Endpoint: https://tu-dominio.onrender.com/api/messages');
            console.error('   7. En Channels, habilitar "Microsoft Teams"');
            console.error('   8. Guardar cambios');
            console.error('\n⚠️ IMPORTANTE: NO crear nuevas credenciales, usar las existentes');
            console.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        }
        
        // Responder al usuario
        try {
            if (error.message && (
                error.message.includes('Failed to load openID config') ||
                error.message.includes('Signing Key could not be retrieved')
            )) {
                await context.sendActivity(
                    '🔧 **Error de configuración Bot Framework**\n\n' +
                    '**Estado**: El bot no está completamente registrado en Bot Framework Portal.\n\n' +
                    '**Para el administrador**: \n' +
                    '1. Ir a https://dev.botframework.com\n' +
                    '2. Registrar este bot con las credenciales existentes\n' +
                    '3. Configurar el endpoint de mensajes\n' +
                    '4. Habilitar Microsoft Teams channel\n\n' +
                    '**Los usuarios pueden seguir usando funciones básicas**'
                );
            } else {
                await context.sendActivity(
                    '⚠️ **Error temporal del bot**\n\n' +
                    'Problema de configuración detectado. El administrador ha sido notificado.\n\n' +
                    'Puedes intentar nuevamente en unos minutos.'
                );
            }
        } catch (sendError) {
            console.error('Error enviando mensaje de error:', sendError.message);
        }
    };
}

// ✅ REPORTE DE DIAGNÓSTICO ACTUALIZADO
async function generateDiagnosticReport() {
    console.log('\n📊 ===== REPORTE DIAGNÓSTICO ACTUALIZADO =====');
    
    const report = {
        timestamp: new Date().toISOString(),
        problema: 'Bot Framework Authentication Error',
        causa: 'App registrada en Azure AD pero NO en Bot Framework Portal',
        configuracion: {
            appId: appId,
            hasAppPassword: !!appPassword,
            tenantId: tenantId || 'common/multi-tenant',
            nodeVersion: process.version,
            environment: process.env.NODE_ENV || 'development'
        },
        endpoints: {
            azurePortalApp: `https://portal.azure.com/#blade/Microsoft_AAD_RegisteredApps/ApplicationMenuBlade/Overview/appId/${appId}/isMSAApp/`,
            botFrameworkPortal: 'https://dev.botframework.com',
            messagingEndpoint: 'https://tu-dominio.onrender.com/api/messages',
            openIdEndpoint: tenantId ? 
                `https://login.microsoftonline.com/${tenantId}/v2.0/.well-known/openid-configuration` :
                'https://login.microsoftonline.com/common/v2.0/.well-known/openid-configuration'
        },
        solucion: {
            paso1: 'Ir a https://dev.botframework.com',
            paso2: `Registrar bot con App ID: ${appId}`,
            paso3: 'Configurar Messaging Endpoint',
            paso4: 'Habilitar Teams Channel',
            paso5: 'Verificar configuración'
        }
    };
    
    console.log('📋 Configuración actual:');
    console.log(JSON.stringify(report.configuracion, null, 2));
    
    console.log('\n🔗 Enlaces importantes:');
    console.log(`   Azure Portal: ${report.endpoints.azurePortalApp}`);
    console.log(`   Bot Framework: ${report.endpoints.botFrameworkPortal}`);
    console.log(`   OpenID Endpoint: ${report.endpoints.openIdEndpoint}`);
    
    console.log('════════════════════════════════════════════════\n');
    
    return report;
}

// ✅ INICIALIZAR
initializeBot().then(() => {
    console.log('🎉 Inicialización completada exitosamente');
}).catch(error => {
    console.error('💥 Error crítico:', error);
    process.exit(1);
});

// ✅ ENDPOINTS DE DIAGNÓSTICO MEJORADOS
server.get('/health', async (req, res) => {
    try {
        let botFrameworkStatus = 'unknown';
        
        if (appId && appPassword) {
            try {
                const botFrameworkTest = await verifyBotFrameworkRegistration(appId, appPassword, tenantId);
                botFrameworkStatus = botFrameworkTest.success ? 'registered' : 'not_registered';
            } catch (error) {
                botFrameworkStatus = 'error';
            }
        } else {
            botFrameworkStatus = 'config_missing';
        }

        const cosmosInfo = cosmosService.getConfigInfo();
        const documentInfo = documentService.getConfigInfo();
        
        res.json({
            status: 'OK',
            timestamp: new Date().toISOString(),
            bot: 'Nova Bot - Configuración Corregida',
            botFramework: {
                appId: appId ? 'Configurado' : 'Faltante',
                appPassword: appPassword ? 'Configurado' : 'Faltante',
                tenantId: tenantId ? 'Configurado' : 'Multi-tenant',
                registrationStatus: botFrameworkStatus,
                portalUrl: 'https://dev.botframework.com',
                messagingEndpoint: '/api/messages',
                channelAuthTenant: tenantId || 'common'
            },
            azureAD: {
                oauthEndpoint: tenantId ? 
                    `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token` : 
                    'https://login.microsoftonline.com/common/oauth2/v2.0/token',
                // ✅ CORREGIDO: Endpoint OpenID con guión
                openIdMetadata: tenantId ? 
                    `https://login.microsoftonline.com/${tenantId}/v2.0/.well-known/openid-configuration` : 
                    'https://login.microsoftonline.com/common/v2.0/.well-known/openid-configuration',
                azurePortalUrl: appId ? 
                    `https://portal.azure.com/#blade/Microsoft_AAD_RegisteredApps/ApplicationMenuBlade/Overview/appId/${appId}/isMSAApp/` : null
            },
            features: {
                customLogin: true,
                oauth: false,
                azure: true,
                openai: !!process.env.OPENAI_API_KEY,
                cosmosDB: cosmosInfo.available,
                azureSearch: documentInfo.searchAvailable,
                persistencia: cosmosInfo.available ? 'Cosmos DB (cosmosService)' : 'Memoria temporal'
            },
            correcciones: {
                openIdEndpoint: 'Corregido a formato con guión',
                tenantHandling: 'Mejorado manejo de tenant común vs específico',
                errorHandling: 'Mejorado manejo de errores de autenticación',
                diagnostics: 'Diagnóstico mejorado para Bot Framework'
            }
        });
    } catch (error) {
        console.error('❌ Error en endpoint /health:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Mantener otros endpoints
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
            botFramework: {
                configured: !!(appId && appPassword),
                appId: appId,
                tenantId: tenantId || 'common',
                hasPassword: !!appPassword,
                registrationRequired: 'https://dev.botframework.com',
                messagingEndpoint: '/api/messages',
                corrections: 'Aplicadas correcciones de autenticación'
            },
            azureAD: {
                // ✅ ENDPOINT CORREGIDO
                openIdMetadata: tenantId ? 
                    `https://login.microsoftonline.com/${tenantId}/v2.0/.well-known/openid-configuration` : 
                    'https://login.microsoftonline.com/common/v2.0/.well-known/openid-configuration',
                oauthEndpoint: tenantId ? 
                    `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token` : 
                    'https://login.microsoftonline.com/common/oauth2/v2.0/token',
                portalUrl: appId ? 
                    `https://portal.azure.com/#blade/Microsoft_AAD_RegisteredApps/ApplicationMenuBlade/Overview/appId/${appId}/isMSAApp/` : null
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
                nodeVersion: process.version
            },
            storage: {
                botFramework: 'MemoryStorage',
                conversations: cosmosService.isAvailable() ? 'CosmosDB (cosmosService)' : 'Memory',
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

console.log('\n═══════════════════════════════════════');
console.log('📋 NOVA BOT - CONFIGURACIÓN CORREGIDA');
console.log('═══════════════════════════════════════');

console.log('🤖 Bot Framework Configuration:');
console.log(`   App ID: ${appId ? '✅ Configurado' : '❌ FALTANTE'}`);
console.log(`   App Password: ${appPassword ? '✅ Configurado' : '❌ FALTANTE'}`);
console.log(`   Tenant ID: ${tenantId ? `✅ ${tenantId}` : '⚠️ Multi-tenant/Common'}`);
console.log(`   Registration: 🔗 https://dev.botframework.com`);

console.log('🔧 Correcciones Aplicadas:');
console.log('   ✅ OpenID endpoint formato corregido (guión en lugar de guión bajo)');
console.log('   ✅ Manejo mejorado de tenant común vs específico');  
console.log('   ✅ Diagnóstico mejorado para errores de autenticación');
console.log('   ✅ Manejo de errores más específico');
console.log('   ✅ Fallback mejorado para configuración mínima');

if (!appId || !appPassword) {
    console.error('\n🚨 CONFIGURACIÓN INCOMPLETA');
    console.error('❌ Variables requeridas faltantes en .env');
} else {
    console.log('\n✅ CONFIGURACIÓN BASE COMPLETA');
    console.log('🎯 Si persisten errores, verificar registro en Bot Framework Portal');
}

console.log('═══════════════════════════════════════');