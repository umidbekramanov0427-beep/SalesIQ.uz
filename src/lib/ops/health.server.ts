import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { MAX_ANALYSIS_ATTEMPTS } from "@/lib/call-analysis-queue.server";
import { orgPhase } from "@/lib/org-access";
import {
  alertsFor,
  buildCompaniesList,
  buildErrorsReport,
  buildHealthReport,
  buildIntegrationsReport,
  OPS_HELP,
  type CompanyFacts,
  type OpsCommand,
  type PlatformFacts,
} from "@/lib/ops/health";
import { notifyOwners, sendToOwner } from "@/lib/ops/bot.server";

// Gathers the facts the monitoring bot judges (src/lib/ops/health.ts) in
// one round of parallel reads, and sends its reports and alerts:
//   - the morning report (09:00 Tashkent) and immediate alerts, from the
//     5-minute Telegram cron (runOpsTick);
//   - answers to the owner's commands (/holat, /kompaniyalar, ...).

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const MAX_ROWS = 20_000;

type Count = Map<string, number>;
const countBy = (rows: { organization_id: string | null }[] | null | undefined): Count => {
  const m: Count = new Map();
  for (const r of rows ?? []) {
    if (r.organization_id) m.set(r.organization_id, (m.get(r.organization_id) ?? 0) + 1);
  }
  return m;
};

