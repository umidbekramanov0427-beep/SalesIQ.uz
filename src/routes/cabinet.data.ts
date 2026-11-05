import { createFileRoute } from "@tanstack/react-router";
import { loadCabinet } from "@/lib/client-cabinet.server";

// GET /cabinet/data?token=... -- public on purpose: what a client's own
// cabinet page (/cabinet/<token>) shows. The token is long and random; an
// unknown or revoked one is a plain 404.
export const Route = createFileRoute("/cabinet/data")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const token = new URL(request.url).searchParams.get("token") ?? "";
        const cabinet = await loadCabinet(token).catch(() => null);
        if (!cabinet) return Response.json({ error: "not_found" }, { status: 404 });
        return Response.json(cabinet, { headers: { "cache-control": "no-store" } });
      },
    },
  },
});
