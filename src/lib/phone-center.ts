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
    answerRate: calls.length ? Math.round((answered.length / calls.length) * 100) : 0,
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
      };
    })
    .sort((a, b) => b.total - a.total || a.name.localeCompare(b.name));
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
