import { EventEmitter } from 'events';
import { PromptTemplate } from 'langchain/prompts';
import { MemoryProvider } from '../memory/memory_provider.js';
import { TokenModel } from '../models/token_model.js';
import { dateTimeToStr } from '../utils/conversion_utils.js';
import { ConvMessage } from './conv_message.js';
import { CyclicBuffer } from './cyclic_buffer.js';

export enum ConversationEvents {
    Updated = 'updated',
    Cleared = 'cleared',
}

export class Conversation extends EventEmitter {
    private tokenModel: TokenModel;
    private memory: MemoryProvider | undefined;
    private delayTimeout: NodeJS.Timeout | undefined;
    private markMessage: ConvMessage | undefined;
    private updating = false;

    settings: any;
    context: any;
    memoryContext: string;
    messages: CyclicBuffer<ConvMessage>;

    constructor(
        settings: any,
        tokenModel: TokenModel,
        memory: MemoryProvider | undefined = undefined,
        context: any = undefined
    ) {
        super();
        this.settings = settings;
        this.tokenModel = tokenModel;
        this.memory = memory;
        this.context = context;
        this.memoryContext = '';
        this.messages = new CyclicBuffer(this.settings.message_history_size);
    }

    clear() {
        this.messages.clear();
        this.memoryContext = '';
        this.emit(ConversationEvents.Cleared, this);
    }

    push(...messages: ConvMessage[]) {
        this.messages.push(...messages);

        if (this.delayTimeout) {
            clearTimeout(this.delayTimeout);
        }

        const timeoutFunc = async () => {
            // Cancelled
            if (this.delayTimeout === undefined) {
                return;
            }
            // Reschedule
            if (this.updating) {
                this.delayTimeout = setTimeout(timeoutFunc);
                return;
            }
            // Process updated event
            this.updating = true;
            try {
                await this.updateMemoryContext();
                this.emit(ConversationEvents.Updated, this);
            } finally {
                this.delayTimeout = undefined;
                this.updating = false;
            }
        };

        this.delayTimeout = setTimeout(timeoutFunc, this.settings.chat_process_delay_ms);
    }

    mark() {
        this.markMessage = [...this.messages].at(-1);
    }

    getMessagesFromMark(): ConvMessage[] {
        // Copy the CyclicBuffer messages to a standard array
        const messagesArray = [...this.messages];

        // If markMessage is undefined, return all messages
        if (!this.markMessage) {
            return messagesArray;
        }

        // Find the index of the markMessage in the array
        const markIndex = messagesArray.findIndex(msg =>
            this.markMessage ? msg.equals(this.markMessage) : false
        );

        // If the markMessage wasn't found, return all messages
        if (markIndex < 0) {
            return messagesArray;
        }

        // Return the slice of the array starting from the message after the mark
        return messagesArray.slice(markIndex + 1);
    }

    async getPrompt(): Promise<ConvMessage[]> {
        const messages: ConvMessage[] = [];

        // parse tools
        const toolsTemplate = new PromptTemplate({
            inputVariables: [...Object.keys(this.settings), 'now'],
            template: this.settings.prompt_templates.tools.join('\n'),
        });
        const tools = await toolsTemplate.format({
            ...this.settings,
            now: dateTimeToStr(new Date(), this.settings.locale),
        });

        // parse prefix
        const prefixTemplate = new PromptTemplate({
            inputVariables: [...Object.keys(this.settings), 'tools', 'now'],
            template: this.settings.prompt_templates.prefix.join('\n'),
        });
        const prefix = await prefixTemplate.format({
            ...this.settings,
            tools: tools,
            now: dateTimeToStr(new Date(), this.settings.locale),
        });

        // parse history
        const historyTemplate = new PromptTemplate({
            inputVariables: [...Object.keys(this.settings), 'now'],
            template: this.settings.prompt_templates.history.join('\n'),
        });
        const history = await historyTemplate.format({
            ...this.settings,
            now: dateTimeToStr(new Date(), this.settings.locale),
        });

        // combine and add them to the memories
        const combined = `${prefix}\n${history}`;
        if (combined.length >= 0) {
            await this.appendMessages(messages, [new ConvMessage('system', 'system', combined)]);
        }

        if (this.memory && this.memoryContext.length >= 0) {
            // get memories related to the memory vector
            const memories = (await this.memory.get(this.memoryContext, 10)).map(
                m => new ConvMessage('system', 'memory', m)
            );

            // add limited amount of memories
            await this.appendMessages(messages, memories, true, this.tokenModel.maxTokens / 2);
        }

        // add most recent messages, save some tokens for the response
        await this.appendMessages(messages, [...this.messages], true, -512);

        return messages;
    }

    async getPromptString(messages: ConvMessage[], includesPrefix = true): Promise<string> {
        const prompt: string[] = [];

        const systemTemplate = new PromptTemplate({
            inputVariables: ['role', 'sender', 'content'],
            template: this.settings.prompt_templates.system_message,
        });
        const userTemplate = new PromptTemplate({
            inputVariables: ['role', 'sender', 'content'],
            template: this.settings.prompt_templates.user_message,
        });
        const assistantTemplate = new PromptTemplate({
            inputVariables: ['role', 'sender', 'content'],
            template: this.settings.prompt_templates.assistant_message,
        });
        const suffixTemplate = new PromptTemplate({
            inputVariables: [...Object.keys(this.settings), 'now'],
            template: this.settings.prompt_templates.suffix.join('\n'),
        });

        // Use prefix as is
        if (includesPrefix) {
            prompt.push(messages[0].content);
            messages = messages.slice(1);
        }

        // Messages
        for (const m of messages) {
            switch (m.role) {
                case 'user':
                    prompt.push(await userTemplate.format(m));
                    break;
                case 'assistant':
                    prompt.push(await assistantTemplate.format(m));
                    break;
                default:
                    prompt.push(await systemTemplate.format(m));
                    break;
            }
        }

        // Suffix
        const suffix = await suffixTemplate.format({
            ...this.settings,
            now: dateTimeToStr(new Date(), this.settings.locale),
        });
        prompt.push(suffix);

        return prompt.join('\n');
    }

    // Update memory vector related to conversation context
    // Called internally before every update event
    async updateMemoryContext() {
        if (this.memory) {
            const memContext: ConvMessage[] = [];
            this.memoryContext = await this.appendMessages(
                memContext,
                [...this.messages].slice(1),
                false
            );
        }
    }

    private async appendMessages(
        target: ConvMessage[],
        messages: ConvMessage[],
        includesPrefix = true,
        tokenLimit?: number
    ): Promise<string> {
        const limit =
            tokenLimit != null
                ? tokenLimit >= 0
                    ? Math.min(tokenLimit, this.tokenModel.maxTokens)
                    : this.tokenModel.maxTokens + tokenLimit
                : this.tokenModel.maxTokens;
        if (limit <= 0) {
            return await this.getPromptString(target, includesPrefix);
        }

        const truncated = [...messages];
        while (truncated.length > 0) {
            // as long as there are enough tokens remaining for the response
            const prompt = await this.getPromptString([...target, ...truncated], includesPrefix);
            const tokens = await this.tokenModel.tokenize(prompt);
            if (tokens.length <= limit) {
                target.push(...truncated);
                return prompt;
            }
            // if not, remove the oldest message and try again
            truncated.shift();
        }
        return await this.getPromptString(target, includesPrefix);
    }
}
