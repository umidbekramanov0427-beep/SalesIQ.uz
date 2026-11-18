// Server-only. The owner's inbox by company (Owner -> Yordam): support
// messages grouped per company with the company's plan/phase and lead
// stage, the read/closed state (support_threads), quick answer templates,
// and "save as a problem" onto the company's lead.
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  sortThreads,
  threadStatus,
  unreadCount,
  type CompanyThread,
  type InboxMessage,
  type InboxPhase,
} from "@/lib/owner-inbox";
import { loadLeadFacts } from "@/lib/company-leads.server";
import { average, supportResponseTimes } from "@/lib/support";

type Msg = {
  id: string;
  organization_id: string | null;
  user_id: string;
  direction: "in" | "out";
  text: string;
  page: string | null;
  sent_by: string | null;
  created_at: string;
};

function phaseOf(
  o: {
    active?: boolean | null;
    is_trial?: boolean | null;
    trial_ends_at?: string | null;
    frozen_at?: string | null;
  } | null,
): InboxPhase {
  if (!o) return "none";
  if (o.frozen_at) return "frozen";
  if (o.active === false || (o.trial_ends_at && new Date(o.trial_ends_at).getTime() < Date.now()))
    return "expired";
  return o.is_trial ? "trial" : "paid";
}

async function names(ids: string[]) {
  const map = new Map<string, { name: string; role: string | null; org: string | null }>();
  for (let i = 0; i < ids.length; i += 200) {
    const { data } = await supabaseAdmin
      .from("profiles")
      .select("id, full_name, email, role, organization_id")
      .in("id", ids.slice(i, i + 200));
    for (const p of data ?? [])
      map.set(p.id, {
        name: p.full_name || p.email || "—",
        role: p.role ? String(p.role) : null,
        org: p.organization_id,
      });
  }
  return map;
}

export type OwnerInboxStats = {
  waiting: number;
  avgResponseMs: number | null;
  answeredToday: number;
  questions: number;
};

const EMPTY_STATS: OwnerInboxStats = {
  waiting: 0,
  avgResponseMs: null,
  answeredToday: 0,
  questions: 0,
};

export async function listCompanyThreads(days = 90): Promise<{
  ready: boolean;
  statesReady: boolean;
  threads: CompanyThread[];
  stats: OwnerInboxStats;
}> {
  const since = new Date(Date.now() - days * 86_400_000).toISOString();
  const { data, error } = await supabaseAdmin
    .from("support_messages")
    .select("id, organization_id, user_id, direction, text, page, sent_by, created_at")
    .gte("created_at", since)
    .order("created_at", { ascending: true })
    .limit(10000);
  if (error) return { ready: false, statesReady: false, threads: [], stats: EMPTY_STATS };
  const msgs = (data ?? []) as Msg[];
  const groups = new Map<string, Msg[]>();
  for (const m of msgs) {
    const key = m.organization_id ?? `u:${m.user_id}`;
    const g = groups.get(key) ?? [];
    g.push(m);
    groups.set(key, g);
  }
  const orgIds = [...groups.keys()].filter((k) => !k.startsWith("u:"));
  const people = await names([...new Set(msgs.map((m) => m.user_id))]);
  const [orgs, states, leads] = await Promise.all([
    orgIds.length
      ? supabaseAdmin.from("organizations").select("*").in("id", orgIds)
      : Promise.resolve({ data: [] as never[] }),
    orgIds.length
      ? supabaseAdmin.from("support_threads").select("*").in("organization_id", orgIds)
      : Promise.resolve({ data: [] as never[], error: null }),
    orgIds.length
      ? supabaseAdmin
          .from("platform_applications")
          .select("id, organization_id, status, created_at")
          .in("organization_id", orgIds)
          .order("created_at", { ascending: false })
      : Promise.resolve({ data: [] as never[] }),
  ]);
  const orgById = new Map((orgs.data ?? []).map((o) => [o.id, o]));
  const stateById = new Map(
    (
      (
        states as {
          data:
            | {
                organization_id: string;
                status: string;
                owner_read_at: string | null;
                updated_at: string;
              }[]
            | null;
        }
      ).data ?? []
    ).map((s) => [s.organization_id, s]),
  );
  const leadByOrg = new Map<string, { id: string; status: string }>();
  for (const l of leads.data ?? [])
    if (l.organization_id && !leadByOrg.has(l.organization_id)) leadByOrg.set(l.organization_id, l);

  const threads: CompanyThread[] = [...groups.entries()].map(([key, list]) => {
    const orgId = key.startsWith("u:") ? null : key;
    const org = orgId ? orgById.get(orgId) : undefined;
    const state = orgId ? stateById.get(orgId) : undefined;
    const last = list[list.length - 1]!;
    const lastIn = [...list].reverse().find((m) => m.direction === "in");
    const waitingSince =
      last.direction === "in"
        ? ([...list]
            .reverse()
            .find((m, i, arr) => m.direction === "in" && arr[i + 1]?.direction !== "in")
            ?.created_at ?? last.created_at)
        : null;
    const who = [...new Set(list.map((m) => m.user_id))].map((id) => ({
      id,
      name: people.get(id)?.name ?? "—",
      role: people.get(id)?.role ?? null,
    }));
    const lead = orgId ? leadByOrg.get(orgId) : undefined;
    const status = threadStatus(
      (state?.status as "open" | "closed" | undefined) ?? null,
      state?.updated_at ?? null,
      lastIn?.created_at ?? null,
    );
    return {
      key,
      orgId,
      name: org?.name ?? people.get(last.user_id)?.name ?? "—",
      plan: org?.plan ?? null,
      phase: phaseOf(org ?? null),
      stage: lead?.status ?? null,
      leadId: lead?.id ?? null,
      status,
      unread: unreadCount(list, state?.owner_read_at ?? null),
      waitingSince: status === "closed" ? null : waitingSince,
      lastAt: last.created_at,
      lastText: last.text.slice(0, 200),
      lastAuthor: last.direction === "out" ? "SalesIQ" : (people.get(last.user_id)?.name ?? null),
      lastDirection: last.direction,
      count: list.length,
      people: who,
      lastAskerId: lastIn?.user_id ?? last.user_id,
    };
  });
  // The last 30 days: how fast the team answers, today's answers, questions.
  const monthAgo = new Date(Date.now() - 30 * 86_400_000).toISOString();
  const todayStart = new Date(
    Math.floor((Date.now() + 5 * 3_600_000) / 86_400_000) * 86_400_000 - 5 * 3_600_000,
  ).toISOString();
  const responses: number[] = [];
  for (const list of groups.values())
    responses.push(
      ...supportResponseTimes(list.filter((m) => m.created_at >= monthAgo)).responsesMs,
    );
  return {
    ready: true,
    statesReady: !(states as { error?: unknown }).error,
    threads: sortThreads(threads),
    stats: {
      waiting: threads.filter((t) => t.waitingSince).length,
      avgResponseMs: average(responses),
      answeredToday: msgs.filter((m) => m.direction === "out" && m.created_at >= todayStart).length,
      questions: msgs.filter((m) => m.direction === "in" && m.created_at >= monthAgo).length,
    },
  };
}

