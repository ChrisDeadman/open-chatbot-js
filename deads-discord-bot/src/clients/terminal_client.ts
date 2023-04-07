import { BotModel } from '../models/bot_model.js';

import readline from 'readline';

import { settings } from '../settings.js';

import { ConversationData } from '../models/converstation_data.js';
import { BotApiHandler } from './bot_api/bot_api_handler.js';
import { BotClient } from './bot_client.js';

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
                // Ask bot
                this.conversation.addMessage({ role: 'user', content: `Konsolero: ${line}` });
                let response = await this.botModel.ask(settings.initial_prompt, this.conversation);
                if (response.length <= 0) {
                    return;
                }
                console.log(`${this.botModel.name}: ${response}`);

                // Let the bot use the API if it wants to but limit cycles
                for (let cycle = 0; cycle < settings.max_api_cycles; cycle += 1) {
                    const req_response = this.botApiHandler.handleAPIRequest(
                        this.conversation,
                        response
                    );
                    if (req_response.length <= 0) {
                        return;
                    }
                    console.log(`System: ${req_response.replace('\n', ' ')}`);

                    // Ask bot again with API answer
                    response = await this.botModel.ask(settings.initial_prompt, this.conversation);
                    if (response.length <= 0) {
                        return;
                    }
                    console.log(`${this.botModel.name}: ${response}`);
                }
            } catch (error) {
                console.error('Channel processing error:', error);
            }
        });
    }
}
