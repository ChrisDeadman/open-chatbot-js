import { CommandApi } from '../bot_api/command_api.js';
import { SpeechApi } from '../bot_api/speech_api.js';
import { MemoryProvider } from '../memory/memory_provider.js';
import { BotModel } from '../models/bot_model.js';
import { ConversationData } from '../models/conversation_data.js';
import { settings } from '../settings.js';
import { BotClient } from './bot_client.js';

export class STTTSClient extends BotClient {
    private new_conversation_delay = settings.chat_process_delay_ms * 2;

    private speech: SpeechApi;
    protected conversation: ConversationData;

    private username;

    private shutdownRequested = false;
    private shutdownPromise: Promise<void> | null = null;
    private lastMessageTime = 0;

    constructor(
        botModel: BotModel,
        memory: MemoryProvider,
        speech: SpeechApi,
        botApiHandler: CommandApi,
        username = 'Developer'
    ) {
        super(botModel, memory, botApiHandler);
        this.speech = speech;
        this.username = username;
        this.conversation = new ConversationData(
            settings.default_language,
            settings.message_history_size
        );
    }

    async startup() {
        this.shutdownRequested = false;
        this.shutdownPromise = this.startWorker();
    }

    async shutdown() {
        this.shutdownRequested = true;
        await this.shutdownPromise;
        console.log('Bot has been shut down.');
    }

    private async startWorker(): Promise<void> {
        console.log('Bot startup complete.');
        try {
            while (!this.shutdownRequested) {
                // Listen for new messages
                const now = Date.now();
                const useTriggerWord = now - this.lastMessageTime > this.new_conversation_delay;
                const triggerWord = useTriggerWord ? this.botModel.name : null;
                const message = await this.speech.listen(triggerWord, this.new_conversation_delay);
                if (message.length <= 0) {
                    continue;
                }
                console.info(`${this.username}: ${message}`);

                // Add new message to conversation
                this.conversation.addMessage({
                    role: 'user',
                    sender: this.username,
                    content: `${message}`,
                });

                // Hand over control to bot handler - he knows best
                await this.chat(
                    this.conversation,
                    async response => {
                        await this.speech.speak(response);
                        console.log(`${this.botModel.name}: ${response}`);
                    },
                    () => null,
                    () => null
                );
                this.lastMessageTime = Date.now();
            }
        } catch (error) {
            console.error(error);
        }
    }
}