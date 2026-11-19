// Minimal browser-side .xlsx writer (companion of xlsx-read.ts): one or
// more sheets of text/number cells, no dependency. A plain sheet gets a
// bold, frozen first row. A styled sheet ("header" set) names its own cell
// styles -- a dark header row with a filter, hairline row borders, money
// with thousands separators, coloured status flags, links -- and may have
// a title over the table, merged cells and its own column widths.
// An .xlsx file is a zip of a few XML parts; they are stored uncompressed,
// which every spreadsheet app opens.

/** The cell looks a styled sheet can use (see STYLE_INDEX). */
export type XlsxStyle =
  | "text"
  | "strong"
  | "head"
  | "money"
  | "num"
  | "mono"
  | "center"
  | "muted"
  | "ok"
  | "warn"
  | "bad"
  | "gray"
  | "title"
  | "subtitle"
  | "totalLabel"
  | "totalMoney"
  | "link"
  | "kpiLabel"
  | "kpiValue";

/** A styled cell: its value, its look, and (link) a HYPERLINK target. */
export type XlsxRich = { v: string | number | null | undefined; s?: XlsxStyle; href?: string };
export type XlsxCell = string | number | null | undefined | XlsxRich;
export type XlsxSheet = {
  name: string;
  rows: XlsxCell[][];
  /** Styled sheet: the 0-based row of the table's header (frozen, with a filter). */
  header?: number;
  /** Column widths in characters (else from the content). */
  widths?: number[];
  /** Row heights in points, by 0-based row. */
  heights?: Record<number, number>;
  /** Merged ranges, "A1:H1". */
  merges?: string[];
};

// Index into cellXfs below; 0 and 1 are the plain sheet's normal and bold.
const STYLE_INDEX: Record<XlsxStyle, number> = {
  head: 2,
  text: 3,
  money: 4,
  mono: 5,
  ok: 6,
  warn: 7,
  bad: 8,
  gray: 9,
  title: 10,
  subtitle: 11,
  center: 12,
  muted: 13,
  totalLabel: 14,
  totalMoney: 15,
  link: 16,
  num: 17,
  kpiLabel: 18,
  kpiValue: 19,
  strong: 20,
};

