import { hideBin } from 'yargs/helpers';
import yargs from 'yargs/yargs';

import { loadSettings, settings } from './settings.js';

import { BotModel } from './models/bot_model.js';
import { OpenAIBot } from './models/openai_bot.js';

import { CommandApi } from './bot_api/command_api.js';
import { SpeechApi } from './bot_api/speech_api.js';
import { startBrowser } from './bot_api/start_browser.js';
import { BotClient } from './clients/bot_client.js';
import { DiscordClient } from './clients/discord_client.js';
import { STTTSClient } from './clients/sttts_client.js';
import { TerminalClient } from './clients/terminal_client.js';
import { MemoryProvider } from './memory/memory_provider.js';
import { RedisMemory } from './memory/redis_memory_provider.js';

function createClient(
    command: string,
    botModel: BotModel,
    memory: MemoryProvider,
    speech: SpeechApi,
    botApiHandler: CommandApi
): BotClient {
    switch (command) {
        case 'discord':
            return new DiscordClient(botModel, memory, botApiHandler);
        case 'sttts':
            return new STTTSClient(botModel, memory, speech, botApiHandler);
        default:
            return new TerminalClient(botModel, memory, botApiHandler);
    }
}

const argv = await yargs(hideBin(process.argv))
    .command('terminal', 'start the bot in terminal mode')
    .command('sttts', 'start the bot in sttts mode')
    .command('discord', 'start the bot in discord mode')
    .demandCommand(1)
    .parse();

const command = typeof argv._[0] === 'string' ? argv._[0] : 'terminal';

console.log('Loading settings...');

await loadSettings('data/settings.json');

// Create the memory model
const memory = new RedisMemory(
    settings.redis_host,
    settings.redis_port,
    1536,
    `idx:${settings.bot_name}:memory`
);

// TODO: Clear always for now
memory.clear();

// Create the Bot model
const botModel: BotModel = new OpenAIBot(
    settings.bot_name,
    settings.openai_api_key,
    settings.openai_model
);

// Create the browser
const browser = await startBrowser(true);

// Create the speech API
const speech = new SpeechApi(browser);

// Create the Bot API Handler
const botApiHandler = new CommandApi(botModel, memory, browser);

// Create the Bot client
const botClient: BotClient = createClient(command, botModel, memory, speech, botApiHandler);

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
