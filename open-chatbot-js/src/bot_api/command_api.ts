import { Browser } from 'puppeteer';
import { MemoryProvider } from '../memory/memory_provider.js';
import { BotModel, ConvMessage } from '../models/bot_model.js';
import { settings } from '../settings.js';
import { dateTimeToStr } from '../utils/conversion_utils.js';
import { CyclicBuffer } from '../utils/cyclic_buffer.js';
import { BotBrowser } from './bot_browser.js';

export const DEFAULT_COMMAND_RESPONSE = 'No action performed.';

export class CommandApi {
    botModel: BotModel;
    botBrowser: BotBrowser;
    memory: MemoryProvider;

    constructor(botModel: BotModel, memory: MemoryProvider, browser: Browser) {
        this.botModel = botModel;
        this.memory = memory;
        this.botBrowser = new BotBrowser(botModel, browser);
    }

    async handleRequest(
        command: string,
        args: Record<string, string>,
        conversation: CyclicBuffer<ConvMessage>,
        language: string
    ): Promise<string> {
        let response = '';

        if (command.length < 0 || command === 'nop') {
            return response;
        }

        console.info(`CMD ${command}(${JSON.stringify(args)})...`);

        try {
            switch (command) {
                case 'store_memory': {
                    const messages = [...conversation].filter(msg => msg.role != 'system');
                    const vector = await this.botModel.createEmbedding(messages);
                    const data = `from ${dateTimeToStr(new Date(), settings.locale)}: ${args.data}`;
                    if (vector.length > 0) {
                        await this.memory.add(vector, data);
                    }
                    break;
                }
                case 'delete_memory': {
                    const messages = [
                        { role: 'assistant', sender: this.botModel.name, content: args.data },
                    ];
                    const vector = await this.botModel.createEmbedding(messages);
                    if (vector.length > 0) {
                        await this.memory.del(vector);
                    }
                    break;
                }
                case 'browse_website': {
                    response = `"${command}": ERROR: Your browser is broken.`;
                    const pageData = await this.botBrowser.getPageData(
                        args.url,
                        args.question,
                        language
                    );
                    response = `"${command}": ${pageData.summary}`;
                    break;
                }
                default: {
                    response = `"${command}": Invalid command.`;
                    break;
                }
            }
        } catch (error) {
            response = `"${command}": ${error}.`;
        }

        if (response.length > 0) {
            console.info(`CMD ${response.slice(0, 300)}`);
        } else {
            console.info(`CMD ${command}: OK`);
        }

        return response;
    }
}
