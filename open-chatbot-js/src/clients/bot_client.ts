import { PromptTemplate } from 'langchain/prompts';
import { Command, CommandApi } from '../bot_api/command_api.js';
import { MemoryProvider } from '../memory/memory_provider.js';
import { BotModel } from '../models/bot_model.js';
import { TokenModel } from '../models/token_model.js';
import { settings } from '../settings.js';
import { ConvMessage } from '../utils/conv_message.js';
import { dateTimeToStr } from '../utils/conversion_utils.js';
import { CyclicBuffer } from '../utils/cyclic_buffer.js';
import { commandToString, parseCommandBlock, parseJsonCommands } from '../utils/parsing_utils.js';

export abstract class BotClient {
    public botModel: BotModel;
    public tokenModel: TokenModel;
    public memory: MemoryProvider;
    protected botApiHandler: CommandApi;

    constructor(
        botModel: BotModel,
        tokenModel: TokenModel,
        memory: MemoryProvider,
        botApiHandler: CommandApi
    ) {
        this.botModel = botModel;
        this.tokenModel = tokenModel;
        this.memory = memory;
        this.botApiHandler = botApiHandler;
    }

    abstract startup(): Promise<void>;

    abstract shutdown(): Promise<void>;

    protected abstract handleResponse(context: any, response: string): Promise<void>;

    protected abstract startTyping(context: any): void;

    protected abstract stopTyping(context: any): void;

    protected async chat(
        conversation: CyclicBuffer<ConvMessage>,
        language: string,
        context: any = null,
        allowCommands = true
    ) {
        const conv_list = [...conversation];

        // Start typing
        this.startTyping(context);
        try {
            // get memory vector related to conversation context
            const memContext = await this.tokenModel.truncateMessages(
                conv_list.filter(msg => msg.role != 'system')
            );

            // chat with bot
            const messages = await this.getMessages(conv_list, memContext, language);
            const response = await this.botModel.chat(messages);

            // parse bot response
            const responseData = this.parseResponse(response);

            // store the bot response
            if (responseData.message.length > 0) {
                conversation.push(
                    new ConvMessage('assistant', this.botModel.name, responseData.message)
                );
            }

            // Execute commands
            if (allowCommands && responseData.commands.length > 0) {
                responseData.commands.forEach((cmd: Record<string, string>) => {
                    console.debug(`CMD: ${JSON.stringify(cmd)}`);
                    // Replace message with thought
                    if (responseData.commands.length < 2 && cmd.command === Command.Thought) {
                        responseData.message = `*${cmd.data.trim()}*`;
                    }
                    this.botApiHandler.handleRequest(cmd, memContext, language).then(result => {
                        // Add API response to system messages when finished
                        if (result.length > 0) {
                            conversation.push(
                                new ConvMessage(
                                    'system',
                                    'system',
                                    result.slice(0, this.tokenModel.maxTokens / 2) // limit text
                                )
                            );
                            this.handleResponse(context, result);
                        }
                    });
                });
            }

            // Display message to the client
            if (responseData.message.length > 0) {
                await this.handleResponse(context, responseData.message);
            }
        } catch (error) {
            // Display error to the client
            await this.handleResponse(context, String(error));
        } finally {
            // Stop typing
            this.stopTyping(context);
        }
    }

    protected async getMessages(
        conversation: ConvMessage[],
        memoryContext: ConvMessage[],
        language: string
    ): Promise<ConvMessage[]> {
        const messages: ConvMessage[] = [];

        // format prefix
        const prefixTemplate = new PromptTemplate({
            inputVariables: [...Object.keys(settings), 'now'],
            template: settings.prompt_templates.prefix.join('\n'),
        });
        const prefix = await prefixTemplate.format({
            ...settings,
            language: language,
            now: dateTimeToStr(new Date(), settings.locale),
        });

        // add prefix to the context
        if (prefix.length >= 0) {
            messages.push(new ConvMessage('system', 'system', prefix));
        }

        if (memoryContext.length > 0) {
            // get memories related to the memory vector
            const memories = (await this.memory.get(memoryContext, 10)).map(
                m => new ConvMessage('system', 'system', m)
            );

            // add limited amount of memories
            const memoriesLimited = await this.tokenModel.truncateMessages(
                memories,
                this.tokenModel.maxTokens / 2
            );
            memoriesLimited.forEach(m => messages.push(m));
        }

        // add most recent messages, save some tokens for the response
        const currentTokens = await this.tokenModel.tokenize(messages);
        const messagesLimited = await this.tokenModel.truncateMessages(
            conversation,
            -(currentTokens.length + 512)
        );
        messagesLimited.forEach(m => messages.push(m));

        return messages;
    }

    protected parseResponse(response: string): any {
        // Strip end-of-previous-sentence and the bot name
        response = response.replace(
            new RegExp(`\\p{P}*\\n*\\s*${this.botModel.name}:\\s*`, 'u'),
            ''
        );

        // Strip excess newlines
        response = response
            .replaceAll('\r', '\n')
            .replaceAll(/(\s*\n){2,}/g, '\n')
            .trimStart();

        const commands: Record<string, string>[] = [];

        // Check each code segment for commands
        for (const match of [...response.matchAll(/[`]+([^`]+)[`]+/g)]) {
            const new_cmds: Record<string, string>[] = [];
            const command = parseCommandBlock(match[1]);
            if (command) {
                new_cmds.push(command);
            } else {
                new_cmds.push(...parseJsonCommands(match[1]));
            }
            if (new_cmds.length > 0) {
                // Add to the parsed command list
                commands.push(...new_cmds);
                // Replace commands with parsed commands in the response
                // This aids the model in keeping consistent formatting
                const useJson = false;
                if (useJson) {
                    response = response.replace(
                        match[0],
                        new_cmds.map(cmd => `\`${JSON.stringify(cmd)}\``).join('\n')
                    );
                } else {
                    response = response.replace(
                        match[0],
                        new_cmds.map(cmd => commandToString(cmd)).join('\n')
                    );
                }
            }
        }

        return { message: response, commands: [...new Set(commands)] };
    }
}
