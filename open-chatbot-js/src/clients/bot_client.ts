import { CommandApi } from '../bot_api/command_api.js';
import { MemoryProvider } from '../memory/memory_provider.js';
import { BotModel, ConvMessage } from '../models/bot_model.js';
import { settings } from '../settings.js';
import { dateTimeToStr } from '../utils/conversion_utils.js';
import { CyclicBuffer } from '../utils/cyclic_buffer.js';
import { fixAndParseJson } from '../utils/json_utils.js';

export abstract class BotClient {
    public botModel: BotModel;
    public memory: MemoryProvider;
    protected botApiHandler: CommandApi;

    constructor(botModel: BotModel, memory: MemoryProvider, botApiHandler: CommandApi) {
        this.botModel = botModel;
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
        // Start typing
        this.startTyping(context);
        try {
            // chat with bot
            const messages = await this.getMessages([...conversation], language);
            const response = await this.botModel.chat(messages);

            // Store the raw bot response
            if (response.length > 0) {
                conversation.push({
                    role: 'assistant',
                    sender: this.botModel.name,
                    content: response,
                });
            }

            // parse bot response
            const responseData = this.parseResponse(response);

            // Execute commands
            if (allowCommands) {
                responseData.commands.forEach((cmd: any) => {
                    this.botApiHandler
                        .handleRequest(cmd.name.toLowerCase(), cmd.args, conversation, language)
                        .then(result => {
                            // Add API response to system messages when finished
                            if (result.length > 0) {
                                conversation.push({
                                    role: 'system',
                                    sender: 'system',
                                    content: result,
                                });
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
        language: string
    ): Promise<ConvMessage[]> {
        const messages = [];

        const initial_prompt = settings.initial_prompt
            .join('\n')
            .replaceAll('$BOT_NAME', this.botModel.name)
            .replaceAll('$NOW', dateTimeToStr(new Date(), settings.locale))
            .replaceAll('$LANGUAGE', language);

        // add initial prompt to the context
        if (initial_prompt.length >= 0) {
            messages.push({
                role: 'system',
                sender: 'system',
                content: initial_prompt,
            });
        }

        // add memories related to the context
        const memContext = conversation.filter(msg => msg.role != 'system');
        if (memContext.length > 0) {
            // get memories
            const vector = await this.botModel.createEmbedding(memContext);
            const memories = vector.length > 0 ? await this.memory.get(vector, 10) : [];

            // add limited amount of memories
            while (memories.length > 0) {
                const memoryPrompt = {
                    role: 'system',
                    sender: 'system',
                    content: `Recall these stored memories:\n${memories.join('\n')}`,
                };
                // add memory tokens to messages if they fit
                if (this.botModel.fits(messages.concat([memoryPrompt]), 1500)) {
                    messages.push(memoryPrompt);
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
            if (this.botModel.fits(messages.concat(convContext), -1000)) {
                convContext.forEach(v => messages.push(v));
                break;
            }
            // if not, remove the oldest message
            convContext.shift();
        }

        return messages;
    }

    protected parseResponse(response: string): any {
        if (response.length <= 0) {
            throw new Error('No response received.');
        }
        console.debug(`RAW RESPONSE: ${response}`);

        const lines = response.split('\n');
        let commands: any[] = [];

        // pick commands at the top of the response
        while (lines.length > 0) {
            const line = lines[0];
            const new_cmds = this.parseCommand(line);
            if (new_cmds.length <= 0) break;
            lines.shift();
            commands = commands.concat(new_cmds);
        }

        // pick commands at the bottom of the response
        if (commands.length <= 0) {
            while (lines.length > 0) {
                const line = lines[lines.length - 1];
                const new_cmds = this.parseCommand(line);
                if (new_cmds.length <= 0) break;
                lines.pop();
                commands = commands.concat(new_cmds);
            }
        }

        // rest of the response is the message
        let message = lines.join('\n');

        // Strip the botname in case it responds with it
        const botNamePrefix = `${this.botModel.name}:`;
        if (String(message).startsWith(botNamePrefix)) {
            message = message.slice(botNamePrefix.length);
        }

        return { message: message, commands: commands };
    }

    private parseCommand(line: string): any[] {
        const commands: any[] = [];

        // Strip the botname in case it responds with it
        const botNamePrefix = `${this.botModel.name}:`;
        if (line.startsWith(botNamePrefix)) {
            line = line.slice(botNamePrefix.length);
        }

        try {
            // Fix and parse json
            const responseData = fixAndParseJson(line);

            // Not a command response
            if (typeof responseData === 'string') {
                return commands;
            }

            // Combine multiple responses
            if (Array.isArray(responseData)) {
                const responseDataArr = responseData;
                responseDataArr.forEach(r => {
                    if ('command' in r) {
                        const cmd = { name: r.command, args: {} };
                        if ('args' in r) {
                            cmd.args = r.args;
                        }
                        commands.push(cmd);
                    }
                });
            }

            if ('command' in responseData) {
                const cmd = { name: responseData.command, args: {} };
                if ('args' in responseData) {
                    cmd.args = responseData.args;
                }
                commands.push(cmd);
            }
        } catch (error) {
            // ignore
        }

        return commands;
    }
}
