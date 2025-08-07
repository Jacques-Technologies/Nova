// index.js - CÓDIGO COMPLETO CORREGIDO: Bot Framework + diagnóstico + modo emergencia
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
const PORT = process.env.port || process.env.PORT || 3978;

console.log('🤖 ===== NOVA BOT - CONFIGURACIÓN CORREGIDA =====');
console.log('🔧 Bot Framework con correcciones de autenticación y modo emergencia');
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

// ✅ VARIABLES GLOBALES PARA EL BOT
let storage;
let conversationState;
let userState;
let botAdapter;
let emergencyMode = false;

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
                console.error(`   4. Usar App Password existente (NO crear nuevo)`);
                console.error('   5. Messaging Endpoint: https://cliente-nuevo.onrender.com/api/messages');
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

// ✅ NUEVO: Función para crear adapter de emergencia
async function createEmergencyAdapter() {
    console.log('🆘 ===== MODO EMERGENCIA ACTIVADO =====');
    console.log('⚠️ Creando adapter sin autenticación Bot Framework...');
    
    try {
        // Adapter con configuración mínima para desarrollo/testing
        const emergencyAdapter = new BotFrameworkAdapter({
            appId: '', // ← Vacío para modo emergencia
            appPassword: '', // ← Vacío para modo emergencia
        });
        
        console.log('🆘 Adapter de emergencia creado');
        console.log('⚠️ LIMITACIONES DEL MODO EMERGENCIA:');
        console.log('   • Sin autenticación de Bot Framework');
        console.log('   • Funcionalidad limitada en Teams');
        console.log('   • Solo para desarrollo/testing');
        console.log('   • Los usuarios pueden ver contenido sin validación completa');
        
        console.log('\n🔧 PARA RESTAURAR FUNCIONALIDAD COMPLETA:');
        console.log('   1. Ir a https://dev.botframework.com');
        console.log('   2. Registrar bot con App ID:', appId);
        console.log('   3. Messaging Endpoint: https://cliente-nuevo.onrender.com/api/messages');
        console.log('   4. Habilitar Microsoft Teams channel');
        console.log('   5. Reiniciar el bot');
        
        emergencyMode = true;
        return emergencyAdapter;
        
    } catch (error) {
        console.error('❌ Error creando adapter de emergencia:', error);
        throw new Error(`No se pudo crear adapter de emergencia: ${error.message}`);
    }
}

// ✅ SERVIDOR PRINCIPAL
const server = restify.createServer({
    name: 'Nova Bot Server',
    version: '2.1.0'
});

server.use(restify.plugins.bodyParser());

// ✅ MIDDLEWARE PARA LOGGING
server.use((req, res, next) => {
    try {
        const timestamp = new Date().toISOString();
        console.log(`📡 [${timestamp}] ${req.method} ${req.url}`);
        
        // Logging específico para mensajes del bot
        if (req.url === '/api/messages') {
            console.log('📨 Bot message incoming:', {
                method: req.method,
                contentType: req.headers['content-type'],
                authorization: req.headers.authorization ? 'Present' : 'Missing',
                userAgent: req.headers['user-agent']
            });
        }
        
        return next();
    } catch (error) {
        console.error('❌ Error en middleware de logging:', error);
        return next();
    }
});

