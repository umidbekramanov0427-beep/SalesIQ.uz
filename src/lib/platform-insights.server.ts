import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { orgPhase, trialDaysLeft } from "@/lib/org-access";
import { notifyPlatformOwners } from "@/lib/owner-alerts.server";
import {
  buildTrialDigest,
  daysSince,
  scoreTrial,
  stoppedAt,
  FUNNEL_STEPS,
  type FunnelStep,
  type TrialScore,
} from "@/lib/trial-score";
import { decorate, isOnline, ONLINE_MS, type SessionRow } from "@/lib/visits.server";

// The platform owner's view of how companies use the platform, behind the
// Tashriflar page's tabs and the daily Telegram digest:
//   - trials: an engagement score per company on its free trial;
//   - funnel: how far every company got (sign-up → bot → lead → integration → paid);
//   - online: who is in the app right now and on which page;
//   - usage: one company's daily sign-ins, sections used and people.

const DAY = 86_400_000;

type OrgRow = {
  id: string;
  name: string;
  plan: string | null;
  active: boolean | null;
  is_trial?: boolean | null;
  trial_ends_at: string | null;
  frozen_at?: string | null;
  created_at: string;
};

type LoginRow = {
  organization_id: string | null;
  user_id: string | null;
  created_at: string;
  last_seen_at: string | null;
};

async function loadOrgs(): Promise<OrgRow[]> {
  // "*": is_trial / frozen_at may predate their migrations on an old database.
  const { data, error } = await supabaseAdmin.from("organizations").select("*");
  if (error) throw error;
  return (data ?? []) as OrgRow[];
}

/** Organization ids with at least one integration connected. */
export async function integrationsByOrg(): Promise<Map<string, string[]>> {
  const tables = [
    ["amocrm_connection", "amoCRM"],
    ["bitrix24_connection", "Bitrix24"],
    ["org_telephony_credentials", "Telefoniya"],
    ["org_sms_credentials", "SMS"],
    ["instagram_accounts", "Instagram"],
  ] as const;
  const results = await Promise.all(
    tables.map(([table]) => supabaseAdmin.from(table).select("organization_id")),
  );
  const map = new Map<string, string[]>();
  results.forEach((r, i) => {
    for (const row of (r.data ?? []) as { organization_id: string | null }[]) {
      if (!row.organization_id) continue;
      map.set(row.organization_id, [...(map.get(row.organization_id) ?? []), tables[i]![1]]);
    }
  });
  return map;
}

async function leadCounts(orgIds: string[]): Promise<Map<string, number>> {
  const counts = await Promise.all(
    orgIds.map(async (id) => {
      const { count } = await supabaseAdmin
        .from("leads")
        .select("id", { count: "exact", head: true })
        .eq("organization_id", id);
      return [id, count ?? 0] as const;
    }),
  );
  return new Map(counts);
}

async function companyPeople(orgIds: string[]) {
  if (!orgIds.length) return [];
  const { data } = await supabaseAdmin
    .from("profiles")
    .select("id, organization_id, role, telegram_chat_id, phone_verified_at")
    .in("organization_id", orgIds);
  return (data ?? []).filter((p) => p.role !== "platform_owner");
}

async function recentSessions(orgIds: string[], days: number): Promise<LoginRow[]> {
  if (!orgIds.length) return [];
  const { data } = await supabaseAdmin
    .from("user_login_events")
    .select("organization_id, user_id, created_at, last_seen_at")
    .eq("kind", "session")
    .in("organization_id", orgIds)
    .gte("created_at", new Date(Date.now() - days * DAY).toISOString())
    .limit(20000);
  return (data ?? []) as LoginRow[];
}

/* ------------------------------------------------------------------ */
/* Trials                                                              */
/* ------------------------------------------------------------------ */

export type TrialHealth = TrialScore & {
  org: { id: string; name: string; createdAt: string; trialEndsAt: string | null };
  daysLeft: number | null;
  idleDays: number | null;
  sessions7d: number;
  activeUsers7d: number;
  users: number;
  leads: number;
  integrations: string[];
  lastSeenAt: string | null;
};

