// Marketing paneli -> Loyihalar: a project (a course, a launch) owns the
// leads that land in its CRM funnels or come from its UTM campaigns, and
// the channels and webinars marked with it. Pure helpers shared by the
// panel, the server and the tests.
import { campaignOf } from "@/lib/marketing";

export type ProjectRule = {
  id: string;
  name: string;
  color: string;
  funnels: string[];
  utm_campaigns: string[];
};

/** The palette a project can take (a dot / chip color across the panel). */
export const PROJECT_COLORS = [
  "sky",
  "violet",
  "emerald",
  "amber",
  "rose",
  "orange",
  "teal",
  "slate",
] as const;

export const PROJECT_DOT: Record<string, string> = {
  sky: "bg-sky-500",
  violet: "bg-violet-500",
  emerald: "bg-emerald-500",
  amber: "bg-amber-400",
  rose: "bg-rose-500",
  orange: "bg-orange-500",
  teal: "bg-teal-500",
  slate: "bg-slate-500",
};

const norm = (s: string | null | undefined) => (s ?? "").trim().toLowerCase().replace(/\s+/g, " ");

/** Does the lead belong to the project: one of its funnels, or one of its UTM campaigns. */
export function leadInProject(
  lead: { funnel?: string | null; campaign: string | null; utm: unknown },
  p: Pick<ProjectRule, "funnels" | "utm_campaigns">,
): boolean {
  const funnel = norm(lead.funnel);
  if (funnel && p.funnels.some((f) => norm(f) === funnel)) return true;
  const campaign = norm(campaignOf(lead));
  return !!campaign && p.utm_campaigns.some((c) => norm(c) === campaign);
}

/** The first project the lead belongs to, if any. */
export function projectOfLead<P extends Pick<ProjectRule, "funnels" | "utm_campaigns">>(
  lead: { funnel?: string | null; campaign: string | null; utm: unknown },
  projects: P[],
): P | null {
  return projects.find((p) => leadInProject(lead, p)) ?? null;
}

/** "a, b , c" / one per line -> a clean, unique list. */
export function parseList(text: string): string[] {
  const out: string[] = [];
  for (const part of text.split(/[\n,]+/)) {
    const v = part.trim().slice(0, 120);
    if (v && !out.some((x) => norm(x) === norm(v))) out.push(v);
  }
  return out.slice(0, 50);
}

export type ShotsSummary = {
  count: number;
  from: string | null;
  to: string | null;
  peak: { viewers: number; at: string } | null;
  avg: number | null;
};

/** The short report under a group of screenshots. */
export function shotsSummary(shots: { at: string; viewers: number | null }[]): ShotsSummary {
  const sorted = [...shots].sort((a, b) => a.at.localeCompare(b.at));
  let peak: ShotsSummary["peak"] = null;
  let sum = 0;
  let n = 0;
  for (const s of sorted) {
    if (s.viewers == null) continue;
    sum += s.viewers;
    n += 1;
    if (!peak || s.viewers > peak.viewers) peak = { viewers: s.viewers, at: s.at };
  }
  return {
    count: sorted.length,
    from: sorted[0]?.at ?? null,
    to: sorted[sorted.length - 1]?.at ?? null,
    peak,
    avg: n ? Math.round(sum / n) : null,
  };
}
