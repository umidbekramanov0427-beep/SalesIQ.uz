import { createFileRoute } from "@tanstack/react-router";
import { requireOrgMember } from "@/lib/auth.server";
import {
  EVENT_KINDS,
  gatherEvents,
  loadViewer,
  parseRange,
  type EventKind,
} from "@/lib/analytics.server";

// GET /analytics/events?from&to&kind&actor&page -> Analitika → Hodisalar
// jurnali: leads created, stage moves, notes, finished tasks, calls,
// messages and payments, newest first, 50 a page. Any company member, cut
// to the people their access rules let them see.
export const Route = createFileRoute("/analytics/events")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const caller = await requireOrgMember(request);
        if (!caller) return Response.json({ error: "Unauthorized" }, { status: 401 });
        const url = new URL(request.url);
        const range = parseRange(url.searchParams.get("from"), url.searchParams.get("to"));
        if (!range) return Response.json({ error: "Bad period" }, { status: 400 });
        const k = url.searchParams.get("kind");
        const kind = EVENT_KINDS.includes(k as EventKind) ? (k as EventKind) : null;
        const actor = url.searchParams.get("actor") || null;
        const page = Math.max(0, Math.min(200, Number(url.searchParams.get("page")) || 0));
        const viewer = await loadViewer(caller.id, caller.organizationId);
        return Response.json(await gatherEvents(viewer, range, { kind, actor, page }));
      },
    },
  },
});
