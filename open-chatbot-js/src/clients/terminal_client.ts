import readline from 'readline';
import { CommandApi } from '../bot_api/command_api.js';
import { MemoryProvider } from '../memory/memory_provider.js';
import { BotModel } from '../models/bot_model.js';
import { ConversationData } from '../models/conversation_data.js';
import { settings } from '../settings.js';
import { BotClient } from './bot_client.js';

export class TerminalClient extends BotClient {
    private rlInterface: any;
    protected conversation: ConversationData;

    private username;

    constructor(
        botModel: BotModel,
        memory: MemoryProvider,
        botApiHandler: CommandApi,
        username = 'Developer'
    ) {
        super(botModel, memory, botApiHandler);
        this.username = username;
        this.conversation = new ConversationData(
            settings.default_language,
            settings.message_history_size
        );
    }

    async startup() {
        this.rlInterface = readline.createInterface({
            input: process.stdin,
            terminal: false,
        });

        this.initEventListeners();
    }

    async shutdown() {
        this.rlInterface.close();
        console.log('Bot has been shut down.');
    }

    private initEventListeners() {
        this.rlInterface.on('line', async (line: string) => {
            try {
                // Add new message to conversation
                this.conversation.addMessage({
                    role: 'user',
                    sender: this.username,
                    content: `${line}`,
                });

                // Hand over control to bot handler - he knows best
                await this.chat(
                    this.conversation,
                    async response => {
                        console.log(`${this.botModel.name}: ${response}`);
                    },
                    () => null,
                    () => null
                );
            } catch (error) {
                console.error(error);
            }
            process.stdout.write(`${this.username}> `);
        });
        console.log('Bot startup complete.');
        process.stdout.write(`${this.username}> `);
    }
}
