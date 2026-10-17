import { createFileRoute } from "@tanstack/react-router";
import { requireSuperAdmin } from "@/lib/auth.server";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { readAutoAnalysisSettings } from "@/lib/call-analysis-policy";

// A company's rules for the automatic AI call analysis (start date and
// minimum call length), kept in its amoCRM integration config next to the
// other amoCRM settings; read by the analyze-pending queue.
type Body = { since?: unknown; minSeconds?: unknown };

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

export const Route = createFileRoute("/admin/call-analysis-settings")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const admin = await requireSuperAdmin(request);
        if (!admin) return Response.json({ error: "Unauthorized" }, { status: 403 });
        const config = await loadConfig(admin.organizationId);
        return Response.json(readAutoAnalysisSettings(config));
      },
      POST: async ({ request }) => {
        const admin = await requireSuperAdmin(request);
        if (!admin) return Response.json({ error: "Unauthorized" }, { status: 403 });
        const body = (await request.json().catch(() => ({}))) as Body;
        const since =
          typeof body.since === "string" && !Number.isNaN(Date.parse(body.since))
            ? new Date(body.since).toISOString()
            : null;
        const min = Number(body.minSeconds);
        const minSeconds =
          body.minSeconds != null && Number.isFinite(min) && min >= 0 && min <= 3600
            ? Math.round(min)
            : null;
        try {
          // Read-modify-write: config also holds the amoCRM app keys.
          const current = await loadConfig(admin.organizationId);
          const config = {
            ...(current ?? {}),
            analysis_since: since,
            analysis_min_seconds: minSeconds,
          };
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
          return Response.json(readAutoAnalysisSettings(config));
        } catch (err) {
          const message = err instanceof Error ? err.message : "Could not save.";
          return Response.json({ error: message }, { status: 400 });
        }
      },
    },
  },
});
