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
        if (!(url in pageDict)) {
            pageDict[url] = new PageData(url);
        }
        const page = pageDict[url];
        page.lastAccessed = Date.now();
        // load pages that are flagged for loading
        if (page.reload) {
            const readPagePromise = this.readPage(page, question, language);
            this.prunePages(pageDict);
            await readPagePromise;
        }
        return page;
    }

    private async readPage(pageData: PageData, question: string, language: string) {
        const chunkSize = 4000;
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
                pageData.reload = true;
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
            pageData.summary = 'Summary:\n\nLinks:';
            pageData.reload = false;

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
                            .replaceAll('$QUESTION', question)
                            .replaceAll('$LANGUAGE', language),
                    },
                    {
                        role: 'system',
                        sender: 'system',
                        content: `${pageData.summary}\n\nContent:\n${pageData.content.shift()}`,
                    },
                ];
                pageData.summary = await this.botModel.chat(messages);
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
