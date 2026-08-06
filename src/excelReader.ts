import * as XLSX from "xlsx";
import path from "path";
import { PageInfo } from "./types";

export function readPages(): PageInfo[] {

    const excelPath = path.join(
        process.cwd(),
        "config",
        "All_Pages_wvis.xlsx"
    );

    const workbook = XLSX.readFile(excelPath);

    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    if (!sheet) throw new Error("The workbook does not contain a worksheet.");

    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "" });

    const pages = rows
        .map((row, index) => ({
            pageName: String(row.Page_Name ?? "").trim(),
            url: String(row.URL ?? "").trim(),
            status: String(row.Status ?? "Yes").trim()
        }))
        .filter(page => page.pageName && page.url && !/^no$/i.test(page.status ?? ""));

    if (!pages.length) throw new Error("No valid pages were found in the workbook.");
    const invalid = pages.find(page => !/^https?:\/\//i.test(page.url));
    if (invalid) throw new Error(`Invalid URL for '${invalid.pageName}': ${invalid.url}`);
    const uniqueUrls = new Set<string>();
    return pages.filter(page => {
        const key = page.url.replace(/\/$/, "").toLowerCase();
        if (uniqueUrls.has(key)) return false;
        uniqueUrls.add(key);
        return true;
    });
}
