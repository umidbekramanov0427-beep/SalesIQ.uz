import { createFileRoute } from "@tanstack/react-router";
import { requirePlatformOwner } from "@/lib/auth.server";
import { parseMeetingSettings } from "@/lib/company-leads";

// Owner -> Sozlamalar -> Suhbat vaqtlari: when companies can book their
// call at sign-up (platform_settings.meeting_settings).
//   GET  -> { ready, settings }      POST {settings} -> { ok, settings }
export const Route = createFileRoute("/platform/meeting-settings")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        if (!(await requirePlatformOwner(request)))
          return Response.json({ error: "Unauthorized" }, { status: 401 });
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data } = await supabaseAdmin.from("platform_settings").select("*").maybeSingle();
        const raw = data as { meeting_settings?: unknown } | null;
        return Response.json({
          ready: !!raw && "meeting_settings" in raw,
          settings: parseMeetingSettings(raw?.meeting_settings),
        });
      },
      POST: async ({ request }) => {
        if (!(await requirePlatformOwner(request)))
          return Response.json({ error: "Unauthorized" }, { status: 401 });
        const body = (await request.json().catch(() => ({}))) as { settings?: unknown };
        const settings = parseMeetingSettings(body.settings);
        if (settings.from >= settings.to)
          return Response.json(
            { error: "Tugash vaqti boshlanishdan keyin bo'lsin" },
            { status: 400 },
          );
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { error } = await supabaseAdmin
          .from("platform_settings")
          .update({ meeting_settings: settings })
          .eq("id", true);
        if (error)
          return Response.json(
            {
              error: /meeting_settings|schema cache|column/.test(error.message)
                ? "Bu imkoniyat bazani yangilagandan keyin ishlaydi."
                : error.message,
            },
            { status: 400 },
          );
        return Response.json({ ok: true, settings });
      },
    },
  },
});
