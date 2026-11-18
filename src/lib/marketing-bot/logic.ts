// Marketing boti: the rules and texts, kept pure so they are tested.
//   * settings (which alerts, the drop threshold, auto-approving join
//     requests to the channel);
//   * the staff link (/start staff_<code>) and the console's buttons
//     (callback data ev:<webinar id>:<kind>);
//   * when an alert is due: the audience fell by N% within 5 minutes, a new
//     peak (at least 10% above the last one announced);
//   * the /holat and after-webinar report texts.
import {
  CONSOLE_KINDS,
  NUMBERED_KINDS,
  nextSeq,
  peaks,
  smsEffect,
  stageLosses,
  type EventKind,
  type TimelinePoint,
  type WebinarEvent,
} from "@/lib/webinar-timeline";

export type MarketingBotSettings = {
  alerts: {
    /** A webinar went live. */
    start: boolean;
    /** The Telegram live stopped while the webinar goes on. */
    tgStop: boolean;
    /** The audience fell by this many % within 5 minutes (0 = off). */
    dropPct: number;
    /** A new peak. */
    peak: boolean;
    /** The report when the webinar ends. */
    report: boolean;
  };
  /** Approve join requests to the channel by themselves (kept as events either way). */
  autoApprove: boolean;
};

export const DEFAULT_BOT_SETTINGS: MarketingBotSettings = {
  alerts: { start: true, tgStop: true, dropPct: 15, peak: true, report: true },
  autoApprove: false,
};

export function parseBotSettings(raw: unknown): MarketingBotSettings {
  const o = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const a = (o["alerts"] && typeof o["alerts"] === "object" ? o["alerts"] : {}) as Record<
    string,
    unknown
  >;
  const bool = (v: unknown, d: boolean) => (typeof v === "boolean" ? v : d);
  const d = DEFAULT_BOT_SETTINGS.alerts;
  const pct = Number(a["dropPct"]);
  return {
    alerts: {
      start: bool(a["start"], d.start),
      tgStop: bool(a["tgStop"], d.tgStop),
      dropPct: Number.isFinite(pct) ? Math.max(0, Math.min(90, Math.round(pct))) : d.dropPct,
      peak: bool(a["peak"], d.peak),
      report: bool(a["report"], d.report),
    },
    autoApprove: bool(o["autoApprove"], DEFAULT_BOT_SETTINGS.autoApprove),
  };
}

/** "/start staff_AB12CD34" -> "AB12CD34". */
export function staffCodeFromStart(text: string): string | null {
  const m = /^\/start(?:@\w+)?\s+staff_([A-Za-z0-9]{6,40})\s*$/.exec(text.trim());
  return m ? m[1]! : null;
}

/** Callback data of a console button: ev:<webinar id>:<kind>. */
export function consoleData(webinarId: string, kind: EventKind): string {
  return `ev:${webinarId}:${kind}`;
}

export function parseConsoleData(data: string): { webinarId: string; kind: EventKind } | null {
  const m = /^ev:([0-9a-f-]{36}):([a-z_]+)$/.exec(data);
  if (!m) return null;
  const kind = m[2] as EventKind;
  return CONSOLE_KINDS.includes(kind) && kind !== "custom" ? { webinarId: m[1]!, kind } : null;
}

const LABEL: Record<EventKind, string> = {
  lesson: "Dars boshlandi",
  tg_live_on: "TG efir yoqildi",
  yt_live_on: "YouTube efir",
  sms_sent: "SMS yuborildi",
  presentation: "Taqdimot",
  price: "Ta'riflar",
  timer: "Timer",
  qa: "Savol-javob",
  intro: "Tanishtiruv",
  offer: "Taklif",
  custom: "Boshqa",
};

export function eventLabel(kind: EventKind, seq: number | null): string {
  return seq != null ? `${LABEL[kind]} ${seq}` : LABEL[kind];
}

type Button = { text: string; callback_data: string };

/** The live console as inline buttons, two per row; numbered ones show the next number. */
export function consoleKeyboard(webinarId: string, events: WebinarEvent[]): Button[][] {
  const kinds = CONSOLE_KINDS.filter((k) => k !== "custom");
  const buttons = kinds.map((k) => ({
    text: eventLabel(k, NUMBERED_KINDS.has(k) ? nextSeq(events, k) : null),
    callback_data: consoleData(webinarId, k),
  }));
  const rows: Button[][] = [];
  for (let i = 0; i < buttons.length; i += 2) rows.push(buttons.slice(i, i + 2));
  rows.push([{ text: "🔄 Holat", callback_data: `st:${webinarId}` }]);
  return rows;
}

const fmt = (n: number) => n.toLocaleString("ru-RU").replace(/\u00a0/g, " ");
const hm = (iso: string) =>
  new Date(new Date(iso).getTime() + 5 * 3_600_000).toISOString().slice(11, 16);

