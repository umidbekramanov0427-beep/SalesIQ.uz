// Minimal RFC4180-ish CSV parser (quoted fields, embedded commas/newlines,
// "" escaping) -- used client-side by the data-import wizard so an upload
// never has to leave the browser as a raw file; only the already-parsed
// rows are sent to the server. No dependency needed for this scope (every
// CRM's own CSV export, and Excel's "Save As CSV", produces exactly this).
export function parseCsv(
  text: string,
  delimiter: string = ",",
): { headers: string[]; rows: string[][] } {
  const rows: string[][] = [];
  let field = "";
  let row: string[] = [];
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += c;
      }
      continue;
    }
    if (c === '"') {
      inQuotes = true;
    } else if (c === delimiter) {
      row.push(field);
      field = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(field);
      field = "";
      if (row.some((cell) => cell.trim() !== "")) rows.push(row);
      row = [];
    } else {
      field += c;
    }
  }
  if (field !== "" || row.length > 0) {
    row.push(field);
    if (row.some((cell) => cell.trim() !== "")) rows.push(row);
  }

  const [headers = [], ...dataRows] = rows;
  return { headers: headers.map((h) => h.trim()), rows: dataRows };
}

/** Excel saves "CSV" with ";" in locales that use "," as the decimal mark -- pick whichever the header row uses. */
export function detectCsvDelimiter(text: string): string {
  const firstLine = text.split(/\r?\n/, 1)[0] ?? "";
  const count = (ch: string) => firstLine.split(ch).length - 1;
  const candidates = [",", ";", "\t"];
  return candidates.reduce((best, ch) => (count(ch) > count(best) ? ch : best), ",");
}