/** One company's conversation (every person), with the company's facts. */
export async function loadCompanyThread(key: string) {
  const orgId = key.startsWith("u:") ? null : key;
  const q = supabaseAdmin
    .from("support_messages")
    .select("id, organization_id, user_id, direction, text, page, sent_by, created_at")
    .order("created_at", { ascending: false })
    .limit(500);
  const { data } = orgId
    ? await q.eq("organization_id", orgId)
    : await q.eq("user_id", key.slice(2));
  const list = ((data ?? []) as Msg[]).reverse();
  const people = await names([
    ...new Set(list.flatMap((m) => [m.user_id, m.sent_by]).filter((x): x is string => !!x)),
  ]);
  const messages: InboxMessage[] = list.map((m) => ({
    id: m.id,
    direction: m.direction,
    text: m.text,
    page: m.page,
    created_at: m.created_at,
    userId: m.user_id,
    author:
      m.direction === "out"
        ? ((m.sent_by ? people.get(m.sent_by)?.name : null) ?? "SalesIQ")
        : (people.get(m.user_id)?.name ?? "—"),
    role: m.direction === "in" ? (people.get(m.user_id)?.role ?? null) : null,
  }));
  let lead: { id: string; status: string; openTasks: number; openIssues: number } | null = null;
  let facts = null;
  if (orgId) {
    const { data: app } = await supabaseAdmin
      .from("platform_applications")
      .select("id, status")
      .eq("organization_id", orgId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    let openIssues = 0;
    if (app) {
      const [notes, tasks] = await Promise.all([
        supabaseAdmin
          .from("platform_application_notes")
          .select("*")
          .eq("application_id", app.id)
          .eq("kind", "issue"),
        supabaseAdmin
          .from("platform_lead_tasks")
          .select("id")
          .eq("application_id", app.id)
          .is("done_at", null),
      ]);
      openIssues = (notes.data ?? []).filter(
        (n) => !(n as { resolved_at?: string | null }).resolved_at,
      ).length;
      lead = { id: app.id, status: app.status, openTasks: tasks.data?.length ?? 0, openIssues };
    }
    facts = await loadLeadFacts(orgId, openIssues).catch(() => null);
  }
  return { messages, lead, facts };
}

export async function markThread(
  orgId: string,
  patch: { read?: boolean; status?: "open" | "closed" },
): Promise<{ ok: boolean; error?: string }> {
  const row: Record<string, unknown> = {
    organization_id: orgId,
    updated_at: new Date().toISOString(),
  };
  if (patch.read) row["owner_read_at"] = new Date().toISOString();
  if (patch.status) row["status"] = patch.status;
  const { error } = await supabaseAdmin
    .from("support_threads")
    .upsert(row as { organization_id: string }, { onConflict: "organization_id" });
  return error ? { ok: false, error: error.message } : { ok: true };
}

export async function loadTemplates(): Promise<string[]> {
  const { data } = await supabaseAdmin.from("platform_settings").select("*").maybeSingle();
  const raw = (data as { support_templates?: unknown } | null)?.support_templates;
  return Array.isArray(raw)
    ? raw.filter((x): x is string => typeof x === "string").slice(0, 30)
    : [];
}

export async function saveTemplates(list: string[]): Promise<{ ok: boolean; error?: string }> {
  const clean = list
    .map((s) => s.trim().slice(0, 1000))
    .filter(Boolean)
    .slice(0, 30);
  const { error } = await supabaseAdmin
    .from("platform_settings")
    .update({ support_templates: clean })
    .eq("id", true);
  return error ? { ok: false, error: error.message } : { ok: true };
}

/** A message saved as a problem on the company's lead (Owner -> Arizalar). */
export async function saveAsIssue(
  orgId: string,
  text: string,
  ownerId: string,
): Promise<{ ok: boolean; error?: string }> {
  const { data: app } = await supabaseAdmin
    .from("platform_applications")
    .select("id")
    .eq("organization_id", orgId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!app) return { ok: false, error: "NO_LEAD" };
  const { error } = await supabaseAdmin.from("platform_application_notes").insert({
    application_id: app.id,
    kind: "issue",
    body: text.slice(0, 4000),
    created_by: ownerId,
  });
  return error ? { ok: false, error: error.message } : { ok: true };
}
