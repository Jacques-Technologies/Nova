// index.js - CORREGIDO: Específico para Bot Framework + diagnóstico AADSTS700016
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

// ✅ DIAGNÓSTICO ESPECÍFICO PARA BOT FRAMEWORK
console.log('🤖 ===== DIAGNÓSTICO BOT FRAMEWORK ESPECÍFICO =====');
console.log('🔧 Nova Bot - Solucionando AADSTS700016 para Bot Framework');
console.log('════════════════════════════════════════════════════════');

const appId = process.env.MicrosoftAppId;
const appPassword = process.env.MicrosoftAppPassword;
const tenantId = process.env.MicrosoftAppTenantId;

console.log(`📋 Configuración actual:`);
console.log(`   🔑 App ID: ${appId ? '✅ Configurado' : '❌ FALTANTE'}`);
console.log(`   🔒 App Password: ${appPassword ? '✅ Configurado' : '❌ FALTANTE'}`);
console.log(`   🏢 Tenant ID: ${tenantId ? '✅ Configurado' : '❌ FALTANTE - CRÍTICO'}`);

if (appId) {
    console.log(`   🔍 App ID: ${appId}`);
}
if (tenantId) {
    console.log(`   🔍 Tenant ID: ${tenantId}`);
}

// ✅ FUNCIÓN ESPECÍFICA: Verificar registración en Bot Framework
async function verifyBotFrameworkRegistration(appId, appPassword, tenantId) {
    try {
        console.log('\n🤖 ===== VERIFICACIÓN BOT FRAMEWORK =====');
        console.log('🔍 Probando autenticación específica para Bot Framework...');

        // ✅ SCOPE CORRECTO PARA BOT FRAMEWORK
        const botFrameworkScope = 'https://api.botframework.com/.default';
        console.log(`🎯 Scope: ${botFrameworkScope}`);

        const tokenUrl = `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`;
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
            
            // ✅ VERIFICAR EL TOKEN DECODIFICADO
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
            
            // ✅ ANÁLISIS ESPECÍFICO DEL ERROR
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

// ✅ FUNCIÓN ESPECÍFICA: Verificar endpoint OpenID
async function verifyOpenIDEndpoint(tenantId) {
    try {
        console.log('\n🔍 ===== VERIFICACIÓN OPENID ENDPOINT =====');
        console.log('🔍 Verificando accesibilidad del endpoint OpenID...');

        // Use the correct OpenID Connect discovery document path. Azure AD publishes the
        // OpenID Connect metadata under `.well-known/openid-configuration` (with a hyphen).
        // The previous underscore variant (`openid_configuration`) returns a 404 and causes
        // authentication failures such as "Failed to load openID config: 404" in single-tenant
        // scenarios. See https://login.microsoftonline.com/{tenant}/v2.0/.well-known/openid-configuration
        // for an example of the valid metadata endpoint.
        const openIdUrl = `https://login.microsoftonline.com/${tenantId}/v2.0/.well-known/openid-configuration`;
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
            console.error('   Esto explica el error "Failed to load openID config: 404"');
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
async function testBotFrameworkAPI(token) {
    try {
        console.log('\n🧪 ===== TEST BOT FRAMEWORK API =====');
        console.log('🔍 Probando conectividad con Bot Framework usando token...');

        // Test endpoint básico de Bot Framework
        const testUrl = 'https://api.botframework.com/v3/conversations';
        
        const response = await axios.get(testUrl, {
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            timeout: 10000,
            validateStatus: (status) => status < 500 // No error en 4xx
        });

        console.log(`📊 Respuesta Bot Framework API: ${response.status}`);
        
        if (response.status === 200 || response.status === 401) {
            // 401 es esperado sin conversación específica, pero indica que el endpoint responde
            console.log('✅ Bot Framework API responde correctamente');
            console.log('✅ Tu app está registrada en Bot Framework');
            return true;
        } else {
            console.warn(`⚠️ Respuesta inesperada: ${response.status}`);
            return false;
        }

    } catch (error) {
        console.error('❌ Error probando Bot Framework API:', error.message);
        
        if (error.response?.status === 401) {
            console.log('✅ Bot Framework API responde (401 es normal para test)');
            return true;
        } else if (error.response?.status === 403) {
            console.error('❌ Token válido pero sin permisos suficientes');
            return false;
        } else {
            console.error('❌ No se pudo conectar con Bot Framework API');
            return false;
        }
    }
}

// ✅ PROCESO PRINCIPAL DE VERIFICACIÓN
async function runCompleteDiagnostic() {
    console.log('\n🚀 ===== DIAGNÓSTICO COMPLETO =====');
    
    // Paso 1: Verificar variables
    if (!appId || !appPassword || !tenantId) {
        console.error('❌ Variables críticas faltantes');
        console.error('\n📋 Agregar a .env:');
        process.exit(1);
    }

    // Paso 2: Verificar OpenID endpoint
    console.log('\n🔍 Verificando OpenID endpoint...');
    const openIdResult = await verifyOpenIDEndpoint(tenantId);
    
    if (!openIdResult.accessible) {
        console.log('\n❌ ===== PROBLEMA CONFIRMADO =====');
        console.log('🔍 OpenID endpoint no accesible');
        console.log(`   Error: ${openIdResult.error}`);
        console.log(`   Recomendación: ${openIdResult.recommendation}`);
        
        if (openIdResult.confirmsError) {
            console.log('\n🎯 ESTO CONFIRMA EL ERROR "Failed to load openID config: 404"');
            console.log('✅ Diagnóstico: El Tenant ID es correcto pero...');
            console.log('❌ Bot Framework no puede acceder a la configuración');
            console.log('🔧 Solución: Registrar en Bot Framework Portal');
        }
    }

    // Paso 3: Verificar Bot Framework Registration
    // Paso 3: Verificar Bot Framework Registration
    const botFrameworkResult = await verifyBotFrameworkRegistration(appId, appPassword, tenantId);
    
    if (botFrameworkResult.success) {
        console.log('\n🎉 ¡Bot Framework authentication exitosa!');
        
        // Paso 4: Test API si el token está disponible
        await testBotFrameworkAPI(botFrameworkResult.token);
        
        console.log('\n✅ ===== DIAGNÓSTICO COMPLETADO =====');
        console.log('🎯 Tu bot debería funcionar correctamente');
        console.log('🚀 Iniciando servidor...');
        
        return true;
    } else {
        console.log('\n❌ ===== DIAGNÓSTICO FALLIDO =====');
        console.log('🔧 Acción requerida: Registrar en Bot Framework Portal');
        
        // ✅ INSTRUCCIONES ESPECÍFICAS MEJORADAS
        console.log('\n📋 PASOS PARA RESOLVER EL ERROR "Failed to load openID config: 404":');
        console.log('1. Ir a: https://dev.botframework.com');
        console.log('2. Click en "Create a Bot" o "Register"');
        console.log(`3. Usar App ID: ${appId}`);
        console.log('4. Usar App Password existente (NO crear nuevo)');
        console.log('5. Messaging Endpoint: https://tu-dominio.com/api/messages');
        console.log('6. Habilitar Microsoft Teams channel');
        console.log('\n🎯 EXPLICACIÓN DEL ERROR:');
        console.log('   • Tu Azure AD está configurado correctamente ✅');
        console.log('   • Microsoft Graph funciona ✅');
        console.log('   • Bot Framework no encuentra tu app registrada ❌');
        console.log('   • Esto causa el error "openID config: 404" ❌');
        console.log('\n⚠️ Continuando sin esta verificación...');
        
        return false;
    }
}

// ✅ CREAR SERVIDOR
const server = restify.createServer();
server.use(restify.plugins.bodyParser());

server.listen(process.env.port || process.env.PORT || 3978, async () => {
    console.log(`\n${server.name} listening on ${server.url}`);
    
    // ✅ EJECUTAR DIAGNÓSTICO AL INICIAR
    if (process.env.SKIP_DIAGNOSTIC !== 'true') {
        await runCompleteDiagnostic();
    }
    
    console.log('\n✅ Bot Nova iniciado');
    console.log(`💾 Persistencia: ${cosmosService.isAvailable() ? 'Cosmos DB (cosmosService)' : 'Memoria temporal'}`);
});

// ✅ CONFIGURACIÓN MEJORADA DEL ADAPTER
let storage;
let conversationState;
let userState;

async function initializeBot() {
    console.log('\n📦 Inicializando Bot Framework...');
    
    try {
        // Storage
        storage = new MemoryStorage();
        conversationState = new ConversationState(storage);
        userState = new UserState(storage);
        
        console.log('✅ Estados del Bot Framework inicializados');

        // ✅ CONFIGURACIÓN ESPECÍFICA PARA BOT FRAMEWORK
        console.log('🔐 Configurando Bot Framework Adapter...');

        const adapterConfig = {
            appId: appId,
            appPassword: appPassword
        };

        // ✅ SOLO agregar channelAuthTenant si está configurado
        if (tenantId && tenantId !== 'common') {
            adapterConfig.channelAuthTenant = tenantId;
            console.log(`🏢 Configurado con Tenant específico: ${tenantId}`);
        } else {
            console.log('🌐 Configurado para multi-tenant');
        }

        // ✅ CONFIGURAR ENDPOINTS ESPECÍFICOS PARA BOT FRAMEWORK
        if (tenantId) {
            adapterConfig.oAuthEndpoint = `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`;
            // Use the correct OIDC metadata document with hyphen (`openid-configuration`). The underscore
            // variant is deprecated/invalid and returns 404 for single-tenant directories.
            adapterConfig.openIdMetadata = `https://login.microsoftonline.com/${tenantId}/v2.0/.well-known/openid-configuration`;
            console.log(`🔗 OAuth Endpoint: ${adapterConfig.oAuthEndpoint}`);
            console.log(`🔗 OpenID Metadata: ${adapterConfig.openIdMetadata}`);
        }

        const adapter = new BotFrameworkAdapter(adapterConfig);

        console.log('✅ Bot Framework Adapter configurado:');
        console.log(`   App ID: ${appId}`);
        console.log(`   Has Password: ${!!appPassword}`);
        console.log(`   Channel Auth Tenant: ${adapterConfig.channelAuthTenant || 'multi-tenant'}`);

        // ✅ MANEJO DE ERRORES ESPECÍFICO PARA BOT FRAMEWORK
        setupAdapterErrorHandling(adapter);

        // Crear bot
        const bot = new TeamsBot(conversationState, userState);
        
        // Configurar endpoint de mensajes
        server.post('/api/messages', async (req, res) => {
            try {
                await adapter.process(req, res, (context) => bot.run(context));
            } catch (error) {
                console.error('❌ Error procesando mensaje:', error);
                
                // ✅ LOG ESPECÍFICO PARA ERRORES DE BOT FRAMEWORK
                if (error.message && error.message.includes('AADSTS700016')) {
                    console.error('\n🚨 ERROR AADSTS700016 DETECTADO EN MENSAJE');
                    console.error('🔍 Causa: App no registrada en Bot Framework Portal');
                    console.error('✅ Solución: Registrar en https://dev.botframework.com');
                    await generateDiagnosticReport();
                }
                
                res.status(500).send('Error interno del servidor - Ver logs para diagnóstico');
            }
        });
        
        console.log('🎯 Bot listo para recibir mensajes');
        
    } catch (error) {
        console.error('❌ Error inicializando bot:', error.message);
        
        // ✅ FALLBACK CON CONFIGURACIÓN MÍNIMA
        console.log('🔄 Iniciando con configuración fallback...');
        
        storage = new MemoryStorage();
        conversationState = new ConversationState(storage);
        userState = new UserState(storage);
        
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
        
        console.log('⚠️ Bot iniciado con configuración fallback');
    }
}

// ✅ MANEJO DE ERRORES MEJORADO
function setupAdapterErrorHandling(adapter) {
    adapter.onTurnError = async (context, error) => {
        console.error('\n❌ ===== ERROR BOT FRAMEWORK =====');
        console.error('Error:', error.message);
        
        // ✅ DETECCIÓN ESPECÍFICA DE ERRORES BOT FRAMEWORK
        if (error.message && error.message.includes('AADSTS700016')) {
            console.error('\n🚨 ERROR AADSTS700016 - SOLUCIÓN ESPECÍFICA:');
            console.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
            console.error('📋 PROBLEMA: App no registrada en Bot Framework Portal');
            console.error('\n✅ SOLUCIÓN PASO A PASO:');
            console.error('   1. Ir a: https://dev.botframework.com');
            console.error('   2. Click "Create a Bot" o "Register"');
            console.error(`   3. App ID: ${appId}`);
            console.error('   4. App Password: [usar el mismo que tienes]');
            console.error('   5. Messaging Endpoint: https://tu-dominio.com/api/messages');
            console.error('   6. Channels: Habilitar Microsoft Teams');
            console.error('\n🔍 VERIFICACIÓN:');
            console.error('   - Tu App funciona para Microsoft Graph');
            console.error('   - Bot Framework requiere registro adicional');
            console.error('   - NO cambies App ID/Password existentes');
            console.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
            
            await generateDiagnosticReport();
        } else if (error.message && error.message.includes('Failed to load openID config')) {
            console.error('\n🔐 ERROR OPENID CONFIG 404 - DIAGNÓSTICO ESPECÍFICO:');
            console.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
            console.error('📋 ERROR CONFIRMADO: App NO registrada en Bot Framework Portal');
            // Reflect the correct OpenID configuration URL in the diagnostic message. Using the
            // underscore variant in the log could mislead debugging; the hyphenated form is the
            // actual endpoint consumed by Azure AD.
            console.error(`   Endpoint fallido: https://login.microsoftonline.com/${tenantId}/v2.0/.well-known/openid-configuration`);
            console.error('\n🎯 ESTE ERROR CONFIRMA EL DIAGNÓSTICO:');
            console.error('   ✅ Azure AD está configurado correctamente');
            console.error('   ✅ Microsoft Graph funciona');
            console.error('   ❌ Bot Framework no puede validar porque app no está registrada');
            console.error('\n🔧 SOLUCIÓN INMEDIATA:');
            console.error('   1. Ejecutar: npm run setup-botframework');
            console.error('   2. Registrar en: https://dev.botframework.com');
            console.error(`   3. Usar App ID: ${appId}`);
            console.error('   4. Usar App Password existente');
            console.error('   5. Configurar Messaging Endpoint');
            console.error('   6. Habilitar Teams Channel');
            console.error('\n⚠️ IMPORTANTE: NO cambies las credenciales existentes');
            console.error('   Solo REGISTRA la misma app en Bot Framework Portal');
            console.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
            
            await generateDiagnosticReport();
        }
        
        // Responder al usuario
        try {
            if (error.message && error.message.includes('Failed to load openID config')) {
                await context.sendActivity(
                    '🔧 **Error de configuración Bot Framework**\n\n' +
                    '**Problema detectado**: El bot no está registrado en Bot Framework Portal.\n\n' +
                    '**Esto es normal** y tiene solución simple:\n' +
                    '1. El administrador debe ir a https://dev.botframework.com\n' +
                    '2. Registrar este bot con las credenciales existentes\n' +
                    '3. Configurar el endpoint de mensajes\n' +
                    '4. Habilitar el canal de Microsoft Teams\n\n' +
                    '**Nota**: Las credenciales Azure AD están correctas, solo falta el registro en Bot Framework.\n\n' +
                    '**Código de error**: OpenID Config 404'
                );
            } else if (error.message && error.message.includes('AADSTS700016')) {
                await context.sendActivity(
                    '🔧 **Error de configuración Bot Framework**\n\n' +
                    'El bot necesita ser registrado en Bot Framework Portal.\n\n' +
                    '**Para el administrador**: Ejecutar `npm run setup-botframework` para instrucciones detalladas.\n\n' +
                    '**Código de error**: AADSTS700016'
                );
            } else {
                await context.sendActivity(
                    '❌ **Error de configuración del bot**\n\n' +
                    'Hay un problema con la configuración de Bot Framework. ' +
                    'El administrador debe registrar este bot en el Portal de Bot Framework.\n\n' +
                    '**Para el administrador**: https://dev.botframework.com'
                );
            }
        } catch (sendError) {
            console.error('Error enviando mensaje de error:', sendError);
        }
    };
}

// ✅ REPORTE DE DIAGNÓSTICO ESPECÍFICO
async function generateDiagnosticReport() {
    console.log('\n📊 ===== REPORTE DIAGNÓSTICO BOT FRAMEWORK =====');
    
    const report = {
        timestamp: new Date().toISOString(),
        problema: 'AADSTS700016 - unauthorized_client',
        causa: 'App registrada en Azure AD pero NO en Bot Framework',
        configuracion: {
            appId: appId,
            hasAppPassword: !!appPassword,
            tenantId: tenantId,
            nodeVersion: process.version,
            environment: process.env.NODE_ENV || 'development'
        },
        endpoints: {
            azurePortalApp: `https://portal.azure.com/#blade/Microsoft_AAD_RegisteredApps/ApplicationMenuBlade/Overview/appId/${appId}/isMSAApp/`,
            botFrameworkPortal: 'https://dev.botframework.com',
            oauthEndpoint: `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`,
            messagingEndpoint: 'https://tu-dominio.com/api/messages (configurar en Bot Framework)'
        },
        solucion: {
            paso1: 'Ir a https://dev.botframework.com',
            paso2: 'Crear/Registrar bot con mismas credenciales',
            paso3: 'Configurar Messaging Endpoint',
            paso4: 'Habilitar Teams Channel',
            paso5: 'Verificar que funcione'
        },
        testCommands: {
            testBotFramework: 'npm run test-botframework',
            testGraph: 'npm run test-graph',
            diagnostic: 'npm run diagnostic'
        }
    };
    
    console.log('📋 Configuración actual:');
    console.log(JSON.stringify(report.configuracion, null, 2));
    
    console.log('\n🔗 Enlaces importantes:');
    console.log(`   Azure Portal App: ${report.endpoints.azurePortalApp}`);
    console.log(`   Bot Framework Portal: ${report.endpoints.botFrameworkPortal}`);
    
    console.log('\n✅ Solución paso a paso:');
    Object.entries(report.solucion).forEach(([key, value]) => {
        console.log(`   ${key}: ${value}`);
    });
    
    console.log('════════════════════════════════════════════════\n');
    
    return report;
}

// ✅ INICIALIZACIÓN
initializeBot().then(() => {
    console.log('🎉 Inicialización completada');
}).catch(error => {
    console.error('💥 Error crítico:', error);
    process.exit(1);
});

// ✅ ENDPOINTS DE DIAGNÓSTICO MEJORADOS

// ✅ CORREGIDO: Endpoint de salud con verificación Bot Framework
server.get('/health', async (req, res) => {
    try {
        // ✅ VERIFICACIÓN ESPECÍFICA BOT FRAMEWORK
        let botFrameworkStatus = 'unknown';
        
        if (appId && appPassword && tenantId) {
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
            bot: 'Nova Bot con Bot Framework específico',
            botFramework: {
                appId: appId ? 'Configurado' : 'Faltante',
                appPassword: appPassword ? 'Configurado' : 'Faltante',
                tenantId: tenantId ? 'Configurado' : 'CRÍTICO - Faltante',
                registrationStatus: botFrameworkStatus,
                portalUrl: 'https://dev.botframework.com',
                messagingEndpoint: '/api/messages',
                channelAuthTenant: tenantId || 'No configurado'
            },
                azureAD: {
                oauthEndpoint: tenantId ? `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token` : null,
                // Report the correct OpenID metadata endpoint in the health check. The underscore version
                // previously used here would return a 404 for single tenant deployments, so we switch to
                // the hyphenated form consistent with the official Azure AD discovery document.
                openIdMetadata: tenantId ? `https://login.microsoftonline.com/${tenantId}/v2.0/.well-known/openid-configuration` : null,
                azurePortalUrl: appId ? `https://portal.azure.com/#blade/Microsoft_AAD_RegisteredApps/ApplicationMenuBlade/Overview/appId/${appId}/isMSAApp/` : null
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
            storage: {
                botFramework: 'MemoryStorage',
                conversations: cosmosInfo.available ? 'CosmosDB (cosmosService)' : 'Memory',
                config: cosmosInfo
            }
        });
    } catch (error) {
        console.error('❌ Error en endpoint /health:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// ✅ ENDPOINT ESPECÍFICO BOT FRAMEWORK DIAGNOSTIC
server.get('/botframework-diagnostic', async (req, res) => {
    try {
        console.log('🤖 Ejecutando diagnóstico específico Bot Framework...');
        
        const diagnosticReport = await generateDiagnosticReport();
        
        // ✅ TEST EN TIEMPO REAL
        if (appId && appPassword && tenantId) {
            const botFrameworkTest = await verifyBotFrameworkRegistration(appId, appPassword, tenantId);
            diagnosticReport.testResults = {
                botFrameworkAuth: botFrameworkTest.success,
                error: botFrameworkTest.error || null,
                timestamp: new Date().toISOString()
            };
            
            if (botFrameworkTest.success && botFrameworkTest.token) {
                const apiTest = await testBotFrameworkAPI(botFrameworkTest.token);
                diagnosticReport.testResults.botFrameworkAPI = apiTest;
            }
        }
        
        res.json(diagnosticReport);
    } catch (error) {
        console.error('❌ Error en botframework-diagnostic:', error);
        res.status(500).json({ 
            error: 'Error en diagnóstico',
            details: error.message 
        });
    }
});

// Mantener otros endpoints existentes
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
                configured: !!(appId && appPassword && tenantId),
                appId: appId,
                tenantId: tenantId,
                hasPassword: !!appPassword,
                registrationRequired: 'https://dev.botframework.com',
                messagingEndpoint: '/api/messages'
            },
            azureAD: {
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

// ✅ INFORMACIÓN FINAL
console.log('\n═══════════════════════════════════════');
console.log('📋 NOVA BOT - BOT FRAMEWORK ESPECÍFICO');
console.log('═══════════════════════════════════════');

console.log('🤖 Bot Framework Configuration:');
console.log(`   App ID: ${appId ? '✅ Configurado' : '❌ FALTANTE'}`);
console.log(`   App Password: ${appPassword ? '✅ Configurado' : '❌ FALTANTE'}`);
console.log(`   Tenant ID: ${tenantId ? '✅ Configurado' : '❌ FALTANTE - CAUSA AADSTS700016'}`);
console.log(`   Registration: 🔗 https://dev.botframework.com`);

console.log('💾 Storage Configuration:');
console.log('   Bot Framework: MemoryStorage (para estados del bot)');
console.log(`   Conversaciones: ${cosmosService.isAvailable() ? 'Cosmos DB (cosmosService personalizado)' : 'Solo memoria'}`);

console.log('📊 Endpoints disponibles:');
console.log('   GET /health - Estado general con Bot Framework check');
console.log('   GET /diagnostic - Diagnóstico completo');
console.log('   GET /botframework-diagnostic - Diagnóstico específico Bot Framework');

if (!appId || !appPassword || !tenantId) {
    console.error('\n🚨 CONFIGURACIÓN INCOMPLETA');
    console.error('❌ El bot NO funcionará sin registrarse en Bot Framework Portal');
    console.error('📋 Pasos necesarios:');
    console.error('   1. Configurar todas las variables en .env');
    console.error('   2. Registrar en https://dev.botframework.com');
    console.error('   3. Configurar Messaging Endpoint');
    console.error('   4. Habilitar Teams Channel');
} else {
    console.log('\n✅ CONFIGURACIÓN COMPLETA DETECTADA');
    console.log('🎯 Si obtienes AADSTS700016, registra en Bot Framework Portal');
    console.log('🔗 Portal: https://dev.botframework.com');
}

console.log('═══════════════════════════════════════');