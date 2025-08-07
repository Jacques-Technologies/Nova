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
// Importar instancias de servicios (exportadas directamente)
const cosmos = require('./services/cosmosService');
const documentSvc = require('./services/documentService');

// Cargar configuración de entorno
// Variables de entorno esperadas: MicrosoftAppId, MicrosoftAppPassword, MicrosoftAppTenantId
const appId = process.env.MicrosoftAppId || '';
const appPassword = process.env.MicrosoftAppPassword || '';
const tenantId = process.env.MicrosoftAppTenantId || '';
const PORT = process.env.PORT || 3978;

// Iniciar servidor HTTP Restify
global.console.log('🤖 Nova Bot (SingleTenant) iniciando...');
const server = restify.createServer();
server.listen(PORT, () => {
  console.log(`🚀 Servidor escuchando en ${server.url}`);
});

// Configurar adaptador para Single-Tenant de Azure AD
const adapter = new BotFrameworkAdapter({
  appId,
  appPassword,
  openIdMetadata: `https://login.microsoftonline.com/${tenantId}/v2.0/.well-known/openid-configuration`
});

// Manejo global de errores
adapter.onTurnError = async (context, error) => {
  console.error(`[onTurnError]: ${error}`);
  await context.sendActivity('Lo siento, se produjo un error inesperado.');
};

// Configurar almacenamiento y estado
const memoryStorage = new MemoryStorage();
const conversationState = new ConversationState(memoryStorage);
const userState = new UserState(memoryStorage);

// Crear instancia del bot con estados y servicios
const bot = new TeamsBot(conversationState, userState, cosmos, documentSvc);

// Ruta de mensajes entrantes
global.console.log('🔗 Conectando endpoint /api/messages');
server.post('/api/messages', async (req, res) => {
  await adapter.processActivity(req, res, async (context) => {
    await bot.run(context);
  });
});
