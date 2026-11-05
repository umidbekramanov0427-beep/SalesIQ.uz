import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { authenticateApi } from "@/lib/api-keys.server";
import { apiError } from "@/lib/api-v1.server";

// GET /api/v1/pipelines (leads:read) -> { data: [{ name, stages: [{ id, name, position, is_won, is_lost }] }] }
// The company's funnels and their stages, for stage_id values.
export const Route = createFileRoute("/api/v1/pipelines")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const caller = await authenticateApi(request, "leads:read");
        if (caller instanceof Response) return caller;
        const { data, error } = await supabaseAdmin
          .from("pipeline_stages")
          .select("id, name, position, is_won, is_lost, pipeline_name")
          .eq("organization_id", caller.organizationId)
          .order("position", { ascending: true });
        if (error) return apiError(500, "server_error", "Could not read pipelines.");
        const byFunnel = new Map<
          string,
          { id: string; name: string; position: number; is_won: boolean; is_lost: boolean }[]
        >();
        for (const s of data ?? []) {
          const key = s.pipeline_name ?? "Direct Sales";
          const list = byFunnel.get(key) ?? [];
          list.push({
            id: s.id,
            name: s.name,
            position: s.position,
            is_won: s.is_won,
            is_lost: s.is_lost,
          });
          byFunnel.set(key, list);
        }
        return Response.json({
          data: [...byFunnel].map(([name, stages]) => ({ name, stages })),
        });
      },
    },
  },
});
