// Server-only. So'm per US dollar, from the Central Bank of Uzbekistan's
// daily rate (cbu.uz), cached for 6 hours; the app's own display rate when
// the bank cannot be reached.
const FALLBACK = 12_900;
let cached: { at: number; rate: number; date: string | null; live: boolean } | null = null;

export async function usdRate(): Promise<{ rate: number; date: string | null; live: boolean }> {
  if (cached && Date.now() - cached.at < 6 * 3_600_000) return cached;
  try {
    const res = await fetch("https://cbu.uz/uz/arkhiv-kursov-valyut/json/USD/", {
      signal: AbortSignal.timeout(8_000),
    });
    const j = (await res.json()) as { Rate?: string; Date?: string }[];
    const rate = Number(j?.[0]?.Rate);
    if (!Number.isFinite(rate) || rate <= 0) throw new Error("no rate");
    cached = { at: Date.now(), rate, date: j[0]?.Date ?? null, live: true };
  } catch {
    cached = { at: Date.now() - 5 * 3_600_000, rate: FALLBACK, date: null, live: false };
  }
  return cached;
}