export async function loadTrialHealth(): Promise<{
  trials: TrialHealth[];
  expiredUnpaid: { id: string; name: string; trialEndsAt: string | null }[];
  newSignupsYesterday: number;
}> {
  const orgs = await loadOrgs();
  const trialOrgs = orgs.filter((o) => !o.frozen_at && orgPhase(o) === "trial");
  const ids = trialOrgs.map((o) => o.id);
  const [people, sessions, leads, integrations, paid] = await Promise.all([
    companyPeople(ids),
    recentSessions(ids, 30),
    leadCounts(ids),
    integrationsByOrg(),
    supabaseAdmin
      .from("platform_subscription_payments")
      .select("organization_id")
      .eq("status", "paid"),
  ]);
  const paidOrgs = new Set((paid.data ?? []).map((p) => p.organization_id));
  const weekAgo = Date.now() - 7 * DAY;

  const trials = trialOrgs.map((o): TrialHealth => {
    const own = sessions.filter((s) => s.organization_id === o.id);
    const week = own.filter((s) => new Date(s.created_at).getTime() >= weekAgo);
    const lastSeenAt =
      own
        .map((s) => s.last_seen_at ?? s.created_at)
        .sort()
        .at(-1) ?? null;
    const activity = {
      sessions7d: week.length,
      activeUsers7d: new Set(week.map((s) => s.user_id)).size,
      users: people.filter((p) => p.organization_id === o.id).length,
      leads: leads.get(o.id) ?? 0,
      integrations: (integrations.get(o.id) ?? []).length,
      lastSeenAt,
    };
    return {
      ...scoreTrial(activity),
      ...activity,
      integrations: integrations.get(o.id) ?? [],
      org: { id: o.id, name: o.name, createdAt: o.created_at, trialEndsAt: o.trial_ends_at },
      daysLeft: trialDaysLeft(o),
      idleDays: daysSince(lastSeenAt),
    };
  });
  trials.sort((a, b) => b.score - a.score);

  const now = Date.now();
  const expiredUnpaid = orgs
    .filter(
      (o) =>
        o.is_trial &&
        !o.frozen_at &&
        o.trial_ends_at &&
        new Date(o.trial_ends_at).getTime() < now &&
        new Date(o.trial_ends_at).getTime() > now - 7 * DAY &&
        !paidOrgs.has(o.id),
    )
    .map((o) => ({ id: o.id, name: o.name, trialEndsAt: o.trial_ends_at }));

  // "Yesterday" on the Tashkent clock (UTC+5).
  const tz = 5 * 3_600_000;
  const todayStart = Math.floor((now + tz) / DAY) * DAY - tz;
  const newSignupsYesterday = orgs.filter((o) => {
    const t = new Date(o.created_at).getTime();
    return t >= todayStart - DAY && t < todayStart;
  }).length;

  return { trials, expiredUnpaid, newSignupsYesterday };
}

/* ------------------------------------------------------------------ */
/* Daily digest                                                        */
/* ------------------------------------------------------------------ */

// Sent once a day at 09:00 Tashkent time from the 5-minute Telegram cron.
const DIGEST_MINUTE = 9 * 60;
const DIGEST_WINDOW_MIN = 5;

export async function buildOwnerDigest(origin: string): Promise<string | null> {
  const { trials, expiredUnpaid, newSignupsYesterday } = await loadTrialHealth();
  return buildTrialDigest(
    trials.map((t) => ({
      name: t.org.name,
      temp: t.temp,
      score: t.score,
      daysLeft: t.daysLeft,
      idleDays: t.idleDays,
      sessions7d: t.sessions7d,
      activeUsers7d: t.activeUsers7d,
      leads: t.leads,
      integrations: t.integrations.length,
    })),
    {
      newSignups: newSignupsYesterday,
      expiredUnpaid: expiredUnpaid.map((o) => o.name),
      url: `${origin}/platform/sessions?tab=trials`,
    },
  );
}

export async function sendOwnerDigest(origin: string): Promise<boolean> {
  const text = await buildOwnerDigest(origin);
  if (!text) return false;
  await notifyPlatformOwners(text);
  return true;
}

/** Called by the 5-minute cron: sends the digest once, in the 09:00 window. */
export async function sendOwnerDigestIfDue(origin: string): Promise<void> {
  const tashkent = new Date(Date.now() + 5 * 3_600_000);
  const minute = tashkent.getUTCHours() * 60 + tashkent.getUTCMinutes();
  if (minute < DIGEST_MINUTE || minute >= DIGEST_MINUTE + DIGEST_WINDOW_MIN) return;
  // One row per day: a second cron tick in the same window finds it taken.
  // Before its migration has run the window alone keeps it to one send.
  const { error } = await supabaseAdmin
    .from("platform_digest_log")
    .insert({ digest_date: tashkent.toISOString().slice(0, 10) });
  if (error && !/platform_digest_log|does not exist|schema cache/i.test(error.message)) return;
  await sendOwnerDigest(origin);
}

