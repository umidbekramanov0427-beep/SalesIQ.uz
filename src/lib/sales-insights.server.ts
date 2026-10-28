// Server-only. Loads one company's analysed calls (the checklist and the
// objections out of each AI analysis) and their leads' outcome, for the
// sums in sales-insights.ts.
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  objectionLibrary,
  scoreBands,
  stageGaps,
  type InsightCall,
  type InsightLead,
} from "@/lib/sales-insights";

const MAX_CALLS = 4000;

type RawCall = {
  lead_id: string | null;
  score: number | null;
  checklist: unknown;
  objections: unknown;
};

const arr = (v: unknown): Record<string, unknown>[] =>
  Array.isArray(v)
    ? (v.filter((x) => x && typeof x === "object") as Record<string, unknown>[])
    : [];
const str = (v: unknown) => (typeof v === "string" ? v : "");

export async function loadSalesInsights(
  organizationId: string,
  opts: { from: string | null; to: string | null; funnel: string | null },
) {
  let q = supabaseAdmin
    .from("amocrm_calls")
    .select("lead_id, score, checklist:analysis->checklist, objections:analysis->objectionHandling")
    .eq("organization_id", organizationId)
    .not("analysis", "is", null)
    .order("occurred_at", { ascending: false })
    .limit(MAX_CALLS);
  if (opts.from) q = q.gte("occurred_at", opts.from);
  if (opts.to) q = q.lt("occurred_at", opts.to);
  const { data, error } = await q;
  if (error) throw error;
  const raw = (data ?? []) as unknown as RawCall[];

  const leadIds = [...new Set(raw.map((c) => c.lead_id).filter((x): x is string => !!x))];
  const [{ data: stages }, leadRows] = await Promise.all([
    supabaseAdmin
      .from("pipeline_stages")
      .select("id, pipeline_name, is_won, is_lost")
      .eq("organization_id", organizationId),
    (async () => {
      const out: {
        id: string;
        owner_id: string | null;
        stage_id: string | null;
        funnel: string | null;
      }[] = [];
      for (let i = 0; i < leadIds.length; i += 200) {
        const { data: rows } = await supabaseAdmin
          .from("leads")
          .select("id, owner_id, stage_id, funnel")
          .eq("organization_id", organizationId)
          .in("id", leadIds.slice(i, i + 200));
        out.push(...(rows ?? []));
      }
      return out;
    })(),
  ]);
  const stageById = new Map((stages ?? []).map((s) => [s.id, s]));
  const leads: InsightLead[] = [];
  for (const l of leadRows) {
    const st = l.stage_id ? stageById.get(l.stage_id) : undefined;
    if (opts.funnel && (st?.pipeline_name ?? l.funnel) !== opts.funnel) continue;
    leads.push({
      id: l.id,
      ownerId: l.owner_id,
      outcome: st?.is_won ? "won" : st?.is_lost ? "lost" : "open",
    });
  }
  const inScope = new Set(leads.map((l) => l.id));
  const calls: InsightCall[] = raw
    .filter((c) => !opts.funnel || (c.lead_id && inScope.has(c.lead_id)))
    .map((c) => ({
      leadId: c.lead_id,
      score: typeof c.score === "number" ? c.score : null,
      checklist: arr(c.checklist).map((i) => ({
        stage: str(i["stage"]) || null,
        step: str(i["step"]) || null,
        met: i["met"] === true,
      })),
      objections: arr(c.objections).map((o) => ({
        objection: str(o["objection"]),
        managerResponse: str(o["managerResponse"]),
        handled: o["handled"] === true,
        betterResponse: str(o["betterResponse"]),
      })),
    }));

  return {
    calls: calls.length,
    capped: raw.length >= MAX_CALLS,
    bands: scoreBands(calls, leads),
    gaps: stageGaps(calls, leads),
    objections: objectionLibrary(calls, leads),
  };
}

export type SalesInsights = Awaited<ReturnType<typeof loadSalesInsights>>;
