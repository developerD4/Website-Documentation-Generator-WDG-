import * as fs from "fs";
import * as path from "path";
import { BorderStyle, Document, HeadingLevel, Packer, Paragraph, PageBreak, Table, TableCell, TableRow, TextRun, WidthType } from "docx";
import { ReviewPage, ReviewSection, ReviewTable } from "../extractor/ContentDocumentExtractor";

export class WordGenerator {
    private readonly children: (Paragraph | Table)[] = [];

    public addPage(page: ReviewPage): void {
        if (this.children.length) this.children.push(new Paragraph({ children: [new PageBreak()] }));
        this.children.push(new Paragraph({ heading: HeadingLevel.HEADING_1, spacing: { after: 120 }, children: [new TextRun({ text: page.pageName.toUpperCase(), bold: true })] }));
        this.children.push(new Paragraph({ spacing: { after: 200 }, children: [new TextRun({ text: "URL: ", bold: true }), new TextRun(page.url)] }));
        this.separator();
        this.heading("Navigation"); this.bullets(page.navigation);
        this.separator();
        this.heading("Hero Banner");
        if (page.hero.heading) this.field("Heading", [page.hero.heading]);
        if (page.hero.description.length) this.field("Description", page.hero.description);
        if (page.hero.buttons.length) this.field("Buttons", page.hero.buttons, true);
        page.sections.forEach((section, index) => { this.separator(); this.section(section, index + 1); });
        if (page.footer.length) { this.separator(); this.heading("Footer"); this.bullets(page.footer); }
        this.children.push(new Paragraph({ spacing: { after: 360 } }));
    }

    public async save(): Promise<void> {
        const outputDirectory = path.join(process.cwd(), "output");
        fs.mkdirSync(outputDirectory, { recursive: true });
        const document = new Document({
            creator: "Website Content Review Generator",
            title: "Website Content Review",
            sections: [{ properties: { page: { margin: { top: 720, right: 720, bottom: 720, left: 720 } } }, children: this.children }]
        });
        fs.writeFileSync(path.join(outputDirectory, "Website_Content_Review.docx"), await Packer.toBuffer(document));
    }

    private section(section: ReviewSection, number: number): void {
        this.heading(`Section ${number}`);
        if (section.heading) this.field("Heading", [section.heading]);
        if (section.content.length) this.field("Content", section.content);
        section.cards.forEach((card, index) => {
            this.subheading(`Card ${index + 1}`);
            this.field("Card Title", [card.title]);
            if (card.description.length) this.field("Description", card.description);
            if (card.buttons.length) this.field("Button", card.buttons, true);
        });
        section.lists.forEach(list => this.field("List", list, true));
        section.tables.forEach(table => { this.subheading("Table"); this.addTable(table); });
        if (section.buttons.length) this.field("Buttons", section.buttons, true);
    }

    private heading(text: string): void { this.children.push(new Paragraph({ heading: HeadingLevel.HEADING_2, spacing: { before: 120, after: 100 }, children: [new TextRun({ text, bold: true })] })); }
    private subheading(text: string): void { this.children.push(new Paragraph({ heading: HeadingLevel.HEADING_3, spacing: { before: 100, after: 60 }, children: [new TextRun({ text, bold: true })] })); }
    private field(label: string, values: string[], bullet = false): void { this.subheading(label); bullet ? this.bullets(values) : values.forEach(value => this.children.push(new Paragraph({ text: value, spacing: { after: 100 } }))); }
    private bullets(values: string[]): void { values.forEach(value => this.children.push(new Paragraph({ text: value, bullet: { level: 0 }, spacing: { after: 60 } }))); }
    private separator(): void { this.children.push(new Paragraph({ border: { bottom: { color: "808080", style: BorderStyle.SINGLE, size: 6, space: 1 } }, spacing: { before: 120, after: 120 } })); }
    private addTable(table: ReviewTable): void {
        const rows = [table.headers, ...table.rows].filter(row => row.length).slice(0, 25);
        if (!rows.length) return;
        const columnCount = Math.max(...rows.map(row => row.length));
        this.children.push(new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows: rows.map((row, rowIndex) => new TableRow({ children: Array.from({ length: columnCount }, (_, index) => new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: row[index] ?? "", bold: table.headers.length > 0 && rowIndex === 0 })] })] })) })) }));
    }
}
