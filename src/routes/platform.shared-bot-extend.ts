import { createFileRoute } from "@tanstack/react-router";
import { requirePlatformOwner } from "@/lib/auth.server";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { SHARED_BOT_DAYS } from "@/lib/telegram/shared-bot";

// POST /platform/shared-bot-extend {orgId, days?} -> {until}: the platform
// owner gives a company more days on the shared trial bot (new clients keep
// coming through it). Counts from today if the time already ran out.
export const Route = createFileRoute("/platform/shared-bot-extend")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        if (!(await requirePlatformOwner(request)))
          return Response.json({ error: "Unauthorized" }, { status: 401 });
        const body = (await request.json().catch(() => ({}))) as {
          orgId?: string;
          days?: number;
        };
        const days = Math.min(Math.max(Math.round(body.days ?? SHARED_BOT_DAYS), 1), 365);
        if (!body.orgId) return Response.json({ error: "BAD_REQUEST" }, { status: 400 });
        const { data: org, error } = await supabaseAdmin
          .from("organizations")
          .select("*")
          .eq("id", body.orgId)
          .maybeSingle();
        if (error || !org) return Response.json({ error: "Not found" }, { status: 404 });
        const current = (org as { shared_bot_until?: string | null }).shared_bot_until;
        if (current === undefined) {
          return Response.json(
            { error: "Bu imkoniyat bazani yangilagandan keyin ishlaydi." },
            { status: 400 },
          );
        }
        const from = Math.max(Date.now(), current ? new Date(current).getTime() : 0);
        const until = new Date(from + days * 86_400_000).toISOString();
        const { error: upErr } = await supabaseAdmin
          .from("organizations")
          .update({ shared_bot_until: until })
          .eq("id", body.orgId);
        if (upErr) return Response.json({ error: upErr.message }, { status: 400 });
        return Response.json({ until });
      },
    },
  },
});
