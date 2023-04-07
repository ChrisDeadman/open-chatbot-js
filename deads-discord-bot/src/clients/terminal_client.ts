import { BotModel } from '../models/bot_model.js';

import readline from 'readline';

import { settings } from '../settings.js';

import { ConversationData } from '../models/converstation_data.js';
import { BotClient } from './bot_client.js';

export class TerminalClient implements BotClient {
    private botModel: BotModel;
    private conversation: ConversationData;
    private rlInterface: any;

    constructor(botModel: BotModel) {
        this.botModel = botModel;
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
                this.conversation.addMessage({ role: 'user', content: `Konsolero: ${line}` });
                const response = await this.botModel.ask(this.conversation);
                if (response.length > 0) {
                    this.conversation.addMessage({ role: 'assistant', content: response });
                    console.log(`${this.botModel.name}: ${response}`);
                }
            } catch (error) {
                console.error('Channel processing error:', error);
            }
        });
    }
}
