// How engaged a company on its free trial is, for the platform owner's
// visits report and daily Telegram digest: sign-ins, how many of its people
// came in, whether it put real work in (leads, an integration) and how
// recently it was seen. Pure, so the server and tests share it.

export type TrialTemp = "hot" | "warm" | "cold";

export type TrialActivity = {
  /** Sign-in sessions in the last 7 days. */
  sessions7d: number;
  /** People of the company who signed in in the last 7 days. */
  activeUsers7d: number;
  /** People in the company. */
  users: number;
  leads: number;
  integrations: number;
  /** Last sign-in or activity, ISO; null = never came in. */
  lastSeenAt: string | null;
};

export type TrialScore = {
  score: number;
  temp: TrialTemp;
  /** What's missing, as keys for i18n (visits.why.*) and the digest. */
  gaps: ("no_visits" | "one_user" | "no_leads" | "no_integration" | "idle")[];
};

export const HOT_SCORE = 60;
export const WARM_SCORE = 30;
const DAY = 86_400_000;

export function daysSince(iso: string | null, now = Date.now()): number | null {
  if (!iso) return null;
  return Math.max(0, Math.floor((now - new Date(iso).getTime()) / DAY));
}

export function scoreTrial(a: TrialActivity, now = Date.now()): TrialScore {
  const idleDays = daysSince(a.lastSeenAt, now);
  let score = Math.min(a.sessions7d, 10) * 3; // up to 30
  score += a.activeUsers7d >= 2 ? 20 : a.activeUsers7d === 1 ? 10 : 0;
  score += a.leads >= 10 ? 20 : a.leads > 0 ? 12 : 0;
  score += a.integrations > 0 ? 20 : 0;
  score += idleDays === null ? 0 : idleDays < 1 ? 10 : idleDays < 3 ? 5 : 0;
  score = Math.min(100, score);

  const gaps: TrialScore["gaps"] = [];
  if (a.sessions7d === 0) gaps.push("no_visits");
  else if (a.activeUsers7d < 2) gaps.push("one_user");
  if (a.leads === 0) gaps.push("no_leads");
  if (a.integrations === 0) gaps.push("no_integration");
  if (idleDays !== null && idleDays >= 2) gaps.push("idle");

  return { score, temp: score >= HOT_SCORE ? "hot" : score >= WARM_SCORE ? "warm" : "cold", gaps };
}

/* ------------------------------------------------------------------ */
/* Customer path: how far each company got.                            */
/* ------------------------------------------------------------------ */

export const FUNNEL_STEPS = [
  "signed_up",
  "bot_linked",
  "first_lead",
  "integration",
  "paid",
] as const;
export type FunnelStep = (typeof FUNNEL_STEPS)[number];

/** The first step not reached yet, in order (null = all done). */
export function stoppedAt(done: Record<FunnelStep, boolean>): FunnelStep | null {
  return FUNNEL_STEPS.find((s) => !done[s]) ?? null;
}

/* ------------------------------------------------------------------ */
/* Daily Telegram digest for the platform owner.                       */
/* ------------------------------------------------------------------ */

export type DigestCompany = {
  name: string;
  temp: TrialTemp;
  score: number;
  daysLeft: number | null;
  idleDays: number | null;
  sessions7d: number;
  activeUsers7d: number;
  leads: number;
  integrations: number;
};

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const TEMP_ICON: Record<TrialTemp, string> = { hot: "🔥", warm: "🌤", cold: "❄️" };
const TEMP_WORD: Record<TrialTemp, string> = { hot: "issiq", warm: "iliq", cold: "sovuq" };

/** Telegram HTML text, or null when there is nothing to say. */
export function buildTrialDigest(
  trials: DigestCompany[],
  extra: { newSignups: number; expiredUnpaid: string[]; url: string },
): string | null {
  if (!trials.length && !extra.newSignups && !extra.expiredUnpaid.length) return null;
  const n = (t: TrialTemp) => trials.filter((c) => c.temp === t).length;
  const lines = [
    "📊 <b>Sinovdagi kompaniyalar</b>",
    trials.length
      ? `Jami: ${trials.length} · 🔥 ${n("hot")} · 🌤 ${n("warm")} · ❄️ ${n("cold")}`
      : "Hozir sinovda kompaniya yo'q.",
  ];
  if (extra.newSignups) lines.push(`🆕 Kecha ro'yxatdan o'tdi: ${extra.newSignups}`);

  const ending = trials.filter((c) => c.daysLeft !== null && c.daysLeft <= 1);
  if (ending.length) {
    lines.push("", "⏳ <b>Sinovi tugayapti</b>");
    for (const c of ending) {
      const when = c.daysLeft === 0 ? "bugun" : "ertaga";
      lines.push(`• ${esc(c.name)} — ${when} (${TEMP_WORD[c.temp]})`);
    }
  }

  const hot = trials.filter((c) => c.temp === "hot").sort((a, b) => b.score - a.score);
  if (hot.length) {
    lines.push("", "📞 <b>Juda faol — qo'ng'iroq qiling</b>");
    for (const c of hot) {
      lines.push(
        `• ${esc(c.name)}: ${c.sessions7d} kirish, ${c.activeUsers7d} xodim, ${c.leads} lid` +
          (c.integrations ? ", integratsiya ulangan" : ""),
      );
    }
  }

  const idle = trials.filter((c) => c.idleDays === null || c.idleDays >= 2);
  if (idle.length) {
    lines.push("", "💤 <b>2 kundan beri kirmagan</b>");
    for (const c of idle) {
      lines.push(
        `• ${esc(c.name)} — ${c.idleDays === null ? "umuman kirmagan" : `${c.idleDays} kun`}`,
      );
    }
  }

  if (extra.expiredUnpaid.length) {
    lines.push("", "⌛ <b>Sinovi tugadi, to'lov yo'q</b>");
    for (const name of extra.expiredUnpaid) lines.push(`• ${esc(name)}`);
  }

  const rest = trials.filter((c) => !ending.includes(c) && !hot.includes(c) && !idle.includes(c));
  if (rest.length) {
    lines.push("", "Boshqalar:");
    for (const c of rest) lines.push(`• ${TEMP_ICON[c.temp]} ${esc(c.name)} — ${c.score} ball`);
  }

  lines.push("", `Batafsil: ${extra.url}`);
  return lines.join("\n");
}
