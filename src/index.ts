import { BrowserManager } from "./browser";
import { PageProcessor } from "./pageProcessor";
import { readPages } from "./excelReader";
import { ContentDocumentExtractor } from "./extractor/ContentDocumentExtractor";
import { WordGenerator } from "./generator/WordGenerator";

async function main(): Promise<void> {
    const browser = new BrowserManager();
    const failures: string[] = [];

    try {
        await browser.launch();
        const processor = new PageProcessor(browser);
        const extractor = new ContentDocumentExtractor(browser.page);
        const generator = new WordGenerator();
        const pages = readPages();

        console.log(`\nTotal Pages: ${pages.length}\n`);
        for (const page of pages) {
            try {
                console.log(`Processing: ${page.pageName}`);
                await processor.open(page);
                generator.addPage(await extractor.extract(page.pageName, page.url));
                console.log(`Completed: ${page.pageName}`);
            } catch (error) {
                failures.push(page.pageName);
                console.error(`Failed: ${page.pageName}`, error);
            }
        }

        if (failures.length) {
            throw new Error(`Unable to extract ${failures.length} page(s): ${failures.join(", ")}`);
        }

        await generator.save();
        console.log("\n====================================");
        console.log("Website Content Review Generated");
        console.log("Location: output/Website_Content_Review.docx");
        console.log("====================================\n");
    } finally {
        await browser.close();
    }
}

main().catch(error => {
    console.error("Website content review generation failed.", error);
    process.exitCode = 1;
});
