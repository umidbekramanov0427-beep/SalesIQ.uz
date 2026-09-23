import { createFileRoute } from "@tanstack/react-router";
import { requireSuperAdmin } from "@/lib/auth.server";
import { fetchAmoCatalog } from "@/lib/amocrm/client.server";

// A hard ceiling on the whole call, independent of (and on top of) every
// per-request timeout inside fetchAmoCatalog itself. Those bound each
// individual network call, but the admin.amocrm-import page still hung
// indefinitely in practice because a slow/broken connection can chain
// several of them (a token refresh, then a paginated users fetch retrying
// per page) well past what feels instant -- wrapping the entire call in one
// Promise.race guarantees this route always answers within this ceiling no
// matter which nested call is the slow one, closing the "stuck on
// Yuklanmoqda..." bug for good instead of chasing it one call at a time.
const CATALOG_FETCH_CEILING_MS = 25_000;

export const Route = createFileRoute("/admin/amocrm-catalog")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const admin = await requireSuperAdmin(request);
        if (!admin) return Response.json({ error: "Unauthorized" }, { status: 403 });

        try {
          const catalog = await Promise.race([
            fetchAmoCatalog(admin.organizationId),
            new Promise<never>((_, reject) =>
              setTimeout(
                () =>
                  reject(
                    new Error(
                      "AmoCRM javob berishi juda uzoq davom etdi. Ulanish (token yoki subdomen) haqiqiy ekanini tekshiring va qayta urinib ko'ring.",
                    ),
                  ),
                CATALOG_FETCH_CEILING_MS,
              ),
            ),
          ]);
          return Response.json(catalog, { status: 200 });
        } catch (err) {
          const message = err instanceof Error ? err.message : "Could not load AmoCRM catalog.";
          return Response.json({ error: message }, { status: 400 });
        }
      },
    },
  },
});
