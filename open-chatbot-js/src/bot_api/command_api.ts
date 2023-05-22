import axios from 'axios';
import { MemoryProvider } from '../memory/memory_provider.js';
import { BotModel } from '../models/bot_model.js';
import { settings } from '../settings.js';
import { ConvMessage } from '../utils/conv_message.js';
import { BotBrowser } from './bot_browser.js';

export enum Command {
    Nop = 'nop',
    StoreMemory = 'store_memory',
    DeleteMemory = 'delete_memory',
    BrowseWebsite = 'browse_website',
    Python = 'python',
}

export class CommandApi {
    botModel: BotModel;
    botBrowser?: BotBrowser;
    memory: MemoryProvider;

    constructor(botModel: BotModel, memory: MemoryProvider, botBrowser?: BotBrowser) {
        this.botModel = botModel;
        this.memory = memory;
        this.botBrowser = botBrowser;
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
                    if ('data' in commandArgs && memContext.length > 0) {
                        await this.memory.add(memContext, String(commandArgs.data));
                    }
                    break;
                }
                case Command.DeleteMemory: {
                    if ('data' in commandArgs && memContext.length > 0) {
                        await this.memory.del(memContext, String(commandArgs.data));
                    }
                    break;
                }
                case Command.BrowseWebsite: {
                    if (this.botBrowser) {
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
                    } else {
                        response = 'ERROR: browser is broken.';
                    }
                    break;
                }
                case Command.Python: {
                    if ('data' in commandArgs) {
                        const url = `http://${settings.python_executor_host}:${settings.python_executor_port}/execute`;
                        const config = {
                            headers: {
                                'Content-Type': 'text/plain',
                            },
                            timeout: settings.browser_timeout,
                        };
                        const completion = await axios.post(url, String(commandArgs.data), config);
                        response = String(completion.data);
                    }
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
