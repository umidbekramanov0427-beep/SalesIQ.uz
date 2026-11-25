import { createFileRoute } from "@tanstack/react-router";
import { requirePlatformOwner } from "@/lib/auth.server";

// Kompaniyalar -> one company -> Tarif -> Modullar (platform owners only):
//   GET  ?org=<id>                      the company's add-on modules
//   POST { org, module, enabled }       turn one on or off
const UUID = /^[0-9a-f-]{36}$/i;
const MODULES = new Set(["warehouse"]);

export const Route = createFileRoute("/platform/org-modules")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        if (!(await requirePlatformOwner(request)))
          return Response.json({ error: "Unauthorized" }, { status: 403 });
        const org = new URL(request.url).searchParams.get("org") ?? "";
        if (!UUID.test(org)) return Response.json({ error: "BAD_ORG" }, { status: 400 });
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data, error } = await supabaseAdmin
          .from("org_modules")
          .select("module, enabled, until")
          .eq("organization_id", org);
        if (error) return Response.json({ modules: [], missing: true });
        return Response.json({ modules: data ?? [] });
      },
      POST: async ({ request }) => {
        if (!(await requirePlatformOwner(request)))
          return Response.json({ error: "Unauthorized" }, { status: 403 });
        const body = (await request.json().catch(() => ({}))) as {
          org?: string;
          module?: string;
          enabled?: boolean;
        };
        if (!body.org || !UUID.test(body.org) || !body.module || !MODULES.has(body.module))
          return Response.json({ error: "BAD_INPUT" }, { status: 400 });
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { error } = await supabaseAdmin.from("org_modules").upsert({
          organization_id: body.org,
          module: body.module,
          enabled: body.enabled !== false,
          updated_at: new Date().toISOString(),
        });
        if (error) return Response.json({ error: error.message }, { status: 500 });
        return Response.json({ ok: true });
      },
    },
  },
});
