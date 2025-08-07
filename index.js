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
// Importar instancia de CosmosDB (ya inicializada)
const cosmos = require('./services/cosmosService');
// Importar clase y crear instancia de DocumentService
// Importar instancia de DocumentService (ya inicializada)
const documentSvc = require('./services/documentService');

// Crear instancia del bot
const bot = new TeamsBot(conversationState, userState, cosmos, documentSvc);

// Ruta de mensajes entrantes
global.console.log('🔗 Conectando endpoint /api/messages');
server.post('/api/messages', async (req, res) => {
    await adapter.processActivity(req, res, async (context) => {
        await bot.run(context);
    });
});