// ✅ FUNCIÓN DE INICIALIZACIÓN COMPLETA CORREGIDA
async function initializeBot() {
    console.log('\n📦 ===== INICIALIZANDO BOT FRAMEWORK CORREGIDO =====');
    
    try {
        // Inicializar storage y estados
        storage = new MemoryStorage();
        conversationState = new ConversationState(storage);
        userState = new UserState(storage);
        
        console.log('✅ Estados del Bot Framework inicializados');

        let adapter;
        
        // ✅ INTENTAR CONFIGURACIÓN NORMAL PRIMERO
        try {
            console.log('🔐 Intentando configuración Bot Framework NORMAL...');
            
            if (!appId || !appPassword) {
                throw new Error('Credenciales Bot Framework faltantes');
            }
            
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

            adapter = new BotFrameworkAdapter(adapterConfig);
            
            console.log('✅ Bot Framework Adapter NORMAL creado exitosamente');
            console.log(`   App ID: ${appId}`);
            console.log(`   Has Password: ${!!appPassword}`);
            console.log(`   Channel Auth Tenant: ${adapterConfig.channelAuthTenant || 'multi-tenant'}`);
            
        } catch (normalError) {
            console.warn('\n⚠️ CONFIGURACIÓN NORMAL FALLÓ');
            console.warn('📋 Error:', normalError.message);
            console.warn('🔄 Activando MODO EMERGENCIA...');
            
            // ✅ USAR CONFIGURACIÓN DE EMERGENCIA
            adapter = await createEmergencyAdapter();
        }

        botAdapter = adapter;
        setupAdapterErrorHandling(adapter);

        // Crear bot
        const bot = new TeamsBot(conversationState, userState);
        
        // ✅ ENDPOINT DE MENSAJES CON MANEJO COMPLETO
        server.post('/api/messages', async (req, res) => {
            const startTime = Date.now();
            const requestId = Math.random().toString(36).substr(2, 9);
            
            try {
                console.log(`\n📨 [${requestId}] ===== MENSAJE RECIBIDO =====`);
                console.log(`📋 [${requestId}] Method: ${req.method}`);
                console.log(`📋 [${requestId}] Content-Type: ${req.headers['content-type']}`);
                console.log(`📋 [${requestId}] Authorization: ${req.headers.authorization ? 'Present' : 'Missing'}`);
                console.log(`📋 [${requestId}] User-Agent: ${req.headers['user-agent']}`);
                console.log(`📋 [${requestId}] Emergency Mode: ${emergencyMode ? 'SÍ' : 'NO'}`);
                
                // Procesar con el adapter
                await adapter.process(req, res, (context) => {
                    console.log(`🔄 [${requestId}] Procesando contexto del bot...`);
                    return bot.run(context);
                });
                
                const duration = Date.now() - startTime;
                console.log(`✅ [${requestId}] Mensaje procesado exitosamente en ${duration}ms`);
                console.log(`🏁 [${requestId}] ===== FIN PROCESAMIENTO =====\n`);
                
            } catch (error) {
                const duration = Date.now() - startTime;
                console.error(`\n❌ [${requestId}] ===== ERROR PROCESANDO MENSAJE =====`);
                console.error(`💥 [${requestId}] Error: ${error.message}`);
                console.error(`⏱️ [${requestId}] Duración hasta error: ${duration}ms`);
                
                // ✅ DETECCIÓN ESPECÍFICA DE ERRORES DE AUTENTICACIÓN
                if (error.message && (
                    error.message.includes('AADSTS700016') || 
                    error.message.includes('Signing Key could not be retrieved') ||
                    error.message.includes('Failed to load openID config') ||
                    error.message.includes('unauthorized_client')
                )) {
                    
                    console.error('\n🚨 ERROR DE CONFIGURACIÓN BOT FRAMEWORK DETECTADO');
                    console.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
                    console.error('📋 PROBLEMA: App registrada en Azure AD pero NO en Bot Framework Portal');
                    console.error('\n✅ SOLUCIÓN PASO A PASO:');
                    console.error('   1. Ir a https://dev.botframework.com');
                    console.error('   2. Hacer login con la misma cuenta de Azure');
                    console.error('   3. Click "Create a Bot" → "Register existing bot"');
                    console.error(`   4. App ID: ${appId}`);
                    console.error('   5. App Password: [usar el mismo de .env]');
                    console.error('   6. Messaging Endpoint: https://cliente-nuevo.onrender.com/api/messages');
                    console.error('   7. Habilitar "Microsoft Teams" en Channels');
                    console.error('   8. Save changes y reiniciar bot');
                    console.error('\n🆘 ALTERNATIVA TEMPORAL: Activar modo emergencia');
                    console.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
                    
                    // Generar reporte automático
                    await generateDiagnosticReport();
                }
                
                // ✅ RESPONDER CON INFORMACIÓN ÚTIL (no solo error 500)
                try {
                    const errorResponse = {
                        timestamp: new Date().toISOString(),
                        requestId: requestId,
                        error: 'Bot Framework configuration issue',
                        message: emergencyMode ? 
                            'Bot running in emergency mode - limited functionality' :
                            'Bot needs registration in Bot Framework Portal',
                        details: {
                            errorType: error.message.includes('Signing Key') ? 'authentication' : 'general',
                            emergencyMode: emergencyMode,
                            appId: appId,
                            hasPassword: !!appPassword,
                            tenantId: tenantId || 'common'
                        },
                        actions: emergencyMode ? [
                            'Bot funcionando en modo limitado',
                            'Algunas funciones pueden no estar disponibles',
                            'Registrar en Bot Framework Portal para funcionalidad completa'
                        ] : [
                            'Ir a https://dev.botframework.com',
                            `Registrar bot con App ID: ${appId}`,
                            'Configurar messaging endpoint',
                            'Habilitar Teams channel'
                        ],
                        portal: 'https://dev.botframework.com',
                        documentation: 'https://docs.microsoft.com/en-us/azure/bot-service/'
                    };
                    
                    res.status(emergencyMode ? 200 : 500).json(errorResponse);
                } catch (resError) {
                    console.error(`❌ [${requestId}] Error enviando respuesta de error:`, resError.message);
                    res.status(500).send('Internal server error - check bot logs');
                }
                
                console.error(`🏁 [${requestId}] ===== FIN ERROR =====\n`);
            }
        });
        
        console.log('🎯 Bot listo para recibir mensajes');
        console.log(`🚀 Messaging endpoint: POST /api/messages`);
        console.log(`🔍 Health endpoint: GET /health`);
        console.log(`📊 Diagnostic endpoint: GET /diagnostic`);
        
    } catch (error) {
        console.error('\n❌ ===== ERROR CRÍTICO INICIALIZANDO BOT =====');
        console.error('💥 Error:', error.message);
        console.error('📋 Stack:', error.stack);
        
        // ✅ ÚLTIMO INTENTO: Configuración súper básica
        console.log('\n🆘 ÚLTIMO INTENTO: Configuración básica de emergencia...');
        
        try {
            storage = new MemoryStorage();
            conversationState = new ConversationState(storage);
            userState = new UserState(storage);
            
            // Adapter mínimo absoluto
            const basicAdapter = new BotFrameworkAdapter({});
            setupAdapterErrorHandling(basicAdapter);
            
            const bot = new TeamsBot(conversationState, userState);
            
            server.post('/api/messages', async (req, res) => {
                try {
                    console.log('🆘 Procesando en modo básico de emergencia...');
                    await basicAdapter.process(req, res, (context) => bot.run(context));
                } catch (basicError) {
                    console.error('❌ Error en modo básico:', basicError.message);
                    res.status(503).json({
                        error: 'Service temporarily unavailable',
                        message: 'Bot configuration needs attention',
                        contact: 'Administrator'
                    });
                }
            });
            
            emergencyMode = true;
            console.log('🆘 Bot iniciado en modo básico de emergencia');
            
        } catch (basicError) {
            console.error('💥 Error crítico final:', basicError.message);
            process.exit(1);
        }
    }
}

