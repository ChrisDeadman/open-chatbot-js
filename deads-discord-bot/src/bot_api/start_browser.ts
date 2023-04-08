import puppeteer from 'puppeteer';

import path from 'path';
import { fileURLToPath } from 'url';

import { settings } from '../settings.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export async function startBrowser() {
    const adblock = `${__dirname}/extensions/adblock.crx`;
    const no_cookies = `${__dirname}/extensions/nocookie.crx`;
    const browserArgs = [
        '--user-agent="Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/111.0.0.0 Safari/537.36',
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
        '--use-fake-device-for-media-stream--hide-scrollbars',
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
        '--mute-audio',
        '--enable-automation',
        '--headless=new',
        '--remote-debugging-port=9222',
        `--disable-extensions-except=${adblock}, ${no_cookies}`,
        `--load-extension=${adblock}`,
        `--load-extension=${no_cookies}`,
    ];

    if (settings.proxy_host != null && settings.proxy_host.length > 0) {
        browserArgs.push(`--proxy-server=http://${settings.proxy_host}:${settings.proxy_port}`);
    }

    const browser = await puppeteer.launch({
        headless: 'new',
        timeout: 6000,
        args: browserArgs,
    });
    await browser.version();
    return browser;
}
