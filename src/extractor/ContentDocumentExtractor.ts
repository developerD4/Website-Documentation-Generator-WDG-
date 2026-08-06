import { Page } from "playwright";

export interface ReviewCard {
    label?: string;
    title: string;
    description: string[];
    buttons: string[];
}

export interface ReviewTable {
    headers: string[];
    rows: string[][];
}

export interface ReviewSection {
    heading: string;
    content: string[];
    buttons: string[];
    lists: string[][];
    tables: ReviewTable[];
    cards: ReviewCard[];
}

export interface ReviewPage {
    pageName: string;
    url: string;
    navigation: string[];
    hero: { heading: string; description: string[]; buttons: string[] };
    sections: ReviewSection[];
    footer: string[];
}

/** Extracts the reader-facing content, including pages built from Material UI components. */
export class ContentDocumentExtractor {
    constructor(private readonly page: Page) {}

    async extract(pageName: string, url: string): Promise<ReviewPage> {
        return this.page.evaluate(({ pageName, url }) => {
            type Card = { label?: string; title: string; description: string[]; buttons: string[] };
            type Table = { headers: string[]; rows: string[][] };
            type Section = { heading: string; content: string[]; buttons: string[]; lists: string[][]; tables: Table[]; cards: Card[] };
            type ExtractedCard = { card: Card; root: Element };
            const excluded = "script,style,noscript,svg,template,[aria-hidden='true'],[hidden]";
            const normalise = (value: string | null | undefined) => (value ?? "").replace(/\s+/g, " ").trim();
            const unique = (items: string[]) => [...new Set(items.map(normalise).filter(Boolean))];
            const visible = (node: Element | null): node is HTMLElement => {
                if (!(node instanceof HTMLElement) || node.matches(excluded) || node.closest(excluded)) return false;
                const style = getComputedStyle(node);
                return style.display !== "none" && style.visibility !== "hidden" && Number(style.opacity || "1") > 0 && node.getClientRects().length > 0;
            };
            const text = (node: Element | null) => visible(node) ? normalise(node.textContent) : "";
            const meaningful = (value: string) => value.length > 1 && !/^(menu|close)$/i.test(value);
            const isIn = (node: Element, area: Element | null) => Boolean(area && area.contains(node));
            const contentText = (root: Element, omit: Element[] = []) => {
                const blockSelector = "p,li,blockquote,figcaption,td,th,dd,div";
                const blocks = Array.from(root.querySelectorAll(blockSelector))
                    .filter(visible)
                    .filter(block => !omit.some(item => item.contains(block)))
                    .filter(block => !Array.from(block.querySelectorAll(blockSelector)).some(visible))
                    .map(block => text(block))
                    .filter(meaningful);
                if (blocks.length) return unique(blocks);

                const values: string[] = [];
                const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
                let current: Node | null;
                while ((current = walker.nextNode())) {
                    const parent = current.parentElement;
                    if (!parent || !visible(parent) || parent.closest(excluded) || omit.some(item => item.contains(parent))) continue;
                    const value = normalise(current.textContent);
                    if (!value || !meaningful(value)) continue;
                    if (values[values.length - 1] !== value) values.push(value);
                }
                return unique(values);
            };
            const controls = (root: Element) => unique(Array.from(root.querySelectorAll("button,a,[role='button']"))
                .filter(visible)
                .filter(element => !Array.from(element.querySelectorAll("button,a,[role='button']")).some(visible))
                .map(element => text(element)).filter(meaningful));
            const listValues = (root: Element) => Array.from(root.querySelectorAll("ul,ol"))
                .filter(visible).map(list => unique(Array.from(list.querySelectorAll(":scope > li")).filter(visible).map(text))).filter(list => list.length > 0);
            const tableValues = (root: Element): Table[] => Array.from(root.querySelectorAll("table")).filter(visible).map(table => {
                const rowElements = Array.from(table.querySelectorAll("tr")).filter(visible);
                const rows = rowElements.map(row => unique(Array.from(row.querySelectorAll("th,td")).filter(visible).map(text))).filter(row => row.length);
                const hasHeader = Boolean(rowElements[0]?.querySelector("th"));
                return { headers: hasHeader ? rows.shift() ?? [] : [], rows };
            }).filter(table => table.headers.length || table.rows.length);
            const candidateContainer = (heading: Element, boundary: Element) => {
                let current: Element = heading.parentElement ?? boundary;
                while (current.parentElement && current.parentElement !== boundary) {
                    const parent = current.parentElement;
                    const headings = Array.from(parent.querySelectorAll("h1,h2,h3,h4,[role='heading']"))
                        .filter(visible);
                    if (headings.length > 1) return parent;
                    if (text(parent).length > 5000) return current;
                    current = parent;
                }
                return current;
            };
            const extractCards = (root: Element): ExtractedCard[] => {
                const headings = Array.from(root.querySelectorAll("h3,h4,h5,[role='heading'][aria-level='3'],[role='heading'][aria-level='4']"))
                    .filter(visible);
                const cards: ExtractedCard[] = [];
                const processedRoots: Element[] = [];
                for (const heading of headings) {
                    const headingText = text(heading);
                    if (!meaningful(headingText)) continue;
                    let card: Element = heading.parentElement ?? root;
                    while (card.parentElement && card.parentElement !== root && text(card).length < 30) card = card.parentElement;
                    if (processedRoots.includes(card)) continue;
                    processedRoots.push(card);

                    const cardHeadings = Array.from(card.querySelectorAll("h3,h4,h5,[role='heading'][aria-level='3'],[role='heading'][aria-level='4']"))
                        .filter(visible);
                    const isSequenceLabel = (value: string) => /^\d{1,3}[.)-]?$/.test(value);
                    const label = cardHeadings.map(text).find(isSequenceLabel);
                    const title = cardHeadings.map(text).find(value => meaningful(value) && !isSequenceLabel(value)) ?? headingText;
                    const cardText = contentText(card, cardHeadings);
                    const description = cardText.filter(value => value !== title && value !== label && !value.includes(title));
                    if (description.length || controls(card).length) cards.push({ card: { label, title, description, buttons: controls(card) }, root: card });
                }
                return cards.filter((item, index, all) => all.findIndex(other => other.card.title === item.card.title) === index);
            };

            const header = document.querySelector("header,[role='banner']");
            const footerElement = document.querySelector("footer,[role='contentinfo']");
            const main = document.querySelector("main,[role='main']") ?? Array.from(document.body.children)
                .filter(visible).filter(element => element !== header && element !== footerElement)
                .sort((a, b) => text(b).length - text(a).length)[0] ?? document.body;
            const navigationRoot = header ?? Array.from(document.querySelectorAll("nav,[role='navigation']")).find(visible) ?? null;
            const navigation = navigationRoot ? controls(navigationRoot) : [];
            const allHeadings = Array.from(main.querySelectorAll("h1,h2,h3,h4,[role='heading']")).filter(visible)
                .filter(heading => !isIn(heading, navigationRoot) && !isIn(heading, footerElement));
            const primaryHeading = allHeadings.find(heading => heading.matches("h1,[role='heading'][aria-level='1']")) ?? allHeadings[0];
            const heroRoot = primaryHeading ? candidateContainer(primaryHeading, main) : main;
            const hero = {
                heading: primaryHeading ? text(primaryHeading) : "",
                description: primaryHeading ? contentText(heroRoot, [primaryHeading])
                    .filter(value => value !== text(primaryHeading)).slice(0, 4) : [],
                buttons: primaryHeading ? controls(heroRoot) : []
            };
            const nonHeroHeadings = allHeadings.filter(heading => heading !== primaryHeading && !heroRoot.contains(heading));
            const sectionHeadings = nonHeroHeadings.filter(heading => heading.matches("h2,[role='heading'][aria-level='2']")).length
                ? nonHeroHeadings.filter(heading => heading.matches("h2,[role='heading'][aria-level='2']"))
                : nonHeroHeadings;
            const sections: Section[] = [];
            const seen = new Set<Element>();
            for (const heading of sectionHeadings) {
                const root = candidateContainer(heading, main);
                if (seen.has(root)) continue;
                seen.add(root);
                const nestedHeadings = Array.from(root.querySelectorAll("h1,h2,h3,h4,[role='heading']")).filter(visible);
                const extractedCards = extractCards(root).filter(item => item.card.title !== text(heading));
                const cards = extractedCards.map(item => item.card);
                const omit = [heading, ...nestedHeadings.filter(item => item !== heading), ...extractedCards.map(item => item.root), ...Array.from(root.querySelectorAll("ul,ol,table"))];
                const cardButtons = new Set(cards.flatMap(card => card.buttons));
                const content = contentText(root, omit).filter(value => value !== text(heading));
                const section: Section = { heading: text(heading), content, buttons: controls(root).filter(button => !cardButtons.has(button)), lists: listValues(root), tables: tableValues(root), cards };
                if (section.heading || section.content.length || section.buttons.length || section.lists.length || section.tables.length || section.cards.length) sections.push(section);
            }
            // Pages without heading landmarks still receive a single reader-focused content section.
            if (!sections.length) {
                const omit = [...Array.from(main.querySelectorAll("ul,ol,table")), ...(primaryHeading ? [primaryHeading] : [])];
                const content = contentText(main, omit).filter(value => value !== hero.heading);
                const extractedCards = extractCards(main);
                const cards = extractedCards.map(item => item.card);
                const contentWithoutCards = content.filter(value => !cards.some(card => card.title === value || card.description.includes(value)));
                if (contentWithoutCards.length || controls(main).length) sections.push({ heading: "Content", content: contentWithoutCards, buttons: controls(main), lists: listValues(main), tables: tableValues(main), cards });
            }
            const footer = footerElement ? unique(contentText(footerElement).concat(controls(footerElement))) : [];
            return { pageName, url, navigation, hero, sections, footer };
        }, { pageName, url });
    }
}
