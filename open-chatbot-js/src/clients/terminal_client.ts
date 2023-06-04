import readline from 'readline';
import { BotController } from '../utils/bot_controller.js';
import { ConvMessage } from '../utils/conv_message.js';
import { Conversation } from '../utils/conversation.js';
import { ConversationChain, ConversationChainEvents } from '../utils/conversation_chain.js';
import { BotClient } from './bot_client.js';

export class TerminalClient implements BotClient {
    private rlInterface: any;
    private conversationChain: ConversationChain;
    private conversationSequence: number | undefined;

    private username;
    private botController: BotController;

    constructor(settings: any, username = 'User') {
        this.botController = new BotController(settings);
        this.username = username;
        this.conversationChain = new ConversationChain();
        this.conversationChain.addConversation(new Conversation(this.botController));
    }

    async startup() {
        await this.botController.init();

        this.rlInterface = readline.createInterface({
            input: process.stdin,
            terminal: false,
        });

        this.rlInterface.on('line', async (line: string) => {
            try {
                const messageContent = line.trim();
                if (messageContent.length > 0) {
                    const message = new ConvMessage('user', this.username, messageContent);

                    // push to conversation chain
                    this.conversationChain.push(message).then(async conversation => {
                        // trigger chat if nobody is chatting
                        if (!this.conversationChain.chatting) {
                            await this.conversationChain
                                .chat(conversation)
                                .catch(error => console.error(error));
                        }
                    });
                }
            } catch (error) {
                console.error(error);
            }
        });

        this.conversationChain.on(
            ConversationChainEvents.Updated,
            this.onConversationUpdated.bind(this)
        );

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
        let printPrompt = true;
        for (const message of messages) {
            switch (message.role) {
                case 'user': {
                    if (message.sender != this.username) {
                        process.stdout.write(`${message.sender}: ${message.content}\n`);
                    } else {
                        printPrompt = false;
                    }
                    break;
                }
                case 'assistant':
                    process.stdout.write(`${message.sender}: ${message.content}\n`);
                    break;
                default:
                    process.stdout.write(`\n${message.content}\n`);
                    break;
            }
        }
        if (printPrompt) {
            process.stdout.write(`${this.username}> `);
        }
    }
}