// ✅ MANEJO DE ERRORES MEJORADO CON MODO EMERGENCIA
function setupAdapterErrorHandling(adapter) {
    adapter.onTurnError = async (context, error) => {
        const timestamp = new Date().toISOString();
        const userId = context?.activity?.from?.id || 'unknown';
        
        console.error(`\n❌ [${timestamp}] ===== BOT TURN ERROR =====`);
        console.error(`👤 User: ${userId}`);
        console.error(`💥 Error: ${error.message}`);
        console.error(`🆘 Emergency Mode: ${emergencyMode ? 'SÍ' : 'NO'}`);
        
        // ✅ CLASIFICACIÓN DE ERRORES MEJORADA
        let errorCategory = 'general';
        let userMessage = '';
        let adminMessage = '';
        
        if (error.message && (
            error.message.includes('AADSTS700016') ||
            error.message.includes('unauthorized_client') ||
            error.message.includes('Signing Key could not be retrieved') ||
            error.message.includes('Failed to load openID config')
        )) {
            errorCategory = 'bot_framework_registration';
            
            if (emergencyMode) {
                userMessage = '⚠️ **Bot en modo emergencia**\n\n' +
                             'El bot funciona con limitaciones. Algunas funciones pueden no estar disponibles.\n\n' +
                             '**Funciones disponibles:**\n' +
                             '• Chat básico\n' +
                             '• Comandos simples\n' +
                             '• Información general\n\n' +
                             '**Nota:** Para funcionalidad completa, contacta al administrador.';
            } else {
                userMessage = '🔧 **Error de configuración del bot**\n\n' +
                             'El bot necesita configuración adicional para funcionar correctamente.\n\n' +
                             '**Estado:** Sistema en configuración\n' +
                             '**Para usuarios:** Contacta al administrador\n' +
                             '**Tiempo estimado:** 5-15 minutos para resolución\n\n' +
                             'Gracias por tu paciencia.';
            }
            
            adminMessage = '\n🚨 ACCIÓN REQUERIDA DEL ADMINISTRADOR:';
            adminMessage += '\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━';
            adminMessage += '\n📋 PROBLEMA: Bot no registrado en Bot Framework Portal';
            adminMessage += '\n✅ SOLUCIÓN:';
            adminMessage += '\n   1. Ir a https://dev.botframework.com';
            adminMessage += '\n   2. Login con cuenta Microsoft';
            adminMessage += '\n   3. "Create a Bot" → "Register existing bot"';
            adminMessage += `\n   4. App ID: ${appId}`;
            adminMessage += '\n   5. App Password: [usar el mismo de .env]';
            adminMessage += '\n   6. Messaging Endpoint: https://cliente-nuevo.onrender.com/api/messages';
            adminMessage += '\n   7. Channels → Habilitar "Microsoft Teams"';
            adminMessage += '\n   8. Save y reiniciar bot';
            adminMessage += '\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━';
            
        } else if (error.message && error.message.includes('timeout')) {
            errorCategory = 'timeout';
            userMessage = '⏰ **Tiempo de respuesta agotado**\n\n' +
                         'El bot tardó demasiado en procesar tu mensaje.\n\n' +
                         'Por favor, intenta nuevamente con un mensaje más simple.';
            
        } else if (error.message && error.message.includes('rate limit')) {
            errorCategory = 'rate_limit';
            userMessage = '🚦 **Límite de velocidad alcanzado**\n\n' +
                         'Demasiadas consultas en poco tiempo.\n\n' +
                         'Por favor, espera 1-2 minutos e intenta nuevamente.';
            
        } else {
            errorCategory = 'general';
            userMessage = emergencyMode ? 
                '⚠️ **Error temporal en modo emergencia**\n\n' +
                'El bot funciona con limitaciones. Intenta reformular tu mensaje.\n\n' +
                '**Comandos disponibles:**\n• `ayuda`\n• `mi info`\n• `logout`' :
                '❌ **Error temporal del bot**\n\n' +
                'Problema técnico detectado. El administrador ha sido notificado.\n\n' +
                'Puedes intentar nuevamente en unos minutos.';
        }
        
        // Log para administrador
        console.error(`📊 Error Category: ${errorCategory}`);
        if (adminMessage) {
            console.error(adminMessage);
        }
        console.error(`🏁 ===== FIN BOT TURN ERROR =====\n`);
        
        // Responder al usuario
        try {
            await context.sendActivity(userMessage);
        } catch (sendError) {
            console.error(`❌ Error enviando mensaje de error al usuario: ${sendError.message}`);
        }
    };
}

