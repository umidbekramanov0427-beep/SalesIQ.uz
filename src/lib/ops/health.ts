// The platform owner's monitoring bot: judges how every connected company
// and the platform itself are doing, and writes the Telegram texts. Pure --
// the facts are gathered in health.server.ts -- so the rules are tested.

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

export type Phase = "trial" | "paid" | "expired";

export type CompanyFacts = {
  id: string;
  name: string;
  plan: string | null;
  phase: Phase;
  frozen: boolean;
  /** When a paid subscription / trial ends (null: open-ended). */
  endsAt: string | null;
  users: number;
  sessions24h: number;
  activeUsers24h: number;
  lastSeenAt: string | null;
  leads24h: number;
  callsAnalyzed24h: number;
  aiPending: number;
  aiFailed24h: number;
  errors24h: number;
  amocrm: {
    lastSyncedAt: string | null;
    error: string | null;
    tokenExpiresAt: string | null;
    syncInProgress: boolean;
    syncStartedAt: string | null;
  } | null;
  bitrix24: { lastSyncedAt: string | null; error: string | null } | null;
  telephony: { provider: string; lastEventAt: string | null; connectedAt: string | null }[];
  paused: string[];
};

export type PlatformFacts = {
  serverErrors1h: number;
  serverErrors24h: number;
  slowRequests24h: number;
  clientErrors24h: number;
  topErrors: { route: string | null; message: string; count: number; source: string }[];
  aiPending: number;
  /** When the oldest call still waiting for analysis came in. */
  aiOldestPendingAt: string | null;
  aiFailed24h: number;
  supportWaiting: number;
  newSignups24h: number;
  /** Most recent amoCRM sync of any company (null: none connected). */
  lastAmoSyncAt: string | null;
  amoConnections: number;
};

export type Level = "critical" | "warning" | "info";
export type Issue = { level: Level; code: string; text: string };

const ago = (iso: string | null, now: number) => (iso ? now - Date.parse(iso) : Infinity);

/** "3 soat", "2 kun", "15 daq". */
export function sinceLabel(ms: number): string {
  if (!Number.isFinite(ms)) return "hech qachon";
  if (ms < HOUR) return `${Math.max(1, Math.round(ms / 60_000))} daq`;
  if (ms < 2 * DAY) return `${Math.round(ms / HOUR)} soat`;
  return `${Math.round(ms / DAY)} kun`;
}

const short = (s: string, n = 90) => {
  const line = s.split("\n")[0]!.trim();
  return line.length > n ? `${line.slice(0, n - 1)}…` : line;
};

