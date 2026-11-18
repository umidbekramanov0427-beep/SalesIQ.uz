// Pure rules of the AI tahlilchi's own work (no button pressed):
//   * when the automatic analysis is due (Sozlash -> AI -> "Har kuni" after
//     09:00 Tashkent, once a day; "Vebinardan keyin" once per ended webinar),
//   * the Telegram message the marketing bot sends with its findings,
//   * reading the AI's guess of what a stream frame shows (prices, timer,
//     presentation, Q&A) -- kept only when it is sure enough.
import type { Finding } from "@/lib/marketing-ai/diagnose";
import type { EventKind } from "@/lib/webinar-timeline";

const TZ_MS = 5 * 3_600_000;

/** "2026-11-18" in Tashkent. */
export function tashkentDate(now: Date): string {
  return new Date(now.getTime() + TZ_MS).toISOString().slice(0, 10);
}

/** The daily run's once-a-day key, or null before 09:00 Tashkent. */
export function dailyRunKey(now: Date): string | null {
  const hour = new Date(now.getTime() + TZ_MS).getUTCHours();
  return hour >= 9 ? `ai:daily:${tashkentDate(now)}` : null;
}

/** The last `days` full Tashkent days before `now` plus today so far. */
export function lastDays(now: Date, days = 7): { from: string; to: string } {
  const local = new Date(now.getTime() + TZ_MS);
  const today = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate()) - TZ_MS;
  return {
    from: new Date(today - (days - 1) * 86_400_000).toISOString(),
    to: new Date(today + 86_400_000).toISOString(),
  };
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const ICON: Record<Finding["priority"], string> = {
  critical: "🔴",
  warning: "🟠",
  opportunity: "🟢",
};
const ORDER: Finding["priority"][] = ["critical", "warning", "opportunity"];

/**
 * The bot's message: the period, then up to `max` findings (most urgent
 * first) with their first piece of evidence and recommendation. null when
 * there is nothing worth sending.
 */
export function findingsText(
  findings: Finding[],
  period: { from: string; to: string },
  opts: { title?: string; max?: number } = {},
): string | null {
  if (!findings.length) return null;
  const sorted = [...findings].sort(
    (a, b) => ORDER.indexOf(a.priority) - ORDER.indexOf(b.priority),
  );
  const shown = sorted.slice(0, opts.max ?? 3);
  const day = (iso: string) => tashkentDate(new Date(iso)).split("-").reverse().join(".");
  const to = day(new Date(Date.parse(period.to) - 1000).toISOString());
  const lines = [`🧠 <b>${esc(opts.title ?? "AI tahlil")}</b> · ${day(period.from)} – ${to}`, ""];
  for (const f of shown) {
    lines.push(`${ICON[f.priority]} <b>${esc(f.problem)}</b>`);
    if (f.evidence[0]) lines.push(`📊 ${esc(f.evidence[0])}`);
    if (f.recommendations[0]) lines.push(`👉 ${esc(f.recommendations[0])}`);
    lines.push("");
  }
  if (sorted.length > shown.length)
    lines.push(`… yana ${sorted.length - shown.length} ta — Marketing → AI tahlilchi`);
  else lines.push("Batafsil: Marketing → AI tahlilchi");
  return lines.join("\n").slice(0, 4000);
}

/* ---- What a stream frame shows ------------------------------------------ */

/** The moments a picture can show; the rest (SMS, live on) the server knows itself. */
export const VISION_KINDS = ["lesson", "presentation", "price", "timer", "qa"] as const;
export type VisionKind = (typeof VISION_KINDS)[number] & EventKind;

export const VISION_SYSTEM = `Siz vebinar efiridan olingan kadrni ko'rasiz. Kadrda quyidagilardan qaysi biri ANIQ ko'rinayotganini ayting:
- "price": narxlar / ta'riflar / to'lov shartlari slaydi
- "timer": ekranda teskari sanoq (taymer) — "number" maydoniga taymer raqamini (1, 2, 3...) faqat ekranda yozilgan bo'lsa yozing
- "presentation": kurs taqdimoti slaydi (kurs nima beradi, dastur, natijalar)
- "qa": savol-javob (savollar ro'yxati yoki "Savol-javob" yozuvi)
- "lesson": oddiy dars (spiker gapirmoqda yoki dars slaydi)
- "none": hech biri aniq emas yoki kadr qora / bo'sh
Faqat JSON qaytaring: {"kind": "...", "number": null, "confidence": 0.0-1.0, "note": "qisqa izoh"}. Shubha bo'lsa "none".`;

export type VisionGuess = {
  kind: VisionKind;
  seq: number | null;
  confidence: number;
  note: string;
};

/** The AI's answer, kept only for a known moment it is at least `min` sure of. */
export function parseVisionGuess(raw: unknown, min = 0.75): VisionGuess | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const kind = r["kind"];
  if (typeof kind !== "string" || !(VISION_KINDS as readonly string[]).includes(kind)) return null;
  const confidence = Number(r["confidence"]);
  if (!Number.isFinite(confidence) || confidence < min) return null;
  const n = Number(r["number"]);
  const seq = kind === "timer" && Number.isInteger(n) && n > 0 && n < 20 ? n : null;
  const note = typeof r["note"] === "string" ? r["note"].slice(0, 200) : "";
  return { kind: kind as VisionKind, seq, confidence: Math.min(1, confidence), note };
}

/**
 * Whether a guessed moment is new: no mark of the same kind (guessed or
 * pressed, same timer number) within `windowMin` minutes.
 */
export function guessIsNew(
  guess: { kind: string; seq: number | null; at: string },
  marks: { kind: string; seq: number | null; at: string }[],
  windowMin = 10,
): boolean {
  const t = Date.parse(guess.at);
  return !marks.some(
    (m) =>
      m.kind === guess.kind &&
      (guess.kind !== "timer" || guess.seq == null || m.seq == null || m.seq === guess.seq) &&
      Math.abs(Date.parse(m.at) - t) < windowMin * 60_000,
  );
}
