import { BotModel } from '../models/bot_model.js';
import { settings } from '../settings.js';
import { BotBrowser } from './bot_browser.js';
import { startBrowser } from './start_browser.js';

export class BotApiHandler {
    botBrowser: BotBrowser;

    constructor(botBrowser: BotBrowser) {
        this.botBrowser = botBrowser;
    }

    async handleAPIRequest(request: string): Promise<string> {
        const api_regex = /\[API:([^:]+):([^>]+)\]/g;

        const matches = request.matchAll(api_regex);
        for (const match of matches) {
            const fn = match[1].toLowerCase();
            const arg = match[2];

            const apiRequest = `API REQUEST: ${match[0]}`;
            console.debug(`${apiRequest}`);

            let apiResponse = '';
            switch (fn) {
                case 'browser': {
                    const pageData = await this.botBrowser.getPageData(
                        settings.default_language,
                        arg
                    );
                    apiResponse = pageData.summary;
                    break;
                }
                default: {
                    apiResponse = 'API FUNCTION NOT FOUND';
                    break;
                }
            }

            console.debug(
                `API RESPONSE: ${this.truncateString(apiResponse, 50).replace('\n', ' ')}`
            );
            return `${apiRequest}\n${apiResponse}`;
        }

        return '';
    }

    static async initApi(botModel: BotModel): Promise<BotApiHandler> {
        const browser = await startBrowser();
        const botBrowser = new BotBrowser(botModel, browser);
        return new BotApiHandler(botBrowser);
    }

    private truncateString(str: string, maxLength: number) {
        if (str.length > maxLength) {
            return str.slice(0, maxLength) + '...';
        } else {
            return str;
        }
    }
}
