import { createFileRoute } from "@tanstack/react-router";
import { requireSuperAdmin } from "@/lib/auth.server";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { readWriteBack, toStored, type AmoWriteBack } from "@/lib/amocrm/write-back";

// What the AI writes back into amoCRM after analysing a call (task, note),
// kept in the company's amoCRM config next to the analysis rules -- see
// src/lib/amocrm/write-back.ts. Super admins read and change it.

async function loadConfig(orgId: string) {
  const { data, error } = await supabaseAdmin
    .from("integration_settings")
    .select("config")
    .eq("organization_id", orgId)
    .eq("key", "amocrm")
    .maybeSingle();
  if (error) throw error;
  return data ? ((data.config as Record<string, unknown> | null) ?? {}) : null;
}

export const Route = createFileRoute("/admin/amocrm-write-back")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const admin = await requireSuperAdmin(request);
        if (!admin) return Response.json({ error: "Unauthorized" }, { status: 403 });
        return Response.json(readWriteBack(await loadConfig(admin.organizationId)));
      },
      POST: async ({ request }) => {
        const admin = await requireSuperAdmin(request);
        if (!admin) return Response.json({ error: "Unauthorized" }, { status: 403 });
        const body = (await request.json().catch(() => ({}))) as Partial<
          Record<keyof AmoWriteBack, unknown>
        >;
        try {
          // Read-modify-write: config also holds the amoCRM app keys.
          const current = await loadConfig(admin.organizationId);
          const config = { ...(current ?? {}), write_back: toStored(body) };
          const { error } = current
            ? await supabaseAdmin
                .from("integration_settings")
                .update({ config })
                .eq("organization_id", admin.organizationId)
                .eq("key", "amocrm")
            : await supabaseAdmin
                .from("integration_settings")
                .insert({ organization_id: admin.organizationId, key: "amocrm", config });
          if (error) throw error;
          return Response.json(readWriteBack(config));
        } catch (err) {
          const message = err instanceof Error ? err.message : "Could not save.";
          return Response.json({ error: message }, { status: 400 });
        }
      },
    },
  },
});