export async function gatherHealth(now = Date.now()): Promise<{
  companies: CompanyFacts[];
  platform: PlatformFacts;
}> {
  const since24h = new Date(now - DAY).toISOString();
  const since1h = new Date(now - HOUR).toISOString();
  const since30d = new Date(now - 30 * DAY).toISOString();

  const [
    orgs,
    people,
    sessions,
    leads,
    analyzed,
    pending,
    failed,
    errors,
    amo,
    bitrix,
    tel,
    pauses,
    support,
  ] = await Promise.all([
    supabaseAdmin.from("organizations").select("*"),
    supabaseAdmin.from("profiles").select("organization_id, role").neq("role", "platform_owner"),
    supabaseAdmin
      .from("user_login_events")
      .select("organization_id, user_id, created_at, last_seen_at")
      .eq("kind", "session")
      .gte("created_at", since30d)
      .order("created_at", { ascending: false })
      .limit(MAX_ROWS),
    supabaseAdmin
      .from("leads")
      .select("organization_id")
      .gte("created_at", since24h)
      .limit(MAX_ROWS),
    supabaseAdmin
      .from("amocrm_calls")
      .select("organization_id")
      .gte("analyzed_at", since24h)
      .limit(MAX_ROWS),
    supabaseAdmin
      .from("amocrm_calls")
      .select("organization_id, occurred_at")
      .not("recording_url", "is", null)
      .is("analyzed_at", null)
      .is("analysis_error", null)
      .lt("analysis_attempts", MAX_ANALYSIS_ATTEMPTS)
      .gte("occurred_at", new Date(now - 7 * DAY).toISOString())
      .order("occurred_at", { ascending: true })
      .limit(MAX_ROWS),
    supabaseAdmin
      .from("amocrm_calls")
      .select("organization_id")
      .not("analysis_error", "is", null)
      .is("analyzed_at", null)
      .gte("synced_at", since24h)
      .limit(MAX_ROWS),
    supabaseAdmin
      .from("error_logs")
      .select("organization_id, source, route, message, created_at")
      .gte("created_at", since24h)
      .order("created_at", { ascending: false })
      .limit(5000),
    supabaseAdmin
      .from("amocrm_connection")
      .select(
        "organization_id, last_synced_at, last_sync_error, token_expires_at, sync_in_progress, sync_started_at",
      ),
    supabaseAdmin
      .from("bitrix24_connection")
      .select("organization_id, last_synced_at, last_sync_error"),
    supabaseAdmin
      .from("org_telephony_credentials")
      .select("organization_id, provider, last_event_at, connected_at"),
    supabaseAdmin.from("integration_pauses").select("organization_id, kind"),
    supabaseAdmin
      .from("support_messages")
      .select("user_id, direction, created_at")
      .gte("created_at", since30d)
      .order("created_at", { ascending: true })
      .limit(MAX_ROWS),
  ]);
  if (orgs.error) throw new Error(orgs.error.message);

  const users = countBy(people.data);
  const leadCount = countBy(leads.data);
  const analyzedCount = countBy(analyzed.data);
  const pendingCount = countBy(pending.data);
  const failedCount = countBy(failed.data);
  const errorCount = countBy(errors.data);

  const activity = new Map<string, { s24: number; users24: Set<string>; last: string | null }>();
  for (const s of sessions.data ?? []) {
    if (!s.organization_id) continue;
    const a = activity.get(s.organization_id) ?? { s24: 0, users24: new Set(), last: null };
    const seen = s.last_seen_at ?? s.created_at;
    if (!a.last || seen > a.last) a.last = seen;
    if (s.created_at >= since24h || seen >= since24h) {
      a.s24++;
      if (s.user_id) a.users24.add(s.user_id);
    }
    activity.set(s.organization_id, a);
  }

  const amoBy = new Map((amo.data ?? []).map((r) => [r.organization_id, r]));
  const bxBy = new Map((bitrix.data ?? []).map((r) => [r.organization_id, r]));
  const telBy = new Map<string, NonNullable<typeof tel.data>>();
  for (const t of tel.data ?? [])
    telBy.set(t.organization_id, [...(telBy.get(t.organization_id) ?? []), t]);
  const pausedBy = new Map<string, string[]>();
  for (const p of pauses.data ?? [])
    pausedBy.set(p.organization_id, [...(pausedBy.get(p.organization_id) ?? []), p.kind]);

  type OrgRow = {
    id: string;
    name: string;
    plan: string | null;
    active: boolean | null;
    is_trial?: boolean | null;
    trial_ends_at: string | null;
    frozen_at?: string | null;
  };
  const companies: CompanyFacts[] = ((orgs.data ?? []) as OrgRow[]).map((o) => {
    const a = activity.get(o.id);
    const amoRow = amoBy.get(o.id);
    const bxRow = bxBy.get(o.id);
    return {
      id: o.id,
      name: o.name,
      plan: o.plan,
      phase: orgPhase(o),
      frozen: !!o.frozen_at,
      endsAt: o.trial_ends_at,
      users: users.get(o.id) ?? 0,
      sessions24h: a?.s24 ?? 0,
      activeUsers24h: a?.users24.size ?? 0,
      lastSeenAt: a?.last ?? null,
      leads24h: leadCount.get(o.id) ?? 0,
      callsAnalyzed24h: analyzedCount.get(o.id) ?? 0,
      aiPending: pendingCount.get(o.id) ?? 0,
      aiFailed24h: failedCount.get(o.id) ?? 0,
      errors24h: errorCount.get(o.id) ?? 0,
      amocrm: amoRow
        ? {
            lastSyncedAt: amoRow.last_synced_at,
            error: amoRow.last_sync_error,
            tokenExpiresAt: amoRow.token_expires_at,
            syncInProgress: !!amoRow.sync_in_progress,
            syncStartedAt: amoRow.sync_started_at,
          }
        : null,
      bitrix24: bxRow ? { lastSyncedAt: bxRow.last_synced_at, error: bxRow.last_sync_error } : null,
      telephony: (telBy.get(o.id) ?? []).map((t) => ({
        provider: t.provider,
        lastEventAt: t.last_event_at,
        connectedAt: t.connected_at,
      })),
      paused: pausedBy.get(o.id) ?? [],
    };
  });

  // Errors: totals by kind and the most repeated ones.
  const errRows = errors.data ?? [];
  const groups = new Map<
    string,
    { route: string | null; message: string; count: number; source: string }
  >();
  for (const e of errRows) {
    // Slow requests differ only in their duration: one line per route.
    const slow = e.source === "slow_request";
    const k = `${e.source}|${e.route ?? ""}|${slow ? "" : e.message.slice(0, 160)}`;
    const g = groups.get(k);
    if (g) g.count++;
    else
      groups.set(k, {
        route: e.route,
        message: slow ? "Sekin javob berdi" : e.message,
        count: 1,
        source: e.source,
      });
  }

  // Support threads whose last word is the person's.
  const lastBy = new Map<string, string>();
  for (const m of support.data ?? []) lastBy.set(m.user_id, m.direction);

  const amoSyncs = (amo.data ?? []).map((r) => r.last_synced_at).filter(Boolean) as string[];
  const platform: PlatformFacts = {
    serverErrors1h: errRows.filter((e) => e.source === "server_error" && e.created_at >= since1h)
      .length,
    serverErrors24h: errRows.filter((e) => e.source === "server_error").length,
    slowRequests24h: errRows.filter((e) => e.source === "slow_request").length,
    clientErrors24h: errRows.filter(
      (e) => e.source !== "server_error" && e.source !== "slow_request",
    ).length,
    topErrors: [...groups.values()].sort((a, b) => b.count - a.count).slice(0, 10),
    aiPending: pending.data?.length ?? 0,
    aiOldestPendingAt: pending.data?.[0]?.occurred_at ?? null,
    aiFailed24h: failed.data?.length ?? 0,
    supportWaiting: [...lastBy.values()].filter((d) => d === "in").length,
    newSignups24h: ((orgs.data ?? []) as { created_at: string }[]).filter(
      (o) => o.created_at >= since24h,
    ).length,
    lastAmoSyncAt: amoSyncs.sort().at(-1) ?? null,
    amoConnections: amo.data?.length ?? 0,
  };
  return { companies, platform };
}

