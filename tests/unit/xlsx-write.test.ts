import { buildXlsx, crc32 } from "@/lib/xlsx-write";

describe("xlsx writer", () => {
  it("computes the standard CRC-32", () => {
    expect(crc32(new TextEncoder().encode("123456789"))).toBe(0xcbf43926);
  });

  it("writes a zip with the workbook parts and escaped cells", () => {
    const bytes = buildXlsx([
      {
        name: "Tashriflar",
        rows: [
          ["Ism", "Soni"],
          ["A & <B>", 3],
          [null, "Oʻzbek"],
        ],
      },
    ]);
    const view = new DataView(bytes.buffer);
    expect(view.getUint32(0, true)).toBe(0x04034b50);
    expect(view.getUint32(bytes.length - 22, true)).toBe(0x06054b50);
    expect(view.getUint16(bytes.length - 22 + 10, true)).toBe(6);
    const text = new TextDecoder().decode(bytes);
    expect(text).toContain('<sheet name="Tashriflar"');
    expect(text).toContain("A &amp; &lt;B&gt;");
    expect(text).toContain('<c r="B2"><v>3</v></c>');
    expect(text).toContain("Oʻzbek");
  });

  it("writes a styled sheet: header row with a filter, merged title, links", () => {
    const bytes = buildXlsx([
      {
        name: "Pul qaytarish",
        header: 1,
        merges: ["A1:C1"],
        widths: [6, 20, 12],
        rows: [
          [{ v: "Hisobot", s: "title" }],
          [
            { v: "#", s: "head" },
            { v: "Mijoz", s: "head" },
            { v: "Summa", s: "head" },
          ],
          [
            { v: 1, s: "center" },
            { v: "Ochish", s: "link", href: 'https://x.uz/a?b="c"' },
            { v: 1500000, s: "money" },
          ],
        ],
      },
    ]);
    const text = new TextDecoder().decode(bytes);
    expect(text).toContain('<autoFilter ref="A2:C3"/>');
    expect(text).toContain('<mergeCell ref="A1:C1"/>');
    expect(text).toContain('<pane ySplit="2" topLeftCell="A3"');
    expect(text).toContain('<c r="C3" s="4"><v>1500000</v></c>');
    expect(text).toContain('HYPERLINK("https://x.uz/a?b=""c""","Ochish")');
    expect(text).toContain("_xlnm._FilterDatabase");
    expect(text).toContain('<col min="2" max="2" width="20" customWidth="1"/>');
  });
});
