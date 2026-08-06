import { chromium, Browser, BrowserContext, Page } from "playwright";
import fs from "fs";

export class BrowserManager {
    browser!: Browser;
    context!: BrowserContext;
    page!: Page;

    async launch(): Promise<void> {
        const configuredPath = process.env.CHROME_EXECUTABLE;
        const installedChrome = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
        const executablePath = configuredPath || (fs.existsSync(installedChrome) ? installedChrome : undefined);
        this.browser = await chromium.launch({ headless: true, executablePath });
        this.context = await this.browser.newContext({ viewport: { width: 1600, height: 900 } });
        this.page = await this.context.newPage();
        this.page.setDefaultTimeout(30_000);
    }

    async close(): Promise<void> {
        await this.context?.close();
        await this.browser?.close();
    }
}
