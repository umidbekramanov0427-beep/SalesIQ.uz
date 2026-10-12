import { supabaseAdmin } from "@/integrations/supabase/client.server";

// Reads behind the platform owner's visits report (/platform/sessions):
// sign-in sessions with who, which company and where, and what happened
// in each. Successful data changes come from audit_logs and browser errors
// from error_logs, matched by user and the session's time window.

// A session counts as active until 5 minutes after its last event.
export const SESSION_TAIL_MS = 5 * 60_000;
// Online: the tab sent its once-a-minute heartbeat this recently.
export const ONLINE_MS = 150_000;

export type VisitSession = {
  id: string;
  kind: string;
  createdAt: string;
  lastSeenAt: string | null;
  device: string | null;
  userAgent: string | null;
  ip: string | null;
  city: string | null;
  region: string | null;
  country: string | null;
  emailAttempted: string | null;
  online: boolean;
  revokedAt: string | null;
  user: { id: string; name: string; email: string; role: string; isIntern: boolean } | null;
  org: {
    id: string;
    name: string;
    plan: string;
    trial: boolean;
    frozen: boolean;
    active: boolean;
  } | null;
};

// "*" rather than a column list: revoked_at / auth_session_id only exist
// once their migration has run, and naming them would fail the query.
export const SESSION_COLUMNS = "*";

export type SessionRow = {
  id: string;
  user_id: string | null;
  organization_id: string | null;
  kind: string;
  email_attempted: string | null;
  device_label: string | null;
  user_agent: string | null;
  ip: string | null;
  city: string | null;
  region: string | null;
  country: string | null;
  created_at: string;
  last_seen_at: string | null;
  revoked_at?: string | null;
};

export function isOnline(row: {
  last_seen_at: string | null;
  revoked_at?: string | null;
}): boolean {
  return (
    !row.revoked_at &&
    !!row.last_seen_at &&
    Date.now() - new Date(row.last_seen_at).getTime() < ONLINE_MS
  );
}

export function sessionEnd(row: { created_at: string; last_seen_at: string | null }): number {
  return new Date(row.last_seen_at ?? row.created_at).getTime() + SESSION_TAIL_MS;
}

export async function decorate(rows: SessionRow[]): Promise<VisitSession[]> {
  const userIds = [...new Set(rows.map((r) => r.user_id).filter((v): v is string => !!v))];
  const orgIds = [...new Set(rows.map((r) => r.organization_id).filter((v): v is string => !!v))];
  const [profiles, orgs] = await Promise.all([
    userIds.length
      ? supabaseAdmin
          .from("profiles")
          .select("id, full_name, email, role, is_intern")
          .in("id", userIds)
      : Promise.resolve({ data: [] as never[] }),
    orgIds.length
      ? supabaseAdmin
          .from("organizations")
          .select("id, name, plan, is_trial, active, frozen_at")
          .in("id", orgIds)
      : Promise.resolve({ data: [] as never[] }),
  ]);
  const p = new Map((profiles.data ?? []).map((x) => [x.id, x]));
  const o = new Map((orgs.data ?? []).map((x) => [x.id, x]));
  return rows.map((r) => {
    const prof = r.user_id ? p.get(r.user_id) : undefined;
    const org = r.organization_id ? o.get(r.organization_id) : undefined;
    return {
      id: r.id,
      kind: r.kind,
      createdAt: r.created_at,
      lastSeenAt: r.last_seen_at,
      device: r.device_label,
      userAgent: r.user_agent,
      ip: r.ip,
      city: r.city,
      region: r.region,
      country: r.country,
      emailAttempted: r.email_attempted,
      online: r.kind === "session" && isOnline(r),
      revokedAt: r.revoked_at ?? null,
      user: prof
        ? {
            id: prof.id,
            name: prof.full_name || prof.email,
            email: prof.email,
            role: prof.role,
            isIntern: prof.is_intern === true,
          }
        : null,
      org: org
        ? {
            id: org.id,
            name: org.name,
            plan: org.plan,
            trial: org.is_trial === true,
            frozen: org.frozen_at != null,
            active: org.active,
          }
        : null,
    };
  });
}

export type VisitListFilters = {
  org: string | null;
  type: "all" | "trial" | "paid" | "failed";
  days: number;
  q: string;
  before: string | null;
};

export type VisitCounts = {
  pages: number;
  actions: number;
  failed: number;
  blocked: number;
  alerts: number;
};

export async function listVisits(f: VisitListFilters) {
  const pageSize = 30;
  let query = supabaseAdmin
    .from("user_login_events")
    .select(SESSION_COLUMNS)
    .gte("created_at", new Date(Date.now() - f.days * 86_400_000).toISOString())
    .order("created_at", { ascending: false })
    .limit(f.q || f.type === "trial" || f.type === "paid" ? 400 : pageSize + 20);
  if (f.org) query = query.eq("organization_id", f.org);
  if (f.type === "failed") query = query.eq("kind", "failed_login");
  else if (f.type !== "all") query = query.eq("kind", "session");
  if (f.before) query = query.lt("created_at", f.before);
  const { data, error } = await query;
  if (error) throw error;

  let sessions = (await decorate((data ?? []) as SessionRow[])).filter(
    // The platform owner's own visits aren't part of the report.
    (s) => s.user?.role !== "platform_owner",
  );
  if (f.type === "trial") sessions = sessions.filter((s) => s.org?.trial);
  if (f.type === "paid") sessions = sessions.filter((s) => s.org && !s.org.trial);
  const q = f.q.trim().toLowerCase();
  if (q) {
    sessions = sessions.filter((s) =>
      [s.user?.name, s.user?.email, s.org?.name, s.emailAttempted, s.city, s.ip, s.device]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(q)),
    );
  }
  const page = sessions.slice(0, pageSize);
  const counts = await countEvents(page);
  return {
    sessions: page.map((s) => ({ ...s, counts: counts.get(s.id) ?? empty() })),
    nextBefore: sessions.length > pageSize ? page[page.length - 1]!.createdAt : null,
  };
}

