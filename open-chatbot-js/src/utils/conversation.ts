import { EventEmitter } from 'events';
import { PromptTemplate } from 'langchain/prompts';
import { CommandApi } from '../bot_api/command_api.js';
import { settings } from '../settings.js';
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
    private fixedContext: string | undefined;
    private updating = false;

    botController: BotController;
    context: any;
    memoryContext: string;
    private messageBuffer: CyclicBuffer<ConvMessage>;

    constructor(
        botController: BotController,
        context: any = undefined,
        fixedContext: string | undefined = undefined
    ) {
        super();
        this.botController = botController;
        this.fixedContext = fixedContext;
        this.context = context;
        this.memoryContext = '';
        this.messageBuffer = new CyclicBuffer(settings.message_history_size);
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
        this.delayTimeout = setTimeout(timeoutFunc, settings.chat_process_delay_ms);
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
        const context = [];
        const messages: ConvMessage[] = [];

        // Use fixed context as context if defined
        if (this.fixedContext != undefined) {
            context.push(this.fixedContext);
        } else {
            // parse tools
            const toolsTemplate = new PromptTemplate({
                inputVariables: [...Object.keys(this.botController.settings), 'now'],
                template: CommandApi.commandDoc,
            });
            const tools = await toolsTemplate.format({
                ...this.botController.settings,
                now: dateTimeToStr(new Date(), settings.locale),
            });

            // parse context
            const contextTemplate = new PromptTemplate({
                inputVariables: [...Object.keys(this.botController.settings), 'tools', 'now'],
                template:
                    this.botController.settings.context.join('\n') +
                    this.botController.settings.command,
            });
            context.push(
                await contextTemplate.format({
                    ...this.botController.settings,
                    tools: tools,
                    now: dateTimeToStr(new Date(), settings.locale),
                })
            );

            // if we're not at capacity: append history to prefix
            if (this.messageBuffer.length < this.messageBuffer.capacity) {
                // parse history
                const historyTemplate = new PromptTemplate({
                    inputVariables: [...Object.keys(this.botController.settings), 'now'],
                    template: (this.botController.settings.history ?? []).join('\n'),
                });
                const history = await historyTemplate.format({
                    ...this.botController.settings,
                    now: dateTimeToStr(new Date(), settings.locale),
                });

                if (history.length > 0) {
                    context.push(history);
                }
            }
        }

        // append the context
        await this.appendMessages(messages, [
            new ConvMessage('system', 'system', context.join('\n')),
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

    async getPromptString(messages: ConvMessage[], includesContext = true): Promise<string> {
        const userMessage: string[] = [];

        const messageTemplate = new PromptTemplate({
            inputVariables: ['sender', 'content'],
            template: '{sender}: {content}',
        });

        const turnTemplate = new PromptTemplate({
            inputVariables: [
                ...Object.keys(this.botController.settings),
                'user_message',
                'bot_message',
            ],
            template: this.botController.settings.turn_template.replace(/\s*(<\/s>)*\s*$/, ''),
        });

        // Extract context from messages if included
        if (includesContext) {
            userMessage.push(messages[0].content);
            messages = messages.slice(1);
        }

        // Add messages
        for (const m of messages) {
            userMessage.push(await messageTemplate.format(m));
        }

        // Parse bot_message parameter for turn template
        const botMessageTemplate = new PromptTemplate({
            inputVariables: Object.keys(this.botController.settings),
            template: this.botController.settings.bot_message ?? '',
        });
        const botMessage = await botMessageTemplate.format(this.botController.settings);

        // Format according to turn template
        const prompt =
            (this.botController.settings.prefix ?? '') +
            (await turnTemplate.format({
                ...this.botController.settings,
                user_message: userMessage.join('\n'),
                bot_message: botMessage,
            }));

        return prompt;
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
            const numTokens = await this.botController.botModel.countTokens(prompt);
            if (numTokens <= limit) {
                target.push(...truncated);
                return prompt;
            }
            // if not, remove the oldest message and try again
            truncated.shift();
        }
        return await this.getPromptString(target, includesPrefix);
    }
}
