import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { requireSuperAdmin } from "@/lib/auth.server";

// GET /admin/ai-overview -> Admin → AI-agentlar va botlar: how much the
// company's AI did this month and last (calls analysed and their minutes,
// AI yordamchi questions, leads scored) and each salesbot with the rules
// that start it, its runs, finished runs and conversion (last 90 days).
// Super admin only; counts come from the tables the work already writes.

type Usage = { calls: number; minutes: number; questions: number; scored: number };

const monthStart = (offset: number) => {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth() + offset, 1).toISOString();
};

async function usageBetween(
  org: string,
  profileIds: string[],
  convIds: string[],
  from: string,
  to: string,
): Promise<Usage> {
  const [calls, scored, questions] = await Promise.all([
    supabaseAdmin
      .from("amocrm_calls")
      .select("duration_seconds")
      .eq("organization_id", org)
      .gte("analyzed_at", from)
      .lt("analyzed_at", to)
      .limit(20000),
    supabaseAdmin
      .from("leads")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", org)
      .gte("ai_scored_at", from)
      .lt("ai_scored_at", to),
    convIds.length && profileIds.length
      ? supabaseAdmin
          .from("ai_chat_messages")
          .select("id", { count: "exact", head: true })
          .in("conversation_id", convIds)
          .eq("role", "user")
          .gte("created_at", from)
          .lt("created_at", to)
      : Promise.resolve({ count: 0 }),
  ]);
  const rows = (calls.data ?? []) as { duration_seconds: number | null }[];
  return {
    calls: rows.length,
    minutes: Math.round(rows.reduce((s, r) => s + (r.duration_seconds ?? 0), 0) / 60),
    questions: questions.count ?? 0,
    scored: scored.count ?? 0,
  };
}

type Action = { type?: string; botId?: string };

export const Route = createFileRoute("/admin/ai-overview")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const admin = await requireSuperAdmin(request);
        if (!admin) return Response.json({ error: "Unauthorized" }, { status: 403 });
        const org = admin.organizationId;

        const { data: people } = await supabaseAdmin
          .from("profiles")
          .select("id")
          .eq("organization_id", org);
        const profileIds = (people ?? []).map((p) => p.id);
        const { data: convs } = profileIds.length
          ? await supabaseAdmin
              .from("ai_chat_conversations")
              .select("id")
              .in("profile_id", profileIds)
              .limit(5000)
          : { data: [] };
        const convIds = (convs ?? []).map((c) => c.id);

        const since = new Date(Date.now() - 90 * 86_400_000).toISOString();
        const [thisMonth, lastMonth, bots, rules, runs, stages] = await Promise.all([
          usageBetween(org, profileIds, convIds, monthStart(0), monthStart(1)),
          usageBetween(org, profileIds, convIds, monthStart(-1), monthStart(0)),
          supabaseAdmin
            .from("salesbots")
            .select("id, name, kind, channel, enabled, updated_at")
            .eq("organization_id", org)
            .order("created_at", { ascending: true }),
          supabaseAdmin
            .from("automation_rules")
            .select("id, name, enabled, trigger_type, trigger_stage_id, actions")
            .eq("organization_id", org),
          supabaseAdmin
            .from("salesbot_runs")
            .select("bot_id, status")
            .eq("organization_id", org)
            .gte("started_at", since)
            .limit(20000),
          supabaseAdmin
            .from("pipeline_stages")
            .select("id, name, pipeline_name")
            .eq("organization_id", org),
        ]);

        const stageName = new Map(
          (stages.data ?? []).map((s) => [
            s.id,
            [s.pipeline_name, s.name].filter(Boolean).join(" · "),
          ]),
        );
        const triggers = new Map<string, { type: string; stage: string | null; on: boolean }[]>();
        for (const r of rules.data ?? []) {
          const acts = Array.isArray(r.actions) ? (r.actions as Action[]) : [];
          for (const a of acts) {
            if (a?.type !== "start_salesbot" || !a.botId) continue;
            const list = triggers.get(a.botId) ?? [];
            list.push({
              type: r.trigger_type,
              stage: r.trigger_stage_id ? (stageName.get(r.trigger_stage_id) ?? null) : null,
              on: r.enabled,
            });
            triggers.set(a.botId, list);
          }
        }
        const stats = new Map<string, { runs: number; done: number }>();
        for (const r of runs.data ?? []) {
          const s = stats.get(r.bot_id) ?? { runs: 0, done: 0 };
          s.runs += 1;
          if (r.status === "done") s.done += 1;
          stats.set(r.bot_id, s);
        }

        return Response.json({
          usage: { thisMonth, lastMonth },
          bots: (bots.data ?? []).map((b) => ({
            id: b.id,
            name: b.name,
            kind: b.kind,
            channel: b.channel,
            enabled: b.enabled,
            triggers: triggers.get(b.id) ?? [],
            runs: stats.get(b.id)?.runs ?? 0,
            done: stats.get(b.id)?.done ?? 0,
          })),
        });
      },
    },
  },
});
