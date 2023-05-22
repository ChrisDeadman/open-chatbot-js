import readline from 'readline';
import { CommandApi } from '../bot_api/command_api.js';
import { MemoryProvider } from '../memory/memory_provider.js';
import { BotModel } from '../models/bot_model.js';
import { TokenModel } from '../models/token_model.js';
import { settings } from '../settings.js';
import { ConvMessage } from '../utils/conv_message.js';
import { CyclicBuffer } from '../utils/cyclic_buffer.js';
import { BotClient } from './bot_client.js';

export class TerminalClient extends BotClient {
    private rlInterface: any;
    protected conversation: CyclicBuffer<ConvMessage>;

    private username;
    private chatting = false;

    constructor(
        botModel: BotModel,
        tokenModel: TokenModel,
        memory: MemoryProvider,
        botApiHandler: CommandApi,
        username = 'User'
    ) {
        super(botModel, tokenModel, memory, botApiHandler);
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
        if (this.chatting) {
            process.stdout.write(`${this.botModel.name}: ${response.trim()}\n`);
        } else {
            process.stdout.write(`\n${response.trim()}\n${this.username}> `);
        }
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
            this.chatting = true;
            try {
                line = line.trim();
                if (line.length > 0) {
                    // Add new message to conversation
                    this.conversation.push(new ConvMessage('user', this.username, `${line}`));

                    // Chat with bot
                    await this.chat(this.conversation, settings.default_language);
                }
            } catch (error) {
                console.error(error);
            } finally {
                this.chatting = false;
            }
            process.stdout.write(`${this.username}> `);
        });
        console.log('Bot startup complete.');
        process.stdout.write(`${this.username}> `);
    }
}
