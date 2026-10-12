import { createFileRoute } from "@tanstack/react-router";
import { requirePlatformOwner } from "@/lib/auth.server";
import { listVisits, loadVisit } from "@/lib/visits.server";

// The platform owner's visits report: GET /platform/visits for the list
// (filters in the query string), or ?id=<session> for one visit's timeline.
export const Route = createFileRoute("/platform/visits")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const ownerId = await requirePlatformOwner(request);
        if (!ownerId) return Response.json({ error: "Unauthorized" }, { status: 403 });
        const url = new URL(request.url);
        try {
          const id = url.searchParams.get("id");
          if (id) {
            const visit = await loadVisit(id);
            if (!visit) return Response.json({ error: "Not found" }, { status: 404 });
            return Response.json(visit);
          }
          const type = url.searchParams.get("type");
          const days = Number(url.searchParams.get("days"));
          return Response.json(
            await listVisits({
              org: url.searchParams.get("org") || null,
              type: type === "trial" || type === "paid" || type === "failed" ? type : "all",
              days: [1, 7, 30].includes(days) ? days : 7,
              q: (url.searchParams.get("q") ?? "").slice(0, 100),
              before: url.searchParams.get("before") || null,
            }),
          );
        } catch (err) {
          const message = err instanceof Error ? err.message : "Failed to load visits";
          return Response.json({ error: message }, { status: 500 });
        }
      },
    },
  },
});