/* ------------------------------------------------------------------ */
/* Funnel                                                              */
/* ------------------------------------------------------------------ */

export type FunnelCompany = {
  id: string;
  name: string;
  createdAt: string;
  phase: "trial" | "paid" | "expired";
  frozen: boolean;
  done: Record<FunnelStep, boolean>;
  stoppedAt: FunnelStep | null;
};

export async function loadFunnel(days: number | null) {
  const since = days ? Date.now() - days * DAY : 0;
  const orgs = (await loadOrgs()).filter((o) => new Date(o.created_at).getTime() >= since);
  const ids = orgs.map((o) => o.id);
  const [people, leads, integrations, paid] = await Promise.all([
    companyPeople(ids),
    leadCounts(ids),
    integrationsByOrg(),
    supabaseAdmin
      .from("platform_subscription_payments")
      .select("organization_id")
      .eq("status", "paid"),
  ]);
  const paidOrgs = new Set((paid.data ?? []).map((p) => p.organization_id));
  const companies = orgs
    .map((o): FunnelCompany => {
      const phase = orgPhase(o);
      const done: Record<FunnelStep, boolean> = {
        signed_up: true,
        bot_linked: people.some(
          (p) => p.organization_id === o.id && p.telegram_chat_id && p.phone_verified_at,
        ),
        first_lead: (leads.get(o.id) ?? 0) > 0,
        integration: integrations.has(o.id),
        paid: paidOrgs.has(o.id) || phase === "paid",
      };
      return {
        id: o.id,
        name: o.name,
        createdAt: o.created_at,
        phase,
        frozen: !!o.frozen_at,
        done,
        stoppedAt: stoppedAt(done),
      };
    })
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const steps = FUNNEL_STEPS.map((step) => ({
    step,
    reached: companies.filter((c) => c.done[step]).length,
    stoppedHere: companies.filter((c) => c.stoppedAt === step).length,
  }));
  return { total: companies.length, steps, companies };
}

/* ------------------------------------------------------------------ */
/* Online now                                                          */
/* ------------------------------------------------------------------ */

export async function loadOnline() {
  const { data, error } = await supabaseAdmin
    .from("user_login_events")
    .select("*")
    .eq("kind", "session")
    .gte("last_seen_at", new Date(Date.now() - ONLINE_MS).toISOString())
    .order("last_seen_at", { ascending: false })
    .limit(200);
  if (error) throw error;
  const rows = ((data ?? []) as SessionRow[]).filter(isOnline);
  const sessions = (await decorate(rows)).filter((s) => s.user?.role !== "platform_owner");
  const ids = sessions.map((s) => s.id);
  const { data: pages } = ids.length
    ? await supabaseAdmin
        .from("user_session_events")
        .select("session_id, path, label, created_at")
        .in("session_id", ids)
        .eq("kind", "page")
        .order("created_at", { ascending: false })
        .limit(2000)
    : { data: [] as { session_id: string; path: string | null; label: string }[] };
  const current = new Map<string, string>();
  for (const p of pages ?? []) {
    if (!current.has(p.session_id)) current.set(p.session_id, p.path ?? p.label);
  }
  return { sessions: sessions.map((s) => ({ ...s, currentPath: current.get(s.id) ?? null })) };
}

/* ------------------------------------------------------------------ */
/* One company's usage                                                 */
/* ------------------------------------------------------------------ */