const empty = (): VisitCounts => ({ pages: 0, actions: 0, failed: 0, blocked: 0, alerts: 0 });

async function countEvents(sessions: VisitSession[]): Promise<Map<string, VisitCounts>> {
  const counts = new Map<string, VisitCounts>();
  const ids = sessions.filter((s) => s.kind === "session").map((s) => s.id);
  if (!ids.length) return counts;
  const userIds = [...new Set(sessions.map((s) => s.user?.id).filter((v): v is string => !!v))];
  const since = sessions.reduce(
    (min, s) => (s.createdAt < min ? s.createdAt : min),
    sessions[0]!.createdAt,
  );
  const [events, audit] = await Promise.all([
    supabaseAdmin
      .from("user_session_events")
      .select("session_id, kind, label")
      .in("session_id", ids)
      .limit(20000),
    userIds.length
      ? supabaseAdmin
          .from("audit_logs")
          .select("actor_id, created_at")
          .in("actor_id", userIds)
          .gte("created_at", since)
          .limit(20000)
      : Promise.resolve({ data: [] as { actor_id: string | null; created_at: string }[] }),
  ]);
  for (const e of events.data ?? []) {
    const c = counts.get(e.session_id) ?? empty();
    if (e.kind === "page") c.pages++;
    else if (e.kind === "failed") c.failed++;
    else if (e.kind === "blocked") c.blocked++;
    else if (e.kind === "action") {
      if (e.label.startsWith("alert:")) c.alerts++;
      else if (e.label !== "first_sign_in") c.actions++;
    }
    counts.set(e.session_id, c);
  }
  for (const s of sessions) {
    if (!s.user) continue;
    const start = new Date(s.createdAt).getTime();
    const end = sessionEnd({ created_at: s.createdAt, last_seen_at: s.lastSeenAt });
    const n = (audit.data ?? []).filter((a) => {
      const t = new Date(a.created_at).getTime();
      return a.actor_id === s.user!.id && t >= start && t <= end;
    }).length;
    if (n) {
      const c = counts.get(s.id) ?? empty();
      c.actions += n;
      counts.set(s.id, c);
    }
  }
  return counts;
}

export type VisitTimelineItem = {
  at: string;
  kind: "page" | "action" | "failed" | "blocked" | "error" | "change";
  label: string;
  path: string | null;
  meta: Record<string, unknown>;
};

export async function loadVisit(id: string) {
  const { data: row, error } = await supabaseAdmin
    .from("user_login_events")
    .select(SESSION_COLUMNS)
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  if (!row) return null;
  const [session] = await decorate([row as SessionRow]);
  const start = new Date(row.created_at).toISOString();
  const end = new Date(sessionEnd(row)).toISOString();

  const [events, audit, errors] = await Promise.all([
    supabaseAdmin
      .from("user_session_events")
      .select("kind, label, path, meta, created_at")
      .eq("session_id", id)
      .order("created_at", { ascending: true })
      .limit(2000),
    row.user_id
      ? supabaseAdmin
          .from("audit_logs")
          .select("action, entity_type, entity_id, meta, created_at")
          .eq("actor_id", row.user_id)
          .gte("created_at", start)
          .lte("created_at", end)
          .order("created_at", { ascending: true })
          .limit(2000)
      : Promise.resolve({ data: [] as never[] }),
    row.user_id
      ? supabaseAdmin
          .from("error_logs")
          .select("message, route, created_at")
          .eq("user_id", row.user_id)
          .gte("created_at", start)
          .lte("created_at", end)
          .limit(200)
      : Promise.resolve({ data: [] as never[] }),
  ]);

  const timeline: VisitTimelineItem[] = [
    ...(events.data ?? []).map((e) => ({
      at: e.created_at,
      kind: e.kind as VisitTimelineItem["kind"],
      label: e.label,
      path: e.path,
      meta: (e.meta ?? {}) as Record<string, unknown>,
    })),
    ...(audit.data ?? []).map((a) => ({
      at: a.created_at,
      kind: "change" as const,
      label: `${a.action}:${a.entity_type}`,
      path: null,
      meta: { entityId: a.entity_id, ...((a.meta ?? {}) as Record<string, unknown>) },
    })),
    ...(errors.data ?? []).map((e) => ({
      at: e.created_at,
      kind: "error" as const,
      label: e.message,
      path: e.route,
      meta: {},
    })),
  ].sort((a, b) => a.at.localeCompare(b.at));

  const authSessionKnown = !!(row as { auth_session_id?: string | null }).auth_session_id;
  return { session, timeline, authSessionKnown };
}
