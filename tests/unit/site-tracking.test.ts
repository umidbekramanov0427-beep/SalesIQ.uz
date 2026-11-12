import { parseVisit, siteStats, snippet, visitSource } from "@/lib/site-tracking";

describe("site tracking", () => {
  it("accepts only well-formed page views and keeps no query strings", () => {
    const v = parseVisit({
      k: "AbCdEfGhJkMnPqRsTu",
      v: "visitor12345",
      s: "session123",
      u: "https://kurs.uz/narxlar?phone=998901234567",
      r: "https://www.instagram.com/p/xyz",
      us: "instagram",
      d: "mobile",
    });
    expect(v).toMatchObject({
      path: "/narxlar",
      referrer: "instagram.com",
      utmSource: "instagram",
      device: "mobile",
    });
    expect(parseVisit({ k: "short", v: "visitor12345" })).toBeNull();
    expect(parseVisit({ k: "AbCdEfGhJkMnPqRsTu", v: "bad id!" })).toBeNull();
  });

  it("counts visitors, leads, conversion and first-touch sources", () => {
    const row = (at: string, v: string, src: string | null, lead: string | null = null) => ({
      at,
      visitor_id: v,
      session_id: null,
      utm_source: src,
      referrer: null,
      path: "/",
      lead_id: lead,
    });
    const s = siteStats([
      row("2026-11-12T05:00:00Z", "a", "instagram"),
      row("2026-11-12T05:10:00Z", "a", null, "L1"),
      row("2026-11-12T06:00:00Z", "b", null),
      row("2026-11-13T06:00:00Z", "c", "instagram"),
    ]);
    expect(s).toMatchObject({ visits: 4, visitors: 3, leads: 1, conversionPct: 33.3 });
    expect(s.sources[0]).toEqual({ name: "instagram", visitors: 2, leads: 1 });
    expect(s.days.map((d) => d.visitors)).toEqual([2, 1]);
    expect(visitSource({ utm_source: null, referrer: "google.com" })).toBe("google.com");
    expect(snippet("https://salesiq.uz", "KEY")).toContain('data-key="KEY"');
  });
});
