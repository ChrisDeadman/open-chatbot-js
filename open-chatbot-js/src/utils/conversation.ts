import { EventEmitter } from 'events';
import { PromptTemplate } from 'langchain/prompts';
import { dateTimeToStr } from '../utils/conversion_utils.js';
import { BotController } from './bot_controller.js';
import { ConvMessage } from './conv_message.js';
import { CyclicBuffer } from './cyclic_buffer.js';

export enum ConversationEvents {
    Updated = 'updated',
    UpdatedDelayed = 'updated delayed', // This is delayed by settings.chat_process_delay_ms
    Cleared = 'cleared',
}

export class Conversation extends EventEmitter {
    private delayTimeout: NodeJS.Timeout | undefined;
    private fixedPrompt: string | undefined;
    private updating = false;

    botController: BotController;
    context: any;
    memoryContext: string;
    private messageBuffer: CyclicBuffer<ConvMessage>;

    constructor(
        botController: BotController,
        context: any = undefined,
        fixedPrompt: string | undefined = undefined
    ) {
        super();
        this.botController = botController;
        this.fixedPrompt = fixedPrompt;
        this.context = context;
        this.memoryContext = '';
        this.messageBuffer = new CyclicBuffer(this.botController.settings.message_history_size);
    }

    clear() {
        this.messageBuffer.clear();
        this.memoryContext = '';
        this.emit(ConversationEvents.Cleared, this);
    }

    push(...messages: ConvMessage[]) {
        if (messages.length <= 0) {
            return;
        }
        this.messageBuffer.push(...messages);

        // Update memory context and emit updated event
        this.updateMemoryContext().then(() => {
            this.emit(ConversationEvents.Updated, this);
        });

        // Emit delayed update event
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
            // Emit delayed update event
            this.updating = true;
            try {
                this.emit(ConversationEvents.UpdatedDelayed, this);
            } finally {
                this.delayTimeout = undefined;
                this.updating = false;
            }
        };
        this.delayTimeout = setTimeout(
            timeoutFunc,
            this.botController.settings.chat_process_delay_ms
        );
    }

    get messages(): ConvMessage[] {
        return [...this.messageBuffer];
    }

    getMessagesAfter(sequence: number | undefined): ConvMessage[] {
        // Copy the CyclicBuffer messages to a standard array
        const messagesArray = [...this.messageBuffer];

        // If sequence is undefined, return all messages
        if (sequence === undefined) {
            return messagesArray;
        }

        // Find the index of the sequence in the array
        const sequenceIndex = messagesArray.findLastIndex(msg => msg.sequence <= sequence);

        // Return empty array if the sequence wasn't found
        if (sequenceIndex < 0) {
            return [];
        }

        // Return the slice of the array starting from the message with a higher sequence
        return messagesArray.slice(sequenceIndex + 1);
    }

    async getPrompt(): Promise<ConvMessage[]> {
        const prefix = [];
        const messages: ConvMessage[] = [];

        // Use fixed prompt as prefix if defined
        if (this.fixedPrompt != undefined) {
            prefix.push(this.fixedPrompt);
        } else {
            // parse tools
            const toolsTemplate = new PromptTemplate({
                inputVariables: [...Object.keys(this.botController.settings), 'now'],
                template: this.botController.settings.prompt_templates.tools.join('\n'),
            });
            const tools = await toolsTemplate.format({
                ...this.botController.settings,
                now: dateTimeToStr(new Date(), this.botController.settings.locale),
            });

            // parse prefix
            const prefixTemplate = new PromptTemplate({
                inputVariables: [...Object.keys(this.botController.settings), 'tools', 'now'],
                template: this.botController.settings.prompt_templates.prefix.join('\n'),
            });
            prefix.push(
                await prefixTemplate.format({
                    ...this.botController.settings,
                    tools: tools,
                    now: dateTimeToStr(new Date(), this.botController.settings.locale),
                })
            );

            // if we're not at capacity: append history to prefix
            if (this.messageBuffer.length < this.messageBuffer.capacity) {
                // parse history
                const historyTemplate = new PromptTemplate({
                    inputVariables: [...Object.keys(this.botController.settings), 'now'],
                    template: this.botController.settings.prompt_templates.history.join('\n'),
                });
                const history = await historyTemplate.format({
                    ...this.botController.settings,
                    now: dateTimeToStr(new Date(), this.botController.settings.locale),
                });

                prefix.push(history);
            }
        }

        // append the prefix
        await this.appendMessages(messages, [
            new ConvMessage('system', 'system', prefix.join('\n')),
        ]);

        if (this.botController.memory && this.memoryContext.length >= 0) {
            // get memories related to the memory vector
            const memories = (await this.botController.memory.get(this.memoryContext, 10)).map(
                m => new ConvMessage('system', 'memory', m)
            );

            // add limited amount of memories
            await this.appendMessages(
                messages,
                memories,
                true,
                this.botController.tokenModel.maxTokens / 2
            );
        }

        // add most recent messages, save some tokens for the response
        await this.appendMessages(
            messages,
            [...this.messageBuffer],
            true,
            -this.botController.settings.bot_backend.max_new_tokens
        );

        return messages;
    }

    async getPromptString(messages: ConvMessage[], includesPrefix = true): Promise<string> {
        const prompt: string[] = [];

        const systemTemplate = new PromptTemplate({
            inputVariables: ['role', 'sender', 'content'],
            template: this.botController.settings.prompt_templates.system_message,
        });
        const userTemplate = new PromptTemplate({
            inputVariables: ['role', 'sender', 'content'],
            template: this.botController.settings.prompt_templates.user_message,
        });
        const assistantTemplate = new PromptTemplate({
            inputVariables: ['role', 'sender', 'content'],
            template: this.botController.settings.prompt_templates.assistant_message,
        });
        const suffixTemplate = new PromptTemplate({
            inputVariables: [...Object.keys(this.botController.settings), 'now'],
            template: this.botController.settings.prompt_templates.suffix.join('\n'),
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
            ...this.botController.settings,
            now: dateTimeToStr(new Date(), this.botController.settings.locale),
        });
        prompt.push(suffix);

        return prompt.join('\n');
    }

    // Update memory vector related to conversation context
    // Called internally before every update event
    async updateMemoryContext() {
        if (this.botController.memory) {
            const memContext: ConvMessage[] = [];
            this.memoryContext = await this.appendMessages(
                memContext,
                [...this.messageBuffer].slice(1),
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
                    ? Math.min(tokenLimit, this.botController.tokenModel.maxTokens)
                    : this.botController.tokenModel.maxTokens + tokenLimit
                : this.botController.tokenModel.maxTokens;
        if (limit <= 0) {
            return await this.getPromptString(target, includesPrefix);
        }

        const truncated = [...messages];
        while (truncated.length > 0) {
            // as long as there are enough tokens remaining for the response
            const prompt = await this.getPromptString([...target, ...truncated], includesPrefix);
            const tokens = await this.botController.tokenModel.tokenize(prompt);
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
