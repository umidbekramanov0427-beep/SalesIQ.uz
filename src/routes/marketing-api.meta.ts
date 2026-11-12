import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { requireMarketingMember } from "@/lib/marketing.server";
import { metaConfigured, metaStartUrl, metaSyncOrg } from "@/lib/meta-ads.server";

// Marketing paneli -> Manbalar -> Meta reklama.
//   GET                                   -> set up?, the connection (no token)
//   POST {action:"start", back}           -> {url} of Facebook's sign-in
//   POST {action:"select", accounts:[..]} -> which ad accounts are read
//   POST {action:"sync"}                  -> read the last 30 days now
//   POST {action:"disconnect"}            -> forget the token (spend stays)
export const Route = createFileRoute("/marketing-api/meta")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const caller = await requireMarketingMember(request);
        if (!caller) return Response.json({ error: "Forbidden" }, { status: 403 });
        const { data } = await supabaseAdmin
          .from("marketing_meta_accounts")
          .select("meta_user, expires_at, ad_accounts, selected, last_sync_at, last_error")
          .eq("organization_id", caller.organizationId)
          .maybeSingle();
        return Response.json({
          configured: metaConfigured(),
          account: data
            ? {
                user: data.meta_user,
                expiresAt: data.expires_at,
                adAccounts: Array.isArray(data.ad_accounts) ? data.ad_accounts : [],
                selected: data.selected ?? [],
                lastSyncAt: data.last_sync_at,
                lastError: data.last_error,
              }
            : null,
        });
      },
      POST: async ({ request }) => {
        const caller = await requireMarketingMember(request);
        if (!caller) return Response.json({ error: "Forbidden" }, { status: 403 });
        const body = (await request.json().catch(() => ({}))) as {
          action?: string;
          accounts?: string[];
          back?: string;
        };
        try {
          if (body.action === "disconnect") {
            await supabaseAdmin
              .from("marketing_meta_accounts")
              .delete()
              .eq("organization_id", caller.organizationId);
            return Response.json({ ok: true });
          }
          if (!metaConfigured())
            return Response.json({ error: "Meta ilovasi sozlanmagan" }, { status: 503 });
          if (body.action === "start") {
            // Back to the page that asked, on the same address.
            const origin = new URL(request.url).origin;
            const back = `${origin}/marketing/settings?tab=sources`;
            return Response.json({ url: metaStartUrl(caller.organizationId, caller.id, back) });
          }
          const { data: acc } = await supabaseAdmin
            .from("marketing_meta_accounts")
            .select("organization_id, token_sealed, ad_accounts, selected, last_sync_at")
            .eq("organization_id", caller.organizationId)
            .maybeSingle();
          if (!acc) return Response.json({ error: "Meta ulanmagan" }, { status: 400 });
          if (body.action === "select") {
            const known = new Set(
              (Array.isArray(acc.ad_accounts) ? acc.ad_accounts : []).map(
                (a) => (a as { id: string }).id,
              ),
            );
            const selected = (body.accounts ?? []).filter((id) => known.has(id)).slice(0, 20);
            await supabaseAdmin
              .from("marketing_meta_accounts")
              .update({ selected })
              .eq("organization_id", caller.organizationId);
            return Response.json({ ok: true });
          }
          if (body.action === "sync") {
            return Response.json({ rows: await metaSyncOrg(acc) });
          }
          return Response.json({ error: "Bad request" }, { status: 400 });
        } catch (err) {
          return Response.json(
            { error: err instanceof Error ? err.message.slice(0, 300) : "Xatolik" },
            { status: 400 },
          );
        }
      },
    },
  },
});
