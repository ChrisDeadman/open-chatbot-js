import { BotController } from '../utils/bot_controller.js';
import { ConvMessage } from '../utils/conv_message.js';
import { Conversation, ConversationEvents } from '../utils/conversation.js';
import { BotClient } from './bot_client.js';

export class STTTSClient implements BotClient {
    private botController: BotController;
    private conversation: Conversation;
    private conversationMark: ConvMessage | undefined;

    private username;
    private new_conversation_delay;
    private shutdownRequested = false;
    private shutdownPromise: Promise<void> | null = null;
    private lastMessageTime = 0;

    constructor(settings: any, username = 'User') {
        this.botController = new BotController(settings);
        this.conversation = new Conversation(this.botController);
        this.username = username;
        this.new_conversation_delay =
            this.conversation.botController.settings.chat_process_delay_ms * 2;
    }

    async startup() {
        this.shutdownRequested = false;
        this.shutdownPromise = this.startWorker();
        this.conversation.on(ConversationEvents.Updated, this.onConversationUpdated.bind(this));
        await this.botController.init();
    }

    async shutdown() {
        this.shutdownRequested = true;
        await this.shutdownPromise;
        console.log('Client shutdown complete.');
    }

    async onConversationUpdated(conversation: Conversation) {
        const messages = conversation.getMessagesFromMark(this.conversationMark) || [];
        if (messages.length <= 0) {
            messages.push(...conversation.messages);
        }
        this.conversationMark = conversation.mark();
        let chat = false;
        for (const message of messages) {
            switch (message.role) {
                case 'user': {
                    if (message.sender != this.username) {
                        console.log(`${message.sender}: ${message.content}`);
                    }
                    chat = true;
                    break;
                }
                case 'assistant':
                    console.log(`${message.sender}: ${message.content}`);
                    await this.botController.speech.speak(message.content);
                    break;
                case 'system':
                    console.log(`${message.sender}: ${message.content}`);
                    break;
            }
        }
        if (chat) {
            await this.botController.chat(conversation).catch(error => console.error(error));
        }
    }

    private async startWorker(): Promise<void> {
        console.log('Client startup complete.');
        try {
            while (!this.shutdownRequested) {
                // Listen for new messages
                const now = Date.now();
                const useTriggerWord = now - this.lastMessageTime > this.new_conversation_delay;
                const triggerWord = useTriggerWord
                    ? this.conversation.botController.settings.bot_name
                    : null;
                const message = await this.botController.speech.listen(
                    triggerWord,
                    this.new_conversation_delay
                );
                if (message.length <= 0) {
                    continue;
                }
                console.info(`${this.username}: ${message}`);

                // Add new message to conversation
                this.conversation.push(new ConvMessage('user', this.username, message));
            }
        } catch (error) {
            console.error(error);
        }
    }
}
