import { Browser, Page } from 'puppeteer';

import { settings } from '../settings.js';

import { BotModel } from '../models/bot_model.js';

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

    async getPageData(url: string, question: string, language: string) {
        if (!(language in this.pages)) {
            this.pages[language] = {};
        }
        const pageDict = this.pages[language];
        if (!(url + question in pageDict)) {
            pageDict[url + question] = new PageData(url);
        }
        const page = pageDict[url + question];

        // read pages that need (re-)loading
        if (page.reload || this.isOutdated(page)) {
            page.reload = false;
            const readPagePromise = this.readPage(page, question, language);
            this.prunePages(pageDict);
            await readPagePromise;
        }

        page.lastAccessed = Date.now();
        return page;
    }

    private async readPage(pageData: PageData, question: string, language: string) {
        const chunkSize = settings.bot_model_token_limit - settings.bot_browser_prompt.length - 512;
        const proto_url = pageData.url
            .replace('http://', '')
            .replace('https://', '')
            .replace('file:///', '');

        // Always use HTTP for proxys
        const url = settings.proxy_host != null ? `http://${proto_url}` : `https://${proto_url}`;

        try {
            // Loading the page and get the content
            let content = '';

            // Initialize a new page
            let page: Page | undefined;
            try {
                page = await this.browser.newPage();

                // Follow forwards
                await page.setRequestInterception(true);
                page.on('request', request => {
                    request.resourceType() === 'document' ? request.continue() : request.abort();
                });

                // Ensure to dismiss all dialogs
                page.on('dialog', async dialog => {
                    await dialog.dismiss();
                });

                // Load page content
                await page.goto(url, {
                    timeout: settings.browser_timeout,
                    waitUntil: 'domcontentloaded',
                });

                // Select everything on the page get the selection content
                content = await page.$eval('*', el => {
                    let selection = window.getSelection();
                    if (selection != null) {
                        const range = document.createRange();
                        range.selectNode(el);
                        selection.removeAllRanges();
                        selection.addRange(range);
                        selection = window.getSelection();
                    }
                    return selection != null ? selection.toString() : '';
                });
            } catch (error) {
                pageData.summary = String(error);
                pageData.done = true;
                return;
            } finally {
                page?.close();
            }

            // Generate content chunks
            let chunkText = '';
            content
                .split(/\r?\n/)
                .map(line => line.trim())
                .forEach(line => {
                    if (chunkText.length > 0 && chunkText.length + line.length > chunkSize) {
                        pageData.content.push(chunkText.slice(0, chunkSize));
                        chunkText = chunkText.slice(chunkSize);
                    }
                    chunkText += chunkText.length > 0 ? `\n${line}` : line;
                });
            if (chunkText.length > 0) {
                pageData.content.push(chunkText.slice(0, chunkSize));
            }

            // Initialize summary
            pageData.summary = '';

            // Ask the bot model to update the summary until all content is processed
            while (pageData.content.length > 0) {
                // Wait a bit so messages can be sent in between the requests
                await new Promise(resolve => setTimeout(resolve, 1000));
                const messages = [
                    {
                        role: 'system',
                        sender: 'system',
                        content: settings.bot_browser_prompt
                            .join('\n')
                            .replaceAll('$BOT_NAME', this.botModel.name)
                            .replaceAll('$QUESTION', question)
                            .replaceAll('$LANGUAGE', language),
                    },
                    {
                        role: 'assistant',
                        sender: this.botModel.name,
                        content: `Summary:\n${pageData.summary}`,
                    },
                    {
                        role: 'system',
                        sender: 'system',
                        content: `Content:\n${pageData.content.shift()}`,
                    },
                ];
                pageData.summary = (await this.botModel.chat(messages))
                    .replaceAll('Summary:', '')
                    .replaceAll('Content:', '')
                    .trim();
            }

            // Update status
            pageData.done = true;
            pageData.reload = pageData.summary.trim().length <= 0;
        } catch (error) {
            pageData.summary = String(error);
            pageData.reload = true;
            pageData.done = true;
        }
    }

    /**
     * Returns true for pages older than 30 minutes
     */
    private isOutdated(pageData: PageData): boolean {
        const now = Date.now();
        return now - pageData.lastAccessed > 30 * 60 * 1000;
    }

    /**
     * Remove old pages
     */
    private prunePages(pageDict: { [key: string]: PageData }) {
        for (const url in pageDict) {
            const pageData = pageDict[url];
            if (pageData.done) {
                if (this.isOutdated(pageData)) {
                    delete pageDict[url];
                }
            }
        }
    }
}
