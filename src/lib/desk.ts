// Ish stoli (Bosh sahifa → «Ish stoli»): the company's main figures for a
// period next to the period before -- sales, average check, new and
// returning clients, conversion, plan vs fact, sales by channel, lead
// sources, the sales curve, the funnel and every manager's results. Pure:
// desk.server.ts reads the rows, this turns them into the page's numbers.

export type DeskRange = { from: string; to: string };

export type DeskStage = {
  id: string;
  name: string;
  position: number;
  won: boolean;
  lost: boolean;
  funnel: string;
};

export type DeskSale = {
  id: string;
  owner_id: string | null;
  contact_id: string | null;
  source: string | null;
  funnel: string | null;
  revenue: number;
  /** When it was won (stage_changed_at). */
  at: string;
};

export type DeskLead = {
  id: string;
  owner_id: string | null;
  stage_id: string | null;
  funnel: string | null;
  source: string | null;
  created_at: string;
};

export type DeskCall = { by: string | null; seconds: number; at: string };

export type DeskInput = {
  range: DeskRange;
  prev: DeskRange;
  now: string;
  /** Minutes east of UTC (Tashkent: 300). */
  tz: number;
  stages: DeskStage[];
  funnels: string[];
  funnel: string | null;
  people: { id: string; name: string; role: string | null }[];
  /** Won leads from min(prev.from, yesterday 00:00) to range.to. */
  sales: DeskSale[];
  /** Every won lead of the sold contacts (any time), to tell new clients from returning. */
  contactWins: { id: string; contact_id: string; at: string }[];
  /** Leads created from prev.from to range.to. */
  leads: DeskLead[];
  /** Stage entries since range.from (for how far each lead got). */
  stageEvents: { lead_id: string; stage_id: string }[];
  calls: DeskCall[];
  /** The plans of the month the period ends in. */
  plans: { profile_id: string | null; target_amount: number }[];
  planMonth: string;
};

export type Pair = { cur: number; prev: number };

export type DeskManager = {
  id: string;
  name: string;
  leads: Pair;
  worked: number;
  sales: Pair;
  revenue: Pair;
  plan: number;
  conversion: number;
  avgCheck: number;
  talks: number;
  longest: number;
};

export type DeskData = {
  range: DeskRange;
  prev: DeskRange;
  funnels: string[];
  funnel: string | null;
  today: { revenue: number; count: number; yRevenue: number; yCount: number; until: string };
  revenue: Pair;
  count: Pair;
  avgCheck: Pair;
  newClients: Pair;
  repeat: Pair;
  conversion: Pair;
  leads: Pair;
  plan: { month: string; team: number; people: Record<string, number>; fact: number };
  channels: { name: string; revenue: number; count: number }[];
  sources: { name: string; leads: number }[];
  dynamics: {
    days: { label: string; cur: number; prev: number; curCount: number; prevCount: number }[];
    hours: { label: string; cur: number; prev: number; curCount: number; prevCount: number }[];
  };
  funnelBars: {
    total: number;
    funnels: { name: string; leads: number; sales: number }[];
    stages: { id: string; name: string; count: number; kind: "open" | "won" | "lost" }[];
  };
  managers: DeskManager[];
  others: { leads: number; sales: number; revenue: number };
};

const DAY = 86_400_000;
export const NO_SOURCE = "—";

/** Charts' fixed categorical order (never cycled past the last: the rest is "Boshqa"). */
export const SERIES_COLORS = [
  "#2563eb",
  "#10b981",
  "#f59e0b",
  "#8b5cf6",
  "#f43f5e",
  "#0ea5e9",
  "#64748b",
];

const t = (iso: string) => Date.parse(iso);
const inside = (iso: string, r: DeskRange) => {
  const x = t(iso);
  return x >= t(r.from) && x < t(r.to);
};
const pct = (a: number, b: number) => (b > 0 ? Math.round((a / b) * 1000) / 10 : 0);
const pad = (n: number) => String(n).padStart(2, "0");

/** Midnight (in the company's zone) of the day containing `ms`, as UTC ms. */
export function dayStart(ms: number, tz: number): number {
  const shifted = ms + tz * 60_000;
  return shifted - (((shifted % DAY) + DAY) % DAY) - tz * 60_000;
}

/** The hour of the day (0-23) in the company's zone. */
export function hourOf(ms: number, tz: number): number {
  return new Date(ms + tz * 60_000).getUTCHours();
}

