// Telefon (5TEL in the platform's look): the company's calls for a period,
// summed up per operator -- pure, so the page's numbers are tested.
// phone-center.server.ts reads the rows.

export type PcOutcome = "answered" | "missed" | "noAnswer" | "ringing" | "failed";

export type PcCall = {
  id: string;
  at: string;
  direction: "incoming" | "outgoing";
  outcome: PcOutcome;
  seconds: number;
  by: string | null;
  phone: string;
  name: string;
  leadId: string | null;
  recording: string | null;
  error: string | null;
};

export type PcScore = {
  id: string;
  at: string;
  by: string | null;
  score: number;
  phone: string | null;
  leadId: string | null;
  seconds: number;
  summary: string | null;
};

export type PcTotals = {
  total: number;
  incoming: number;
  outgoing: number;
  missed: number;
  answered: number;
  talkSeconds: number;
  avgSeconds: number;
  answerRate: number;
};

export type PcOperator = PcTotals & {
  id: string;
  name: string;
  role: string | null;
  extension: string | null;
  longest: number;
  lastAt: string | null;
  aiScore: number | null;
  analyzed: number;
  /** Outgoing: picked up / not; incoming: answered / missed. */
  outAnswered: number;
  outNoAnswer: number;
  inAnswered: number;
  inMissed: number;
};

/** Where an operator is right now (Operatorlar). */
export type OperatorStatus = "free" | "onCall" | "unconfigured" | "offline";

export type PcHour = { hour: number; incoming: number; outgoing: number };
export type PcDay = { date: string; answered: number; missed: number; total: number };

/** Journal by number: one row per client number. */
export type PcNumber = {
  phone: string;
  name: string;
  leadId: string | null;
  by: string | null;
  total: number;
  incoming: number;
  outgoing: number;
  answered: number;
  lastAt: string;
  last: PcCall;
};

export type PcJournalTotals = {
  numbers: number;
  incomingNumbers: number;
  outgoingNumbers: number;
  unansweredNumbers: number;
  ops: number;
  incomingOps: number;
  outgoingOps: number;
  answeredOps: number;
};

export type PhoneCenterData = {
  provider: {
    id: string;
    connected: boolean;
    connectedAt: string | null;
    lastEventAt: string | null;
  } | null;
  myExtension: string | null;
  totals: PcTotals;
  operators: PcOperator[];
  calls: PcCall[];
  scores: PcScore[];
  /** Over every call of the period (calls above may be cut short). */
  hourly: PcHour[];
  /** [weekday 0 = Monday][hour] call counts (Tashkent time). */
  heat: number[][];
  daily: PcDay[];
  journal: PcJournalTotals;
  split: ReturnType<typeof splitOf>;
  /** Operators on a call now, and when each last had the app open. */
  live: { onCall: string[]; seenAt: Record<string, string> };
};

/** A PBX row's result, the way the call history shows it. */
export function callOutcome(
  status: string | null,
  direction: string | null,
  seconds: number,
): PcOutcome {
  if (status === "answered" || (status === "completed" && seconds > 0)) return "answered";
  if (status === "initiated" || status === "ringing") return "ringing";
  if (status === "failed") return "failed";
  return direction === "incoming" ? "missed" : "noAnswer";
}

export function totalsOf(calls: PcCall[]): PcTotals {
  const answered = calls.filter((c) => c.outcome === "answered");
  const talk = answered.reduce((a, c) => a + c.seconds, 0);
  return {
    total: calls.length,
    incoming: calls.filter((c) => c.direction === "incoming").length,
    outgoing: calls.filter((c) => c.direction === "outgoing").length,
    missed: calls.filter((c) => c.outcome === "missed").length,
    answered: answered.length,
    talkSeconds: talk,
    avgSeconds: answered.length ? Math.round(talk / answered.length) : 0,
    answerRate: answerRate(answered.length, calls.length),
  };
}

/** Every operator's calls, AI score and extension, busiest first. */
export function operatorsOf(
  calls: PcCall[],
  scores: PcScore[],
  people: { id: string; name: string; role: string | null }[],
  extensions: { code: string; profileId: string }[],
): PcOperator[] {
  return people
    .map((p) => {
      const mine = calls.filter((c) => c.by === p.id);
      const sc = scores.filter((s) => s.by === p.id);
      const last = mine.reduce<string | null>((a, c) => (!a || c.at > a ? c.at : a), null);
      return {
        id: p.id,
        name: p.name,
        role: p.role,
        extension: extensions.find((e) => e.profileId === p.id)?.code ?? null,
        ...totalsOf(mine),
        longest: mine.reduce((a, c) => Math.max(a, c.outcome === "answered" ? c.seconds : 0), 0),
        lastAt: last,
        aiScore: sc.length ? Math.round(sc.reduce((a, s) => a + s.score, 0) / sc.length) : null,
        analyzed: sc.length,
        ...splitOf(mine),
      };
    })
    .sort((a, b) => b.total - a.total || a.name.localeCompare(b.name));
}