/** What is wrong (or worth knowing) about one company right now. */
export function companyIssues(c: CompanyFacts, now = Date.now()): Issue[] {
  if (c.frozen) return [];
  const issues: Issue[] = [];
  const paused = new Set(c.paused);

  if (c.amocrm && !paused.has("amocrm")) {
    const a = c.amocrm;
    if (a.tokenExpiresAt && Date.parse(a.tokenExpiresAt) < now) {
      issues.push({
        level: "critical",
        code: "amocrm_token",
        text: "amoCRM ruxsati (token) tugagan — qayta ulash kerak",
      });
    } else if (a.error) {
      issues.push({
        level: "critical",
        code: "amocrm_error",
        text: `amoCRM sinxron xatosi: ${short(a.error)}`,
      });
    }
    if (a.syncInProgress && ago(a.syncStartedAt, now) > HOUR) {
      issues.push({
        level: "warning",
        code: "amocrm_stuck",
        text: `amoCRM sinxroni ${sinceLabel(ago(a.syncStartedAt, now))}dan beri tugamayapti`,
      });
    } else if (ago(a.lastSyncedAt, now) > 3 * HOUR) {
      issues.push({
        level: "warning",
        code: "amocrm_stale",
        text: `amoCRM ${sinceLabel(ago(a.lastSyncedAt, now))}dan beri sinxronlanmagan`,
      });
    }
  }

  if (c.bitrix24 && !paused.has("bitrix24")) {
    const b = c.bitrix24;
    if (b.error) {
      issues.push({
        level: "critical",
        code: "bitrix24_error",
        text: `Bitrix24 sinxron xatosi: ${short(b.error)}`,
      });
    } else if (ago(b.lastSyncedAt, now) > 3 * HOUR) {
      issues.push({
        level: "warning",
        code: "bitrix24_stale",
        text: `Bitrix24 ${sinceLabel(ago(b.lastSyncedAt, now))}dan beri sinxronlanmagan`,
      });
    }
  }

  if (!paused.has("telephony")) {
    for (const t of c.telephony) {
      // A fresh connection gets a day before silence counts.
      if (ago(t.connectedAt, now) < DAY) continue;
      if (!t.lastEventAt) {
        issues.push({
          level: "warning",
          code: `telephony_none:${t.provider}`,
          text: `Telefoniya (${t.provider}) ulangan, lekin bitta ham qo'ng'iroq kelmagan`,
        });
      } else if (ago(t.lastEventAt, now) > 3 * DAY) {
        issues.push({
          level: "warning",
          code: `telephony_silent:${t.provider}`,
          text: `Telefoniyadan (${t.provider}) ${sinceLabel(ago(t.lastEventAt, now))}dan beri qo'ng'iroq kelmayapti`,
        });
      }
    }
  }

  if (c.aiFailed24h >= 5) {
    issues.push({
      level: "warning",
      code: "ai_failed",
      text: `24 soatda ${c.aiFailed24h} ta qo'ng'iroq tahlili xato bilan tugadi`,
    });
  }
  if (c.aiPending >= 30) {
    issues.push({
      level: "warning",
      code: "ai_backlog",
      text: `${c.aiPending} ta qo'ng'iroq AI tahlil navbatida turibdi`,
    });
  }
  if (c.errors24h >= 20) {
    issues.push({
      level: "warning",
      code: "errors",
      text: `24 soatda ${c.errors24h} ta xatolik (Platforma → Xatoliklar)`,
    });
  }

  if (c.phase === "paid" && c.users > 0 && ago(c.lastSeenAt, now) > 3 * DAY) {
    issues.push({
      level: "warning",
      code: "idle",
      text: `${sinceLabel(ago(c.lastSeenAt, now))}dan beri hech kim kirmagan — ketib qolish xavfi`,
    });
  }
  if (c.phase === "expired") {
    issues.push({ level: "info", code: "expired", text: "Obuna/sinov muddati tugagan" });
  } else if (c.phase === "paid" && c.endsAt) {
    const left = Date.parse(c.endsAt) - now;
    if (left > 0 && left <= 3 * DAY) {
      issues.push({
        level: "info",
        code: "ending",
        text: `Obuna ${Math.max(1, Math.ceil(left / DAY))} kunda tugaydi`,
      });
    }
  }
  if (c.paused.length) {
    issues.push({
      level: "info",
      code: "paused",
      text: `To'xtatilgan integratsiya: ${c.paused.join(", ")}`,
    });
  }
  return issues;
}

/** Problems with the platform as a whole (cron, AI worker, error spikes). */
export function platformIssues(p: PlatformFacts, now = Date.now()): Issue[] {
  const issues: Issue[] = [];
  if (p.serverErrors1h >= 10) {
    issues.push({
      level: "critical",
      code: "server_errors_spike",
      text: `Oxirgi 1 soatda ${p.serverErrors1h} ta server xatosi`,
    });
  }
  if (p.amoConnections > 0 && ago(p.lastAmoSyncAt, now) > 45 * 60_000) {
    issues.push({
      level: "critical",
      code: "cron_stalled",
      text: `Hech bir kompaniyaning amoCRM'i ${sinceLabel(ago(p.lastAmoSyncAt, now))}dan beri sinxronlanmadi — cron ishlamayotgan bo'lishi mumkin`,
    });
  }
  if (p.aiPending > 0 && ago(p.aiOldestPendingAt, now) > 3 * HOUR) {
    issues.push({
      level: "warning",
      code: "ai_queue_stale",
      text: `AI tahlil navbatida ${p.aiPending} ta qo'ng'iroq, eng eskisi ${sinceLabel(ago(p.aiOldestPendingAt, now))}dan beri kutyapti — AI worker'ni tekshiring`,
    });
  }
  if (p.supportWaiting > 0) {
    issues.push({
      level: "info",
      code: "support_waiting",
      text: `${p.supportWaiting} ta yordam so'rovi javob kutyapti`,
    });
  }
  return issues;
}