const STYLES_XML =
  `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
  `<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">` +
  `<numFmts count="1"><numFmt numFmtId="164" formatCode="#,##0"/></numFmts>` +
  `<fonts count="11">` +
  `<font><sz val="11"/><name val="Calibri"/></font>` + // 0
  `<font><b/><sz val="11"/><name val="Calibri"/></font>` + // 1
  `<font><b/><sz val="10.5"/><color rgb="FFFFFFFF"/><name val="Calibri"/></font>` + // 2 header
  `<font><b/><sz val="16"/><color rgb="FF111827"/><name val="Calibri"/></font>` + // 3 title
  `<font><sz val="10"/><color rgb="FF6B7280"/><name val="Calibri"/></font>` + // 4 muted
  `<font><sz val="10.5"/><name val="Consolas"/></font>` + // 5 mono
  `<font><b/><sz val="10.5"/><color rgb="FF065F46"/><name val="Calibri"/></font>` + // 6 green
  `<font><b/><sz val="10.5"/><color rgb="FF92400E"/><name val="Calibri"/></font>` + // 7 amber
  `<font><b/><sz val="10.5"/><color rgb="FF9F1239"/><name val="Calibri"/></font>` + // 8 red
  `<font><u/><sz val="11"/><color rgb="FF2563EB"/><name val="Calibri"/></font>` + // 9 link
  `<font><b/><sz val="14"/><color rgb="FF111827"/><name val="Calibri"/></font>` + // 10 kpi
  `</fonts>` +
  `<fills count="7">` +
  `<fill><patternFill patternType="none"/></fill>` +
  `<fill><patternFill patternType="gray125"/></fill>` +
  `<fill><patternFill patternType="solid"><fgColor rgb="FF1F2937"/><bgColor indexed="64"/></patternFill></fill>` + // 2 header
  `<fill><patternFill patternType="solid"><fgColor rgb="FFD1FAE5"/><bgColor indexed="64"/></patternFill></fill>` + // 3 green
  `<fill><patternFill patternType="solid"><fgColor rgb="FFFEF3C7"/><bgColor indexed="64"/></patternFill></fill>` + // 4 amber
  `<fill><patternFill patternType="solid"><fgColor rgb="FFFFE4E6"/><bgColor indexed="64"/></patternFill></fill>` + // 5 red
  `<fill><patternFill patternType="solid"><fgColor rgb="FFF3F4F6"/><bgColor indexed="64"/></patternFill></fill>` + // 6 gray
  `</fills>` +
  `<borders count="3">` +
  `<border><left/><right/><top/><bottom/><diagonal/></border>` +
  `<border><left/><right/><top/><bottom style="thin"><color rgb="FFE5E7EB"/></bottom><diagonal/></border>` + // 1 hairline
  `<border><left/><right/><top style="medium"><color rgb="FF1F2937"/></top><bottom/><diagonal/></border>` + // 2 total
  `</borders>` +
  `<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>` +
  `<cellXfs count="21">` +
  `<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>` + // 0
  `<xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/>` + // 1
  `<xf numFmtId="0" fontId="2" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1" applyAlignment="1"><alignment vertical="center" wrapText="1"/></xf>` + // 2 head
  `<xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1" applyAlignment="1"><alignment vertical="center"/></xf>` + // 3 text
  `<xf numFmtId="164" fontId="1" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyFont="1" applyBorder="1" applyAlignment="1"><alignment horizontal="right" vertical="center"/></xf>` + // 4 money
  `<xf numFmtId="0" fontId="5" fillId="0" borderId="1" xfId="0" applyFont="1" applyBorder="1" applyAlignment="1"><alignment vertical="center"/></xf>` + // 5 mono
  `<xf numFmtId="0" fontId="6" fillId="3" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>` + // 6 ok
  `<xf numFmtId="0" fontId="7" fillId="4" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>` + // 7 warn
  `<xf numFmtId="0" fontId="8" fillId="5" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>` + // 8 bad
  `<xf numFmtId="0" fontId="4" fillId="6" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>` + // 9 gray
  `<xf numFmtId="0" fontId="3" fillId="0" borderId="0" xfId="0" applyFont="1" applyAlignment="1"><alignment vertical="center"/></xf>` + // 10 title
  `<xf numFmtId="0" fontId="4" fillId="0" borderId="0" xfId="0" applyFont="1" applyAlignment="1"><alignment vertical="center"/></xf>` + // 11 subtitle
  `<xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>` + // 12 center
  `<xf numFmtId="0" fontId="4" fillId="0" borderId="1" xfId="0" applyFont="1" applyBorder="1" applyAlignment="1"><alignment vertical="center"/></xf>` + // 13 muted
  `<xf numFmtId="0" fontId="1" fillId="6" borderId="2" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment vertical="center"/></xf>` + // 14 totalLabel
  `<xf numFmtId="164" fontId="1" fillId="6" borderId="2" xfId="0" applyNumberFormat="1" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="right" vertical="center"/></xf>` + // 15 totalMoney
  `<xf numFmtId="0" fontId="9" fillId="0" borderId="1" xfId="0" applyFont="1" applyBorder="1" applyAlignment="1"><alignment vertical="center"/></xf>` + // 16 link
  `<xf numFmtId="164" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyBorder="1" applyAlignment="1"><alignment horizontal="right" vertical="center"/></xf>` + // 17 num
  `<xf numFmtId="0" fontId="4" fillId="6" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment vertical="center"/></xf>` + // 18 kpiLabel
  `<xf numFmtId="164" fontId="10" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyFont="1" applyBorder="1" applyAlignment="1"><alignment horizontal="right" vertical="center"/></xf>` + // 19 kpiValue
  `<xf numFmtId="0" fontId="1" fillId="0" borderId="1" xfId="0" applyFont="1" applyBorder="1" applyAlignment="1"><alignment vertical="center"/></xf>` + // 20 strong
  `</cellXfs>` +
  `<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>` +
  `</styleSheet>`;

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

