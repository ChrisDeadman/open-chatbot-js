import { Browser } from 'puppeteer';
import { MemoryProvider } from '../memory/memory_provider.js';
import { BotModel } from '../models/bot_model.js';
import { ConversationData } from '../models/conversation_data.js';
import { dateTimeToStr } from '../utils/conversion_utils.js';
import { BotBrowser } from './bot_browser.js';
import { startBrowser } from './start_browser.js';

export const DEFAULT_COMMAND_RESPONSE = 'No action performed.';

export class BotApiHandler {
    botModel: BotModel;
    botBrowser: BotBrowser;
    memory: MemoryProvider;

    constructor(botModel: BotModel, memory: MemoryProvider, browser: Browser) {
        this.botModel = botModel;
        this.memory = memory;
        this.botBrowser = new BotBrowser(botModel, browser);
    }

    async handleAPIRequest(
        command: string,
        args: Record<string, string>,
        conversation: ConversationData
    ): Promise<string> {
        let response = '';

        if (command.length < 0 || command === 'nop') {
            return response;
        }

        console.debug(`CMD ${command}(${JSON.stringify(args)})...`);

        try {
            switch (command) {
                case 'store_memory': {
                    const messages = conversation.getMessages().filter(msg => msg.role != 'system');
                    const vector = await this.botModel.createEmbedding(messages);
                    const data = `from ${dateTimeToStr(new Date())}: ${args.data}`;
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
                    /*
                    const pageData = await this.botBrowser.getPageData(
                        args.url,
                        args.question,
                        conversation.language
                    );
                    response = `"${command}": ${pageData.summary}`;
                    */
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
            console.debug(`CMD ${response.substring(0, 300)}`);
        } else {
            console.debug(`CMD ${command}: OK`);
        }

        return response;
    }

    static async initApi(botModel: BotModel, memory: MemoryProvider): Promise<BotApiHandler> {
        const browser = await startBrowser();
        return new BotApiHandler(botModel, memory, browser);
    }
}
