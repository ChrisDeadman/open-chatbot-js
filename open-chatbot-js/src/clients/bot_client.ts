import { Command, CommandApi } from '../bot_api/command_api.js';
import { MemoryProvider } from '../memory/memory_provider.js';
import { BotModel } from '../models/bot_model.js';
import { ConvMessage } from '../models/conv_message.js';
import { EmbeddingModel } from '../models/embedding_model.js';
import { settings } from '../settings.js';
import { dateTimeToStr } from '../utils/conversion_utils.js';
import { CyclicBuffer } from '../utils/cyclic_buffer.js';
import { fixAndParseJson } from '../utils/json_utils.js';

export abstract class BotClient {
    public botModel: BotModel;
    public embeddingModel: EmbeddingModel;
    public memory: MemoryProvider;
    protected botApiHandler: CommandApi;

    constructor(
        botModel: BotModel,
        embeddingModel: EmbeddingModel,
        memory: MemoryProvider,
        botApiHandler: CommandApi
    ) {
        this.botModel = botModel;
        this.embeddingModel = embeddingModel;
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
            const memContext = conv_list.filter(msg => msg.role != 'system');
            const memory_vector =
                memContext.length > 0 ? await this.embeddingModel.createEmbedding(memContext) : [];

            // chat with bot
            const messages = await this.getMessages(conv_list, memory_vector, language);
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
            if (allowCommands && responseData.commands.length > 0) {
                if (responseData.message.trim().length > 0) {
                    const cmd_list_str = Array.from(
                        new Set(responseData.commands.map((cmd: any) => `\`${cmd.command}\``))
                    ).join(' ');
                    responseData.message = `${cmd_list_str} ${responseData.message}`;
                }
                responseData.commands.forEach((cmd: Record<string, string>) => {
                    // Clear message upon NOP command
                    if (cmd.command === Command.Nop) {
                        responseData.message = '';
                    }
                    this.botApiHandler.handleRequest(cmd, memory_vector, language).then(result => {
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
        memory_vector: number[],
        language: string
    ): Promise<ConvMessage[]> {
        const messages: ConvMessage[] = [];

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

        if (memory_vector.length > 0) {
            // get memories related to the memory vector
            const memories = (await this.memory.get(memory_vector, 10)).map(m => ({
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
        if (response.length <= 0) {
            throw new Error('No response received.');
        }
        // console.debug(`RAW RESPONSE: ${response}`);

        const lines = response
            .replaceAll('\r', '')
            .replaceAll(/(\n){2,}/g, '\n\n')
            .split('\n');

        let commands: any[] = [];

        // check each response line for commands
        for (let i = 0; i < lines.length; i += 1) {
            const line = lines[i];
            const new_cmds = this.parseCommand(line);
            if (new_cmds.length > 0) {
                commands = commands.concat(new_cmds);
                lines.splice(i, 1);
                i -= 1;
            }
        }

        // remaining response is the message
        let message = lines.join('\n');

        // Strip the botname in case it responds with it
        const botNamePrefix = `${this.botModel.name}:`;
        if (String(message).startsWith(botNamePrefix)) {
            message = message.slice(botNamePrefix.length);
        }

        return { message: message, commands: commands };
    }

    private parseCommand(line: string): Record<string, string>[] {
        const commands: Record<string, string>[] = [];

        // Strip the botname in case it responds with it
        const botNamePrefix = `${this.botModel.name}:`;
        if (line.startsWith(botNamePrefix)) {
            line = line.slice(botNamePrefix.length);
        }

        try {
            // Fix and parse json
            let responseData = fixAndParseJson(line);

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
