import { createFileRoute } from "@tanstack/react-router";
import { readAmoOAuthState } from "@/lib/amocrm/oauth-state.server";
import { exchangeCodeForTokens, subscribeAmoWebhooks } from "@/lib/amocrm/client.server";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { companyOrigin } from "@/lib/subdomain";

export const Route = createFileRoute("/integrations/amocrm/callback")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const code = url.searchParams.get("code");
        // AmoCRM sends the account's subdomain back as `referer`, e.g. "mysubdomain.amocrm.ru".
        const referer = url.searchParams.get("referer");
        // Echoed back verbatim from the signed state we sent — see connect.ts.
        const state = url.searchParams.get("state");
        const organizationId = readAmoOAuthState(state);

        if (!code || !referer || !state) {
          return new Response(
            "AmoCRM did not send a code/referer/state. Open this page again from the AmoCRM integration screen.",
            { status: 400 },
          );
        }
        if (!organizationId) {
          return new Response(
            "Bu ulanish havolasi eskirgan yoki noto'g'ri. AmoCRM'ni platformadagi Integratsiyalar sahifasidan qaytadan ulang.",
            { status: 400, headers: { "content-type": "text/plain; charset=utf-8" } },
          );
        }

        try {
          const tokens = await exchangeCodeForTokens(code, referer, organizationId);
          const expiresAt = new Date(Date.now() + tokens.expires_in * 1000).toISOString();

          const { error: connError } = await supabaseAdmin.from("amocrm_connection").upsert({
            organization_id: organizationId,
            subdomain: referer,
            access_token: tokens.access_token,
            refresh_token: tokens.refresh_token,
            token_expires_at: expiresAt,
            connected_at: new Date().toISOString(),
            last_sync_error: null,
          });
          if (connError) throw connError;

          // Read-modify-write, not a blind overwrite: config also carries
          // this org's own client_id/client_secret (per-org AmoCRM
          // credentials), which a plain `.update({ config: {...} })` here
          // would silently wipe.
          const { data: existingSettings, error: fetchSettingsError } = await supabaseAdmin
            .from("integration_settings")
            .select("config")
            .eq("organization_id", organizationId)
            .eq("key", "amocrm")
            .maybeSingle();
          if (fetchSettingsError) throw fetchSettingsError;
          const currentSettingsConfig =
            (existingSettings?.config as Record<string, unknown> | null) ?? {};

          const { error: settingsError } = await supabaseAdmin
            .from("integration_settings")
            .update({
              enabled: true,
              config: { ...currentSettingsConfig, subdomain: referer },
            })
            .eq("organization_id", organizationId)
            .eq("key", "amocrm");
          if (settingsError) throw settingsError;

          // Best-effort: registers our endpoint with AmoCRM's own webhook
          // subscription API so lead/note/task changes push to us in near
          // real time. Never block the connection on this -- the periodic
          // sync (and the classic-webhook fallback) still work without it.
          try {
            await subscribeAmoWebhooks(organizationId);
          } catch (err) {
            console.error("AmoCRM webhook subscribe failed", err);
          }
        } catch (err) {
          const message = err instanceof Error ? err.message : "Unknown error";
          return new Response(`AmoCRM connection failed: ${message}`, { status: 500 });
        }

        // amoCRM sends everyone to the one registered callback on the root
        // domain, but a company with its own address is signed in there
        // (the session lives per address), so send them back to it.
        const { data: org } = await supabaseAdmin
          .from("organizations")
          .select("subdomain")
          .eq("id", organizationId)
          .maybeSingle();
        const back = org?.subdomain
          ? `${companyOrigin(org.subdomain)}/integrations/amocrm`
          : "/integrations/amocrm";
        return new Response(null, { status: 302, headers: { location: back } });
      },
    },
  },
});
