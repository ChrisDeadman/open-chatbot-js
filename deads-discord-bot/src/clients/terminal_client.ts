import { BotModel } from '../models/bot_model.js';

import readline from 'readline';

import { settings } from '../settings.js';

import { BotApiHandler } from '../bot_api/bot_api_handler.js';
import { ConversationData } from '../models/converstation_data.js';
import { BotClient, handleBot } from './bot_client.js';

export class TerminalClient implements BotClient {
    private botModel: BotModel;
    private botApiHandler: BotApiHandler;
    private conversation: ConversationData;
    private rlInterface: any;

    constructor(botModel: BotModel, botApiHandler: BotApiHandler) {
        this.botModel = botModel;
        this.botApiHandler = botApiHandler;
        this.conversation = new ConversationData(
            settings.default_language,
            settings.message_history_size
        );
    }

    async startup() {
        this.rlInterface = readline.createInterface({
            input: process.stdin,
            //output: process.stdout,
            terminal: false,
        });

        this.initEventListeners();

        console.log('Bot startup complete.');
    }

    async shutdown() {
        this.rlInterface.close();
        console.log('Bot has been shut down.');
    }

    private initEventListeners() {
        this.rlInterface.on('line', async (line: string) => {
            try {
                // Add new message to conversation
                this.conversation.addMessage({ role: 'user', content: `Konsolero: ${line}` });

                // Hand over control to bot handler - he knows best
                handleBot(
                    this.botModel,
                    this.botApiHandler,
                    this.conversation,
                    async response => {
                        console.log(`${this.botModel.name}: ${response}`);
                    },
                    () => null,
                    () => null
                );
            } catch (error) {
                console.error('Channel processing error:', error);
            }
        });
    }
}