export function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]!) & 0xff]! ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/** A zip archive with the given files stored (no compression). */
export function zipStored(files: { name: string; data: Uint8Array }[]): Uint8Array {
  const enc = new TextEncoder();
  const chunks: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let offset = 0;
  for (const f of files) {
    const name = enc.encode(f.name);
    const crc = crc32(f.data);
    const local = new DataView(new ArrayBuffer(30));
    local.setUint32(0, 0x04034b50, true);
    local.setUint16(4, 20, true);
    local.setUint16(6, 0x0800, true); // UTF-8 names
    local.setUint16(8, 0, true); // stored
    local.setUint32(14, crc, true);
    local.setUint32(18, f.data.length, true);
    local.setUint32(22, f.data.length, true);
    local.setUint16(26, name.length, true);
    chunks.push(new Uint8Array(local.buffer), name, f.data);

    const dir = new DataView(new ArrayBuffer(46));
    dir.setUint32(0, 0x02014b50, true);
    dir.setUint16(4, 20, true);
    dir.setUint16(6, 20, true);
    dir.setUint16(8, 0x0800, true);
    dir.setUint16(10, 0, true);
    dir.setUint32(16, crc, true);
    dir.setUint32(20, f.data.length, true);
    dir.setUint32(24, f.data.length, true);
    dir.setUint16(28, name.length, true);
    dir.setUint32(42, offset, true);
    central.push(new Uint8Array(dir.buffer), name);
    offset += 30 + name.length + f.data.length;
  }
  const dirSize = central.reduce((n, c) => n + c.length, 0);
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true);
  end.setUint16(8, files.length, true);
  end.setUint16(10, files.length, true);
  end.setUint32(12, dirSize, true);
  end.setUint32(16, offset, true);
  const parts = [...chunks, ...central, new Uint8Array(end.buffer)];
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.length;
  }
  return out;
}

const xml = (s: string) =>
  s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    // Control characters other than tab/newline are invalid in XML.
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "");

function columnName(i: number): string {
  let s = "";
  for (let n = i + 1; n > 0; n = Math.floor((n - 1) / 26)) {
    s = String.fromCharCode(65 + ((n - 1) % 26)) + s;
  }
  return s;
}

const isRich = (v: XlsxCell): v is XlsxRich => typeof v === "object" && v !== null;

function cellXml(ref: string, v: XlsxCell, style: number): string {
  const rich = isRich(v) ? v : null;
  const value = rich ? rich.v : (v as string | number | null | undefined);
  const s = style ? ` s="${style}"` : "";
  if (rich?.href) {
    const text = String(value ?? rich.href);
    const q = (x: string) => xml(x).replace(/&quot;/g, '""');
    return (
      `<c r="${ref}" t="str"${s}><f>HYPERLINK("${q(rich.href)}","${q(text)}")</f>` +
      `<v>${xml(text)}</v></c>`
    );
  }
  if (value === null || value === undefined || value === "") {
    return style ? `<c r="${ref}"${s}/>` : "";
  }
  return typeof value === "number" && Number.isFinite(value)
    ? `<c r="${ref}"${s}><v>${value}</v></c>`
    : `<c r="${ref}" t="inlineStr"${s}><is><t xml:space="preserve">${xml(String(value))}</t></is></c>`;
}

function sheetXml(sheet: XlsxSheet): string {
  const { rows } = sheet;
  const styled = sheet.header !== undefined;
  const head = sheet.header ?? 0;
  const widths = new Map<number, number>();
  let lastCol = 0;
  const body = rows
    .map((row, r) => {
      const cells = row
        .map((v, c) => {
          const rich = isRich(v) ? v : null;
          const value = rich ? rich.v : v;
          // Titles and merged lines don't widen their column.
          const wide = !styled || r >= head;
          if (wide && value !== null && value !== undefined && value !== "") {
            const text = typeof value === "number" ? value.toLocaleString("ru-RU") : String(value);
            widths.set(c, Math.max(widths.get(c) ?? 8, Math.min(60, text.length + 3)));
          }
          if (r >= head) lastCol = Math.max(lastCol, c);
          const style = rich?.s ? STYLE_INDEX[rich.s] : !styled && r === 0 ? 1 : 0;
          return cellXml(`${columnName(c)}${r + 1}`, v, style);
        })
        .join("");
      const ht = sheet.heights?.[r];
      return `<row r="${r + 1}"${ht ? ` ht="${ht}" customHeight="1"` : ""}>${cells}</row>`;
    })
    .join("");
  const colCount = Math.max(
    widths.size ? Math.max(...widths.keys()) + 1 : 0,
    sheet.widths?.length ?? 0,
  );
  const cols = Array.from({ length: colCount }, (_, c) => {
    const w = sheet.widths?.[c] ?? widths.get(c);
    return w ? `<col min="${c + 1}" max="${c + 1}" width="${w}" customWidth="1"/>` : "";
  }).join("");
  const frozen = head + 1;
  const lastRow = rows.length;
  const filter =
    styled && lastRow > head
      ? `<autoFilter ref="A${head + 1}:${columnName(lastCol)}${lastRow}"/>`
      : "";
  const merges = sheet.merges?.length
    ? `<mergeCells count="${sheet.merges.length}">${sheet.merges.map((m) => `<mergeCell ref="${m}"/>`).join("")}</mergeCells>`
    : "";
  return (
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">` +
    (styled ? `<sheetPr><pageSetUpPr fitToPage="1"/></sheetPr>` : "") +
    `<sheetViews><sheetView workbookViewId="0"${styled ? ` showGridLines="0"` : ""}><pane ySplit="${frozen}" topLeftCell="A${frozen + 1}" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>` +
    (styled ? `<sheetFormatPr defaultRowHeight="20" customHeight="1"/>` : "") +
    (cols ? `<cols>${cols}</cols>` : "") +
    `<sheetData>${body}</sheetData>` +
    filter +
    merges +
    (styled
      ? `<pageMargins left="0.4" right="0.4" top="0.5" bottom="0.5" header="0.3" footer="0.3"/>` +
        `<pageSetup orientation="landscape" fitToWidth="1" fitToHeight="0"/>`
      : "") +
    `</worksheet>`
  );
}

