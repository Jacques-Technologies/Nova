// index.js
const path = require('path');
const restify = require('restify');
require('dotenv').config();

const { 
    BotFrameworkAdapter,
    MemoryStorage,
    ConversationState,
    UserState
} = require('botbuilder');

const { TeamsBot } = require('./bots/teamsBot');
const CosmosService = require('./services/cosmosService');
const DocumentService = require('./services/documentService');

// Cargar configuración de entorno
env:
//   MicrosoftAppId, MicrosoftAppPassword, MicrosoftAppTenantId
const appId = process.env.MicrosoftAppId || '';
const appPassword = process.env.MicrosoftAppPassword || '';
const tenantId = process.env.MicrosoftAppTenantId || '';
const PORT = process.env.PORT || 3978;

// Crear servidor HTTP Restify
global.console.log('🤖 Nova Bot (SingleTenant) iniciando...');
const server = restify.createServer();
server.listen(PORT, () => {
    console.log(`🚀 Servidor escuchando en ${server.url}`);
});

// Adaptador configurado para Single-Tenant
const adapter = new BotFrameworkAdapter({
    appId: appId,
    appPassword: appPassword,
    // Metadata de OpenID de Azure AD para tenant único
    openIdMetadata: `https://login.microsoftonline.com/${tenantId}/v2.0/.well-known/openid-configuration`
});

// Manejo global de errores
adapter.onTurnError = async (context, error) => {
    console.error(`
 [onTurnError]: ${error}`);
    await context.sendActivity('Lo siento, se produjo un error inesperado.');
};

// Configurar almacenamiento y estado
const memoryStorage = new MemoryStorage();
const conversationState = new ConversationState(memoryStorage);
const userState = new UserState(memoryStorage);

// Inicializar servicios auxiliares\const cosmos = new CosmosService();
const documentSvc = new DocumentService();

// Crear instancia del bot
const bot = new TeamsBot(conversationState, userState, cosmos, documentSvc);

// Ruta de mensajes entrantes
server.post('/api/messages', async (req, res) => {
    await adapter.processActivity(req, res, async (context) => {
        await bot.run(context);
    });
});
