import { createFileRoute } from "@tanstack/react-router";
import { requirePlatformOwner } from "@/lib/auth.server";
import { loadRevenueReport } from "@/lib/revenue.server";

// Platforma → Daromad: MRR, churn, LTV, conversion and payments. Owner only.
export const Route = createFileRoute("/platform/revenue-api")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const ownerId = await requirePlatformOwner(request);
        if (!ownerId) return Response.json({ error: "Unauthorized" }, { status: 403 });
        try {
          return Response.json(await loadRevenueReport());
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
