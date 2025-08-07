require('dotenv').config();
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

const appId       = process.env.MicrosoftAppId;
const appPassword = process.env.MicrosoftAppPassword;
const tenantId    = process.env.MicrosoftAppTenantId;
const PORT        = process.env.PORT || 3978;

const adapter = new BotFrameworkAdapter({
  appId,
  appPassword,
  channelAuthTenant: tenantId,
  oAuthEndpoint: `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`,
  openIdMetadata: `https://login.microsoftonline.com/${tenantId}/v2.0/.well-known/openid-configuration`
});
adapter.onTurnError = async (context, error) => {
  console.error('❌ Turn error:', error);
  await context.sendActivity('Lo siento, ocurrió un error procesando tu solicitud.');
};

const storage           = new MemoryStorage();
const conversationState = new ConversationState(storage);
const userState         = new UserState(storage);
const bot               = new TeamsBot(conversationState, userState);

const server = restify.createServer();
server.use(restify.plugins.bodyParser());

server.post('/api/messages', async (req, res) => {
  await adapter.process(req, res, (context) => bot.run(context));
});

// **Aquí viene el cambio**: handler async con 2 args
server.get('/health', async (req, res) => {
  res.send(200, { status: 'OK' });
});

server.listen(PORT, () => {
  console.log(`🚀 Nova Bot escuchando en puerto ${PORT}`);
  console.log(`📨 Messaging endpoint: http://localhost:${PORT}/api/messages`);
});
