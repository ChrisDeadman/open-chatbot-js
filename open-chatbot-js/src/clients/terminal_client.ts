import readline from 'readline';
import { CommandApi } from '../bot_api/command_api.js';
import { MemoryProvider } from '../memory/memory_provider.js';
import { BotModel } from '../models/bot_model.js';
import { TokenModel } from '../models/token_model.js';
import { ConvMessage } from '../utils/conv_message.js';
import { Conversation, ConversationEvents } from '../utils/conversation.js';
import { BotClient } from './bot_client.js';

export class TerminalClient extends BotClient {
    private rlInterface: any;
    protected conversation: Conversation;

    private username;

    constructor(
        settings: any,
        botModel: BotModel,
        tokenModel: TokenModel,
        botApiHandler: CommandApi,
        memory: MemoryProvider | undefined = undefined,
        username = 'User'
    ) {
        super(botModel, tokenModel, botApiHandler);
        this.username = username;
        this.conversation = new Conversation(settings, tokenModel, memory);
    }

    async startup() {
        this.rlInterface = readline.createInterface({
            input: process.stdin,
            terminal: false,
        });

        this.rlInterface.on('line', async (line: string) => {
            try {
                line = line.trim();
                if (line.length > 0) {
                    // Add new message to conversation
                    this.conversation.push(new ConvMessage('user', this.username, line));
                }
            } catch (error) {
                console.error(error);
            }
        });

        this.conversation.on(ConversationEvents.Updated, this.onConversationUpdated.bind(this));

        console.log('Bot startup complete.');
        process.stdout.write(`${this.username}> `);
    }

    async shutdown() {
        this.rlInterface.close();
        console.log('Bot has been shut down.');
    }

    async onConversationUpdated(conversation: Conversation) {
        const messages = conversation.getMessagesFromMark();
        conversation.mark();
        let chat = false;
        for (const message of messages) {
            switch (message.role) {
                case 'user': {
                    if (message.sender != this.username) {
                        process.stdout.write(`${message.sender}: ${message.content}\n`);
                    }
                    chat = true;
                    break;
                }
                case 'assistant':
                    process.stdout.write(`${message.sender}: ${message.content}\n`);
                    break;
                case 'system':
                    process.stdout.write(`\n${message.content}\n`);
                    break;
            }
        }
        if (chat) {
            // do not await here otherwise chats will pile up!
            this.chat(conversation).catch(error => console.error(error));
        }
        process.stdout.write(`${this.username}> `);
    }
}
