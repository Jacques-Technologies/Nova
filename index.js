require('dotenv').config();
const restify = require('restify');
const {
  CloudAdapter,
  ConfigurationBotFrameworkAuthentication,
  MemoryStorage,
  ConversationState,
  UserState
} = require('botbuilder');
const { TeamsBot } = require('./bots/teamsBot');
const cosmosService = require('./services/cosmosService');
const documentService = require('./services/documentService');

// The Azure Bot Service deprecated support for creating new multi‑tenant bots after
// July 31 2025.  To comply with the new single‑tenant requirement the adapter
// has been updated to use CloudAdapter with ConfigurationBotFrameworkAuthentication.
//
// When running this bot you must provide the following environment variables:
//   MicrosoftAppId       – The Application (client) ID for your bot registration
//   MicrosoftAppPassword – The client secret for your bot registration
//   MicrosoftAppTenantId – The tenant ID where your bot is registered
//   MicrosoftAppType     – Should be set to "SingleTenant" (defaulted below)
// See the Microsoft documentation for more details: https://learn.microsoft.com/azure/bot-service/bot-builder-authentication#to-update-your-app-service

const PORT = process.env.PORT || 3978;

// Create a BotFrameworkAuthentication instance using environment variables.  If
// MicrosoftAppType is not explicitly set it defaults to SingleTenant.  This
// object encapsulates all of the authentication endpoints required for the
// CloudAdapter and eliminates the need to manually set channelAuthTenant,
// oAuthEndpoint or openIdMetadata.
const botFrameworkAuthentication = new ConfigurationBotFrameworkAuthentication({
  MicrosoftAppId: process.env.MicrosoftAppId,
  MicrosoftAppPassword: process.env.MicrosoftAppPassword,
  MicrosoftAppType: process.env.MicrosoftAppType || 'SingleTenant',
  MicrosoftAppTenantId: process.env.MicrosoftAppTenantId
});

// Instantiate the CloudAdapter which replaces the deprecated BotFrameworkAdapter.
const adapter = new CloudAdapter(botFrameworkAuthentication);

// Global error handler to catch any unhandled errors.  Without this your bot
// may fail silently and return a 500 status code.
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
