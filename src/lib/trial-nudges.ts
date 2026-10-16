// Nudges to a company on its free trial, to its owners' Telegram (and web
// push): after the first day if setup isn't finished, after two idle days,
// and when the trial is about to end. Each names the one next step that
// matters. Pure, so which nudge goes out and its wording are unit-tested;
// trial-nudges.server.ts sends them, once each (platform_ops_log keys).

import { nextFirstStep, type FirstStep, type FirstStepsState } from "./first-steps";

export type NudgeKind = "day1" | "idle" | "ends";

export type NudgeInput = {
  orgId: string;
  createdAt: string;
  daysLeft: number | null;
  idleDays: number | null;
  lastSeenAt: string | null;
  steps: FirstStepsState;
};

export type Nudge = { kind: NudgeKind; key: string; step: FirstStep | null };

const HOUR = 3_600_000;

/** The one nudge due now, or null. Ending beats idle beats day one. */
export function pickNudge(t: NudgeInput, now: number): Nudge | null {
  const step = nextFirstStep(t.steps);
  if (t.daysLeft !== null && t.daysLeft <= 1)
    return { kind: "ends", key: `nudge:${t.orgId}:ends`, step };
  if (t.idleDays !== null && t.idleDays >= 2 && t.lastSeenAt)
    return { kind: "idle", key: `nudge:${t.orgId}:idle:${t.lastSeenAt.slice(0, 10)}`, step };
  const age = now - new Date(t.createdAt).getTime();
  if (step && age >= 20 * HOUR && age < 48 * HOUR)
    return { kind: "day1", key: `nudge:${t.orgId}:day1`, step };
  return null;
}

const STEP_TEXT: Record<FirstStep, string> = {
  bot: "Telegram botni ulang — hisobotlar va bildirishnomalar shu yerga keladi",
  team: "menejerlaringizni qo'shing — har biri o'z lidlari bilan ishlaydi",
  lead: "birinchi lidni qo'shing yoki Excel'dan import qiling",
  integration: "amoCRM, telefoniya yoki Instagram'ni ulang — qo'ng'iroq va xabarlar o'zi tushadi",
  business: "biznes profilini to'ldiring — AI tahlil sizning mahsulotingizni biladi",
};

export function nudgeText(n: Nudge, company: string, link: string, daysLeft: number | null) {
  const next = n.step ? `\n\nKeyingi qadam: ${STEP_TEXT[n.step]}.` : "";
  if (n.kind === "ends")
    return (
      `⏳ ${company}: sinov davri ${daysLeft === 0 ? "bugun" : "ertaga"} tugaydi.\n` +
      `Ma'lumotlaringiz saqlanib qoladi — ishni davom ettirish uchun tarifni tanlang: ${link}/billing`
    );
  if (n.kind === "idle")
    return `👋 ${company}: 2 kundan beri SalesIQ'ga kirmadingiz.${next}\n\n${link}`;
  return `🚀 ${company}: SalesIQ'dagi birinchi kuningiz uchun rahmat!${next}\n\n${link}`;
}
