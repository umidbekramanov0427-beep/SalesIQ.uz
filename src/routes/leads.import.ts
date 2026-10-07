import { createFileRoute } from "@tanstack/react-router";
import { getRequestUserId } from "@/lib/auth.server";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { MAX_IMPORT_ROWS, importLeads, type ImportLeadRow } from "@/lib/leads/lead-import.server";

// Funnel settings -> "Lidlarni import qilish". The browser parses the
// spreadsheet and applies the column mapping; it sends rows here in chunks
// of up to MAX_IMPORT_ROWS. ROP / admins only.
export const Route = createFileRoute("/leads/import")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const userId = await getRequestUserId(request);
        if (!userId) return Response.json({ error: "Unauthorized" }, { status: 401 });
        const { data: me } = await supabaseAdmin
          .from("profiles")
          .select("role, organization_id")
          .eq("id", userId)
          .maybeSingle();
        const allowed =
          me?.role === "super_admin" || me?.role === "rop" || me?.role === "platform_owner";
        if (!me?.organization_id || !allowed) {
          return Response.json({ error: "Only ROP or admins can import leads." }, { status: 403 });
        }

        const body = (await request.json().catch(() => null)) as {
          funnel?: unknown;
          stageId?: unknown;
          ownerId?: unknown;
          tags?: unknown;
          skipDuplicates?: unknown;
          sourceLabel?: unknown;
          rows?: unknown;
        } | null;
        const rows = Array.isArray(body?.rows) ? (body.rows as ImportLeadRow[]) : [];
        const funnel = typeof body?.funnel === "string" ? body.funnel.trim() : "";
        if (!funnel) return Response.json({ error: "Choose a funnel." }, { status: 400 });
        if (rows.length === 0) return Response.json({ error: "No rows." }, { status: 400 });
        if (rows.length > MAX_IMPORT_ROWS) {
          return Response.json(
            { error: `Max ${MAX_IMPORT_ROWS} rows per request.` },
            { status: 400 },
          );
        }

        try {
          const result = await importLeads(me.organization_id, userId, rows, {
            funnel,
            stageId: typeof body?.stageId === "string" && body.stageId ? body.stageId : null,
            ownerId: typeof body?.ownerId === "string" && body.ownerId ? body.ownerId : null,
            tags: Array.isArray(body?.tags)
              ? (body.tags as unknown[])
                  .filter((t): t is string => typeof t === "string")
                  .map((t) => t.trim())
                  .filter(Boolean)
                  .slice(0, 20)
              : [],
            skipDuplicates: body?.skipDuplicates !== false,
            sourceLabel:
              typeof body?.sourceLabel === "string" && body.sourceLabel.trim()
                ? body.sourceLabel.trim().slice(0, 120)
                : "Import",
          });
          return Response.json(result);
        } catch (err) {
          return Response.json(
            { error: err instanceof Error ? err.message : "Import failed" },
            { status: 400 },
          );
        }
      },
    },
  },
});
