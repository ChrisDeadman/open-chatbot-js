import { BotModel } from '../../models/bot_model.js';
import { ConversationData } from '../../models/converstation_data.js';
import { settings } from '../../settings.js';
import { BotBrowser } from './bot_browser.js';
import { startBrowser } from './start_browser.js';

export class BotApiHandler {
    botBrowser: BotBrowser;

    constructor(botBrowser: BotBrowser) {
        this.botBrowser = botBrowser;
    }

    handleAPIRequest(conversation: ConversationData, request: string): string {
        const api_regex = /\[API:([^:]+):([^>]+)\]/g;

        const matches = request.matchAll(api_regex);
        for (const match of matches) {
            const fn = match[1].toLowerCase();
            const arg = match[2];

            let userResponse = `API REQUEST: ${match[0]}\n`;
            let systemResponse = userResponse;
            switch (fn) {
                case 'browser': {
                    const pageData = this.botBrowser.getPageData(settings.default_language, arg);
                    systemResponse += `STATUS: ${pageData.status}`;
                    userResponse = systemResponse;
                    if (pageData.summary.length > 0) {
                        systemResponse += `\nCONTENT:\n${pageData.summary}`;
                    }
                    break;
                }
                default: {
                    systemResponse += 'STATUS: API FUNCTION NOT FOUND';
                    userResponse = systemResponse;
                    break;
                }
            }

            if (systemResponse.length > 0) {
                conversation.addMessage({ role: 'system', content: systemResponse });
            }

            return userResponse;
        }

        return '';
    }

    static async initApi(botModel: BotModel): Promise<BotApiHandler> {
        const browser = await startBrowser();
        const botBrowser = new BotBrowser(botModel, browser);
        return new BotApiHandler(botBrowser);
    }
}
