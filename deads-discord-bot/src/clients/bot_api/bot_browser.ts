import { convert } from 'html-to-text';
import { Browser, Page } from 'puppeteer';

import { settings } from '../../settings.js';

import { BotModel } from '../../models/bot_model.js';
import { ConversationData } from '../../models/converstation_data.js';

class PageData {
    url: string;
    content: Array<string> = [];
    lastAccessed: number;
    reload: boolean;
    done: boolean;
    summary: string;

    constructor(url: string) {
        this.url = url;
        this.lastAccessed = Date.now();
        this.reload = true;
        this.done = false;
        this.summary = '';
    }
}

export class BotBrowser {
    private botModel: BotModel;
    private browser: Browser;
    private pages: { [key: string]: { [key: string]: PageData } } = {};

    constructor(botModel: BotModel, browser: Browser) {
        this.botModel = botModel;
        this.browser = browser;
    }

    async getPageData(language: string, url: string) {
        if (!(language in this.pages)) {
            this.pages[language] = {};
        }
        const pageDict = this.pages[language];
        if (!(url in pageDict)) {
            pageDict[url] = new PageData(url);
        }
        const page = pageDict[url];
        page.lastAccessed = Date.now();
        // load pages that are flagged for loading
        if (page.reload) {
            const readPagePromise = this.readPage(page);
            this.prunePages(pageDict);
            await readPagePromise;
        }
        return page;
    }

    private async readPage(pageData: PageData) {
        const chunkSize = 4000;
        const proto_url = pageData.url.replace('http://', '').replace('https://', '');

        // Always use HTTP for proxys
        const url = settings.proxy_host != null ? `http://${proto_url}` : `https://${proto_url}`;

        try {
            // Loading the page and get the content
            if (pageData.reload) {
                let html = '';

                // Initialize a new page
                let page: Page | undefined;
                try {
                    page = await this.browser.newPage();
                    // Ensure to dismiss all dialogs
                    page.on('dialog', async dialog => {
                        await dialog.dismiss();
                    });

                    // Load page contant
                    await page.goto(url, {
                        timeout: settings.www_timeout,
                        waitUntil: 'domcontentloaded',
                    });
                    html = await page.evaluate(() => {
                        return document.body.innerHTML;
                    });
                } catch (error) {
                    pageData.summary = String(error);
                    pageData.reload = true;
                    pageData.done = true;
                    return;
                } finally {
                    page?.close();
                }

                // Convert and filter content
                const convert_options = {
                    wordwrap: 90,
                    preserveNewlines: true,
                    selectors: [{ selector: 'a.button', format: 'skip' }],
                };
                const content = convert(html, convert_options)
                    .split(/\r?\n/)
                    .filter(line => line.trim() !== '')
                    .filter(line => !line.startsWith('[data:'))
                    .filter(line => !line.startsWith('[') || !line.match(/\[[^\]]{100}/))
                    .join('\n');

                // Generate content chunks
                for (let i = 0; i < content.length; i += chunkSize) {
                    pageData.content.push(content.slice(i, i + chunkSize));
                }

                // Initialize summary
                pageData.summary = 'Summary:\n\nLinks:';
                pageData.reload = false;
            }

            // Ask the bot model to update the summary until all content is processed
            while (pageData.content.length > 0) {
                const conversation = new ConversationData(settings.default_language, 1);
                conversation.addMessage({
                    role: 'system',
                    content: `${pageData.summary}\n\nContent:\n${pageData.content.shift()}`,
                });
                pageData.summary = await this.botModel.ask(
                    settings.bot_browser_prompt,
                    conversation
                );
            }

            // Update status
            pageData.done = true;
        } catch (error) {
            pageData.summary = String(error);
            pageData.reload = false;
            pageData.done = true;
        }
    }

    /**
     * Remove pages older than 30 minutes
     */
    private prunePages(pageDict: { [key: string]: PageData }) {
        const now = Date.now();
        for (const url in pageDict) {
            const pageData = pageDict[url];
            if (pageData.done) {
                if (now - pageData.lastAccessed > 30 * 60 * 1000) {
                    delete pageDict[url];
                }
            }
        }
    }
}
