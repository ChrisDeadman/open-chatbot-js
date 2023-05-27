import { CommandApi } from '../bot_api/command_api.js';
import { SpeechApi } from '../bot_api/speech_api.js';
import { MemoryProvider } from '../memory/memory_provider.js';
import { BotModel } from '../models/bot_model.js';
import { TokenModel } from '../models/token_model.js';
import { ConvMessage } from '../utils/conv_message.js';
import { Conversation, ConversationEvents } from '../utils/conversation.js';
import { BotClient } from './bot_client.js';

export class STTTSClient extends BotClient {
    private username;
    private new_conversation_delay;
    private speech: SpeechApi;
    private conversation: Conversation;

    private shutdownRequested = false;
    private shutdownPromise: Promise<void> | null = null;
    private lastMessageTime = 0;

    constructor(
        settings: any,
        botModel: BotModel,
        tokenModel: TokenModel,
        speech: SpeechApi,
        botApiHandler: CommandApi,
        memory: MemoryProvider | undefined = undefined,
        username = 'User'
    ) {
        super(botModel, tokenModel, botApiHandler);
        this.speech = speech;
        this.username = username;
        this.conversation = new Conversation(settings, tokenModel, memory);
        this.new_conversation_delay = this.conversation.settings.chat_process_delay_ms * 2;
    }

    async startup() {
        this.shutdownRequested = false;
        this.shutdownPromise = this.startWorker();
        this.conversation.on(ConversationEvents.Updated, this.onConversationUpdated.bind(this));
    }

    async shutdown() {
        this.shutdownRequested = true;
        await this.shutdownPromise;
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
                        console.log(`${message.sender}: ${message.content}`);
                    }
                    chat = true;
                    break;
                }
                case 'assistant':
                    console.log(`${message.sender}: ${message.content}`);
                    await this.speech.speak(message.content);
                    break;
                case 'system':
                    console.log(`${message.sender}: ${message.content}`);
                    break;
            }
        }
        if (chat) {
            try {
                await this.chat(conversation);
                this.lastMessageTime = Date.now();
            } catch (error) {
                console.error(error);
            }
        }
    }

    private async startWorker(): Promise<void> {
        console.log('Bot startup complete.');
        try {
            while (!this.shutdownRequested) {
                // Listen for new messages
                const now = Date.now();
                const useTriggerWord = now - this.lastMessageTime > this.new_conversation_delay;
                const triggerWord = useTriggerWord ? this.conversation.settings.bot_name : null;
                const message = await this.speech.listen(triggerWord, this.new_conversation_delay);
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
