import { Command, CommandApi } from '../bot_api/command_api.js';
import { MemoryProvider } from '../memory/memory_provider.js';
import { BotModel } from '../models/bot_model.js';
import { ConvMessage } from '../models/conv_message.js';
import { settings } from '../settings.js';
import { dateTimeToStr } from '../utils/conversion_utils.js';
import { CyclicBuffer } from '../utils/cyclic_buffer.js';
import { fixAndParseJson } from '../utils/json_utils.js';

export abstract class BotClient {
    public botModel: BotModel;
    public memory: MemoryProvider;
    protected botApiHandler: CommandApi;
    protected initialPrompt: string;

    constructor(botModel: BotModel, memory: MemoryProvider, botApiHandler: CommandApi) {
        this.botModel = botModel;
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
            const memContext = conv_list.filter(msg => msg.role != 'system');

            // chat with bot
            const messages = await this.getMessages(conv_list, memContext, language);
            const response = await this.botModel.chat(messages);

            // parse bot response
            const responseData = this.parseResponse(response);

            // store the bot response
            if (responseData.message.length > 0) {
                conversation.push({
                    role: 'assistant',
                    sender: this.botModel.name,
                    content: responseData.message,
                });
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
                            conversation.push({
                                role: 'system',
                                sender: 'system',
                                content: result,
                            });
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
            messages.push({
                role: 'system',
                sender: 'system',
                content: initialPrompt,
            });
        }

        if (memoryContext.length > 0) {
            // get memories related to the memory vector
            const memories = (await this.memory.get(memoryContext, 10)).map(m => ({
                role: 'system',
                sender: 'system',
                content: m,
            }));

            // add limited amount of memories
            while (memories.length > 0) {
                // add memory tokens to messages if they fit
                if (this.botModel.fits(messages.concat(memories), 1500)) {
                    memories.forEach(m => messages.push(m));
                    break;
                }
                // if not, remove another memory and try again
                memories.pop();
            }
        }

        // add most recent messages
        const convContext = [...conversation];
        while (convContext.length > 0) {
            // as long as there are enough tokens remaining for the response
            if (this.botModel.fits(messages.concat(convContext), -512)) {
                convContext.forEach(m => messages.push(m));
                break;
            }
            // if not, remove the oldest message
            convContext.shift();
        }

        return messages;
    }

    protected parseResponse(response: string): any {
        // Strip the botname in case it responds with it
        const botNamePrefix = `${this.botModel.name}:`;
        if (response.startsWith(botNamePrefix)) {
            response = response.slice(botNamePrefix.length);
        }

        // Strip excess newlines
        response = response.replaceAll('\r', '').replaceAll(/(\s*\n){2,}/g, '\n');

        let commands: any[] = [];

        // Check each code segment for commands
        for (const match of [...response.matchAll(/[`]+([^`]+)[`]+/g)]) {
            const new_cmds = this.parseCommand(match[1]);
            if (new_cmds.length > 0) {
                // Add to the parsed command list
                commands = commands.concat(new_cmds);
                if (new_cmds.length > 1 || new_cmds[0].command != Command.Python) {
                    // Replace commands with parsed commands in the response
                    response = response.replace(
                        match[0],
                        new_cmds.map((cmd: any) => `\`${JSON.stringify(cmd)}\``).join('\n')
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
