import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';

import { settings } from '../settings.js';

export async function startBrowser(headless = true) {
    const browserArgs = [...settings.browser_args];

    if (headless) {
        browserArgs.push('--headless=new');
    }

    let proxyServerUrl;
    if (settings.proxy_host != null && settings.proxy_host.length > 0) {
        proxyServerUrl = `http://${settings.proxy_host}:${settings.proxy_port}`;
        browserArgs.push(`--proxy-server=${proxyServerUrl}`);
    }

    // Stealth Mode: ACTIVATED
    puppeteer.use(StealthPlugin());

    // Launch the browser
    const browser = await puppeteer.launch({
        headless: headless ? 'new' : false,
        timeout: 10000,
        ignoreDefaultArgs: ['--mute-audio'],
        args: browserArgs,
    });

    // Give the browser extensions some time
    const [page] = await browser.pages();
    await new Promise(resolve => setTimeout(resolve, 3000));

    // Register logging callback
    page.on('console', async msg => {
        const args = msg.args();
        for (let i = 0; i < args.length; i += 1) {
            console.log(await args[i].jsonValue());
        }
    });

    return browser;
}
