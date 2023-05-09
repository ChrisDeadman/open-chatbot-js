import readline from 'readline';
import { CommandApi } from '../bot_api/command_api.js';
import { MemoryProvider } from '../memory/memory_provider.js';
import { BotModel } from '../models/bot_model.js';
import { ConvMessage } from '../models/conv_message.js';
import { EmbeddingModel } from '../models/embedding_model.js';
import { settings } from '../settings.js';
import { CyclicBuffer } from '../utils/cyclic_buffer.js';
import { BotClient } from './bot_client.js';

export class TerminalClient extends BotClient {
    private rlInterface: any;
    protected conversation: CyclicBuffer<ConvMessage>;

    private username;

    constructor(
        botModel: BotModel,
        embeddingModel: EmbeddingModel,
        memory: MemoryProvider,
        botApiHandler: CommandApi,
        username = 'User'
    ) {
        super(botModel, embeddingModel, memory, botApiHandler);
        this.username = username;
        this.conversation = new CyclicBuffer(settings.message_history_size);
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

    async handleResponse(_context: any, response: string): Promise<void> {
        console.log(`${this.botModel.name}: ${response}`);
    }

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    startTyping(_context: any): void {
        // nothing
    }

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    stopTyping(_context: any): void {
        // nothing
    }

    private initEventListeners() {
        this.rlInterface.on('line', async (line: string) => {
            try {
                line = line.trim();
                if (line.length > 0) {
                    // Add new message to conversation
                    this.conversation.push({
                        role: 'user',
                        sender: this.username,
                        content: `${line}`,
                    });

                    // Chat with bot
                    await this.chat(this.conversation, settings.default_language);
                }
            } catch (error) {
                console.error(error);
            }
            process.stdout.write(`${this.username}> `);
        });
        console.log('Bot startup complete.');
        process.stdout.write(`${this.username}> `);
    }
}