export function computeDesk(i: DeskInput): DeskData {
  const now = t(i.now);
  const funnelOk = (f: string | null) =>
    i.funnel ? (f ?? "") === i.funnel : i.funnels.includes(f ?? "");
  const sales = i.sales.filter((s) => funnelOk(s.funnel));
  const leads = i.leads.filter((l) => funnelOk(l.funnel));
  const stageById = new Map(i.stages.map((s) => [s.id, s]));

  const cur = sales.filter((s) => inside(s.at, i.range));
  const prev = sales.filter((s) => inside(s.at, i.prev));
  const sum = (xs: DeskSale[]) => xs.reduce((a, s) => a + s.revenue, 0);

  // Today until now vs yesterday until the same time.
  const today0 = dayStart(now, i.tz);
  const tod = sales.filter((s) => t(s.at) >= today0 && t(s.at) <= now);
  const yest = sales.filter((s) => t(s.at) >= today0 - DAY && t(s.at) <= now - DAY);
  const nowLocal = new Date(now + i.tz * 60_000);

  // A client is new when this is their first won lead; the rest are repeat sales.
  const firstWin = new Map<string, number>();
  for (const w of [...i.contactWins, ...sales.filter((s) => s.contact_id)]) {
    const c = (w as { contact_id: string }).contact_id;
    const at = t(w.at);
    const was = firstWin.get(c);
    if (was === undefined || at < was) firstWin.set(c, at);
  }
  const split = (xs: DeskSale[]) => {
    const fresh = new Set<string>();
    let repeat = 0;
    for (const s of xs) {
      if (!s.contact_id) {
        fresh.add(`lead:${s.id}`);
        continue;
      }
      const first = firstWin.get(s.contact_id) ?? t(s.at);
      if (t(s.at) > first) repeat += 1;
      else fresh.add(s.contact_id);
    }
    return { fresh: fresh.size, repeat };
  };
  const sc = split(cur);
  const sp = split(prev);

  // Conversion: of the leads that came in the period, how many are won now.
  const curLeads = leads.filter((l) => inside(l.created_at, i.range));
  const prevLeads = leads.filter((l) => inside(l.created_at, i.prev));
  const isWon = (l: DeskLead) => !!(l.stage_id && stageById.get(l.stage_id)?.won);
  const conv = (xs: DeskLead[]) => pct(xs.filter(isWon).length, xs.length);

  // Plan vs fact for the plan's month.
  const planPeople: Record<string, number> = {};
  let team = 0;
  for (const p of i.plans) {
    if (p.profile_id) planPeople[p.profile_id] = Number(p.target_amount) || 0;
    else team = Number(p.target_amount) || 0;
  }
  if (!team) team = Object.values(planPeople).reduce((a, b) => a + b, 0);
  const [py, pm] = i.planMonth.split("-").map(Number) as [number, number];
  const pFrom = Date.UTC(py, pm - 1, 1) - i.tz * 60_000;
  const pTo = Date.UTC(py, pm, 1) - i.tz * 60_000;
  const planFact = sum(sales.filter((s) => t(s.at) >= pFrom && t(s.at) < pTo));

  // Sales by channel (the lead's source) and new leads by source.
  const byName = <T>(xs: T[], key: (x: T) => string | null) => {
    const m = new Map<string, T[]>();
    for (const x of xs) {
      const k = (key(x) ?? "").trim() || NO_SOURCE;
      m.set(k, [...(m.get(k) ?? []), x]);
    }
    return m;
  };
  const channels = [...byName(cur, (s) => s.source)]
    .map(([name, xs]) => ({ name, revenue: sum(xs), count: xs.length }))
    .sort((a, b) => b.revenue - a.revenue || b.count - a.count);
  const sources = [...byName(curLeads, (l) => l.source)]
    .map(([name, xs]) => ({ name, leads: xs.length }))
    .sort((a, b) => b.leads - a.leads);

  // The sales curve: each day of the period against the same day of the
  // period before, and the hours of the day added up.
  const curDays = Math.max(1, Math.ceil((t(i.range.to) - t(i.range.from)) / DAY));
  const days = Array.from({ length: Math.min(curDays, 400) }, (_, k) => {
    const d = new Date(t(i.range.from) + k * DAY + i.tz * 60_000);
    return {
      label: `${pad(d.getUTCDate())}.${pad(d.getUTCMonth() + 1)}`,
      cur: 0,
      prev: 0,
      curCount: 0,
      prevCount: 0,
    };
  });
  const hours = Array.from({ length: 24 }, (_, h) => ({
    label: `${pad(h)}:00`,
    cur: 0,
    prev: 0,
    curCount: 0,
    prevCount: 0,
  }));
  for (const s of cur) {
    const k = Math.floor((t(s.at) - t(i.range.from)) / DAY);
    const d = days[k];
    if (d) {
      d.cur += s.revenue;
      d.curCount += 1;
    }
    const h = hours[hourOf(t(s.at), i.tz)]!;
    h.cur += s.revenue;
    h.curCount += 1;
  }
  for (const s of prev) {
    const k = Math.floor((t(s.at) - t(i.prev.from)) / DAY);
    const d = days[k];
    if (d) {
      d.prev += s.revenue;
      d.prevCount += 1;
    }
    const h = hours[hourOf(t(s.at), i.tz)]!;
    h.prev += s.revenue;
    h.prevCount += 1;
  }

  // The funnel: the period's leads per funnel, and with one funnel chosen
  // how many got at least as far as each stage.
  const funnelRows = (i.funnel ? [i.funnel] : i.funnels).map((name) => {
    const xs = curLeads.filter((l) => (l.funnel ?? "") === name);
    return { name, leads: xs.length, sales: xs.filter(isWon).length };
  });
  const stagesOut: DeskData["funnelBars"]["stages"] = [];
  if (i.funnel) {
    const fs = i.stages
      .filter((s) => s.funnel === i.funnel)
      .sort((a, b) => a.position - b.position);
    const open = fs.filter((s) => !s.won && !s.lost);
    const reach = new Map<string, number>();
    const mark = (leadId: string, stageId: string | null) => {
      const s = stageId ? stageById.get(stageId) : undefined;
      if (!s || s.funnel !== i.funnel || s.lost) return;
      const pos = s.won ? Infinity : s.position;
      reach.set(leadId, Math.max(reach.get(leadId) ?? -Infinity, pos));
    };
    const ids = new Set(curLeads.map((l) => l.id));
    for (const l of curLeads) {
      mark(l.id, l.stage_id);
      if (!reach.has(l.id)) reach.set(l.id, -Infinity);
    }
    for (const e of i.stageEvents) if (ids.has(e.lead_id)) mark(e.lead_id, e.stage_id);
    const first = open[0]?.position;
    for (const s of open) {
      let n = 0;
      for (const v of reach.values())
        if (v >= s.position || (s.position === first && v === -Infinity)) n += 1;
      stagesOut.push({ id: s.id, name: s.name, count: n, kind: "open" });
    }
    const won = fs.filter((s) => s.won);
    const lost = fs.filter((s) => s.lost);
    if (won.length)
      stagesOut.push({
        id: won[0]!.id,
        name: won[0]!.name,
        count: curLeads.filter(isWon).length,
        kind: "won",
      });
    if (lost.length)
      stagesOut.push({
        id: lost[0]!.id,
        name: lost[0]!.name,
        count: curLeads.filter((l) => !!(l.stage_id && stageById.get(l.stage_id)?.lost)).length,
        kind: "lost",
      });
  }

  // Managers: leads, how many were worked (moved past the funnel's first
  // stage), sales, plan, conversion, average check and calls.
  const firstStage = new Map<string, string>();
  for (const s of [...i.stages].sort((a, b) => a.position - b.position)) {
    if (!s.won && !s.lost && !firstStage.has(s.funnel)) firstStage.set(s.funnel, s.id);
  }
  const ids = new Set(i.people.map((p) => p.id));
  const callsIn = i.calls.filter((c) => inside(c.at, i.range));
  const managers: DeskManager[] = i.people
    .map((p) => {
      const ml = curLeads.filter((l) => l.owner_id === p.id);
      const ms = cur.filter((s) => s.owner_id === p.id);
      const rev = sum(ms);
      const calls = callsIn.filter((c) => c.by === p.id && c.seconds > 0);
      return {
        id: p.id,
        name: p.name,
        leads: { cur: ml.length, prev: prevLeads.filter((l) => l.owner_id === p.id).length },
        worked: ml.filter((l) => l.stage_id && l.stage_id !== firstStage.get(l.funnel ?? ""))
          .length,
        sales: { cur: ms.length, prev: prev.filter((s) => s.owner_id === p.id).length },
        revenue: { cur: rev, prev: sum(prev.filter((s) => s.owner_id === p.id)) },
        plan: planPeople[p.id] ?? 0,
        conversion: conv(ml),
        avgCheck: ms.length ? Math.round(rev / ms.length) : 0,
        talks: calls.length,
        longest: calls.reduce((a, c) => Math.max(a, c.seconds), 0),
      };
    })
    .filter(
      (m) =>
        m.leads.cur + m.leads.prev + m.sales.cur + m.sales.prev + m.talks > 0 ||
        m.plan > 0 ||
        i.people.find((p) => p.id === m.id)?.role === "sotuv_menejeri",
    )
    .sort((a, b) => b.revenue.cur - a.revenue.cur || b.sales.cur - a.sales.cur);
  const outside = <T extends { owner_id: string | null }>(xs: T[]) =>
    xs.filter((x) => !x.owner_id || !ids.has(x.owner_id));

  const cr = sum(cur);
  const pr = sum(prev);
  return {
    range: i.range,
    prev: i.prev,
    funnels: i.funnels,
    funnel: i.funnel,
    today: {
      revenue: sum(tod),
      count: tod.length,
      yRevenue: sum(yest),
      yCount: yest.length,
      until: `${pad(nowLocal.getUTCHours())}:${pad(nowLocal.getUTCMinutes())}`,
    },
    revenue: { cur: cr, prev: pr },
    count: { cur: cur.length, prev: prev.length },
    avgCheck: {
      cur: cur.length ? Math.round(cr / cur.length) : 0,
      prev: prev.length ? Math.round(pr / prev.length) : 0,
    },
    newClients: { cur: sc.fresh, prev: sp.fresh },
    repeat: { cur: sc.repeat, prev: sp.repeat },
    conversion: { cur: conv(curLeads), prev: conv(prevLeads) },
    leads: { cur: curLeads.length, prev: prevLeads.length },
    plan: { month: i.planMonth, team, people: planPeople, fact: planFact },
    channels,
    sources,
    dynamics: { days, hours },
    funnelBars: { total: curLeads.length, funnels: funnelRows, stages: stagesOut },
    managers,
    others: {
      leads: outside(curLeads).length,
      sales: outside(cur).length,
      revenue: sum(outside(cur)),
    },
  };
}