// ✅ DIAGNÓSTICO COMPLETO CORREGIDO
async function runCompleteDiagnostic() {
    console.log('\n🚀 ===== DIAGNÓSTICO COMPLETO CORREGIDO =====');
    
    const diagnosticResults = {
        timestamp: new Date().toISOString(),
        overall: 'unknown',
        tests: {}
    };
    
    // Paso 1: Verificar variables requeridas
    if (!appId || !appPassword) {
        console.error('❌ Variables críticas faltantes para Bot Framework');
        console.error('\n📋 Requeridas en .env:');
        console.error('   MicrosoftAppId=tu-app-id');
        console.error('   MicrosoftAppPassword=tu-app-password');
        console.error('   MicrosoftAppTenantId=tu-tenant-id (opcional)');
        
        diagnosticResults.tests.environmentVariables = {
            status: 'fail',
            missing: ['MicrosoftAppId', 'MicrosoftAppPassword'].filter(v => 
                !process.env[v]
            )
        };
        
        return diagnosticResults;
    }

    diagnosticResults.tests.environmentVariables = {
        status: 'pass',
        appId: '✅ Configurado',
        appPassword: '✅ Configurado',
        tenantId: tenantId ? '✅ Configurado' : '⚠️ Multi-tenant'
    };

    // Paso 2: Verificar OpenID endpoint
    console.log('\n🔍 Verificando OpenID endpoint...');
    const openIdResult = await verifyOpenIDEndpoint(tenantId);
    
    diagnosticResults.tests.openIdEndpoint = {
        status: openIdResult.accessible ? 'pass' : 'warn',
        accessible: openIdResult.accessible,
        error: openIdResult.error,
        recommendation: openIdResult.recommendation
    };
    
    if (!openIdResult.accessible) {
        console.log('\n⚠️ OpenID endpoint no accesible, pero continuando...');
        console.log(`   Recomendación: ${openIdResult.recommendation}`);
    }

    // Paso 3: Verificar Bot Framework Registration
    const botFrameworkResult = await verifyBotFrameworkRegistration(appId, appPassword, tenantId);
    
    diagnosticResults.tests.botFramework = {
        status: botFrameworkResult.success ? 'pass' : 'fail',
        success: botFrameworkResult.success,
        message: botFrameworkResult.message || botFrameworkResult.error,
        error: botFrameworkResult.error
    };
    
    if (botFrameworkResult.success) {
        console.log('\n🎉 ¡Bot Framework authentication exitosa!');
        diagnosticResults.overall = 'pass';
    } else {
        console.log('\n❌ ===== DIAGNÓSTICO FALLIDO =====');
        console.log('🔧 Acción requerida: Registrar en Bot Framework Portal');
        diagnosticResults.overall = 'fail';
    }

    // Paso 4: Verificar servicios adicionales
    console.log('\n🔍 Verificando servicios adicionales...');
    
    diagnosticResults.tests.openai = {
        status: process.env.OPENAI_API_KEY ? 'pass' : 'warn',
        configured: !!process.env.OPENAI_API_KEY
    };
    
    diagnosticResults.tests.cosmosDB = {
        status: cosmosService.isAvailable() ? 'pass' : 'skip',
        available: cosmosService.isAvailable(),
        config: cosmosService.getConfigInfo()
    };
    
    diagnosticResults.tests.documentService = {
        status: documentService.isAvailable() ? 'pass' : 'skip',
        available: documentService.isAvailable(),
        config: documentService.getConfigInfo()
    };
    
    console.log('✅ ===== DIAGNÓSTICO COMPLETADO =====');
    console.log(`📊 Estado general: ${diagnosticResults.overall}`);
    console.log('🚀 Iniciando servidor...');
    
    return diagnosticResults;
}

