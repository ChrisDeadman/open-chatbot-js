import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';

import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(path.join(fileURLToPath(import.meta.url), '../'));

export async function startBrowser(headless = true, proxyServerUrl: string | null = null) {
    const adblock = `${__dirname}/extensions/adblock`;
    const no_cookies = `${__dirname}/extensions/nocookie`;
    const browserArgs = [
        '--user-agent="Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/112.0.0.0 Safari/537.36',
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-infobars',
        '--no-zygote',
        '--no-first-run',
        '--window-size=1280,800',
        '--window-position=0,0',
        '--ignore-certificate-errors',
        '--ignore-certificate-errors-skip-list',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--disable-gpu',
        '--use-fake-ui-for-media-stream',
        '--use-fake-device-for-media-stream',
        '--hide-scrollbars',
        '--disable-notifications',
        '--disable-background-timer-throttling',
        '--disable-backgrounding-occluded-windows',
        '--disable-breakpad',
        '--disable-component-extensions-with-background-pages',
        '--disable-features=TranslateUI,BlinkGenPropertyTrees',
        '--disable-ipc-flooding-protection',
        '--disable-renderer-backgrounding',
        '--enable-features=NetworkService,NetworkServiceInProcess',
        '--force-color-profile=srgb',
        '--metrics-recording-only',
        '--enable-automation',
        '--enable-speech-dispatcher',
        '--remote-debugging-port=9222',
        `--disable-extensions-except=${adblock},${no_cookies}`,
        `--load-extension=${adblock},${no_cookies}`,
    ];

    if (headless) {
        browserArgs.push('--headless=new');
    }

    if (proxyServerUrl != null) {
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
