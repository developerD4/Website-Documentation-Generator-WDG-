import { Page } from "playwright";

export interface ReviewImage {
    alt: string;
    link?: string;
}

export interface ReviewCard {
    label?: string;
    title: string;
    description: string[];
    buttons: string[];
    images: ReviewImage[];
}

export interface ReviewTable {
    headers: string[];
    rows: string[][];
}

export interface ReviewSection {
    heading: string;
    content: string[];
    buttons: string[];
    images: ReviewImage[];
    lists: string[][];
    tables: ReviewTable[];
    cards: ReviewCard[];
}

export interface ReviewPage {
    pageName: string;
    url: string;
    navigation: string[];
    hero: { heading: string; description: string[]; buttons: string[]; images: ReviewImage[] };
    sections: ReviewSection[];
    footer: string[];
}

/** Extracts visible, reader-facing content without repeating parent and child containers. */
export class ContentDocumentExtractor {
    constructor(private readonly page: Page) {}

    async extract(pageName: string, url: string): Promise<ReviewPage> {
        return this.page.evaluate(({ pageName, url }) => {
            type Image = { alt: string; link?: string };
            type Card = { label?: string; title: string; description: string[]; buttons: string[]; images: Image[] };
            type Table = { headers: string[]; rows: string[][] };
            type Section = { heading: string; content: string[]; buttons: string[]; images: Image[]; lists: string[][]; tables: Table[]; cards: Card[] };
            const EXCLUDED = "script,style,noscript,svg,template,[aria-hidden='true'],[hidden]";
            const HEADING = "h1,h2,h3,h4,h5,h6,[role='heading']";
            const BLOCK = "p,li,blockquote,figcaption,td,th,dd,dt,address,pre,div";
            const normalise = (value: string | null | undefined) => (value ?? "").replace(/\s+/g, " ").trim();
            const unique = <T>(values: T[], key: (value: T) => string): T[] => {
                const seen = new Set<string>();
                return values.filter(value => {
                    const id = key(value);
                    if (!id || seen.has(id)) return false;
                    seen.add(id);
                    return true;
                });
            };
            const visible = (node: Element | null): node is HTMLElement => {
                if (!(node instanceof HTMLElement) || node.matches(EXCLUDED) || node.closest(EXCLUDED)) return false;
                const style = getComputedStyle(node);
                return style.display !== "none" && style.visibility !== "hidden" && Number(style.opacity || "1") > 0 && node.getClientRects().length > 0;
            };
            const text = (node: Element | null) => visible(node) ? normalise(node.textContent) : "";
            const meaningful = (value: string) => value.length > 1 && !/^(menu|open|close)$/i.test(value);
            const isWithin = (node: Element, roots: Array<Element | undefined | null>) => roots.some(root => Boolean(root?.contains(node)));
            const headingLevel = (heading: Element) => Number(heading.tagName.match(/^H([1-6])$/)?.[1] || heading.getAttribute("aria-level") || 2);
            const headingText = (heading: Element) => text(heading);

            const leafText = (root: Element, omit: Element[] = []) => {
                const blocks = Array.from(root.querySelectorAll(BLOCK)).filter(visible).filter(element => !isWithin(element, omit));
                const nestedBlocks = new Set<Element>();
                for (const block of blocks) {
                    let parent = block.parentElement;
                    while (parent && parent !== root) {
                        if (parent.matches(BLOCK)) nestedBlocks.add(parent);
                        parent = parent.parentElement;
                    }
                }
                const blockValues = blocks.filter(block => !nestedBlocks.has(block))
                    .filter(block => !block.querySelector(HEADING))
                    .map(block => text(block)).filter(meaningful);
                const inlineValues = Array.from(root.querySelectorAll("span,strong,em,b,i,label"))
                    .filter(visible).filter(element => !isWithin(element, omit))
                    .filter(element => !element.closest(`${HEADING},button,a,[role='button']`))
                    .filter(element => !Array.from(element.children).some(visible))
                    .map(element => text(element)).filter(meaningful);
                return unique(
                    [...blockValues, ...inlineValues],
                    value => value
                );
            };
            const orderedContent = (root: Element, titleElement: Element | undefined, omit: Element[] = []) => {
                const elements = Array.from(root.querySelectorAll(`${HEADING},${BLOCK}`)).filter(visible)
                    .filter(element => !isWithin(element, omit) && element !== titleElement)
                    .filter(element => element.matches(HEADING) || !element.querySelector(HEADING));
                const blockElements = elements.filter(element => element.matches(BLOCK));
                const nestedBlocks = new Set<Element>();
                for (const block of blockElements) {
                    let parent = block.parentElement;
                    while (parent && parent !== root) {
                        if (parent.matches(BLOCK)) nestedBlocks.add(parent);
                        parent = parent.parentElement;
                    }
                }
                return unique(elements.filter(element => !element.matches(BLOCK) || !nestedBlocks.has(element))
                    .map(element => text(element)).filter(meaningful), value => value);
            };
            const controls = (root: Element) => unique(
                Array.from(root.querySelectorAll("button,a,[role='button']")).filter(visible)
                    .filter(control => !Array.from(control.querySelectorAll("button,a,[role='button']")).some(visible))
                    .map(control => text(control)).filter(meaningful),
                value => value
            );
            const images = (root: Element, omit: Element[] = []): Image[] => unique(
                Array.from(root.querySelectorAll("img")).filter(visible).filter(image => !isWithin(image, omit)).map(image => {
                    const imageElement = image as HTMLImageElement;
                    const alt = normalise(imageElement.alt || image.getAttribute("aria-label") || image.getAttribute("title") || "") || "No alternative text provided";
                    const anchor = image.closest("a[href]") as HTMLAnchorElement | null;
                    return { alt, link: anchor ? anchor.href : undefined };
                }),
                image => `${image.alt}|${image.link ?? ""}`
            );
            const lists = (root: Element, omit: Element[] = []) => Array.from(root.querySelectorAll("ul,ol")).filter(visible)
                .filter(list => !isWithin(list, omit)).map(list => unique(Array.from(list.querySelectorAll(":scope > li")).filter(visible).map(text).filter(meaningful), value => value)).filter(list => list.length);
            const tables = (root: Element, omit: Element[] = []): Table[] => Array.from(root.querySelectorAll("table")).filter(visible)
                .filter(table => !isWithin(table, omit)).map(table => {
                    const rowElements = Array.from(table.querySelectorAll("tr")).filter(visible);
                    const rows = rowElements.map(row => unique(Array.from(row.querySelectorAll("th,td")).filter(visible).map(text).filter(meaningful), value => value)).filter(row => row.length);
                    return { headers: rowElements[0]?.querySelector("th") ? rows.shift() ?? [] : [], rows };
                }).filter(table => table.headers.length || table.rows.length);
            const sectionContainer = (heading: Element, main: Element, sectionLevel: number): Element => {
                const semanticSection = heading.closest("section");
                if (semanticSection && semanticSection !== main) return semanticSection;
                let current = heading.parentElement ?? main;
                while (current.parentElement && current.parentElement !== main) {
                    const parent = current.parentElement;
                    const peerHeadings = Array.from(parent.children).flatMap(child => Array.from(child.querySelectorAll(HEADING)).filter(visible))
                        .filter(candidate => headingLevel(candidate) === sectionLevel);
                    if (peerHeadings.length >= 2 || text(parent).length > 2400) return current;
                    current = parent;
                }
                return current;
            };
            const isNumber = (value: string) => /^\d{1,3}[.)-]?$/.test(value);
            const cardMatches = (root: Element): Array<{ root: Element; card: Card }> => {
                const candidateHeadings = Array.from(root.querySelectorAll("h3,h4,h5,h6,[role='heading']")).filter(visible);
                const candidateRoots: Element[] = [];
                for (const heading of candidateHeadings) {
                    let cardRoot = heading.parentElement ?? root;
                    while (cardRoot.parentElement && cardRoot.parentElement !== root) {
                        const parent = cardRoot.parentElement;
                        const siblingCards = Array.from(parent.children).filter(child => child !== cardRoot)
                            .filter(child => Array.from(child.querySelectorAll("h3,h4,h5,h6,[role='heading']")).some(visible));
                        if (siblingCards.length >= 1 || text(parent).length > 1600) break;
                        cardRoot = parent;
                    }
                    if (!candidateRoots.some(existing => existing === cardRoot || existing.contains(cardRoot) || cardRoot.contains(existing))) candidateRoots.push(cardRoot);
                }
                return unique(candidateRoots.map(cardRoot => {
                    const headingElements = Array.from(cardRoot.querySelectorAll("h3,h4,h5,h6,[role='heading']")).filter(visible).filter(heading => meaningful(headingText(heading)));
                    const headings = headingElements.map(headingText);
                    const label = headings.find(isNumber);
                    // A smaller nested heading is commonly the actual card title; a preceding h3 is often a quote or eyebrow.
                    const titleElement = headingElements.find(heading => headingLevel(heading) >= 4 && !isNumber(headingText(heading)))
                        ?? headingElements.find(heading => !isNumber(headingText(heading)));
                    const title = titleElement ? headingText(titleElement) : "";
                    const description = orderedContent(cardRoot, titleElement).filter(value => value !== label);
                    return { root: cardRoot, card: { label, title, description, buttons: controls(cardRoot), images: images(cardRoot) } };
                }).filter(match => match.card.title && (match.card.description.length || match.card.buttons.length || match.card.images.length)), match => match.card.title);
            };

            const header = document.querySelector("header,[role='banner'],#main-header,.site-header");
            const footerRoot = document.querySelector("footer,[role='contentinfo'],#main-footer,.site-footer");
            const main = document.querySelector("main,[role='main']") ?? Array.from(document.body.children).filter(visible)
                .filter(element => element !== header && element !== footerRoot).sort((left, right) => text(right).length - text(left).length)[0] ?? document.body;
            const navigationRoot = header ?? Array.from(document.querySelectorAll("nav,[role='navigation']")).find(visible) ?? null;
            const navigation = navigationRoot ? controls(navigationRoot) : [];
            const headings = Array.from(main.querySelectorAll(HEADING)).filter(visible).filter(heading => !navigationRoot?.contains(heading) && !footerRoot?.contains(heading));
            const primaryHeading = headings.find(heading => headingLevel(heading) === 1) ?? headings[0];
            const candidates = headings.filter(heading => heading !== primaryHeading && headingLevel(heading) > 1);
            const sectionLevel = [2, 3, 4, 5, 6].find(level => candidates.some(heading => headingLevel(heading) === level));
            const sectionHeadings = sectionLevel ? candidates.filter(heading => headingLevel(heading) === sectionLevel) : [];
            const sectionRoots: Array<{ heading: Element; root: Element }> = [];
            for (const heading of sectionHeadings) {
                const root = sectionContainer(heading, main, sectionLevel!);
                if (!sectionRoots.some(item => item.root === root)) sectionRoots.push({ heading, root });
            }
            const heroRoot = primaryHeading ? sectionContainer(primaryHeading, main, 1) : main;
            const hasTrueHeroHeading = Boolean(primaryHeading && headingLevel(primaryHeading) === 1);
            const hero = {
                heading: primaryHeading ? headingText(primaryHeading) : "",
                description: hasTrueHeroHeading ? leafText(heroRoot, [primaryHeading, ...sectionRoots.map(item => item.root)]).slice(0, 6) : [],
                buttons: hasTrueHeroHeading ? controls(heroRoot) : [],
                images: hasTrueHeroHeading ? images(heroRoot, sectionRoots.map(item => item.root)) : []
            };
            const sectionLabel = (heading: Element) => {
                const parent = heading.parentElement;
                if (!parent) return "";
                const candidates = Array.from(parent.children).filter(child => child !== heading && child.compareDocumentPosition(heading) & Node.DOCUMENT_POSITION_FOLLOWING)
                    .filter(visible).map(text).filter(value => meaningful(value) && value.length < 90 && !/\s{2,}/.test(value));
                return candidates.find(value => /[A-Z]{3,}/.test(value) && value === value.toUpperCase()) ?? "";
            };
            let sections: Section[] = sectionRoots.map(({ heading, root }) => {
                const cards = cardMatches(root);
                const cardRoots = cards.map(match => match.root);
                const excludedContent = [heading, ...cardRoots, ...Array.from(root.querySelectorAll("ul,ol,table"))];
                const sectionImages = images(root, cardRoots);
                // Some page builders place one image immediately after a single text card.
                // Preserve that visual group by associating the image with its only card.
                if (cards.length === 1 && sectionImages.length && !cards[0].card.images.length) {
                    cards[0].card.images = sectionImages;
                }
                return {
                    heading: sectionLabel(heading) || headingText(heading),
                    content: sectionLabel(heading) ? [headingText(heading), ...leafText(root, excludedContent)] : leafText(root, excludedContent),
                    buttons: controls(root).filter(button => !cards.some(match => match.card.buttons.includes(button))),
                    images: cards.length === 1 && sectionImages.length && cards[0].card.images.length ? [] : sectionImages,
                    lists: lists(root, cardRoots),
                    tables: tables(root, cardRoots),
                    cards: cards.map(match => match.card)
                };
            }).filter(section => section.heading);
            if (!sections.length || !hasTrueHeroHeading) {
                const cards = cardMatches(main);
                const cardRoots = cards.map(match => match.root);
                const fallback: Section = {
                    heading: "Content", content: leafText(main, [primaryHeading, ...cardRoots, ...Array.from(main.querySelectorAll("ul,ol,table"))]),
                    buttons: controls(main).filter(button => !cards.some(match => match.card.buttons.includes(button))), images: images(main, cardRoots), lists: lists(main, cardRoots), tables: tables(main, cardRoots), cards: cards.map(match => match.card)
                };
                if (!sections.some(section => section.heading === fallback.heading && section.cards.length === fallback.cards.length)) sections = [fallback];
            }
            const footer = footerRoot ? unique([...leafText(footerRoot), ...controls(footerRoot)], value => value) : [];
            return { pageName, url, navigation, hero, sections, footer };
        }, { pageName, url });
    }
}
