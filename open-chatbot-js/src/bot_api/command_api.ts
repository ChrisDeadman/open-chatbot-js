import axios from 'axios';
import { Browser } from 'puppeteer';
import { MemoryProvider } from '../memory/memory_provider.js';
import { BotModel } from '../models/bot_model.js';
import { ConvMessage } from '../models/conv_message.js';
import { settings } from '../settings.js';
import { dateTimeToStr } from '../utils/conversion_utils.js';
import { BotBrowser } from './bot_browser.js';

export const DEFAULT_COMMAND_RESPONSE = 'No action performed.';

export enum Command {
    Nop = 'nop',
    StoreMemory = 'store_memory',
    DeleteMemory = 'delete_memory',
    BrowseWebsite = 'browse_website',
    Python = 'python',
}

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
        commandArgs: Record<string, string>,
        memContext: ConvMessage[],
        language: string
    ): Promise<string> {
        let response = '';

        if (commandArgs.command.length <= 0 || commandArgs.command === Command.Nop) {
            return response;
        }

        try {
            switch (commandArgs.command) {
                case Command.StoreMemory: {
                    const data = `from ${dateTimeToStr(new Date(), settings.locale)}: ${
                        commandArgs.data
                    }`;
                    if (memContext.length > 0) {
                        await this.memory.add(memContext, data);
                    }
                    break;
                }
                case Command.DeleteMemory: {
                    await this.memory.del(memContext, commandArgs.data);
                    break;
                }
                case Command.BrowseWebsite: {
                    response = 'ERROR: Your browser is broken.';
                    const question =
                        typeof commandArgs.question === 'string' &&
                        commandArgs.question.trim() !== ''
                            ? commandArgs.question
                            : 'what is on the website?';
                    const pageData = await this.botBrowser.getPageData(
                        commandArgs.url,
                        question,
                        language
                    );
                    response = pageData.summary;
                    break;
                }
                case Command.Python: {
                    const completion = await axios.post(
                        `http://${settings.python_executor_host}:${settings.python_executor_port}/execute`,
                        String(commandArgs.data),
                        {
                            headers: {
                                'Content-Type': 'text/plain',
                            },
                            timeout: settings.browser_timeout,
                        }
                    );
                    response = String(completion.data);
                    break;
                }
                default: {
                    response = 'Invalid command.';
                    break;
                }
            }
        } catch (error) {
            response = `"${error}.`;
        }

        if (response.length > 0) {
            response = `\`${commandArgs.command}\`: ${response}`;
        }

        return response;
    }
}
