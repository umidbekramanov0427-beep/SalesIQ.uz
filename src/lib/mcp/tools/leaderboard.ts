import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { requireToolOrgId } from "./org-scope";

export default defineTool({
  name: "leaderboard_ranking",
  title: "Sales leaderboard",
  description:
    "Get the current SalesIQ sales leaderboard ranking: revenue, conversion, KPI and target completion per manager, computed from real CRM leads.",
  inputSchema: {
    search: z.string().optional().describe("Filter managers by name."),
    limit: z
      .number()
      .int()
      .min(1)
      .max(50)
      .optional()
      .describe("How many ranks to return (default 10)."),
  },
  annotations: { readOnlyHint: true, openWorldHint: false },
  handler: async ({ search, limit }, ctx) => {
    const orgId = await requireToolOrgId(ctx);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const [
      { data: profiles, error: profilesError },
      { data: leads, error: leadsError },
      { data: stages, error: stagesError },
    ] = await Promise.all([
      supabaseAdmin
        .from("profiles")
        .select("id, full_name, email, role, monthly_target, kpi_percent")
        .eq("organization_id", orgId),
      supabaseAdmin
        .from("leads")
        .select("owner_id, stage_id, expected_revenue")
        .eq("organization_id", orgId),
      supabaseAdmin
        .from("pipeline_stages")
        .select("id, is_won, is_lost")
        .eq("organization_id", orgId),
    ]);
    if (profilesError) throw new Error(profilesError.message);
    if (leadsError) throw new Error(leadsError.message);
    if (stagesError) throw new Error(stagesError.message);

    const stagesById = new Map((stages ?? []).map((s) => [s.id, s]));
    const q = search?.trim().toLowerCase();

    const ranking = (profiles ?? [])
      .filter((p) => p.role !== "super_admin" && p.role !== "platform_owner")
      .filter((p) => !q || (p.full_name || p.email).toLowerCase().includes(q))
      .map((p) => {
        const mine = (leads ?? []).filter((l) => l.owner_id === p.id);
        const won = mine.filter((l) => (l.stage_id ? stagesById.get(l.stage_id)?.is_won : false));
        const lost = mine.filter((l) => (l.stage_id ? stagesById.get(l.stage_id)?.is_lost : false));
        const revenue = won.reduce((s, l) => s + l.expected_revenue, 0);
        const conversion = mine.length ? (won.length / mine.length) * 100 : 0;
        const targetCompletion =
          p.monthly_target && p.monthly_target > 0 ? (revenue / p.monthly_target) * 100 : 0;
        return {
          name: p.full_name || p.email,
          totalLeads: mine.length,
          wonLeads: won.length,
          lostLeads: lost.length,
          revenue: Math.round(revenue),
          conversion: Number(conversion.toFixed(1)),
          kpiPercent: p.kpi_percent,
          targetCompletion: Number(targetCompletion.toFixed(1)),
        };
      })
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, limit ?? 10);

    const payload = { totalManagers: (profiles ?? []).length, ranking };

    return {
      content: [{ type: "text", text: JSON.stringify(payload, null, 2) }],
      structuredContent: payload,
    };
  },
});
