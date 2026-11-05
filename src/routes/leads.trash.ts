import { createFileRoute } from "@tanstack/react-router";
import { requireSuperAdmin } from "@/lib/auth.server";
import { listTrashedLeads, purgeTrashedLeads, restoreTrashedLeads } from "@/lib/leads-trash.server";

// GET /leads/trash -> Admin → Savat: the company's deleted leads (30 days).
// POST /leads/trash { action: "restore" | "purge", ids } -> puts them back
// with everything they had, or removes them for good. Super admin only --
// the same people who may delete leads (RLS on leads).
const readIds = (v: unknown): string[] =>
  Array.isArray(v) ? v.filter((x): x is string => typeof x === "string").slice(0, 200) : [];

export const Route = createFileRoute("/leads/trash")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const admin = await requireSuperAdmin(request);
        if (!admin) return Response.json({ error: "Unauthorized" }, { status: 403 });
        const leads = await listTrashedLeads(admin.organizationId);
        return Response.json(leads === null ? { leads: [], pending: true } : { leads });
      },
      POST: async ({ request }) => {
        const admin = await requireSuperAdmin(request);
        if (!admin) return Response.json({ error: "Unauthorized" }, { status: 403 });
        const body = (await request.json().catch(() => ({}))) as {
          action?: unknown;
          ids?: unknown;
        };
        const ids = readIds(body.ids);
        if (!ids.length) return Response.json({ error: "ids are required" }, { status: 400 });
        try {
          if (body.action === "restore") {
            return Response.json(await restoreTrashedLeads(admin.organizationId, ids));
          }
          if (body.action === "purge") {
            return Response.json({ purged: await purgeTrashedLeads(admin.organizationId, ids) });
          }
          return Response.json({ error: "unknown action" }, { status: 400 });
        } catch (err) {
          const message = err instanceof Error ? err.message : "failed";
          return Response.json(
            { error: message },
            { status: message === "MIGRATION_PENDING" ? 409 : 500 },
          );
        }
      },
    },
  },
});
