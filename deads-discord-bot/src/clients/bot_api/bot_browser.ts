import { convert } from 'html-to-text';
import { Browser } from 'puppeteer';

import { settings } from '../../settings.js';

import { BotModel } from '../../models/bot_model.js';
import { ConversationData } from '../../models/converstation_data.js';

import { Queue, Worker } from 'bullmq';

const STATUS_LOADING = 'LOADING';
const STATUS_MORE_DATA = 'MORE DATA LOADING';
const STATUS_COMPLETE = 'LOADING COMPLETE';
const STATUS_ERROR = 'ERROR';

class PageData {
    url: string;
    content: Array<string> = [];
    lastAccessed: number;
    status: string;
    summary: string;

    constructor(url: string) {
        this.url = url;
        this.lastAccessed = Date.now();
        this.status = STATUS_LOADING;
        this.summary = '';
    }
}

export class BotBrowser {
    private botModel: BotModel;
    private browser: Browser;
    private pages: { [key: string]: { [key: string]: PageData } } = {};
    private processQueue = new Queue('processPages');

    constructor(botModel: BotModel, browser: Browser) {
        this.botModel = botModel;
        this.browser = browser;
        this.createWorker();
        this.schedulePeriodicJobs();
    }

    private createWorker() {
        return new Worker(this.processQueue.name, this.processPages.bind(this));
    }

    private async schedulePeriodicJobs() {
        // Remove all previously scheduled jobs
        await this.processQueue.obliterate({ force: true });

        // Add new repeatable job
        await this.processQueue.add(
            'processPages',
            {},
            {
                repeat: {
                    every: 5000,
                },
            }
        );
    }

    getPageData(language: string, url: string) {
        if (!(language in this.pages)) {
            this.pages[language] = {};
        }
        const pageDict = this.pages[language];
        if (!(url in pageDict)) {
            pageDict[url] = new PageData(url);
        }
        const page = pageDict[url];
        page.lastAccessed = Date.now();
        return page;
    }

    private async processPages() {
        const now = Date.now();
        for (const language in this.pages) {
            for (const url in this.pages[language]) {
                const pageData = this.pages[language][url];
                if (
                    pageData.status === STATUS_COMPLETE ||
                    pageData.status.startsWith(STATUS_ERROR)
                ) {
                    // Remove pages older than 30 minutes
                    if (now - pageData.lastAccessed > 30 * 60 * 1000) {
                        delete this.pages[language];
                    }
                } else {
                    await this.readPage(pageData);
                }
            }
        }
    }

    private async readPage(pageData: PageData) {
        const chunkSize = 4000;
        const proto_url = pageData.url.replace('http://', '').replace('https://', '');

        // Always use HTTP for proxys
        const url = settings.proxy_host != null ? `http://${proto_url}` : `https://${proto_url}`;

        try {
            // Perform initial loading of the page
            if (pageData.status === STATUS_LOADING) {
                let html = '';

                // Initialize a new page
                const page = await this.browser.newPage();
                try {
                    // Ensure to dismiss all dialogs
                    page.on('dialog', async dialog => {
                        await dialog.dismiss();
                    });

                    // Load page contant
                    await page.goto(url, { waitUntil: 'domcontentloaded' });
                    html = await page.evaluate(() => {
                        return document.body.innerHTML;
                    });
                } catch (error) {
                    pageData.status = `${STATUS_ERROR}: ${error}`;
                    return;
                } finally {
                    page.close();
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
            }

            // No content -> we are finished
            if (pageData.content.length <= 0) {
                pageData.status = STATUS_COMPLETE;
                return;
            }

            // Ask the bot model to update the summary
            const conversation = new ConversationData(settings.default_language, 1);
            conversation.addMessage({
                role: 'assistant',
                content: `${pageData.summary}\n\nContent:\n${pageData.content.shift()}`,
            });
            pageData.summary = await this.botModel.ask(settings.bot_browser_prompt, conversation);

            // Update status
            pageData.status = pageData.content.length > 0 ? STATUS_MORE_DATA : STATUS_COMPLETE;
        } catch (error) {
            pageData.status = `${STATUS_ERROR}: ${error}`;
        }
    }
}
