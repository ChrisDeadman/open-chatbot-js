import { Browser } from 'puppeteer';
import { MemoryProvider } from '../memory/memory_provider.js';
import { BotModel } from '../models/bot_model.js';
import { ConvMessage, ConversationData } from '../models/conversation_data.js';
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
                    let context: ConvMessage[] = [];
                    for (let i=-9; i <= 0; i+= 1) {
                        context = conversation
                            .getMessages()
                            .filter(msg => msg.role != 'system')
                            .slice(i);
                        if (this.botModel.fits(context)) {
                            break;
                        }
                    }
                    if (context.length > 0) {
                        const vector = await this.botModel.createEmbedding(context);
                        if (vector.length > 0) {
                            await this.memory.add(
                                vector,
                                `from ${dateTimeToStr(new Date())}: ${args.data}`
                            );
                        }
                    }
                    break;
                }
                case 'browse_website': {
                    const pageData = await this.botBrowser.getPageData(
                        args.url,
                        args.question,
                        conversation.language
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
