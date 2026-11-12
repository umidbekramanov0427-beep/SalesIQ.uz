import { createFileRoute } from "@tanstack/react-router";
import { parseRange } from "@/lib/analytics-reports";
import { gatherMarketing, requireMarketingMember } from "@/lib/marketing.server";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

// GET /marketing/data?from=YYYY-MM-DD&to=YYYY-MM-DD -> the marketing
// panel's figures for the period (src/lib/marketing.server.ts): ad spend,
// leads, sales and AI lead quality by source and campaign, company-wide.
export const Route = createFileRoute("/marketing/data")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const caller = await requireMarketingMember(request);
        if (!caller) return Response.json({ error: "Forbidden" }, { status: 403 });
        const url = new URL(request.url);
        const range = parseRange(url.searchParams.get("from"), url.searchParams.get("to"));
        if (!range) return Response.json({ error: "Bad period" }, { status: 400 });
        // Loyiha filtri: the chosen project's funnels and UTM campaigns.
        const projectId = url.searchParams.get("project");
        let project = null;
        if (projectId) {
          const { data } = await supabaseAdmin
            .from("marketing_projects")
            .select("id, funnels, utm_campaigns")
            .eq("organization_id", caller.organizationId)
            .eq("id", projectId)
            .maybeSingle();
          if (!data) return Response.json({ error: "Project not found" }, { status: 404 });
          project = data;
        }
        return Response.json(
          await gatherMarketing(caller.organizationId, range, new Date(), project),
        );
      },
    },
  },
});
