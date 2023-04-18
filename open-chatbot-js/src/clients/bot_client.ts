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

    protected async chat(
        conversation: CyclicBuffer<ConvMessage>,
        language: string,
        handleResponse: (response: string) => Promise<void>,
        startTyping: () => void,
        stopTyping: () => void,
        allowCommands = true
    ) {
        const maxLoops = 3;
        let loopIdx = 0;
        let done = false;
        let response = '';

        while (!done && loopIdx < maxLoops) {
            // chat with bot
            startTyping();
            try {
                const messages = await this.getMessages([...conversation], language);
                response = await this.botModel.chat(messages);
            } finally {
                stopTyping();
            }

            // assume we are done
            done = true;

            try {
                // Store the raw bot response
                conversation.push({
                    role: 'assistant',
                    sender: this.botModel.name,
                    content: response,
                });

                // parse bot response
                const responseData = this.parseResponse(response);

                // Display message to the client
                if (responseData.message.length > 0) {
                    await handleResponse(responseData.message);
                }

                // Execute command
                if (allowCommands && 'command' in responseData) {
                    const command = responseData.command['name'].toLowerCase();
                    const args = responseData.command['args'];
                    const result = await this.botApiHandler.handleRequest(
                        command,
                        args,
                        conversation,
                        language
                    );
                    if (result.length > 0) {
                        // Add API response to system messages
                        conversation.push({
                            role: 'system',
                            sender: 'system',
                            content: result,
                        });

                        // we are not done, need to return command response to bot
                        done = false;
                    }
                }
            } catch (error) {
                // Display error to the client
                await handleResponse(String(error));
            }

            // keep track of the loop index
            loopIdx += 1;
        }
    }

    protected async getMessages(
        conversation: ConvMessage[],
        language: string
    ): Promise<ConvMessage[]> {
        const messages = [
            {
                role: 'system',
                sender: 'system',
                content: settings.initial_prompt
                    .join('\n')
                    .replaceAll('$BOT_NAME', this.botModel.name)
                    .replaceAll('$NOW', dateTimeToStr(new Date(), settings.locale))
                    .replaceAll('$LANGUAGE', language),
            },
        ];

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
                if (this.botModel.fits(messages.concat([memoryPrompt]), 2000)) {
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
            if (this.botModel.fits(messages.concat(convContext), -2000)) {
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

        let responseData: any;
        try {
            // Fix and parse json
            responseData = fixAndParseJson(response);

            // use original string if parser wrongly assumes an array of size 1
            if (Array.isArray(responseData) && responseData.length < 2) {
                responseData = response;
            }

            // Combine multiple responses
            if (Array.isArray(responseData)) {
                const responseDataArr = responseData;
                responseData = { message: '' };
                responseDataArr.forEach(r => {
                    if ('message' in r) {
                        responseData.message += r.message;
                    }
                    if ('command' in r) {
                        if (r.command['name'] != 'nop') {
                            responseData['command'] = r.command;
                        }
                    }
                });
            }

            // Account for non-json response
            if (typeof responseData === 'string') {
                responseData = { message: responseData };
            }
        } catch (error) {
            responseData = { message: response };
        }

        // Bot might omit message field
        if (!('message' in responseData)) {
            responseData['message'] = '';
        }

        // Bot might omit command field
        if (!('command' in responseData)) {
            responseData['command'] = { name: 'nop', args: {} };
        }

        // Strip the botname in case it responds with it
        const botNamePrefix = `${this.botModel.name}: `;
        if (String(responseData.message).startsWith(botNamePrefix)) {
            responseData.message = responseData.message.slice(botNamePrefix.length);
        }

        return responseData;
    }
}
