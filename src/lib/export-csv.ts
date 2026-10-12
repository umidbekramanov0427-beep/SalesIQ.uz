import { trail } from "@/lib/session-trail";

// Client-side CSV export — no server round-trip or third-party API needed.
// The resulting .csv opens natively in Excel, and can be imported into or
// dragged onto Google Sheets (File → Import).
function csvCell(value: unknown): string {
  const s = value == null ? "" : String(value);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function downloadCsv(filename: string, rows: Record<string, unknown>[]): void {
  if (rows.length === 0) return;
  trail("action", "report_export", undefined, { format: "csv" });
  const headers = Object.keys(rows[0]!);
  const lines = [
    headers.map(csvCell).join(","),
    ...rows.map((row) => headers.map((h) => csvCell(row[h])).join(",")),
  ];
  // Leading BOM keeps Excel from mangling non-ASCII (Cyrillic/Uzbek) text.
  const blob = new Blob(["﻿" + lines.join("\r\n")], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename.endsWith(".csv") ? filename : `${filename}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

// Real OAuth-based push into an existing Google Sheet would need a Google
// Cloud project + client credentials from the account owner, which this
// platform doesn't have on file -- so this is the no-setup path instead:
// download the CSV (identical to the CSV export above) and open a blank
// Google Sheet in a new tab, ready for the user to File -> Import it.
export function exportToGoogleSheets(filename: string, rows: Record<string, unknown>[]): void {
  if (rows.length === 0) return;
  downloadCsv(filename, rows);
  window.open("https://sheets.new", "_blank", "noopener,noreferrer");
}

function pdfCell(value: unknown): string {
  const s = value == null ? "" : String(value);
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// PDF export via the browser's native print-to-PDF — no bundled PDF library
// needed. Opens a clean, print-ready table in a new tab and triggers the
// print dialog, where "Save as PDF" produces the file.
export function exportAsPdf(filename: string, rows: Record<string, unknown>[]): void {
  if (rows.length === 0) return;
  trail("action", "report_export", undefined, { format: "pdf" });
  const headers = Object.keys(rows[0]!);
  const title = filename.replace(/\.(pdf|csv)$/i, "");
  const win = window.open("", "_blank");
  if (!win) return;
  win.document.write(`<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<title>${pdfCell(title)}</title>
<style>
  body { font-family: -apple-system, Segoe UI, Roboto, sans-serif; padding: 24px; color: #111; }
  h1 { font-size: 16px; margin: 0 0 16px; }
  table { width: 100%; border-collapse: collapse; font-size: 11px; }
  th, td { border: 1px solid #ccc; padding: 6px 8px; text-align: left; }
  th { background: #f2f2f2; }
  tr:nth-child(even) { background: #fafafa; }
</style>
</head>
<body>
  <h1>${pdfCell(title)}</h1>
  <table>
    <thead><tr>${headers.map((h) => `<th>${pdfCell(h)}</th>`).join("")}</tr></thead>
    <tbody>
      ${rows.map((row) => `<tr>${headers.map((h) => `<td>${pdfCell(row[h])}</td>`).join("")}</tr>`).join("\n")}
    </tbody>
  </table>
</body>
</html>`);
  win.document.close();
  win.focus();
  setTimeout(() => win.print(), 300);
}

// A report made of several titled tables (e.g. the dashboard's Hisobot):
// each section becomes its own block -- a title line, a header row, its
// rows -- separated by a blank line, all in one .csv file.
export type ReportSection = { title: string; rows: Record<string, unknown>[] };

export function downloadReportCsv(
  filename: string,
  heading: string[],
  sections: ReportSection[],
): void {
  trail("action", "report_export", undefined, { format: "csv" });
  const lines: string[] = heading.map(csvCell);
  for (const section of sections) {
    if (section.rows.length === 0) continue;
    const headers = Object.keys(section.rows[0]!);
    lines.push("", csvCell(section.title), headers.map(csvCell).join(","));
    for (const row of section.rows) lines.push(headers.map((h) => csvCell(row[h])).join(","));
  }
  const blob = new Blob(["﻿" + lines.join("\r\n")], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename.endsWith(".csv") ? filename : `${filename}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

// Same report as a print-ready page (the browser's "Save as PDF").
export function exportReportPdf(title: string, heading: string[], sections: ReportSection[]): void {
  trail("action", "report_export", undefined, { format: "pdf" });
  const win = window.open("", "_blank");
  if (!win) return;
  const tables = sections
    .filter((s) => s.rows.length > 0)
    .map((s) => {
      const headers = Object.keys(s.rows[0]!);
      return `<h2>${pdfCell(s.title)}</h2>
  <table>
    <thead><tr>${headers.map((h) => `<th>${pdfCell(h)}</th>`).join("")}</tr></thead>
    <tbody>
      ${s.rows.map((row) => `<tr>${headers.map((h) => `<td>${pdfCell(row[h])}</td>`).join("")}</tr>`).join("\n")}
    </tbody>
  </table>`;
    })
    .join("\n");
  win.document.write(`<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<title>${pdfCell(title)}</title>
<style>
  body { font-family: -apple-system, Segoe UI, Roboto, sans-serif; padding: 24px; color: #111; }
  h1 { font-size: 18px; margin: 0 0 6px; }
  h2 { font-size: 14px; margin: 22px 0 8px; }
  p { margin: 0; font-size: 12px; color: #444; }
  table { width: 100%; border-collapse: collapse; font-size: 11px; }
  th, td { border: 1px solid #ccc; padding: 6px 8px; text-align: left; }
  th { background: #f2f2f2; }
  tr:nth-child(even) { background: #fafafa; }
</style>
</head>
<body>
  <h1>${pdfCell(title)}</h1>
  ${heading.map((h) => `<p>${pdfCell(h)}</p>`).join("\n")}
  ${tables}
</body>
</html>`);
  win.document.close();
  win.focus();
  setTimeout(() => win.print(), 300);
}
