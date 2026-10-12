import { createFileRoute } from "@tanstack/react-router";
import { requirePlatformOwner } from "@/lib/auth.server";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

// Every company's integrations in one read for the platform owner's
// Integrations page: amoCRM, Bitrix24, telephony providers, SMS, outgoing
// webhooks, which of them are paused, and the latest sync runs. Secrets
// never leave the server -- only whether one is set.

const set = (v: unknown) => typeof v === "string" && v.length > 0;

export const Route = createFileRoute("/platform/integrations/overview")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const ownerId = await requirePlatformOwner(request);
        if (!ownerId) return Response.json({ error: "Unauthorized" }, { status: 403 });

        const [orgs, amo, bitrix, tel, sms, hooks, pauses, amoLogs, bxLogs] = await Promise.all([
          supabaseAdmin
            .from("organizations")
            .select("id, name, plan, active, frozen_at")
            .order("created_at", { ascending: true }),
          supabaseAdmin
            .from("amocrm_connection")
            .select(
              "organization_id, subdomain, connected_at, last_synced_at, last_sync_error, sync_in_progress, token_expires_at",
            ),
          supabaseAdmin
            .from("bitrix24_connection")
            .select(
              "organization_id, portal_domain, connected_at, last_synced_at, last_sync_error, sync_in_progress",
            ),
          supabaseAdmin
            .from("org_telephony_credentials")
            .select(
              "organization_id, provider, connected_at, last_event_at, pbx_domain, caller_id, api_key, api_secret",
            ),
          supabaseAdmin
            .from("org_sms_credentials")
            .select("organization_id, provider, email, sender_name, connected_at"),
          supabaseAdmin
            .from("org_webhook_destinations")
            .select("id, organization_id, name, url, enabled, created_at"),
          supabaseAdmin
            .from("integration_pauses")
            .select("organization_id, kind, paused_at, reason"),
          supabaseAdmin
            .from("amocrm_sync_log")
            .select(
              "organization_id, started_at, finished_at, synced_count, error, skipped, trigger",
            )
            .order("started_at", { ascending: false })
            .limit(300),
          supabaseAdmin
            .from("bitrix24_sync_log")
            .select(
              "organization_id, started_at, finished_at, synced_count, error, skipped, trigger",
            )
            .order("started_at", { ascending: false })
            .limit(300),
        ]);
        if (orgs.error) return Response.json({ error: orgs.error.message }, { status: 500 });

        const byOrg = <T extends { organization_id: string }>(rows: T[] | null | undefined) => {
          const map = new Map<string, T[]>();
          for (const r of rows ?? [])
            map.set(r.organization_id, [...(map.get(r.organization_id) ?? []), r]);
          return map;
        };
        const amoBy = byOrg(amo.data);
        const bxBy = byOrg(bitrix.data);
        const telBy = byOrg(tel.data);
        const smsBy = byOrg(sms.data);
        const hookBy = byOrg(hooks.data);
        const pauseBy = byOrg(pauses.data);
        const amoLogBy = byOrg(amoLogs.data);
        const bxLogBy = byOrg(bxLogs.data);

        const companies = (orgs.data ?? []).map((o) => ({
          id: o.id,
          name: o.name,
          plan: o.plan,
          active: o.active,
          frozen: o.frozen_at != null,
          amocrm: amoBy.get(o.id)?.[0] ?? null,
          amocrmLogs: (amoLogBy.get(o.id) ?? []).slice(0, 10),
          bitrix24: bxBy.get(o.id)?.[0] ?? null,
          bitrix24Logs: (bxLogBy.get(o.id) ?? []).slice(0, 10),
          telephony: (telBy.get(o.id) ?? []).map(({ api_key, api_secret, ...rest }) => ({
            ...rest,
            hasApiKey: set(api_key),
            hasApiSecret: set(api_secret),
          })),
          sms: smsBy.get(o.id)?.[0] ?? null,
          webhooks: hookBy.get(o.id) ?? [],
          pauses: (pauseBy.get(o.id) ?? []).map(({ kind, paused_at, reason }) => ({
            kind,
            pausedAt: paused_at,
            reason,
          })),
        }));
        return Response.json({ companies });
      },
    },
  },
});
