import { Browser } from 'puppeteer';
import { MemoryProvider } from '../memory/memory_provider.js';
import { BotModel } from '../models/bot_model.js';
import { EmbeddingModel } from '../models/embedding_model.js';
import { settings } from '../settings.js';
import { dateTimeToStr } from '../utils/conversion_utils.js';
import { BotBrowser } from './bot_browser.js';

export const DEFAULT_COMMAND_RESPONSE = 'No action performed.';

export enum Command {
    Nop = 'nop',
    StoreMemory = 'store_memory',
    DeleteMemory = 'delete_memory',
    BrowseWebsite = 'browse_website',
}

export class CommandApi {
    botModel: BotModel;
    embeddingModel: EmbeddingModel;
    botBrowser: BotBrowser;
    memory: MemoryProvider;

    constructor(
        botModel: BotModel,
        embeddingModel: EmbeddingModel,
        memory: MemoryProvider,
        browser: Browser
    ) {
        this.botModel = botModel;
        this.embeddingModel = embeddingModel;
        this.memory = memory;
        this.botBrowser = new BotBrowser(botModel, browser);
    }

    async handleRequest(
        command_args: Record<string, string>,
        memory_vector: number[],
        language: string
    ): Promise<string> {
        let response = '';

        if (command_args.command.length <= 0 || command_args.command === Command.Nop) {
            return response;
        }

        console.info(`CMD ${JSON.stringify(command_args)}`);

        try {
            switch (command_args.command) {
                case Command.StoreMemory: {
                    const data = `from ${dateTimeToStr(new Date(), settings.locale)}: ${
                        command_args.data
                    }`;
                    if (memory_vector.length > 0) {
                        await this.memory.add(memory_vector, data);
                    }
                    break;
                }
                case Command.DeleteMemory: {
                    const messages = [
                        {
                            role: 'assistant',
                            sender: this.botModel.name,
                            content: command_args.data,
                        },
                    ];
                    const vector = await this.embeddingModel.createEmbedding(messages);
                    if (vector.length > 0) {
                        await this.memory.del(vector);
                    }
                    break;
                }
                case Command.BrowseWebsite: {
                    response = 'ERROR: Your browser is broken.';
                    const pageData = await this.botBrowser.getPageData(
                        command_args.url,
                        command_args.question,
                        language
                    );
                    response = pageData.summary;
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
            console.info(`CMD ${command_args.command}: ${response.slice(0, 300)}`);
            response = `${command_args.command}: ${response}`;
        }

        return response;
    }
}