/** Change against the period before, in percent (null when there was nothing before). */
export function change(p: Pair): number | null {
  if (!p.prev) return null;
  return Math.round(((p.cur - p.prev) / p.prev) * 100);
}

// ---- Periods ---------------------------------------------------------------

export type DeskPreset = "today" | "week" | "month" | "year" | "range";

const ymd = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

/**
 * The period (inclusive days, YYYY-MM-DD) and the one to compare with:
 * Bugun → yesterday, Hafta (Monday on) → the week before, Oy → the same
 * days of last month, Yil → the same days of last year, Oraliq → the same
 * number of days just before.
 */
export function deskPeriod(
  preset: DeskPreset,
  now: Date,
  custom?: { from: string; to: string },
): { from: string; to: string; prevFrom: string; prevTo: string } {
  const d0 = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const add = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
  const clampDay = (y: number, m: number, day: number) =>
    new Date(y, m, Math.min(day, new Date(y, m + 1, 0).getDate()));
  if (preset === "today") {
    const y = add(d0, -1);
    return { from: ymd(d0), to: ymd(d0), prevFrom: ymd(y), prevTo: ymd(y) };
  }
  if (preset === "week") {
    const from = add(d0, -((d0.getDay() + 6) % 7));
    return { from: ymd(from), to: ymd(d0), prevFrom: ymd(add(from, -7)), prevTo: ymd(add(d0, -7)) };
  }
  if (preset === "month") {
    const from = new Date(d0.getFullYear(), d0.getMonth(), 1);
    const pf = new Date(d0.getFullYear(), d0.getMonth() - 1, 1);
    const pt = clampDay(d0.getFullYear(), d0.getMonth() - 1, d0.getDate());
    return { from: ymd(from), to: ymd(d0), prevFrom: ymd(pf), prevTo: ymd(pt) };
  }
  if (preset === "year") {
    const from = new Date(d0.getFullYear(), 0, 1);
    const pf = new Date(d0.getFullYear() - 1, 0, 1);
    const pt = clampDay(d0.getFullYear() - 1, d0.getMonth(), d0.getDate());
    return { from: ymd(from), to: ymd(d0), prevFrom: ymd(pf), prevTo: ymd(pt) };
  }
  const from = custom?.from ?? ymd(d0);
  const to = custom?.to ?? ymd(d0);
  const a = new Date(`${from}T00:00:00`);
  const b = new Date(`${to}T00:00:00`);
  const n = Math.max(1, Math.round((b.getTime() - a.getTime()) / DAY) + 1);
  return { from, to, prevFrom: ymd(add(a, -n)), prevTo: ymd(add(a, -1)) };
}