export function worstLevel(issues: Issue[]): Level | "ok" {
  if (issues.some((i) => i.level === "critical")) return "critical";
  if (issues.some((i) => i.level === "warning")) return "warning";
  return "ok";
}

const ICON: Record<Level | "ok", string> = {
  critical: "🔴",
  warning: "🟡",
  info: "ℹ️",
  ok: "🟢",
};

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const PHASE_LABEL: Record<Phase, string> = { trial: "sinov", paid: "pullik", expired: "tugagan" };

function companyLine(c: CompanyFacts, issues: Issue[]): string {
  const status = worstLevel(issues);
  const facts = [
    `${c.activeUsers24h}/${c.users} faol`,
    `${c.leads24h} lid`,
    c.callsAnalyzed24h ? `${c.callsAnalyzed24h} tahlil` : null,
  ]
    .filter(Boolean)
    .join(" · ");
  return `${ICON[status]} <b>${esc(c.name)}</b> (${PHASE_LABEL[c.phase]}) — ${facts}`;
}

function issueLines(issues: Issue[]): string[] {
  return issues
    .filter((i) => i.level !== "info" || i.code !== "paused")
    .map((i) => `   ${i.level === "info" ? "•" : ICON[i.level]} ${esc(i.text)}`);
}

export type Report = { companies: CompanyFacts[]; platform: PlatformFacts; url: string };

/**
 * The full health report (morning message and /holat): platform numbers,
 * then companies needing attention with their problems, then a count of
 * the healthy ones.
 */
export function buildHealthReport({ companies, platform, url }: Report, now = Date.now()): string {
  const live = companies.filter((c) => !c.frozen);
  const judged = live.map((c) => ({ c, issues: companyIssues(c, now) }));
  const bad = judged
    .filter((j) => worstLevel(j.issues) !== "ok")
    .sort((a, b) => rank(worstLevel(a.issues)) - rank(worstLevel(b.issues)));
  const okCount = judged.length - bad.length;
  const pIssues = platformIssues(platform, now);

  const lines = [
    `🩺 <b>SalesIQ — platforma holati</b>`,
    ``,
    `🏢 Kompaniyalar: ${live.filter((c) => c.phase === "paid").length} pullik · ${live.filter((c) => c.phase === "trial").length} sinovda · ${live.filter((c) => c.phase === "expired").length} tugagan` +
      (companies.length > live.length ? ` · ${companies.length - live.length} muzlatilgan` : ""),
    `🆕 24 soatda ro'yxatdan o'tgan: ${platform.newSignups24h}`,
    `⚠️ 24 soatda xatolar: server ${platform.serverErrors24h} · sekin so'rov ${platform.slowRequests24h} · brauzer ${platform.clientErrors24h}`,
    `🎧 AI tahlil: navbatda ${platform.aiPending} · 24 soatda xato ${platform.aiFailed24h}`,
    `💬 Javob kutayotgan yordam so'rovlari: ${platform.supportWaiting}`,
  ];
  if (pIssues.some((i) => i.level !== "info")) {
    lines.push(``, `<b>Platforma muammolari</b>`);
    for (const i of pIssues.filter((x) => x.level !== "info"))
      lines.push(`${ICON[i.level]} ${esc(i.text)}`);
  }
  lines.push(``);
  if (bad.length) {
    lines.push(`<b>E'tibor kerak (${bad.length})</b>`);
    for (const { c, issues } of bad.slice(0, 15)) {
      lines.push(companyLine(c, issues), ...issueLines(issues));
    }
    if (bad.length > 15) lines.push(`… yana ${bad.length - 15} ta — /kompaniyalar`);
  } else {
    lines.push(`✅ Barcha kompaniyalarda muammo yo'q.`);
  }
  if (okCount && bad.length) lines.push(``, `🟢 Yaxshi ishlayapti: ${okCount} ta kompaniya`);
  lines.push(``, `Batafsil: ${url}`);
  return lines.join("\n");
}

