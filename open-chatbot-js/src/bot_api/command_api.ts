import axios from 'axios';
import { MemoryProvider } from '../memory/memory_provider.js';
import { BotModel } from '../models/bot_model.js';
import { settings } from '../settings.js';
import { ConvMessage } from '../utils/conv_message.js';
import { commandToString, extractURLs } from '../utils/parsing_utils.js';
import { BotBrowser } from './bot_browser.js';

export enum Command {
    StoreMemory = 'storeMemory',
    DeleteMemory = 'deleteMemory',
    BrowseWebsite = 'browseWebsite',
    Python = 'python',
    Exit = 'exit',
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

        const commandContent = commandToString(commandArgs, true).trim();

        try {
            switch (commandArgs.command) {
                case Command.StoreMemory: {
                    if (commandContent.length > 0 && memContext.length > 0) {
                        await this.memory.add(memContext, commandContent);
                    }
                    break;
                }
                case Command.DeleteMemory: {
                    if (commandContent.length > 0 && memContext.length > 0) {
                        await this.memory.del(memContext, commandContent);
                    }
                    break;
                }
                case Command.BrowseWebsite: {
                    if (this.botBrowser) {
                        let url = commandArgs.url;
                        let question = commandArgs.question;

                        if (url === undefined) {
                            const urls = extractURLs(commandContent);
                            if (urls.length > 0) {
                                url = urls[0];
                            }
                        }

                        if (question === undefined) {
                            question = commandContent;
                        }

                        if (url === undefined) {
                            response = 'ERROR: no URL provided';
                        } else if (question.length <= url.length) {
                            response = 'ERROR: no question provided';
                        } else {
                            const pageData = await this.botBrowser.getPageData(
                                url,
                                question,
                                language
                            );
                            response = pageData.summary;
                        }
                    } else {
                        response = 'ERROR: browser is broken.';
                    }
                    break;
                }
                case Command.Python: {
                    if (commandContent.length > 0) {
                        const url = `http://${settings.python_executor_host}:${settings.python_executor_port}/execute`;
                        const config = {
                            headers: {
                                'Content-Type': 'text/plain',
                            },
                            timeout: settings.browser_timeout,
                        };
                        const completion = await axios.post(url, commandContent, config);
                        response = String(completion.data);
                    }
                    break;
                }
                case Command.Exit:
                    break;
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
