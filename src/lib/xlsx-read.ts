// Minimal browser-side .xlsx reader for the lead importer: reads the first
// worksheet into rows of strings. An .xlsx file is a zip of XML parts, so
// this only needs the zip central directory, the browser's own
// DecompressionStream("deflate-raw") and DOMParser -- no dependency, no
// upload of the raw file anywhere. Formulas come through as their cached
// values; formatting, merged cells and extra sheets are ignored.

type ZipEntry = { name: string; method: number; compSize: number; offset: number };

function readEntries(buf: ArrayBuffer): ZipEntry[] {
  const view = new DataView(buf);
  // End of central directory: scan back from the end for its signature.
  let eocd = -1;
  for (let i = buf.byteLength - 22; i >= Math.max(0, buf.byteLength - 66_000); i--) {
    if (view.getUint32(i, true) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error("Not a valid .xlsx file");
  const count = view.getUint16(eocd + 10, true);
  let p = view.getUint32(eocd + 16, true);
  const decoder = new TextDecoder();
  const entries: ZipEntry[] = [];
  for (let n = 0; n < count; n++) {
    if (view.getUint32(p, true) !== 0x02014b50) break;
    const method = view.getUint16(p + 10, true);
    const compSize = view.getUint32(p + 20, true);
    const nameLen = view.getUint16(p + 28, true);
    const extraLen = view.getUint16(p + 30, true);
    const commentLen = view.getUint16(p + 32, true);
    const offset = view.getUint32(p + 42, true);
    const name = decoder.decode(new Uint8Array(buf, p + 46, nameLen));
    entries.push({ name, method, compSize, offset });
    p += 46 + nameLen + extraLen + commentLen;
  }
  return entries;
}

async function readEntry(buf: ArrayBuffer, entry: ZipEntry): Promise<string> {
  const view = new DataView(buf);
  const nameLen = view.getUint16(entry.offset + 26, true);
  const extraLen = view.getUint16(entry.offset + 28, true);
  const start = entry.offset + 30 + nameLen + extraLen;
  const data = new Uint8Array(buf, start, entry.compSize);
  if (entry.method === 0) return new TextDecoder().decode(data);
  if (entry.method !== 8) throw new Error("Unsupported .xlsx compression");
  const stream = new Blob([data]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
  return new Response(stream).text();
}

function parseXml(text: string): Document {
  return new DOMParser().parseFromString(text, "application/xml");
}

function colIndex(ref: string): number {
  let n = 0;
  for (const ch of ref.replace(/\d+$/, "")) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}

function textOf(el: Element): string {
  // <si>/<is> may hold rich-text runs (<r><t>..</t></r>) -- join every <t>.
  return Array.from(el.getElementsByTagName("t"))
    .map((t) => t.textContent ?? "")
    .join("");
}

export async function readXlsxFirstSheet(file: File): Promise<string[][]> {
  const buf = await file.arrayBuffer();
  const entries = readEntries(buf);
  const byName = new Map(entries.map((e) => [e.name.replace(/^\/+/, ""), e]));
  const load = async (name: string) => {
    const e = byName.get(name);
    return e ? readEntry(buf, e) : null;
  };

  // First sheet in workbook order (not necessarily sheet1.xml).
  let sheetPath = "xl/worksheets/sheet1.xml";
  const workbook = await load("xl/workbook.xml");
  const rels = await load("xl/_rels/workbook.xml.rels");
  if (workbook && rels) {
    const firstSheet = parseXml(workbook).getElementsByTagName("sheet")[0];
    const rid =
      firstSheet?.getAttribute("r:id") ??
      firstSheet?.getAttributeNS(
        "http://schemas.openxmlformats.org/officeDocument/2006/relationships",
        "id",
      );
    const rel = Array.from(parseXml(rels).getElementsByTagName("Relationship")).find(
      (r) => r.getAttribute("Id") === rid,
    );
    const target = rel?.getAttribute("Target");
    if (target) sheetPath = target.startsWith("/") ? target.slice(1) : `xl/${target}`;
  }

  const sharedXml = await load("xl/sharedStrings.xml");
  const shared = sharedXml
    ? Array.from(parseXml(sharedXml).getElementsByTagName("si")).map(textOf)
    : [];

  const sheetXml = await load(sheetPath);
  if (!sheetXml) throw new Error("The workbook has no worksheet");
  const rows: string[][] = [];
  for (const rowEl of Array.from(parseXml(sheetXml).getElementsByTagName("row"))) {
    const row: string[] = [];
    for (const c of Array.from(rowEl.getElementsByTagName("c"))) {
      const ref = c.getAttribute("r");
      const idx = ref ? colIndex(ref) : row.length;
      const type = c.getAttribute("t");
      let value = "";
      if (type === "inlineStr") {
        const is = c.getElementsByTagName("is")[0];
        value = is ? textOf(is) : "";
      } else {
        const v = c.getElementsByTagName("v")[0]?.textContent ?? "";
        value = type === "s" ? (shared[Number(v)] ?? "") : v;
      }
      while (row.length < idx) row.push("");
      row[idx] = value;
    }
    if (row.some((cell) => cell.trim() !== "")) rows.push(row);
  }
  return rows;
}