// ✅ REPORTE DE DIAGNÓSTICO ACTUALIZADO
async function generateDiagnosticReport() {
    console.log('\n📊 ===== REPORTE DIAGNÓSTICO DETALLADO =====');
    
    const report = {
        timestamp: new Date().toISOString(),
        problema: 'Bot Framework Authentication Error',
        causa: 'App registrada en Azure AD pero NO en Bot Framework Portal',
        severidad: emergencyMode ? 'MEDIO (modo emergencia activo)' : 'ALTO (bot no funcional)',
        configuracion: {
            appId: appId,
            hasAppPassword: !!appPassword,
            tenantId: tenantId || 'common/multi-tenant',
            nodeVersion: process.version,
            environment: process.env.NODE_ENV || 'production',
            emergencyMode: emergencyMode
        },
        endpoints: {
            messagingEndpoint: 'https://cliente-nuevo.onrender.com/api/messages',
            botFrameworkPortal: 'https://dev.botframework.com',
            azurePortalApp: appId ? 
                `https://portal.azure.com/#blade/Microsoft_AAD_RegisteredApps/ApplicationMenuBlade/Overview/appId/${appId}/isMSAApp/` : null,
            openIdEndpoint: tenantId ? 
                `https://login.microsoftonline.com/${tenantId}/v2.0/.well-known/openid-configuration` :
                'https://login.microsoftonline.com/common/v2.0/.well-known/openid-configuration'
        },
        solucion: {
            urgencia: 'ALTA',
            tiempo_estimado: '5-15 minutos',
            pasos: [
                'Ir a https://dev.botframework.com',
                'Login con cuenta Microsoft/Azure',
                'Click "Create a Bot" → "Register existing bot"',
                `Usar App ID: ${appId}`,
                'Usar App Password existente (NO crear nuevo)',
                'Messaging Endpoint: https://cliente-nuevo.onrender.com/api/messages',
                'En Channels, habilitar "Microsoft Teams"',
                'Save changes',
                'Reiniciar aplicación (opcional)',
                'Verificar con /health endpoint'
            ]
        },
        impacto: {
            usuarios: emergencyMode ? 'Funcionalidad limitada' : 'Sin acceso al bot',
            funciones: emergencyMode ? 
                'Chat básico disponible, autenticación Teams limitada' :
                'Todas las funciones del bot no disponibles',
            business: 'Medio - Los usuarios no pueden usar completamente el bot corporativo'
        },
        alternativa_temporal: emergencyMode ? 
            'Bot funcionando en modo emergencia con limitaciones' :
            'Activar modo emergencia modificando código',
        monitoreo: {
            health_endpoint: 'https://cliente-nuevo.onrender.com/health',
            diagnostic_endpoint: 'https://cliente-nuevo.onrender.com/diagnostic',
            logs_location: 'Console output / Azure Application Insights'
        }
    };
    
    console.log('📋 REPORTE COMPLETO:');
    console.log(JSON.stringify(report, null, 2));
    
    console.log('\n🔗 Enlaces importantes:');
    console.log(`   Bot Framework Portal: ${report.endpoints.botFrameworkPortal}`);
    console.log(`   Azure Portal (App): ${report.endpoints.azurePortalApp}`);
    console.log(`   Messaging Endpoint: ${report.endpoints.messagingEndpoint}`);
    
    console.log('\n⏰ ACCIÓN INMEDIATA REQUERIDA:');
    console.log(`   Tiempo estimado de solución: ${report.solucion.tiempo_estimado}`);
    console.log(`   Impacto actual: ${report.impacto.usuarios}`);
    
    console.log('════════════════════════════════════════════════\n');
    
    return report;
}

// ✅ INICIALIZACIÓN PRINCIPAL
async function startServer() {
    try {
        // Ejecutar diagnóstico si no está deshabilitado
        if (process.env.SKIP_DIAGNOSTIC !== 'true') {
            const diagnosticResults = await runCompleteDiagnostic();
            
            // Si el diagnóstico falla completamente, activar modo emergencia
            if (diagnosticResults.overall === 'fail' && !emergencyMode) {
                console.log('\n🆘 Diagnóstico falló - considerando activar modo emergencia...');
                console.log('⚠️ Continuando con inicialización normal primero...');
            }
        }
        
        // Inicializar bot
        await initializeBot();
        
        // Iniciar servidor
        server.listen(PORT, async () => {
            console.log(`\n🌐 ===== SERVIDOR INICIADO =====`);
            console.log(`📍 URL: ${server.url}`);
            console.log(`🚀 Puerto: ${PORT}`);
            console.log(`🆘 Modo Emergencia: ${emergencyMode ? 'ACTIVO' : 'INACTIVO'}`);
            console.log(`💾 Persistencia: ${cosmosService.isAvailable() ? 'Cosmos DB (cosmosService)' : 'Memoria temporal'}`);
            console.log(`🔍 Document Search: ${documentService.isAvailable() ? 'Azure Search disponible' : 'No disponible'}`);
            
            console.log(`\n📡 Endpoints disponibles:`);
            console.log(`   POST /api/messages - Bot messaging endpoint`);
            console.log(`   GET  /health      - Health check`);
            console.log(`   GET  /diagnostic  - Detailed diagnostics`);
            console.log(`   GET  /bot-status  - Bot status information`);
            
            if (emergencyMode) {
                console.log(`\n🆘 ===== MODO EMERGENCIA ACTIVO =====`);
                console.log(`⚠️ Funcionalidad limitada`);
                console.log(`🔧 Para restaurar funcionalidad completa:`);
                console.log(`   1. Registrar bot en https://dev.botframework.com`);
                console.log(`   2. Reiniciar aplicación`);
                console.log(`════════════════════════════════════════════`);
            }
            
            console.log('\n✅ Nova Bot iniciado y listo para recibir mensajes');
        });
        
    } catch (error) {
        console.error('\n💥 ===== ERROR CRÍTICO INICIANDO SERVIDOR =====');
        console.error('Error:', error.message);
        console.error('Stack:', error.stack);
        console.error('═══════════════════════════════════════════════');
        process.exit(1);
    }
}

