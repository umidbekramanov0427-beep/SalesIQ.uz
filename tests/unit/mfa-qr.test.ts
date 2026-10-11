import { qrImageSrc } from "@/lib/mfa";

// Supabase's TOTP QR arrives as raw SVG markup in a data URL; it has to come
// out as a base64 image every browser accepts.
const svg = '<svg xmlns="http://www.w3.org/2000/svg"><rect width="1" height="1"/></svg>';
const decode = (src: string) => atob(src.replace("data:image/svg+xml;base64,", ""));

describe("2FA QR code", () => {
  it("re-wraps raw and url-encoded SVG as base64", () => {
    for (const input of [
      `data:image/svg+xml;utf-8,${svg}`,
      `data:image/svg+xml;utf-8,${encodeURIComponent(svg)}`,
    ]) {
      const out = qrImageSrc(input);
      expect(out.startsWith("data:image/svg+xml;base64,")).toBe(true);
      expect(decode(out)).toBe(svg);
    }
  });

  it("leaves base64 and non-SVG sources alone", () => {
    const b64 = `data:image/svg+xml;base64,${btoa(svg)}`;
    expect(qrImageSrc(b64)).toBe(b64);
    expect(qrImageSrc("data:image/png;base64,AAAA")).toBe("data:image/png;base64,AAAA");
  });
});
