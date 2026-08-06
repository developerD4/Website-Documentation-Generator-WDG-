import { BrowserManager } from "./browser";
import { PageInfo } from "./types";

export class PageProcessor {

    constructor(

        private browser: BrowserManager

    ) { }

    async open(pageInfo: PageInfo): Promise<void> {

        console.log(`Opening ${pageInfo.pageName}`);

        await this.browser.page.goto(

            pageInfo.url,

            {

                waitUntil: "domcontentloaded",
                timeout: 60_000

            }

        );
        await this.browser.page.locator("body").waitFor({ state: "visible" });
        await this.browser.page.evaluate(async () => {
            await document.fonts?.ready;
        }).catch(() => undefined);
        await this.browser.page.waitForTimeout(250);

    }

}
