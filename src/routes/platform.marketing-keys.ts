import { createFileRoute } from "@tanstack/react-router";
import { requirePlatformOwner } from "@/lib/auth.server";

// Platforma -> Sozlamalar -> Marketing: the marketing panel's platform keys.
//   GET  -> { ready, meta: { source, appId, redirectUri }, youtube: { cookies },
//             tglive: { configured, up } }  (never a secret)
//   POST {action: "meta", appId, secret?}   saves the Meta app (secret sealed)
//   POST {action: "meta-clear"}             forgets the saved Meta app
//   POST {action: "cookies", text}          saves YouTube's cookies.txt (sealed)
//   POST {action: "cookies-clear"}
//   POST {action: "yt-test", url}           a frame of that stream now, or why not
const YT_ID =
  /(?:v=|youtu\.be\/|\/live\/|\/shorts\/|\/embed\/)([A-Za-z0-9_-]{11})|^([A-Za-z0-9_-]{11})$/;

export const Route = createFileRoute("/platform/marketing-keys")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        if (!(await requirePlatformOwner(request)))
          return Response.json({ error: "Unauthorized" }, { status: 401 });
        const p = await import("@/lib/platform-integrations.server");
        const meta = await import("@/lib/meta-ads.server");
        const tg = await import("@/lib/tg-live.server");
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        await p.refreshPlatformIntegrations(true);
        const probe = await supabaseAdmin
          .from("platform_private")
          .select("youtube_cookies_sealed")
          .limit(1);
        const source = meta.metaAppSource();
        return Response.json({
          ready: !probe.error,
          meta: {
            source,
            appId: source === "panel" ? p.savedMetaApp().id : null,
            redirectUri: meta.metaRedirectUri(),
          },
          youtube: { cookies: !!p.youtubeCookies() },
          tglive: { configured: tg.tgLiveConfigured(), up: await tg.tgLiveHealth() },
        });
      },
      POST: async ({ request }) => {
        if (!(await requirePlatformOwner(request)))
          return Response.json({ error: "Unauthorized" }, { status: 401 });
        const body = (await request.json().catch(() => ({}))) as {
          action?: string;
          appId?: string;
          secret?: string;
          text?: string;
          url?: string;
        };
        const p = await import("@/lib/platform-integrations.server");
        try {
          if (body.action === "meta") {
            await p.saveMetaApp(String(body.appId ?? ""), body.secret ? String(body.secret) : null);
            return Response.json({ ok: true });
          }
          if (body.action === "meta-clear") {
            await p.saveMetaApp(null, null);
            return Response.json({ ok: true });
          }
          if (body.action === "cookies") {
            await p.saveYoutubeCookies(String(body.text ?? ""));
            return Response.json({ ok: true });
          }
          if (body.action === "cookies-clear") {
            await p.saveYoutubeCookies(null);
            return Response.json({ ok: true });
          }
          if (body.action === "yt-test") {
            const m = YT_ID.exec(String(body.url ?? "").trim());
            const id = m?.[1] ?? m?.[2];
            if (!id)
              return Response.json(
                {
                  error:
                    "YouTube video havolasini kiriting (youtube.com/watch?v=… yoki youtu.be/…)",
                },
                { status: 400 },
              );
            const tg = await import("@/lib/tg-live.server");
            if (!tg.tgLiveConfigured())
              return Response.json({ ok: false, error: "tg-live serverda sozlanmagan" });
            return Response.json(await tg.ytTest(id));
          }
          return Response.json({ error: "Unknown action" }, { status: 400 });
        } catch (e) {
          return Response.json(
            { error: e instanceof Error ? e.message : String(e) },
            { status: 400 },
          );
        }
      },
    },
  },
});
