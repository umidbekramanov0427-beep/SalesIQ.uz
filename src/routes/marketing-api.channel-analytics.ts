import { createFileRoute } from "@tanstack/react-router";
import { requireMarketingMember } from "@/lib/marketing.server";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  channelAnalytics,
  parseTgStats,
  type ChannelDayRow,
  type ChannelEvent,
  type TgStatsRaw,
} from "@/lib/channel-analytics";
import { rulesOf, marketingRulesFor } from "@/lib/marketing-rules.server";

// GET /marketing-api/channel-analytics?id=<channel>&from=YYYY-MM-DD&to=YYYY-MM-DD
// -> one channel's analytics (src/lib/channel-analytics.ts): joined / left
// per day, when people join and leave, how soon newcomers leave, invite
// links, and Telegram's own statistics when the company's account reads
// them; plus where the figures come from (bot admin, account).

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
const MAX_EVENTS = 30_000;

export const Route = createFileRoute("/marketing-api/channel-analytics")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const caller = await requireMarketingMember(request);
        if (!caller) return Response.json({ error: "Forbidden" }, { status: 403 });
        const url = new URL(request.url);
        const id = url.searchParams.get("id") ?? "";
        const from = url.searchParams.get("from") ?? "";
        const to = url.searchParams.get("to") ?? "";
        if (!id || !DAY_RE.test(from) || !DAY_RE.test(to) || from > to) {
          return Response.json({ error: "Bad request" }, { status: 400 });
        }
        const orgId = caller.organizationId;
        const { data: channel, error } = await supabaseAdmin
          .from("marketing_channels")
          .select("*")
          .eq("organization_id", orgId)
          .eq("id", id)
          .maybeSingle();
        if (error || !channel) return Response.json({ error: "Not found" }, { status: 404 });
        const ch = channel as typeof channel & {
          bot_admin?: boolean | null;
          tg_stats?: unknown;
          tg_stats_at?: string | null;
          tg_stats_error?: string | null;
        };

        // The day before the period too, for the first day's change.
        const dayBefore = new Date(Date.parse(`${from}T00:00:00Z`) - 86_400_000)
          .toISOString()
          .slice(0, 10);
        let daysRes = await supabaseAdmin
          .from("marketing_channel_days")
          .select("day, members, joined, left_count")
          .eq("channel_id", id)
          .gte("day", dayBefore)
          .lte("day", to)
          .order("day");
        const migrated = !daysRes.error;
        if (daysRes.error) {
          daysRes = (await supabaseAdmin
            .from("marketing_channel_days")
            .select("day, members")
            .eq("channel_id", id)
            .gte("day", dayBefore)
            .lte("day", to)
            .order("day")) as typeof daysRes;
        }
        const days = (daysRes.data ?? []) as ChannelDayRow[];

        const events: ChannelEvent[] = [];
        if (migrated) {
          const start = new Date(`${from}T00:00:00+05:00`).toISOString();
          const end = new Date(Date.parse(`${to}T00:00:00+05:00`) + 86_400_000).toISOString();
          for (let off = 0; off < MAX_EVENTS; off += 1000) {
            const { data, error: evErr } = await supabaseAdmin
              .from("marketing_channel_events")
              .select("at, kind, tg_user_id, invite_link, invite_name")
              .eq("channel_id", id)
              .gte("at", start)
              .lt("at", end)
              .order("at", { ascending: false })
              .range(off, off + 999);
            if (evErr || !data?.length) break;
            events.push(...(data as ChannelEvent[]));
            if (data.length < 1000) break;
          }
        }

        const rules = rulesOf(await marketingRulesFor([orgId]), orgId);
        const stats = parseTgStats(ch.tg_stats as TgStatsRaw | null);
        const { data: account } = await supabaseAdmin
          .from("marketing_tg_accounts")
          .select("status")
          .eq("organization_id", orgId)
          .maybeSingle();

        return Response.json({
          migrated,
          rules,
          analytics: channelAnalytics({
            from,
            to,
            days,
            events,
            stats,
            quickLeaveH: rules.channels.quickLeaveH,
          }),
          stats,
          source: {
            botAdmin: ch.bot_admin ?? null,
            account: account ? (account.status as string) : null,
            statsAt: ch.tg_stats_at ?? null,
            statsError: ch.tg_stats_error ?? null,
          },
        });
      },
    },
  },
});
