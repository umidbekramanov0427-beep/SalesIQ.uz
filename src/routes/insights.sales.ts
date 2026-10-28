import { createFileRoute } from "@tanstack/react-router";
import { requireOrgMember } from "@/lib/auth.server";
import { loadSalesInsights } from "@/lib/sales-insights.server";

// GET /insights/sales?from=&to=&funnel= -- the AI score vs sales result,
// the script steps that lose sales and the objection library, for the
// caller's company (src/lib/sales-insights.ts).
const iso = (v: string | null) =>
  v && !Number.isNaN(Date.parse(v)) ? new Date(v).toISOString() : null;

export const Route = createFileRoute("/insights/sales")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const caller = await requireOrgMember(request);
        if (!caller) return Response.json({ error: "Unauthorized" }, { status: 401 });
        const url = new URL(request.url);
        try {
          const data = await loadSalesInsights(caller.organizationId, {
            from: iso(url.searchParams.get("from")),
            to: iso(url.searchParams.get("to")),
            funnel: url.searchParams.get("funnel") || null,
          });
          return Response.json(data);
        } catch (err) {
          return Response.json(
            { error: err instanceof Error ? err.message : "Failed" },
            { status: 500 },
          );
        }
      },
    },
  },
});
