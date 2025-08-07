// index.js – Bot Framework con Single-Tenant y setup simplificado
require('dotenv').config();
const path = require('path');
const restify = require('restify');
const {
  BotFrameworkAdapter,
  MemoryStorage,
  ConversationState,
  UserState
} = require('botbuilder');

const { TeamsBot } = require('./bots/teamsBot');
const cosmosService = require('./services/cosmosService');
const documentService = require('./services/documentService');

// Variables de entorno
const appId       = process.env.MicrosoftAppId;
const appPassword = process.env.MicrosoftAppPassword;
const tenantId    = process.env.MicrosoftAppTenantId;
const PORT        = process.env.PORT || 3978;

// Adapter configurado en modo Single-Tenant
const adapter = new BotFrameworkAdapter({
  appId,
  appPassword,
  channelAuthTenant: tenantId,
  oAuthEndpoint: `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`,
  openIdMetadata: `https://login.microsoftonline.com/${tenantId}/v2.0/.well-known/openid-configuration`
});

// Error handler global
adapter.onTurnError = async (context, error) => {
  console.error('❌ Turn error:', error);
  await context.sendActivity('Lo siento, ocurrió un error procesando tu solicitud.');
};

// Inicializar estado y tu bot
const storage           = new MemoryStorage();
const conversationState = new ConversationState(storage);
const userState         = new UserState(storage);
const bot               = new TeamsBot(conversationState, userState);

// Crear servidor REST
const server = restify.createServer();
server.use(restify.plugins.bodyParser());

// Endpoint de mensajes para Teams
server.post('/api/messages', async (req, res) => {
  await adapter.process(req, res, (context) => bot.run(context));
});

// Health check opcional
server.get('/health', (req, res) => {
  res.send(200, { status: 'OK' });
});

// Arrancar servidor
server.listen(PORT, () => {
  console.log(`🚀 Nova Bot escuchando en puerto ${PORT}`);
  console.log(`📨 Messaging endpoint: http://localhost:${PORT}/api/messages`);
});
