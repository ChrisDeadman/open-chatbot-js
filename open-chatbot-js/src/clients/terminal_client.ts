import readline from 'readline';
import { ConvMessage } from '../utils/conv_message.js';
import { Conversation, ConversationEvents } from '../utils/conversation.js';
import { BotClient } from './bot_client.js';
import { BotController } from '../utils/bot_controller.js';

export class TerminalClient implements BotClient {
    private rlInterface: any;
    private conversation: Conversation;
    private conversationSequence: number | undefined;

    private username;
    private botController: BotController;

    constructor(settings: any, username = 'User') {
        this.botController = new BotController(settings);
        this.username = username;
        this.conversation = new Conversation(this.botController);
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
        await this.botController.init();

        console.log('Client startup complete.');
        process.stdout.write(`${this.username}> `);
    }

    async shutdown() {
        this.rlInterface.close();
        console.log('Client shutdown complete.');
    }

    async onConversationUpdated(conversation: Conversation) {
        const messages = conversation.getMessagesAfter(this.conversationSequence);
        if (messages.length > 0) {
            this.conversationSequence = messages.at(-1)?.sequence;
        }
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
            await this.botController.chat(conversation).catch(error => console.error(error));
        }
        process.stdout.write(`${this.username}> `);
    }
}
