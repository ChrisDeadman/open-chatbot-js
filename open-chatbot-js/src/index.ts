import fs from 'fs';
import { hideBin } from 'yargs/helpers';
import yargs from 'yargs/yargs';
import { loadSettings, settings } from './settings.js';

import { BotModel } from './models/bot_model.js';
import { OpenAIBot } from './models/openai_bot.js';
import { WebUIBot } from './models/webui_bot.js';

import { BotBrowser } from './bot_api/bot_browser.js';
import { CommandApi } from './bot_api/command_api.js';
import { SpeechApi } from './bot_api/speech_api.js';
import { startBrowser } from './bot_api/start_browser.js';
import { BotClient } from './clients/bot_client.js';
import { DiscordClient } from './clients/discord_client.js';
import { STTTSClient } from './clients/sttts_client.js';
import { TerminalClient } from './clients/terminal_client.js';
import { WebClient } from './clients/web_client.js';
import { MemoryProvider } from './memory/memory_provider.js';
import { RedisMemory } from './memory/redis_memory_provider.js';
import { EmbeddingModel } from './models/embedding_model.js';
import { LlamaBot } from './models/llama_bot.js';
import { LlamaEmbedding } from './models/llama_embedding.js';
import { TokenModel } from './models/token_model.js';
import { SbertEmbedding } from './models/sbert_embedding.js';

function createClient(
    command: string,
    botModel: BotModel,
    tokenModel: TokenModel,
    memory: MemoryProvider,
    speech: SpeechApi,
    botApiHandler: CommandApi
): BotClient {
    switch (command) {
        case 'discord':
            return new DiscordClient(botModel, tokenModel, memory, botApiHandler);
        case 'sttts':
            return new STTTSClient(botModel, tokenModel, memory, speech, botApiHandler);
        case 'web':
            return new WebClient(botModel, tokenModel, memory, botApiHandler);
        default:
            return new TerminalClient(botModel, tokenModel, memory, botApiHandler);
    }
}

const argv = await yargs(hideBin(process.argv))
    .command('terminal', 'start the bot in terminal mode')
    .command('web', 'start the bot in web-interface mode')
    .command('sttts', 'start the bot in sttts mode')
    .command('discord', 'start the bot in discord mode')
    .demandCommand(1)
    .option('settings', {
        alias: 's',
        type: 'string',
        description: 'Path to the config file',
        default: 'data/persistent/settings.json',
    })
    .parse();

const command = typeof argv._[0] === 'string' ? argv._[0] : 'terminal';

console.log('Loading settings...');

await loadSettings(argv.settings);

// Create the models
let botModel: BotModel;
let tokenModel: TokenModel | undefined;
let embeddingModel: EmbeddingModel | undefined;
switch (settings.bot_backend) {
    case 'openai': {
        const openAiBot = new OpenAIBot(
            settings.bot_name,
            settings.openai_api_key,
            settings.bot_model,
            settings.bot_model_token_limit
        );
        botModel = openAiBot;
        tokenModel = openAiBot;
        embeddingModel = openAiBot;
        break;
    }
    case 'webui':
        botModel = new WebUIBot(
            settings.bot_name,
            settings.bot_model,
            settings.bot_model_token_limit
        );
        break;
    default: {
        if (!fs.existsSync(settings.bot_model)) {
            throw new Error(
                `${settings.bot_model} does not exist, please check settings.json.`
            );
        }
        const llamaBot = new LlamaBot(
            settings.bot_name,
            settings.bot_model,
            settings.bot_model_token_limit
        );
        await llamaBot.init();
        botModel = llamaBot;
        break;
    }
}
switch (settings.embedding_backend) {
    case 'openai': {
        tokenModel = botModel as OpenAIBot;
        embeddingModel = botModel as OpenAIBot;
        break;
    }
    case 'llama': {
        if (!fs.existsSync(settings.embedding_model)) {
            throw new Error(
                `${settings.embedding_model} does not exist, please check settings.json.`
            );
        }
        const llamaEmbedding = new LlamaEmbedding(
            settings.embedding_model,
            settings.bot_model_token_limit
        );
        await llamaEmbedding.init();
        tokenModel = llamaEmbedding;
        embeddingModel = llamaEmbedding;
        break;
    }
    default: {
        const sbert = new SbertEmbedding(settings.embedding_model, settings.bot_model_token_limit);
        tokenModel = sbert;
        embeddingModel = sbert;
        break;
    }
}

// Create the memory model
const memory = new RedisMemory(
    settings.redis_host,
    settings.redis_port,
    embeddingModel,
    `idx:${settings.bot_name}:memory`
);
await memory.init();
await memory.clear(); // TODO: Clear always for now

// Create the browser
const browser = await startBrowser(true);

// Create the speech API
const speech = new SpeechApi(browser);

// Create the bot browser
const botBrowser: BotBrowser | undefined = new BotBrowser(botModel, browser);

// Create the Bot API Handler
const botApiHandler = new CommandApi(botModel, memory, botBrowser);

// Create the Bot client
const botClient: BotClient = createClient(
    command,
    botModel,
    tokenModel,
    memory,
    speech,
    botApiHandler
);

// Normal exit
process.on('beforeExit', async () => {
    await botClient.shutdown();
    process.exit();
});

// Catch signals that usually terminate the application, such as SIGINT (Ctrl+C)
process.on('SIGINT', async () => {
    console.log('\nCaught interrupt signal. Shutting down...');
    await botClient.shutdown();
    process.exit();
});

// Handle debugger disconnection
process.on('SIGUSR2', async () => {
    console.log('\nDebugger disconnected. Shutting down...');
    await botClient.shutdown();
    process.exit();
});

// Start the bot client
await botClient.startup();
