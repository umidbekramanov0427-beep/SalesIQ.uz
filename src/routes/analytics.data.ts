import { createFileRoute } from "@tanstack/react-router";
import { requireOrgMember } from "@/lib/auth.server";
import { gatherAnalytics, loadViewer, parseRange } from "@/lib/analytics.server";

// GET /analytics/data?from=YYYY-MM-DD&to=YYYY-MM-DD&funnel=<name> ->
// Analitika's reports for the period (Tashkent days, inclusive) and funnel:
// sales funnel, per-manager summary, win-loss, staff activity, forecast.
// Any company member; each sees only the leads their access rules allow.
export const Route = createFileRoute("/analytics/data")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const caller = await requireOrgMember(request);
        if (!caller) return Response.json({ error: "Unauthorized" }, { status: 401 });
        const url = new URL(request.url);
        const range = parseRange(url.searchParams.get("from"), url.searchParams.get("to"));
        if (!range) return Response.json({ error: "Bad period" }, { status: 400 });
        const viewer = await loadViewer(caller.id, caller.organizationId);
        const data = await gatherAnalytics(viewer, range, url.searchParams.get("funnel"));
        return Response.json(data);
      },
    },
  },
});
