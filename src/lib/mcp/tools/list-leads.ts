import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { requireToolOrgId } from "./org-scope";

export default defineTool({
  name: "list_leads",
  title: "List leads",
  description:
    "List CRM leads from SalesIQ, optionally filtered by stage, temperature, owner or a free-text search over name/company.",
  inputSchema: {
    search: z.string().optional().describe("Free-text match on lead name or company."),
    stage: z.string().optional().describe("Pipeline stage name filter, e.g. Qualified, Demo, Won."),
    temperature: z.enum(["Hot", "Warm", "Cold"]).optional(),
    owner: z.string().optional().describe("Lead owner full name."),
    limit: z.number().int().min(1).max(100).optional().describe("Max rows to return (default 25)."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ search, stage, temperature, owner, limit }, ctx) => {
    const orgId = await requireToolOrgId(ctx);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    let query = supabaseAdmin
      .from("leads")
      .select(
        "id, name, company_name, contact_id, stage_id, owner_id, temperature, priority, score, expected_revenue, next_follow_up",
      )
      .eq("organization_id", orgId)
      .order("updated_at", { ascending: false })
      .limit(500);
    if (temperature) query = query.eq("temperature", temperature);
    const { data: leads, error } = await query;
    if (error) throw new Error(error.message);

    const ownerIds = [
      ...new Set((leads ?? []).map((l) => l.owner_id).filter((v): v is string => !!v)),
    ];
    const contactIds = [
      ...new Set((leads ?? []).map((l) => l.contact_id).filter((v): v is string => !!v)),
    ];
    const [{ data: stages }, { data: owners }, { data: contacts }] = await Promise.all([
      supabaseAdmin.from("pipeline_stages").select("id, name").eq("organization_id", orgId),
      ownerIds.length
        ? supabaseAdmin.from("profiles").select("id, full_name, email").in("id", ownerIds)
        : Promise.resolve({ data: [] as { id: string; full_name: string; email: string }[] }),
      contactIds.length
        ? supabaseAdmin.from("contacts").select("id, position, email, phone").in("id", contactIds)
        : Promise.resolve({
            data: [] as {
              id: string;
              position: string | null;
              email: string | null;
              phone: string | null;
            }[],
          }),
    ]);
    const stageById = new Map((stages ?? []).map((s) => [s.id, s.name]));
    const ownerById = new Map((owners ?? []).map((o) => [o.id, o.full_name || o.email]));
    const contactById = new Map((contacts ?? []).map((c) => [c.id, c]));

    const q = search?.trim().toLowerCase();
    const rows = (leads ?? [])
      .map((l) => {
        const contact = l.contact_id ? contactById.get(l.contact_id) : undefined;
        return {
          id: l.id,
          name: l.name,
          company: l.company_name,
          position: contact?.position ?? "",
          email: contact?.email ?? "",
          phone: contact?.phone ?? "",
          stage: (l.stage_id && stageById.get(l.stage_id)) || "New Lead",
          temperature: l.temperature,
          priority: l.priority,
          score: l.score,
          expectedRevenue: l.expected_revenue,
          owner: (l.owner_id && ownerById.get(l.owner_id)) || "Unassigned",
          nextFollowUp: l.next_follow_up,
        };
      })
      .filter((l) => {
        if (stage && l.stage.toLowerCase() !== stage.toLowerCase()) return false;
        if (owner && l.owner.toLowerCase() !== owner.toLowerCase()) return false;
        if (q && !`${l.name} ${l.company}`.toLowerCase().includes(q)) return false;
        return true;
      })
      .slice(0, limit ?? 25);

    return {
      content: [{ type: "text", text: JSON.stringify(rows, null, 2) }],
      structuredContent: { count: rows.length, leads: rows },
    };
  },
});