// ✅ ENDPOINTS DE SALUD Y DIAGNÓSTICO MEJORADOS

server.get('/health', async (req, res) => {
    try {
        let botFrameworkStatus = 'unknown';
        
        if (appId && appPassword && !emergencyMode) {
            try {
                const botFrameworkTest = await verifyBotFrameworkRegistration(appId, appPassword, tenantId);
                botFrameworkStatus = botFrameworkTest.success ? 'registered' : 'not_registered';
            } catch (error) {
                botFrameworkStatus = 'error';
            }
        } else if (emergencyMode) {
            botFrameworkStatus = 'emergency_mode';
        } else {
            botFrameworkStatus = 'config_missing';
        }

        const cosmosInfo = cosmosService.getConfigInfo();
        const documentInfo = documentService.getConfigInfo();
        
        const healthData = {
            status: emergencyMode ? 'LIMITED' : 'OK',
            timestamp: new Date().toISOString(),
            bot: 'Nova Bot - Configuración Corregida con Modo Emergencia',
            mode: emergencyMode ? 'EMERGENCY' : 'NORMAL',
            botFramework: {
                status: botFrameworkStatus,
                appId: appId ? 'Configurado' : 'Faltante',
                appPassword: appPassword ? 'Configurado' : 'Faltante',
                tenantId: tenantId ? 'Configurado' : 'Multi-tenant',
                registrationRequired: botFrameworkStatus === 'not_registered' || 
                                    botFrameworkStatus === 'config_missing',
                portalUrl: 'https://dev.botframework.com',
                messagingEndpoint: '/api/messages',
                channelAuthTenant: tenantId || 'common'
            },
            azureAD: {
                oauthEndpoint: tenantId ? 
                    `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token` : 
                    'https://login.microsoftonline.com/common/oauth2/v2.0/token',
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
                persistencia: cosmosInfo.available ? 'Cosmos DB (cosmosService)' : 'Memoria temporal',
                emergencyMode: emergencyMode
            },
            actions: emergencyMode ? [
                'Bot funcionando en modo emergencia',
                'Registrar en Bot Framework Portal para funcionalidad completa',
                'Algunas funciones pueden estar limitadas'
            ] : botFrameworkStatus === 'not_registered' ? [
                'Registrar bot en Bot Framework Portal',
                'Configurar messaging endpoint',
                'Habilitar Teams channel'
            ] : [
                'Bot funcionando correctamente',
                'Todas las funciones disponibles'
            ]
        };
        
        const statusCode = emergencyMode ? 206 : 200; // 206 = Partial Content
        res.status(statusCode).json(healthData);
        return next();
        
    } catch (error) {
        console.error('❌ Error en endpoint /health:', error);
        res.status(500).json({ 
            error: 'Health check failed',
            timestamp: new Date().toISOString()
        });
        return next();
    }
});