/** The filter's range for the workbook (Excel keeps it as a hidden name). */
function filterRange(sheet: XlsxSheet, name: string): string | null {
  if (sheet.header === undefined || sheet.rows.length <= sheet.header) return null;
  let last = 0;
  sheet.rows.slice(sheet.header).forEach((r) => (last = Math.max(last, r.length - 1)));
  const col = columnName(last);
  return `'${name.replace(/'/g, "''")}'!$A$${sheet.header + 1}:$${col}$${sheet.rows.length}`;
}

/** Sheet names: at most 31 chars, no []:*?/\ and unique. */
function sheetNames(sheets: XlsxSheet[]): string[] {
  const used = new Set<string>();
  return sheets.map((s, i) => {
    let name =
      s.name
        .replace(/[[\]:*?/\\]/g, " ")
        .slice(0, 31)
        .trim() || `Sheet${i + 1}`;
    while (used.has(name)) name = `${name.slice(0, 28)} ${i + 1}`;
    used.add(name);
    return name;
  });
}

export function buildXlsx(sheets: XlsxSheet[]): Uint8Array {
  const enc = new TextEncoder();
  const names = sheetNames(sheets);
  const files = [
    {
      name: "[Content_Types].xml",
      text:
        `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
        `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
        `<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>` +
        `<Default Extension="xml" ContentType="application/xml"/>` +
        `<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>` +
        `<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>` +
        sheets
          .map(
            (_, i) =>
              `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`,
          )
          .join("") +
        `</Types>`,
    },
    {
      name: "_rels/.rels",
      text:
        `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
        `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
        `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>` +
        `</Relationships>`,
    },
    {
      name: "xl/workbook.xml",
      text:
        `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
        `<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>` +
        names
          .map((n, i) => `<sheet name="${xml(n)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`)
          .join("") +
        `</sheets>` +
        (() => {
          const defs = sheets
            .map((s, i) => {
              const ref = filterRange(s, names[i]!);
              return ref
                ? `<definedName name="_xlnm._FilterDatabase" localSheetId="${i}" hidden="1">${xml(ref)}</definedName>`
                : "";
            })
            .join("");
          return defs ? `<definedNames>${defs}</definedNames>` : "";
        })() +
        `</workbook>`,
    },
    {
      name: "xl/_rels/workbook.xml.rels",
      text:
        `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
        `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
        sheets
          .map(
            (_, i) =>
              `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`,
          )
          .join("") +
        `<Relationship Id="rId${sheets.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>` +
        `</Relationships>`,
    },
    { name: "xl/styles.xml", text: STYLES_XML },
    ...sheets.map((s, i) => ({ name: `xl/worksheets/sheet${i + 1}.xml`, text: sheetXml(s) })),
  ];
  return zipStored(files.map((f) => ({ name: f.name, data: enc.encode(f.text) })));
}

export function downloadXlsx(filename: string, sheets: XlsxSheet[]): void {
  const bytes = buildXlsx(sheets);
  const blob = new Blob([bytes.buffer as ArrayBuffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename.endsWith(".xlsx") ? filename : `${filename}.xlsx`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