const rank = (l: Level | "ok") => (l === "critical" ? 0 : l === "warning" ? 1 : 2);

/** Every live company on one line each, problems first (/kompaniyalar). */
export function buildCompaniesList(companies: CompanyFacts[], now = Date.now()): string {
  const judged = companies
    .filter((c) => !c.frozen)
    .map((c) => ({ c, issues: companyIssues(c, now) }))
    .sort(
      (a, b) =>
        rank(worstLevel(a.issues)) - rank(worstLevel(b.issues)) ||
        b.c.activeUsers24h - a.c.activeUsers24h,
    );
  if (!judged.length) return "Hozircha kompaniya yo'q.";
  const lines = [`🏢 <b>Kompaniyalar (${judged.length})</b>`, ``];
  for (const { c, issues } of judged.slice(0, 40)) {
    lines.push(companyLine(c, issues));
    lines.push(...issueLines(issues.filter((i) => i.level !== "info")));
  }
  if (judged.length > 40) lines.push(`… yana ${judged.length - 40} ta`);
  lines.push(``, `🟢 yaxshi · 🟡 e'tibor kerak · 🔴 muammo`);
  return lines.join("\n");
}

/** Integrations of every company that has any (/integratsiyalar). */
export function buildIntegrationsReport(companies: CompanyFacts[], now = Date.now()): string {
  const rows: string[] = [];
  for (const c of companies.filter((x) => !x.frozen)) {
    const parts: string[] = [];
    const paused = new Set(c.paused);
    if (c.amocrm) {
      const bad =
        c.amocrm.error || (c.amocrm.tokenExpiresAt && Date.parse(c.amocrm.tokenExpiresAt) < now);
      parts.push(
        `${paused.has("amocrm") ? "⏸" : bad ? "🔴" : ago(c.amocrm.lastSyncedAt, now) > 3 * HOUR ? "🟡" : "🟢"} amoCRM (${sinceLabel(ago(c.amocrm.lastSyncedAt, now))} oldin)`,
      );
    }
    if (c.bitrix24) {
      parts.push(
        `${paused.has("bitrix24") ? "⏸" : c.bitrix24.error ? "🔴" : ago(c.bitrix24.lastSyncedAt, now) > 3 * HOUR ? "🟡" : "🟢"} Bitrix24 (${sinceLabel(ago(c.bitrix24.lastSyncedAt, now))} oldin)`,
      );
    }
    for (const t of c.telephony) {
      parts.push(
        `${paused.has("telephony") ? "⏸" : !t.lastEventAt || ago(t.lastEventAt, now) > 3 * DAY ? "🟡" : "🟢"} ${esc(t.provider)} (oxirgi qo'ng'iroq: ${t.lastEventAt ? `${sinceLabel(ago(t.lastEventAt, now))} oldin` : "yo'q"})`,
      );
    }
    if (parts.length) rows.push(`<b>${esc(c.name)}</b>\n   ${parts.join("\n   ")}`);
  }
  return rows.length
    ? [`🔌 <b>Integratsiyalar</b>`, ``, ...rows].join("\n")
    : "Hech bir kompaniya integratsiya ulamagan.";
}