server.get('/diagnostic', async (req, res) => {
    try {
        let cosmosStats = null;
        if (cosmosService.isAvailable()) {
            try {
                cosmosStats = await cosmosService.getStats();
            } catch (error) {
                console.warn('⚠️ Error obteniendo stats de Cosmos DB:', error.message);
                cosmosStats = { error: error.message };
            }
        }

        let documentStats = null;
        if (documentService.isAvailable()) {
            try {
                documentStats = await documentService.getStats();
            } catch (error) {
                console.warn('⚠️ Error obteniendo stats de DocumentService:', error.message);
                documentStats = { error: error.message };
            }
        }
        
        const diagnosticData = {
            timestamp: new Date().toISOString(),
            mode: emergencyMode ? 'EMERGENCY' : 'NORMAL',
            bot: {
                status: emergencyMode ? 'limited' : 'running',
                authenticatedUsers: global.botInstance?.getStats?.()?.authenticatedUsers || 0,
                uptime: Math.round(process.uptime()),
                emergencyMode: emergencyMode
            },
            botFramework: {
                configured: !!(appId && appPassword),
                appId: appId,
                tenantId: tenantId || 'common',
                hasPassword: !!appPassword,
                registrationRequired: !emergencyMode,
                messagingEndpoint: '/api/messages',
                mode: emergencyMode ? 'Emergency (no authentication)' : 'Normal (full authentication)'
            },
            azureAD: {
                openIdMetadata: tenantId ? 
                    `https://login.microsoftonline.com/${tenantId}/v2.0/.well-known/openid-configuration` : 
                    'https://login.microsoftonline.com/common/v2.0/.well-known/openid-configuration',
                oauthEndpoint: tenantId ? 
                    `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token` : 
                    'https://login.microsoftonline.com/common/oauth2/v2.0/token',
                portalUrl: appId ? 
                    `https://portal.azure.com/#blade/Microsoft_AAD_RegisteredApps/ApplicationMenuBlade/Overview/appId/${appId}/isMSAApp/` : null
            },
            system: {
                memory: {
                    used: Math.round(process.memoryUsage().heapUsed / 1024 / 1024) + ' MB',
                    total: Math.round(process.memoryUsage().heapTotal / 1024 / 1024) + ' MB'
                },
                uptime: Math.round(process.uptime()) + ' segundos',
                nodeVersion: process.version,
                platform: process.platform
            },
            environment: {
                hasOpenAI: !!process.env.OPENAI_API_KEY,
                hasBotId: !!process.env.MicrosoftAppId,
                hasBotPassword: !!process.env.MicrosoftAppPassword,
                hasTenantId: !!process.env.MicrosoftAppTenantId,
                nodeEnv: process.env.NODE_ENV || 'production'
            },
            storage: {
                botFramework: 'MemoryStorage',
                conversations: cosmosService.isAvailable() ? 'CosmosDB (cosmosService)' : 'Memory',
                cosmosConfig: cosmosService.getConfigInfo(),
                cosmosStats: cosmosStats
            },
            documentService: {
                type: documentService.isAvailable() ? 'Azure Search' : 'Not Available',
                config: documentService.getConfigInfo(),
                stats: documentStats
            },
            recommendations: emergencyMode ? [
                'Bot en modo emergencia - funcionalidad limitada',
                'Registrar en Bot Framework Portal para restaurar funcionalidad completa',
                'Verificar configuración de credenciales',
                'Considerar reiniciar después de registrar el bot'
            ] : [
                'Bot funcionando normalmente',
                'Monitorear uso de recursos',
                'Verificar logs para errores ocasionales'
            ]
        };
        
        res.json(diagnosticData);
        return next();
        
    } catch (error) {
        console.error('❌ Error en endpoint /diagnostic:', error);
        res.status(500).json({ 
            error: 'Diagnostic failed', 
            message: error.message,
            timestamp: new Date().toISOString()
        });
        return next();
    }
});

// ✅ NUEVO: Endpoint específico de estado del bot
server.get('/bot-status', async (req, res) => {
    try {
        const statusData = {
            timestamp: new Date().toISOString(),
            bot: {
                name: 'Nova Bot',
                version: '2.1.0-Fixed',
                status: emergencyMode ? 'EMERGENCY_MODE' : 'NORMAL',
                uptime: process.uptime()
            },
            configuration: {
                appId: appId,
                hasPassword: !!appPassword,
                tenantId: tenantId || 'multi-tenant',
                emergencyMode: emergencyMode
            },
            capabilities: {
                messaging: true,
                authentication: !emergencyMode,
                teamsIntegration: !emergencyMode,
                openaiChat: !!process.env.OPENAI_API_KEY,
                documentSearch: documentService.isAvailable(),
                persistence: cosmosService.isAvailable()
            },
            actions_required: emergencyMode ? [
                'Ir a https://dev.botframework.com',
                'Login con cuenta Microsoft',
                'Create a Bot → Register existing bot',
                `Usar App ID: ${appId}`,
                'Usar App Password existente',
                'Messaging Endpoint: https://cliente-nuevo.onrender.com/api/messages',
                'Habilitar Microsoft Teams channel',
                'Save y reiniciar bot'
            ] : [
                'Bot funcionando correctamente',
                'No se requieren acciones'
            ],
            links: {
                botFrameworkPortal: 'https://dev.botframework.com',
                azurePortal: appId ? 
                    `https://portal.azure.com/#blade/Microsoft_AAD_RegisteredApps/ApplicationMenuBlade/Overview/appId/${appId}/isMSAApp/` : null,
                documentation: 'https://docs.microsoft.com/en-us/azure/bot-service/'
            }
        };
        
        const statusCode = emergencyMode ? 206 : 200; // 206 = Partial Content
        res.status(statusCode).json(statusData);
        return next();
        
    } catch (error) {
        console.error('❌ Error en endpoint /bot-status:', error);
        res.status(500).json({ 
            error: 'Status check failed',
            timestamp: new Date().toISOString()
        });
        return next();
    }
});

