import { createFileRoute } from "@tanstack/react-router";
import { requirePlatformOwner } from "@/lib/auth.server";
import {
  closeVisit,
  loadFunnel,
  loadOnline,
  loadOrgUsage,
  loadTrialHealth,
  sendOwnerDigest,
} from "@/lib/platform-insights.server";

// The visits report's other views, platform owner only:
//   GET ?view=trials | funnel&days=30|90|all | online | usage&org=<id>
//   POST { action: "digest" }            -- send today's Telegram digest now
//   POST { action: "close", id: <visit> } -- sign that session out
export const Route = createFileRoute("/platform/insights")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const ownerId = await requirePlatformOwner(request);
        if (!ownerId) return Response.json({ error: "Unauthorized" }, { status: 403 });
        const url = new URL(request.url);
        try {
          switch (url.searchParams.get("view")) {
            case "trials":
              return Response.json(await loadTrialHealth());
            case "funnel": {
              const days = Number(url.searchParams.get("days"));
              return Response.json(await loadFunnel([30, 90].includes(days) ? days : null));
            }
            case "online":
              return Response.json(await loadOnline());
            case "usage": {
              const org = url.searchParams.get("org");
              const usage = org ? await loadOrgUsage(org) : null;
              if (!usage) return Response.json({ error: "Not found" }, { status: 404 });
              return Response.json(usage);
            }
            default:
              return Response.json({ error: "Unknown view" }, { status: 400 });
          }
        } catch (err) {
          const message = err instanceof Error ? err.message : "Failed to load";
          return Response.json({ error: message }, { status: 500 });
        }
      },
      POST: async ({ request }) => {
        const ownerId = await requirePlatformOwner(request);
        if (!ownerId) return Response.json({ error: "Unauthorized" }, { status: 403 });
        const body = (await request.json().catch(() => ({}))) as { action?: unknown; id?: unknown };
        try {
          if (body.action === "digest") {
            const sent = await sendOwnerDigest(new URL(request.url).origin);
            return Response.json({ ok: true, sent });
          }
          if (body.action === "close" && typeof body.id === "string") {
            return Response.json({ ok: true, ...(await closeVisit(body.id)) });
          }
          return Response.json({ error: "Unknown action" }, { status: 400 });
        } catch (err) {
          const message = err instanceof Error ? err.message : "Action failed";
          return Response.json({ error: message }, { status: 500 });
        }
      },
    },
  },
});
