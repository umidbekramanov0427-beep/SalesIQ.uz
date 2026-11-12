import { createFileRoute } from "@tanstack/react-router";
import { requireOrgMember } from "@/lib/auth.server";
import { loadViewer, parseRange } from "@/lib/analytics.server";
import { gatherFinance } from "@/lib/finance.server";

// GET /analytics/finance?from=YYYY-MM-DD&to=YYYY-MM-DD -> Analitika's
// Reklama / Moliya / Prognoz figures (src/lib/finance.ts). Admins and heads
// of sales; the P&L and the income/expense lines only for the admin.
export const Route = createFileRoute("/analytics/finance")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const caller = await requireOrgMember(request);
        if (!caller) return Response.json({ error: "Unauthorized" }, { status: 401 });
        const url = new URL(request.url);
        const range = parseRange(url.searchParams.get("from"), url.searchParams.get("to"));
        if (!range) return Response.json({ error: "Bad period" }, { status: 400 });
        const viewer = await loadViewer(caller.id, caller.organizationId);
        if (!["super_admin", "platform_owner", "rop"].includes(viewer.role ?? "")) {
          return Response.json({ error: "Forbidden" }, { status: 403 });
        }
        return Response.json(await gatherFinance(viewer, range));
      },
    },
  },
});