/** The text answering one of the owner's commands. */
export async function answerOpsCommand(command: OpsCommand, origin: string): Promise<string> {
  if (command === "help") return OPS_HELP;
  const { companies, platform } = await gatherHealth();
  switch (command) {
    case "holat":
      return buildHealthReport({ companies, platform, url: `${origin}/platform/companies` });
    case "kompaniyalar":
      return buildCompaniesList(companies);
    case "integratsiyalar":
      return buildIntegrationsReport(companies);
    case "xatolar":
      return buildErrorsReport(platform, `${origin}/platform/errors`);
    case "yordam": {
      const { listSupportThreads } = await import("@/lib/support.server");
      const inbox = await listSupportThreads(30);
      const waiting = inbox.threads.filter((t) => t.waitingSince);
      if (!inbox.ready) return "Jonli yordam hali yoqilmagan (migratsiya qo'llanmagan).";
      if (!waiting.length) return "✅ Javob kutayotgan yordam so'rovi yo'q.";
      const esc = (s: string) =>
        s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
      return [
        `💬 <b>Javob kutayotganlar (${waiting.length})</b>`,
        ``,
        ...waiting
          .slice(0, 15)
          .map(
            (t) =>
              `• <b>${esc(t.name)}</b>${t.org ? ` (${esc(t.org.name)})` : ""}: ${esc(t.lastText.slice(0, 120))}`,
          ),
        ``,
        `Javob berish: ${origin}/platform/support`,
      ].join("\n");
    }
  }
}

/** Answers a command in the chat it came from. */
export async function replyToOpsCommand(
  chatId: number,
  command: OpsCommand,
  origin: string,
): Promise<void> {
  let text: string;
  try {
    text = await answerOpsCommand(command, origin);
  } catch (err) {
    text = `⚠️ Hisobotni tayyorlab bo'lmadi: ${err instanceof Error ? err.message : "xato"}`;
  }
  await sendToOwner(chatId, text).catch(() => undefined);
}

// The morning report goes out in the same 09:00 Tashkent window as the
// trial digest; alerts are checked every 15 minutes.
const REPORT_MINUTE = 9 * 60;
const WINDOW_MIN = 5;

/** Claims a log key; false when it was already sent (or the table is missing). */
async function claim(key: string): Promise<boolean> {
  const { error } = await supabaseAdmin.from("platform_ops_log").insert({ key });
  return !error;
}

/** Called by the 5-minute Telegram cron. */
export async function runOpsTick(origin: string, now = Date.now()): Promise<void> {
  const tashkent = new Date(now + 5 * HOUR);
  const minute = tashkent.getUTCHours() * 60 + tashkent.getUTCMinutes();
  const reportDue = minute >= REPORT_MINUTE && minute < REPORT_MINUTE + WINDOW_MIN;
  const alertsDue = minute % 15 < WINDOW_MIN;
  if (!reportDue && !alertsDue) return;

  const { companies, platform } = await gatherHealth(now);
  if (reportDue && (await claim(`daily:${tashkent.toISOString().slice(0, 10)}`))) {
    await notifyOwners(
      buildHealthReport({ companies, platform, url: `${origin}/platform/companies` }, now),
    );
  }
  if (alertsDue) {
    for (const alert of alertsFor(companies, platform, now)) {
      if (await claim(alert.key)) await notifyOwners(alert.text);
    }
  }
}
