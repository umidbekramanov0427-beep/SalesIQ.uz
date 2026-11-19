import { createFileRoute } from "@tanstack/react-router";
import { loadViewer, parseRange } from "@/lib/analytics.server";
import { requireOrgMember } from "@/lib/auth.server";
import { gatherDesk } from "@/lib/desk.server";

// Bosh sahifa → «Umumiy».
//   GET /dashboard/desk?from&to&prevFrom&prevTo&funnel   the page's figures
//       (YYYY-MM-DD, Tashkent days, inclusive; prev = the period compared with)
// Any company member; each sees only the leads their access rules allow.

function ranges(p: { get: (k: string) => string | null }) {
  const range = parseRange(p.get("from"), p.get("to"));
  const prev = parseRange(p.get("prevFrom"), p.get("prevTo"));
  return range && prev ? { range, prev } : null;
}

export const Route = createFileRoute("/dashboard/desk")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const caller = await requireOrgMember(request);
        if (!caller) return Response.json({ error: "Unauthorized" }, { status: 401 });
        const url = new URL(request.url);
        const funnel = url.searchParams.get("funnel") || null;
        const viewer = await loadViewer(caller.id, caller.organizationId);
        const r = ranges(url.searchParams);
        if (!r) return Response.json({ error: "Bad period" }, { status: 400 });
        return Response.json(await gatherDesk(viewer, r.range, r.prev, funnel));
      },
    },
  },
});