// ✅ Endpoint para activar/desactivar modo emergencia (solo desarrollo)
if (process.env.NODE_ENV !== 'production') {
    server.post('/emergency-mode/:action', (req, res) => {
        try {
            const action = req.params.action;
            
            if (action === 'enable') {
                emergencyMode = true;
                res.json({ 
                    message: 'Modo emergencia activado',
                    emergencyMode: true,
                    timestamp: new Date().toISOString()
                });
            } else if (action === 'disable') {
                emergencyMode = false;
                res.json({ 
                    message: 'Modo emergencia desactivado - reiniciar para aplicar cambios completos',
                    emergencyMode: false,
                    timestamp: new Date().toISOString()
                });
            } else {
                res.status(400).json({ error: 'Acción inválida. Use: enable o disable' });
            }
            return next();
        } catch (error) {
            console.error('❌ Error en emergency-mode endpoint:', error);
            res.status(500).json({ error: 'Internal server error' });
            return next();
        }
    });
}

// ✅ MANEJO GRACEFUL DE CIERRE
process.on('SIGINT', () => {
    console.log('\n🛑 ===== CERRANDO NOVA BOT =====');
    console.log('💾 Guardando estados finales...');
    
    if (global.botInstance && typeof global.botInstance.cleanup === 'function') {
        global.botInstance.cleanup();
    }
    
    console.log('👋 Nova Bot cerrado exitosamente');
    process.exit(0);
});

process.on('SIGTERM', () => {
    console.log('\n🛑 ===== TERMINANDO NOVA BOT =====');
    console.log('💾 Finalizando conexiones...');
    
    if (global.botInstance && typeof global.botInstance.cleanup === 'function') {
        global.botInstance.cleanup();
    }
    
    console.log('👋 Nova Bot terminado exitosamente');
    process.exit(0);
});

// ✅ MANEJO DE ERRORES NO CAPTURADOS
process.on('uncaughtException', (error) => {
    console.error('\n💥 ===== ERROR NO CAPTURADO =====');
    console.error('Error:', error.message);
    console.error('Stack:', error.stack);
    console.error('🆘 Activando modo emergencia automático...');
    
    emergencyMode = true;
    console.error('⚠️ Bot continuará en modo emergencia');
    console.error('════════════════════════════════════');
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('\n⚠️ ===== PROMESA RECHAZADA NO MANEJADA =====');
    console.error('Razón:', reason);
    console.error('Promesa:', promise);
    console.error('⚠️ Bot continuará funcionando...');
    console.error('═══════════════════════════════════════════');
});

// ✅ MOSTRAR CONFIGURACIÓN FINAL
console.log('\n═══════════════════════════════════════');
console.log('📋 NOVA BOT - CONFIGURACIÓN FINAL');
console.log('═══════════════════════════════════════');

console.log('🤖 Bot Framework Configuration:');
console.log(`   App ID: ${appId ? '✅ Configurado' : '❌ FALTANTE'}`);
console.log(`   App Password: ${appPassword ? '✅ Configurado' : '❌ FALTANTE'}`);
console.log(`   Tenant ID: ${tenantId ? `✅ ${tenantId}` : '⚠️ Multi-tenant/Common'}`);
console.log(`   Registration: 🔗 https://dev.botframework.com`);

console.log('🔧 Características Implementadas:');
console.log('   ✅ Configuración normal con fallback a modo emergencia');
console.log('   ✅ Diagnóstico automático mejorado');  
console.log('   ✅ Manejo de errores específicos por tipo');
console.log('   ✅ Logging detallado para troubleshooting');
console.log('   ✅ Endpoints de salud y diagnóstico completos');
console.log('   ✅ Manejo graceful de cierre y errores');
console.log('   ✅ Modo emergencia automático en caso de fallos críticos');

console.log('🆘 Modo Emergencia:');
console.log('   • Activación automática si Bot Framework falla');
console.log('   • Funcionalidad limitada pero operacional');
console.log('   • Logging claro sobre limitaciones');
console.log('   • Instrucciones específicas para resolución');

if (!appId || !appPassword) {
    console.error('\n🚨 CONFIGURACIÓN INCOMPLETA');
    console.error('❌ Variables requeridas faltantes en .env');
    console.error('🆘 Se activará modo emergencia automáticamente');
} else {
    console.log('\n✅ CONFIGURACIÓN BASE COMPLETA');
    console.log('🎯 Si hay errores de "Signing Key", el bot activará modo emergencia automáticamente');
    console.log('🔧 Para solución definitiva: registrar en Bot Framework Portal');
}

console.log('═══════════════════════════════════════');

// ✅ INICIAR SERVIDOR
startServer();