export async function loadOrgUsage(orgId: string, days = 30) {
  const { data: org } = await supabaseAdmin
    .from("organizations")
    .select("*")
    .eq("id", orgId)
    .maybeSingle();
  if (!org) return null;
  const o = org as OrgRow;
  const since = new Date(Date.now() - days * DAY).toISOString();
  const [sessions, events, audit, people] = await Promise.all([
    supabaseAdmin
      .from("user_login_events")
      .select("id, user_id, created_at, last_seen_at")
      .eq("organization_id", orgId)
      .eq("kind", "session")
      .gte("created_at", since)
      .limit(20000),
    supabaseAdmin
      .from("user_session_events")
      .select("user_id, kind, label, path")
      .eq("organization_id", orgId)
      .in("kind", ["page", "action"])
      .gte("created_at", since)
      .limit(50000),
    supabaseAdmin
      .from("audit_logs")
      .select("actor_id")
      .eq("organization_id", orgId)
      .gte("created_at", since)
      .limit(50000),
    supabaseAdmin
      .from("profiles")
      .select("id, full_name, email, role, is_intern")
      .eq("organization_id", orgId),
  ]);

  // Daily sign-ins on the Tashkent calendar, oldest first, empty days included.
  const tz = 5 * 3_600_000;
  const dayKey = (t: number) => new Date(t + tz).toISOString().slice(0, 10);
  const byDay = new Map<string, { sessions: number; users: Set<string> }>();
  for (let i = days - 1; i >= 0; i--) {
    byDay.set(dayKey(Date.now() - i * DAY), { sessions: 0, users: new Set() });
  }
  for (const s of sessions.data ?? []) {
    const d = byDay.get(dayKey(new Date(s.created_at).getTime()));
    if (!d) continue;
    d.sessions++;
    if (s.user_id) d.users.add(s.user_id);
  }

  const pages = new Map<string, number>();
  const actions = new Map<string, number>();
  for (const e of events.data ?? []) {
    if (e.kind === "page") {
      const key = e.path ?? e.label;
      pages.set(key, (pages.get(key) ?? 0) + 1);
    } else if (!e.label.startsWith("alert:") && e.label !== "first_sign_in") {
      actions.set(e.label, (actions.get(e.label) ?? 0) + 1);
    }
  }

  const employees = (people.data ?? [])
    .filter((p) => p.role !== "platform_owner")
    .map((p) => {
      const own = (sessions.data ?? []).filter((s) => s.user_id === p.id);
      return {
        id: p.id,
        name: p.full_name || p.email,
        email: p.email,
        role: p.role,
        isIntern: p.is_intern === true,
        sessions: own.length,
        pages: (events.data ?? []).filter((e) => e.user_id === p.id && e.kind === "page").length,
        changes: (audit.data ?? []).filter((a) => a.actor_id === p.id).length,
        lastSeenAt:
          own
            .map((s) => s.last_seen_at ?? s.created_at)
            .sort()
            .at(-1) ?? null,
      };
    })
    .sort((a, b) => b.sessions + b.changes - (a.sessions + a.changes));

  return {
    org: {
      id: o.id,
      name: o.name,
      phase: orgPhase(o),
      trialEndsAt: o.trial_ends_at,
      createdAt: o.created_at,
    },
    days,
    daily: [...byDay.entries()].map(([date, d]) => ({
      date,
      sessions: d.sessions,
      users: d.users.size,
    })),
    pages: [...pages.entries()]
      .map(([path, count]) => ({ path, count }))
      .sort((a, b) => b.count - a.count),
    actions: [...actions.entries()]
      .map(([label, count]) => ({ label, count }))
      .sort((a, b) => b.count - a.count),
    employees,
  };
}

/* ------------------------------------------------------------------ */
/* Close a session                                                     */
/* ------------------------------------------------------------------ */

/**
 * Signs the visit's person out: the auth session behind it (or, for a visit
 * recorded before sessions were tracked, every session of that person) is
 * deleted, so its refresh token stops working, and the open tab is told on
 * its next heartbeat to sign out.
 */
export async function closeVisit(id: string): Promise<{ scope: "session" | "all" }> {
  const { data: row, error } = await supabaseAdmin
    .from("user_login_events")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  const r = row as (SessionRow & { auth_session_id?: string | null }) | null;
  if (!r?.user_id) throw new Error("Bu tashrif seansi topilmadi");
  const authSession = r.auth_session_id ?? null;
  const { error: rpcError } = await supabaseAdmin.rpc("platform_revoke_auth_sessions", {
    p_user: r.user_id,
    p_auth_session: authSession,
  });
  if (rpcError) {
    throw new Error(
      /platform_revoke_auth_sessions|does not exist|schema cache/i.test(rpcError.message)
        ? "Seansni yopish uchun bazaga yangi migratsiya qo'llanishi kerak"
        : rpcError.message,
    );
  }
  const now = new Date().toISOString();
  let update = supabaseAdmin.from("user_login_events").update({ revoked_at: now });
  update = authSession
    ? update.eq("id", id)
    : update.eq("user_id", r.user_id).is("revoked_at", null);
  await update;
  return { scope: authSession ? "session" : "all" };
}
