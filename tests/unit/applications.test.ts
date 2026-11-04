import { applicationTelegramText, normalizePhone, parseApplication } from "@/lib/applications";

describe("applications", () => {
  it("normalizes Uzbek phone numbers", () => {
    expect(normalizePhone("90 123-45-67")).toBe("+998901234567");
    expect(normalizePhone("+998 (90) 123 45 67")).toBe("+998901234567");
    expect(normalizePhone("998901234567")).toBe("+998901234567");
    expect(normalizePhone("")).toBe("");
  });

  it("validates and cleans the form", () => {
    expect(parseApplication({ name: "", phone: "901234567" })).toEqual({
      ok: false,
      error: "NAME",
    });
    expect(parseApplication({ name: "Ali", phone: "12" })).toEqual({ ok: false, error: "PHONE" });
    expect(parseApplication({ name: "Ali", phone: "901234567", email: "x" })).toEqual({
      ok: false,
      error: "EMAIL",
    });
    const r = parseApplication({
      name: "  Ali  ",
      phone: "90 123 45 67",
      teamSize: "6-15",
      source: "pricing<script>",
      utm: { utm_source: "ig", evil: "x" },
    });
    expect(r.ok && r.value).toMatchObject({
      name: "Ali",
      phone: "+998901234567",
      teamSize: "6-15",
      source: "pricingscript",
      utm: { utm_source: "ig" },
      email: null,
    });
  });

  it("escapes the Telegram ping", () => {
    const r = parseApplication({ name: "<b>", phone: "901234567", company: "A & B" });
    expect(r.ok && applicationTelegramText(r.value)).toBe(
      "📝 <b>Yangi ariza</b>\n👤 &lt;b&gt; · A &amp; B\n📞 +998901234567",
    );
  });
});