// ---- History (Tarix) -------------------------------------------------------

export type DeskMonth = {
  month: string;
  revenue: number;
  count: number;
  leads: number;
  plan: number;
};

/** The last months' sales, leads and plans, newest first. */
export function deskHistory(input: {
  months: string[];
  tz: number;
  sales: { revenue: number; at: string }[];
  leads: { created_at: string }[];
  plans: { month: string; profile_id: string | null; target_amount: number }[];
}): DeskMonth[] {
  const key = (iso: string) => {
    const d = new Date(t(iso) + input.tz * 60_000);
    return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-01`;
  };
  const rows = new Map<string, DeskMonth>(
    input.months.map((m) => [m, { month: m, revenue: 0, count: 0, leads: 0, plan: 0 }]),
  );
  for (const s of input.sales) {
    const r = rows.get(key(s.at));
    if (r) {
      r.revenue += s.revenue;
      r.count += 1;
    }
  }
  for (const l of input.leads) {
    const r = rows.get(key(l.created_at));
    if (r) r.leads += 1;
  }
  const teamPlan = new Map<string, number>();
  const peoplePlan = new Map<string, number>();
  for (const p of input.plans) {
    const m = p.month.slice(0, 10);
    if (p.profile_id) peoplePlan.set(m, (peoplePlan.get(m) ?? 0) + Number(p.target_amount));
    else teamPlan.set(m, Number(p.target_amount));
  }
  for (const r of rows.values()) r.plan = teamPlan.get(r.month) || peoplePlan.get(r.month) || 0;
  return [...rows.values()].sort((a, b) => (a.month < b.month ? 1 : -1));
}

// ---- Telegram ----------------------------------------------------------------

const som = (n: number) => String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, " ");
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const trend = (p: Pair) => {
  const c = change(p);
  return c === null ? "" : ` (${c >= 0 ? "+" : ""}${c}%)`;
};

/** «Telegram» on Ish stoli: the page's figures as one message (HTML). */
export function deskTelegramText(d: DeskData, head: { org: string; period: string }): string {
  const lines = [
    `📊 <b>${esc(head.org)}</b> — Ish stoli`,
    `🗓 ${esc(head.period)}${d.funnel ? ` · ${esc(d.funnel)}` : ""}`,
    "",
    `💰 Sotuv: <b>${som(d.revenue.cur)} so'm</b>${trend(d.revenue)}`,
    `🛒 Sotuvlar soni: <b>${d.count.cur}</b>${trend(d.count)}`,
    `🧾 O'rtacha chek: <b>${som(d.avgCheck.cur)} so'm</b>`,
    `🆕 Yangi mijozlar: <b>${d.newClients.cur}</b> · 🔁 Qayta sotuv: <b>${d.repeat.cur}</b>`,
    `📥 Lidlar: <b>${d.leads.cur}</b>${trend(d.leads)} · Konversiya: <b>${d.conversion.cur}%</b>`,
  ];
  if (d.plan.team > 0) {
    lines.push(
      `🎯 Plan: ${som(d.plan.fact)} / ${som(d.plan.team)} so'm (${Math.round((d.plan.fact / d.plan.team) * 100)}%)`,
    );
  }
  const top = d.managers.filter((m) => m.sales.cur > 0 || m.leads.cur > 0).slice(0, 10);
  if (top.length) {
    lines.push("", "👥 <b>Menejerlar</b>");
    top.forEach((m, k) =>
      lines.push(
        `${k + 1}. ${esc(m.name)} — ${m.sales.cur} ta · ${som(m.revenue.cur)} so'm · ${m.leads.cur} lid`,
      ),
    );
  }
  return lines.join("\n");
}