/**
 * The audience fell by `pct`% or more within the last `windowMin` minutes:
 * the highest count in the window against the latest one.
 */
export function dropAlert(
  points: TimelinePoint[],
  pct: number,
  windowMin = 5,
): { from: number; to: number; pct: number; at: string } | null {
  if (pct <= 0 || points.length < 2) return null;
  const last = points[points.length - 1]!;
  const since = new Date(last.at).getTime() - windowMin * 60_000;
  const window = points.filter((p) => new Date(p.at).getTime() >= since);
  const top = Math.max(...window.map((p) => p.total));
  if (top < 20) return null; // too few to mean anything
  const fell = (top - last.total) / top;
  return fell * 100 >= pct
    ? { from: top, to: last.total, pct: Math.round(fell * 100), at: last.at }
    : null;
}

/** A new peak worth announcing: 10% above the last one sent (or the first above 50). */
export function peakAlert(points: TimelinePoint[], lastAnnounced: number | null): number | null {
  const p = peaks(points).total;
  if (!p) return null;
  if (lastAnnounced == null) return p.viewers >= 50 ? p.viewers : null;
  return p.viewers >= Math.ceil(lastAnnounced * 1.1) ? p.viewers : null;
}

/** /holat: viewers now per source, the peak and the biggest loss so far. */
export function statusText(title: string, points: TimelinePoint[], events: WebinarEvent[]): string {
  const last = points[points.length - 1];
  const pk = peaks(points);
  const { worst } = stageLosses(points, events);
  const lines = [`📊 <b>${escapeHtml(title)}</b>`];
  if (!last) {
    lines.push("Hali tomoshabinlar soni kelmagan.");
    return lines.join("\n");
  }
  lines.push(
    `Hozir: <b>${fmt(last.total)}</b>` +
      [
        last.youtube != null ? ` · YouTube ${fmt(last.youtube)}` : "",
        last.telegram != null ? ` · Telegram ${fmt(last.telegram)}` : "",
      ].join(""),
  );
  if (pk.total) lines.push(`Eng ko'p: <b>${fmt(pk.total.viewers)}</b> (${hm(pk.total.at)})`);
  if (worst?.change != null && worst.change < 0)
    lines.push(
      `Eng katta yo'qotish: ${eventLabel(worst.from.kind, worst.from.seq)} → ${
        worst.to ? eventLabel(worst.to.kind, worst.to.seq) : "hozir"
      }: <b>${fmt(worst.change)}</b>`,
    );
  return lines.join("\n");
}

/** After the webinar: peak, average, the stage that lost the most, each SMS's effect. */
export function reportText(
  title: string,
  points: TimelinePoint[],
  events: WebinarEvent[],
  registrations: number | null,
): string {
  const pk = peaks(points);
  const avg = points.length
    ? Math.round(points.reduce((a, p) => a + p.total, 0) / points.length)
    : null;
  const { worst } = stageLosses(points, events);
  const lines = [`🏁 <b>${escapeHtml(title)}</b> tugadi`];
  if (pk.total) lines.push(`Eng ko'p: <b>${fmt(pk.total.viewers)}</b> (${hm(pk.total.at)})`);
  if (pk.youtube && pk.telegram)
    lines.push(`YouTube ${fmt(pk.youtube.viewers)} · Telegram ${fmt(pk.telegram.viewers)}`);
  if (avg != null) lines.push(`O'rtacha: ${fmt(avg)}`);
  if (registrations && pk.total)
    lines.push(
      `Ro'yxatdan o'tganlardan keldi: ${Math.round((pk.total.viewers / registrations) * 100)}%`,
    );
  if (worst?.change != null && worst.change < 0)
    lines.push(
      `Eng katta yo'qotish: ${eventLabel(worst.from.kind, worst.from.seq)} → ${
        worst.to ? eventLabel(worst.to.kind, worst.to.seq) : "efir oxiri"
      }: <b>${fmt(worst.change)}</b>${worst.pct != null ? ` (${Math.round(worst.pct * 100)}%)` : ""}`,
    );
  for (const s of smsEffect(points, events))
    if (s.delta != null)
      lines.push(
        `${eventLabel("sms_sent", s.event.seq)}: 10 daqiqada ${s.delta >= 0 ? "+" : ""}${fmt(s.delta)}`,
      );
  return lines.join("\n");
}

export function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** An invite link's name: letters, digits, _ and -, at most 32 (Telegram's limit). */
export function cleanInviteName(raw: string): string | null {
  const s = raw
    .trim()
    .replace(/\s+/g, "_")
    .replace(/[^\p{L}\p{N}_-]/gu, "")
    .slice(0, 32);
  return s.length ? s : null;
}
