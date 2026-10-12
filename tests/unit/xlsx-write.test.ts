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
});