/** Outgoing picked up / not, incoming answered / missed. */
export function splitOf(calls: PcCall[]) {
  const out = calls.filter((c) => c.direction === "outgoing");
  const inc = calls.filter((c) => c.direction === "incoming");
  return {
    outAnswered: out.filter((c) => c.outcome === "answered").length,
    outNoAnswer: out.filter((c) => c.outcome !== "answered" && c.outcome !== "ringing").length,
    inAnswered: inc.filter((c) => c.outcome === "answered").length,
    inMissed: inc.filter((c) => c.outcome === "missed").length,
  };
}

// ---- time buckets (Tashkent, UTC+5) -------------------------------------------

const TZ_MS = 5 * 3600_000;
const local = (iso: string) => new Date(Date.parse(iso) + TZ_MS);
/** The Tashkent calendar day of a moment, "YYYY-MM-DD". */
export const localDay = (iso: string) => local(iso).toISOString().slice(0, 10);

/** Calls per hour of the day (00–23), incoming and outgoing apart. */
export function hourlyOf(calls: PcCall[]): PcHour[] {
  const out = Array.from({ length: 24 }, (_, hour) => ({ hour, incoming: 0, outgoing: 0 }));
  for (const c of calls) {
    const h = local(c.at).getUTCHours();
    out[h]![c.direction] += 1;
  }
  return out;
}

/** Load map: [weekday, Monday first][hour] → calls. */
export function heatmapOf(calls: PcCall[]): number[][] {
  const grid = Array.from({ length: 7 }, () => Array<number>(24).fill(0));
  for (const c of calls) {
    const d = local(c.at);
    const wd = (d.getUTCDay() + 6) % 7;
    grid[wd]![d.getUTCHours()]! += 1;
  }
  return grid;
}

/** Each day of the period (oldest first): answered, missed / not picked up, all. */
export function dailyOf(calls: PcCall[], days: string[]): PcDay[] {
  const map = new Map(days.map((d) => [d, { date: d, answered: 0, missed: 0, total: 0 }]));
  for (const c of calls) {
    const row = map.get(localDay(c.at));
    if (!row) continue;
    row.total += 1;
    if (c.outcome === "answered") row.answered += 1;
    else if (c.outcome !== "ringing") row.missed += 1;
  }
  return [...map.values()];
}

/** The days from `from` to `to` (inclusive, "YYYY-MM-DD"), at most the last `max`. */
export function daysBetween(from: string, to: string, max = 31): string[] {
  const out: string[] = [];
  const end = Date.parse(`${to}T00:00:00Z`);
  for (let t = Date.parse(`${from}T00:00:00Z`); t <= end; t += 86_400_000) {
    out.push(new Date(t).toISOString().slice(0, 10));
  }
  return out.slice(-max);
}

// ---- Jurnal: by number --------------------------------------------------------------

/** One row per client number, the latest call first. */
export function journalOf(calls: PcCall[]): PcNumber[] {
  const map = new Map<string, PcNumber>();
  for (const c of calls) {
    const key = c.phone.replace(/\D/g, "").slice(-9) || c.phone || c.id;
    let row = map.get(key);
    if (!row) {
      row = {
        phone: c.phone,
        name: c.name,
        leadId: c.leadId,
        by: c.by,
        total: 0,
        incoming: 0,
        outgoing: 0,
        answered: 0,
        lastAt: c.at,
        last: c,
      };
      map.set(key, row);
    }
    row.total += 1;
    row[c.direction] += 1;
    if (c.outcome === "answered") row.answered += 1;
    if (!row.name && c.name) row.name = c.name;
    if (!row.leadId && c.leadId) row.leadId = c.leadId;
    if (c.at > row.lastAt) {
      row.lastAt = c.at;
      row.last = c;
      if (c.by) row.by = c.by;
    }
  }
  return [...map.values()].sort((a, b) => (a.lastAt < b.lastAt ? 1 : -1));
}

/** Jurnal's eight figures. */
export function journalTotalsOf(rows: PcNumber[]): PcJournalTotals {
  return {
    numbers: rows.length,
    incomingNumbers: rows.filter((r) => r.incoming > 0).length,
    outgoingNumbers: rows.filter((r) => r.outgoing > 0).length,
    unansweredNumbers: rows.filter((r) => r.answered === 0).length,
    ops: rows.reduce((a, r) => a + r.total, 0),
    incomingOps: rows.reduce((a, r) => a + r.incoming, 0),
    outgoingOps: rows.reduce((a, r) => a + r.outgoing, 0),
    answeredOps: rows.reduce((a, r) => a + r.answered, 0),
  };
}

