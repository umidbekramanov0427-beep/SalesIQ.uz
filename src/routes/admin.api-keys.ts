import { createFileRoute } from "@tanstack/react-router";
import { requireSuperAdmin } from "@/lib/auth.server";
import { createApiKey, listApiKeys, revokeApiKey } from "@/lib/api-keys.server";

// GET /admin/api-keys -> the company's live keys (never the keys themselves).
// POST /admin/api-keys { name, scopes[] } -> { id, key } -- the key, once.
// DELETE /admin/api-keys?id=... -> revokes it. Super admin only.
export const Route = createFileRoute("/admin/api-keys")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const admin = await requireSuperAdmin(request);
        if (!admin) return Response.json({ error: "Unauthorized" }, { status: 403 });
        const keys = await listApiKeys(admin.organizationId);
        return Response.json(keys === null ? { keys: [], pending: true } : { keys });
      },
      POST: async ({ request }) => {
        const admin = await requireSuperAdmin(request);
        if (!admin) return Response.json({ error: "Unauthorized" }, { status: 403 });
        const body = (await request.json().catch(() => ({}))) as {
          name?: unknown;
          scopes?: unknown;
        };
        try {
          const made = await createApiKey(
            admin.organizationId,
            admin.id,
            typeof body.name === "string" ? body.name : "",
            body.scopes,
          );
          return Response.json(made);
        } catch (err) {
          const message = err instanceof Error ? err.message : "failed";
          return Response.json(
            { error: message },
            { status: message === "MIGRATION_PENDING" ? 409 : 400 },
          );
        }
      },
      DELETE: async ({ request }) => {
        const admin = await requireSuperAdmin(request);
        if (!admin) return Response.json({ error: "Unauthorized" }, { status: 403 });
        const id = new URL(request.url).searchParams.get("id") ?? "";
        if (!id) return Response.json({ error: "id is required" }, { status: 400 });
        await revokeApiKey(admin.organizationId, id);
        return Response.json({ ok: true });
      },
    },
  },
});