/** The most frequent errors of the last 24 hours (/xatolar). */
export function buildErrorsReport(p: PlatformFacts, url: string): string {
  if (!p.topErrors.length) return "✅ Oxirgi 24 soatda xatolik yo'q.";
  const SOURCE: Record<string, string> = {
    server_error: "server",
    slow_request: "sekin",
  };
  const lines = [
    `⚠️ <b>Oxirgi 24 soatdagi xatolar</b>`,
    `server ${p.serverErrors24h} · sekin so'rov ${p.slowRequests24h} · brauzer ${p.clientErrors24h}`,
    ``,
  ];
  for (const e of p.topErrors.slice(0, 10)) {
    lines.push(
      `<b>${e.count}×</b> [${SOURCE[e.source] ?? "brauzer"}] ${e.route ? `<code>${esc(e.route.slice(0, 60))}</code> ` : ""}${esc(short(e.message, 120))}`,
    );
  }
  lines.push(``, `Batafsil: ${url}`);
  return lines.join("\n");
}

export type Alert = { key: string; text: string };

/**
 * The problems worth an immediate message: every critical issue, keyed per
 * company and day so each is sent once a day while it lasts.
 */
export function alertsFor(
  companies: CompanyFacts[],
  platform: PlatformFacts,
  now = Date.now(),
): Alert[] {
  const day = new Date(now + 5 * HOUR).toISOString().slice(0, 10);
  const alerts: Alert[] = [];
  for (const i of platformIssues(platform, now)) {
    if (i.level !== "critical") continue;
    const hour = new Date(now).toISOString().slice(0, 13);
    alerts.push({
      // An error spike may repeat each hour; the rest once a day.
      key: `alert:${i.code}:${i.code === "server_errors_spike" ? hour : day}`,
      text: `🚨 <b>Platforma</b>\n${esc(i.text)}`,
    });
  }
  for (const c of companies) {
    for (const i of companyIssues(c, now)) {
      if (i.level !== "critical") continue;
      alerts.push({
        key: `alert:${i.code}:${c.id}:${day}`,
        text: `🔴 <b>${esc(c.name)}</b>\n${esc(i.text)}`,
      });
    }
  }
  return alerts;
}

export const OPS_HELP =
  `🤖 <b>SalesIQ nazoratchi bot</b>\n\n` +
  `Har kuni 09:00 da platforma holati haqida hisobot yuboraman, muammo chiqsa darhol yozaman.\n\n` +
  `/holat — platforma va kompaniyalar holati\n` +
  `/kompaniyalar — har bir kompaniya bir qatorda\n` +
  `/integratsiyalar — amoCRM, Bitrix24, telefoniya\n` +
  `/xatolar — 24 soatdagi eng ko'p xatolar\n` +
  `/yordam — javob kutayotgan yordam so'rovlari\n\n` +
  `Yordam so'roviga javob berish uchun o'sha xabarga reply qiling.`;

/** Bot commands the platform owner can send. */
export const OPS_COMMANDS = [
  ["holat", "Platforma va kompaniyalar holati"],
  ["kompaniyalar", "Har bir kompaniya holati"],
  ["integratsiyalar", "Integratsiyalar holati"],
  ["xatolar", "24 soatdagi xatolar"],
  ["yordam", "Javob kutayotgan yordam so'rovlari"],
] as const;

export type OpsCommand = (typeof OPS_COMMANDS)[number][0] | "help";

/**
 * "/holat", "/holat@bot", "holat" → "holat"; null when it isn't a command.
 * In the shared customer bot (`shared`) only slash commands count and
 * /start keeps its usual meaning.
 */
export function parseOpsCommand(text: string, shared = false): OpsCommand | null {
  const m = text.trim().match(/^(\/)?([a-z_]+)(@\w+)?$/i);
  if (!m || (shared && !m[1])) return null;
  const word = m[2]!.toLowerCase();
  if (word === "help" || word === "buyruqlar" || (!shared && word === "start")) return "help";
  return OPS_COMMANDS.some(([c]) => c === word) ? (word as OpsCommand) : null;
}