export type JournalDir = "all" | "incoming" | "outgoing" | "unanswered";

/** Jurnal's search and direction filter. */
export function filterJournal(rows: PcNumber[], dir: JournalDir, query: string): PcNumber[] {
  const needle = query.trim().toLowerCase();
  const digits = needle.replace(/\D/g, "");
  return rows.filter((r) => {
    if (dir === "incoming" && r.incoming === 0) return false;
    if (dir === "outgoing" && r.outgoing === 0) return false;
    if (dir === "unanswered" && r.answered > 0) return false;
    if (!needle) return true;
    return (
      r.name.toLowerCase().includes(needle) ||
      (digits.length > 2 && r.phone.replace(/\D/g, "").includes(digits))
    );
  });
}

// ---- Qo'ng'iroqlar: the filter panel ----------------------------------------------

export type CallFilter = {
  managers: string[];
  minSeconds: number | null;
  maxSeconds: number | null;
  status: "all" | "answered" | "missed" | "noAnswer";
};
export const EMPTY_CALL_FILTER: CallFilter = {
  managers: [],
  minSeconds: null,
  maxSeconds: null,
  status: "all",
};

export function filterCalls(calls: PcCall[], f: CallFilter): PcCall[] {
  return calls.filter((c) => {
    if (f.managers.length && (!c.by || !f.managers.includes(c.by))) return false;
    if (f.minSeconds != null && c.seconds < f.minSeconds) return false;
    if (f.maxSeconds != null && c.seconds > f.maxSeconds) return false;
    if (f.status === "answered" && c.outcome !== "answered") return false;
    if (f.status === "missed" && c.outcome !== "missed") return false;
    if (f.status === "noAnswer" && c.outcome !== "noAnswer" && c.outcome !== "failed") return false;
    return true;
  });
}

/** Per manager: calls and talk time (incoming and outgoing apart), busiest first. */
export function byManager(
  calls: PcCall[],
  names: Map<string, string>,
): {
  id: string;
  name: string;
  inCount: number;
  outCount: number;
  inSeconds: number;
  outSeconds: number;
}[] {
  const map = new Map<
    string,
    {
      id: string;
      name: string;
      inCount: number;
      outCount: number;
      inSeconds: number;
      outSeconds: number;
    }
  >();
  for (const c of calls) {
    const id = c.by ?? "—";
    const row = map.get(id) ?? {
      id,
      name: c.by ? (names.get(c.by) ?? "—") : "—",
      inCount: 0,
      outCount: 0,
      inSeconds: 0,
      outSeconds: 0,
    };
    // Talk time counts answered calls only.
    const talk = c.outcome === "answered" ? c.seconds : 0;
    if (c.direction === "incoming") {
      row.inCount += 1;
      row.inSeconds += talk;
    } else {
      row.outCount += 1;
      row.outSeconds += talk;
    }
    map.set(id, row);
  }
  return [...map.values()].sort(
    (a, b) => b.inCount + b.outCount - (a.inCount + a.outCount) || a.name.localeCompare(b.name),
  );
}

// ---- Operatorlar: live status ----------------------------------------------------

/** "Online" means the app was open within this long (its heartbeat is once a minute). */
export const ONLINE_MS = 3 * 60_000;

export function operatorStatus(o: {
  extension: string | null;
  onCall: boolean;
  seenAt: string | null;
  now: number;
}): OperatorStatus {
  if (!o.extension) return "unconfigured";
  if (o.onCall) return "onCall";
  if (o.seenAt && o.now - Date.parse(o.seenAt) <= ONLINE_MS) return "free";
  return "offline";
}

/** Javob %: answered out of all, rounded. */
export function answerRate(answered: number, total: number): number {
  return total ? Math.round((answered / total) * 100) : 0;
}

/** "1:05", "12:40", "1:02:03". */
export function clock(seconds: number): string {
  const s = Math.max(0, Math.round(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = String(s % 60).padStart(2, "0");
  return h ? `${h}:${String(m).padStart(2, "0")}:${r}` : `${m}:${r}`;
}

// ---- Avto-qo'ng'iroq ---------------------------------------------------------

export type DialItem = { leadId: string; name: string; phone: string };
export type DialResult = "answered" | "noAnswer" | "failed" | "skipped";

/** The next lead to call: the first one without a result yet. */
export function nextToDial(queue: DialItem[], results: Record<string, DialResult>): number {
  return queue.findIndex((q) => !results[q.leadId]);
}
