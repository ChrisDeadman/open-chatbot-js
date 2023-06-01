import { hideBin } from 'yargs/helpers';
import yargs from 'yargs/yargs';
import { loadSettings, settings } from './settings.js';

import { BotClient } from './clients/bot_client.js';
import { DiscordClient } from './clients/discord_client.js';
import { STTTSClient } from './clients/sttts_client.js';
import { TerminalClient } from './clients/terminal_client.js';
import { WebClient } from './clients/web_client.js';

function createClient(clientId: string): BotClient {
    const botSettings = JSON.parse(JSON.stringify(settings));
    switch (clientId) {
        case 'discord':
            return new DiscordClient(botSettings);
        case 'sttts':
            return new STTTSClient(botSettings);
        case 'web':
            return new WebClient(botSettings);
        default:
            return new TerminalClient(botSettings);
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

const clientId = typeof argv._[0] === 'string' ? argv._[0] : 'terminal';

console.log('Loading settings...');

await loadSettings(argv.settings);

// Create the Bot client
const botClient: BotClient = createClient(clientId);

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
