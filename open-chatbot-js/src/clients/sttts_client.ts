import { settings } from '../settings.js';
import { BotController } from '../utils/bot_controller.js';
import { ConvMessage } from '../utils/conv_message.js';
import { Conversation } from '../utils/conversation.js';
import { ConversationChain, ConversationChainEvents } from '../utils/conversation_chain.js';
import { BotClient } from './bot_client.js';

export class STTTSClient implements BotClient {
    private botController: BotController;
    private conversationChain: ConversationChain;
    private conversationSequence: number | undefined;

    private username;
    private new_conversation_delay;
    private shutdownRequested = false;
    private shutdownPromise: Promise<void> | null = null;

    constructor(botController: BotController, username = 'User') {
        this.botController = botController;
        this.conversationChain = new ConversationChain();
        this.conversationChain.addConversation(new Conversation(this.botController));
        this.username = username;
        this.new_conversation_delay = settings.chat_process_delay_ms * 2;
    }

    async startup() {
        await this.botController.init();
        this.shutdownRequested = false;
        this.shutdownPromise = this.startWorker();
        this.conversationChain.on(
            ConversationChainEvents.Updated,
            this.onConversationUpdated.bind(this)
        );
    }

    async shutdown() {
        this.shutdownRequested = true;
        await this.shutdownPromise;
        console.log('Client shutdown complete.');
    }

    async onConversationUpdated(conversation: Conversation) {
        const messages = conversation.getMessagesAfter(this.conversationSequence);
        if (messages.length > 0) {
            this.conversationSequence = messages.at(-1)?.sequence;
        }
        for (const message of messages) {
            switch (message.role) {
                case 'user': {
                    if (message.sender != this.username) {
                        console.log(`${message.sender}: ${message.content}`);
                    }
                    break;
                }
                case 'assistant':
                    console.log(`${message.sender}: ${message.content}`);
                    await this.botController.speech.speak(message.content);
                    break;
                default:
                    console.log(`${message.sender}: ${message.content}`);
                    break;
            }
        }
    }

    private async startWorker(): Promise<void> {
        console.log('Client startup complete.');
        try {
            let lastMessageTime = 0;
            while (!this.shutdownRequested) {
                // Listen for new messages
                const useTriggerWord = Date.now() - lastMessageTime > this.new_conversation_delay;
                const triggerWord = useTriggerWord ? this.botController.settings.name : null;
                const messageContent = await this.botController.speech.listen(
                    triggerWord,
                    this.new_conversation_delay
                );
                lastMessageTime = Date.now();
                if (messageContent.length <= 0) {
                    continue;
                }

                const message = new ConvMessage('user', this.username, messageContent);
                console.info(`${message.sender}: ${message.content}`);

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
    }
}
