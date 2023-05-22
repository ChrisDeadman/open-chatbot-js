import { Command, CommandApi } from '../bot_api/command_api.js';
import { MemoryProvider } from '../memory/memory_provider.js';
import { BotModel } from '../models/bot_model.js';
import { TokenModel } from '../models/token_model.js';
import { settings } from '../settings.js';
import { ConvMessage } from '../utils/conv_message.js';
import { dateTimeToStr } from '../utils/conversion_utils.js';
import { CyclicBuffer } from '../utils/cyclic_buffer.js';
import { fixAndParseJson } from '../utils/json_utils.js';

export abstract class BotClient {
    public botModel: BotModel;
    public tokenModel: TokenModel;
    public memory: MemoryProvider;
    protected botApiHandler: CommandApi;
    protected initialPrompt: string;

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
        this.initialPrompt = settings.initial_prompt.join('\n');
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
                    // Clear message upon NOP command
                    if (cmd.command === Command.Nop) {
                        responseData.message = '';
                    }
                    this.botApiHandler.handleRequest(cmd, memContext, language).then(result => {
                        // Add API response to system messages when finished
                        if (result.length > 0) {
                            conversation.push(new ConvMessage('system', 'system', result));
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

        const initialPrompt = this.initialPrompt
            .replaceAll('$BOT_NAME', this.botModel.name)
            .replaceAll('$NOW', dateTimeToStr(new Date(), settings.locale))
            .replaceAll('$LANGUAGE', language);

        // add initial prompt to the context
        if (initialPrompt.length >= 0) {
            messages.push(new ConvMessage('system', 'system', initialPrompt));
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
        const messagesLimited = await this.tokenModel.truncateMessages(conversation, -512);
        messagesLimited.forEach(m => messages.push(m));

        return messages;
    }

    protected parseResponse(response: string): any {
        // Strip the botname in case it responds with it
        const botNamePrefix = `${this.botModel.name}:`;
        if (response.startsWith(botNamePrefix)) {
            response = response.slice(botNamePrefix.length);
        }

        // Strip excess newlines
        response = response.replaceAll('\r', '\n').replaceAll(/(\s*\n){2,}/g, '\n');

        let commands: any[] = [];

        // Check each code segment for commands
        for (const match of [...response.matchAll(/[`]+([^`]+)[`]+/g)]) {
            const new_cmds = this.parseCommand(match[1]);
            if (new_cmds.length > 0) {
                // Add to the parsed command list
                commands = commands.concat(new_cmds);
                // Replace commands with parsed commands in the response
                // This aids the model in keeping consistent formatting
                if (new_cmds.length > 1 || new_cmds[0].command != Command.Python) {
                    response = response.replace(
                        match[0],
                        new_cmds.map((cmd: any) => `\`${JSON.stringify(cmd)}\``).join('\n')
                    );
                } else {
                    response = response.replace(
                        match[0],
                        `\`\`\`${new_cmds[0].command}\n${new_cmds[0].data}\n\`\`\`\n`
                    );
                }
            }
        }

        return { message: response, commands: commands };
    }

    private parseCommand(response: string): Record<string, string>[] {
        const commands: Record<string, string>[] = [];

        // Match code-block types with commands
        const cmd = response
            .trimStart()
            .match(new RegExp(`^(${Object.values(Command).join('|')})\\s*([\\s\\S]+)`, 'i'));
        if (cmd) {
            return [{ command: cmd[1], data: cmd[2] }];
        }

        try {
            // Fix and parse json
            let responseData = fixAndParseJson(response);

            // Not a command response
            if (typeof responseData === 'string') {
                return commands;
            }

            // Combine multiple responses
            if (!Array.isArray(responseData)) {
                responseData = [responseData];
            }
            responseData.forEach((r: Record<string, string>) => {
                if ('command' in r) {
                    commands.push(r);
                }
            });
        } catch (error) {
            // ignore
        }

        return commands;
    }
}
