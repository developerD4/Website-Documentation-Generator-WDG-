# Website Content Review Document Generator

Generates one leadership-ready Microsoft Word content review document from the website URLs in the supplied Excel workbook.

The output is intended for Leadership and Content Teams. It presents visible website content by page, without HTML or implementation details.

## Prerequisites

- Node.js 18 or later
- Google Chrome installed (default path: `C:\Program Files\Google\Chrome\Application\chrome.exe`)
- Network access to the website URLs in the workbook

## Install dependencies

From the project root:

```powershell
npm install
```

## Input file

The generator reads:

```text
config/All_Pages_wvis.xlsx
```

Required worksheet columns:

| Column | Description |
| --- | --- |
| `Page_Name` | Page name shown in the review document |
| `URL` | Full HTTP or HTTPS URL to review |
| `Status` | Optional. Set to `No` to exclude a row. |

Duplicate URLs are processed only once.

## Compile

```powershell
npx.cmd tsc
```

Compiled JavaScript is written to `dist`.

## Run

```powershell
node dist/index.js
```

The program processes every eligible URL. It exits with an error if any page cannot be extracted, preventing an incomplete review document from being generated.

## Output

The generated document is:

```text
output/Website_Content_Review.docx
```

It contains one page-level review for every website URL, with:

- Page name and URL
- Navigation
- Hero banner content
- Content sections
- Cards, lists, tables, and calls to action where visible
- Footer content
- Professional headings, separators, whitespace, and page breaks

## Chrome configuration

The generator uses Google Chrome in headless mode. To use a different Chrome or Chromium executable, set `CHROME_EXECUTABLE` before running:

```powershell
$env:CHROME_EXECUTABLE = "C:\Path\To\chrome.exe"
node dist/index.js
```

## Troubleshooting

- **Browser executable not found:** Install Google Chrome or set `CHROME_EXECUTABLE`.
- **Network access denied or a page fails:** Confirm the URL is accessible from the machine and that the environment permits browser network access.
- **Excel validation error:** Ensure `Page_Name` and `URL` are populated and every URL begins with `http://` or `https://`.
