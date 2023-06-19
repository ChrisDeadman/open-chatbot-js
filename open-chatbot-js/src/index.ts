import { hideBin } from 'yargs/helpers';
import yargs from 'yargs/yargs';
import {
    getBackendDir,
    getCharacterDir,
    getTurnTemplateDir,
    loadSettings,
    readCombineSettings,
} from './settings.js';

import path from 'path';
import { BotClient } from './clients/bot_client.js';
import { DiscordClient } from './clients/discord_client.js';
import { STTTSClient } from './clients/sttts_client.js';
import { TerminalClient } from './clients/terminal_client.js';
import { WebClient } from './clients/web_client.js';
import { BotController } from './utils/bot_controller.js';

function createClient(clientId: string, controllerSettings: any): BotClient {
    const controller = new BotController(controllerSettings);
    switch (clientId) {
        case 'discord':
            return new DiscordClient(controller);
        case 'sttts':
            return new STTTSClient(controller);
        case 'web':
            return new WebClient();
        default:
            return new TerminalClient(controller);
    }
}

const argv = await yargs(hideBin(process.argv))
    .command('terminal', 'start the bot in terminal mode')
    .command('web', 'start the bot in web-interface mode')
    .command('sttts', 'start the bot in sttts mode')
    .command('discord', 'start the bot in discord mode')
    .demandCommand(1)
    .option('data', {
        alias: 'd',
        type: 'string',
        description: 'Path to the data directory containing settings.json',
        default: 'data/persistent',
    })
    .option('backend', {
        alias: 'b',
        type: 'string',
        description: 'Name of the backend json file',
        default: 'webui.example.json',
    })
    .option('turn_template', {
        alias: 't',
        type: 'string',
        description: 'Name of the turn-template json file',
        default: 'alpaca.json',
    })
    .option('character', {
        alias: 'c',
        type: 'string',
        description: 'Name of the character json file',
        default: 'eva.example.json',
    })
    .parse();

const clientId = typeof argv._[0] === 'string' ? argv._[0] : 'terminal';

console.log('Loading settings...');

await loadSettings(argv.data);

const controllerSettings = await readCombineSettings(
    path.join(getBackendDir(argv.data), argv.backend),
    path.join(getTurnTemplateDir(argv.data), argv.turn_template),
    path.join(getCharacterDir(argv.data), argv.character)
);

// Create the Bot client
const botClient: BotClient = createClient(clientId, controllerSettings);

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
