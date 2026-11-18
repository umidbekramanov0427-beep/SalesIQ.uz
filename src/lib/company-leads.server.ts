// Server-only. Owner -> Arizalar: company leads from sign-up, the booked
// calls, the facts shown on a lead's card (its company's people, payments,
// problems, support and errors) and the owner's due tasks / call reminders
// (from the 5-minute Telegram cron).
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { notifyPlatformOwners } from "@/lib/owner-alerts.server";
import { notifyOrgAdmins } from "@/lib/org-admins-notify.server";
import {
  companyHealth,
  dueTasks,
  freeSlots,
  isFreeSlot,
  parseMeetingSettings,
  tashkentDay,
  tashkentTime,
  type MeetingSettings,
} from "@/lib/company-leads";
import { effectiveSeatLimit } from "@/lib/plan-gating";

const DAY = 86_400_000;
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

export async function loadMeetingSettings(): Promise<MeetingSettings> {
  const { data } = await supabaseAdmin.from("platform_settings").select("*").maybeSingle();
  return parseMeetingSettings((data as { meeting_settings?: unknown } | null)?.meeting_settings);
}

/** Calls already booked from now on. */
export async function busySlots(): Promise<string[]> {
  const { data, error } = await supabaseAdmin
    .from("platform_applications")
    .select("meeting_at, status")
    .gte("meeting_at", new Date(Date.now() - DAY).toISOString())
    .neq("status", "lost");
  if (error) return [];
  return (data ?? []).map((r) => r.meeting_at).filter((v): v is string => !!v);
}

export async function openSlots(now = new Date()) {
  const [settings, busy] = await Promise.all([loadMeetingSettings(), busySlots()]);
  return { minutes: settings.minutes, days: freeSlots(settings, busy, now) };
}

export type SignupLeadInput = {
  organizationId: string;
  name: string;
  phone: string;
  email: string | null;
  company: string;
  plan: string | null;
  business: string | null;
  salesReps: string | null;
  currentTool: string | null;
  meetingAt: string | null;
  utm?: Record<string, string>;
};

/**
 * A company that just signed up becomes the owner's lead: stage "meeting"
 * when it booked a call (the slot is re-checked), else "new". Returns the
 * booked time (null when none or the slot was taken meanwhile).
 */
export async function createSignupLead(
  input: SignupLeadInput,
): Promise<{ meetingAt: string | null }> {
  let meetingAt: string | null = null;
  if (input.meetingAt) {
    const [settings, busy] = await Promise.all([loadMeetingSettings(), busySlots()]);
    if (isFreeSlot(settings, busy, new Date(), input.meetingAt))
      meetingAt = new Date(input.meetingAt).toISOString();
  }
  const row = {
    name: input.name.slice(0, 120),
    phone: input.phone.slice(0, 40),
    email: input.email,
    company: input.company.slice(0, 160),
    source: "signup",
    organization_id: input.organizationId,
    plan: input.plan,
    business: input.business?.slice(0, 300) || null,
    sales_reps: input.salesReps,
    team_size: input.salesReps,
    current_tool: input.currentTool,
    meeting_at: meetingAt,
    status: meetingAt ? "meeting" : "new",
    utm: input.utm ?? {},
  };
  let { error } = await supabaseAdmin.from("platform_applications").insert(row);
  if (error && meetingAt && error.code === "23505") {
    // Someone took the slot a second ago: keep the lead, without the call.
    meetingAt = null;
    ({ error } = await supabaseAdmin
      .from("platform_applications")
      .insert({ ...row, meeting_at: null, status: "new" }));
  }
  if (error) {
    // Before the migration: the old columns only.
    await supabaseAdmin.from("platform_applications").insert({
      name: row.name,
      phone: row.phone,
      email: row.email,
      company: row.company,
      source: "signup",
      organization_id: row.organization_id,
      team_size: row.team_size,
      message: [input.plan, input.business, input.currentTool].filter(Boolean).join(" · "),
    });
  }
  const lines = [
    "🆕 <b>Yangi kompaniya ro'yxatdan o'tdi</b>",
    `🏢 ${esc(input.company)} · ${esc(input.name)}`,
    `📞 ${esc(input.phone)}${input.email ? ` · ${esc(input.email)}` : ""}`,
  ];
  if (input.plan) lines.push(`💳 Tarif: ${esc(input.plan)}`);
  if (input.business) lines.push(`🛍 Sotadi: ${esc(input.business)}`);
  if (input.salesReps) lines.push(`👥 Sotuvchilar: ${esc(input.salesReps)}`);
  if (input.currentTool) lines.push(`🧰 Hozir: ${esc(input.currentTool)}`);
  lines.push(
    meetingAt
      ? `📅 Suhbat: <b>${tashkentDay(meetingAt)} ${tashkentTime(meetingAt)}</b>`
      : "📅 Suhbat vaqti tanlanmadi — qo'ng'iroq qiling",
  );
  await notifyPlatformOwners(lines.join("\n")).catch(() => undefined);
  return { meetingAt };
}

// ---------------------------------------------------------------- facts

export type LeadFacts = {
  org: {
    id: string;
    name: string;
    plan: string | null;
    subdomain: string | null;
    createdAt: string;
    trialEndsAt: string | null;
    isTrial: boolean;
    active: boolean;
    frozen: boolean;
    crmEnabled: boolean;
  };
  people: { total: number; active7d: number; seatLimit: number | null; lastSeenAt: string | null };
  people_list: {
    id: string;
    name: string;
    role: string;
    email: string | null;
    lastSeenAt: string | null;
  }[];
  payments: {
    id: string;
    amount: number;
    status: string;
    provider: string;
    plan: string | null;
    createdAt: string;
    paidAt: string | null;
  }[];
  daysLeft: number | null;
  errors: {
    id: string;
    message: string;
    route: string | null;
    resolved: boolean;
    createdAt: string;
  }[];
  support: {
    id: string;
    direction: string;
    text: string;
    author: string | null;
    createdAt: string;
  }[];
  health: ReturnType<typeof companyHealth>;
};

/** Everything the lead card shows about the company behind it. */
export async function loadLeadFacts(orgId: string, openIssues: number): Promise<LeadFacts | null> {
  const { data: org } = await supabaseAdmin
    .from("organizations")
    .select("*")
    .eq("id", orgId)
    .maybeSingle();
  if (!org) return null;
  const since = new Date(Date.now() - 7 * DAY).toISOString();
  const [people, logins, payments, errors, support] = await Promise.all([
    supabaseAdmin
      .from("profiles")
      .select("id, full_name, role, email")
      .eq("organization_id", orgId),
    supabaseAdmin
      .from("user_login_events")
      .select("user_id, created_at")
      .eq("organization_id", orgId)
      .order("created_at", { ascending: false })
      .limit(500),
    supabaseAdmin
      .from("platform_subscription_payments")
      .select("id, amount, status, provider, plan, created_at, paid_at")
      .eq("organization_id", orgId)
      .order("created_at", { ascending: false })
      .limit(50),
    supabaseAdmin
      .from("error_logs")
      .select("id, message, route, resolved, created_at")
      .eq("organization_id", orgId)
      .order("created_at", { ascending: false })
      .limit(30),
    supabaseAdmin
      .from("support_messages")
      .select("id, direction, text, user_id, created_at")
      .eq("organization_id", orgId)
      .order("created_at", { ascending: false })
      .limit(60),
  ]);
  const ppl = people.data ?? [];
  const lastSeen = new Map<string, string>();
  for (const l of logins.data ?? [])
    if (l.user_id && l.created_at && !lastSeen.has(l.user_id))
      lastSeen.set(l.user_id, l.created_at);
  const active7d = [...lastSeen.values()].filter((t) => t >= since).length;
  const lastSeenAt = (logins.data ?? [])[0]?.created_at ?? null;
  const o = org as typeof org & {
    subdomain?: string | null;
    extra_seats?: number | null;
    unlimited_seats?: boolean | null;
    frozen_at?: string | null;
    crm_enabled?: boolean | null;
  };
  const seatLimit = effectiveSeatLimit(o.plan, o.extra_seats ?? 0, !!o.unlimited_seats);
  const daysLeft = o.trial_ends_at
    ? Math.ceil((new Date(o.trial_ends_at).getTime() - Date.now()) / DAY)
    : null;
  const names = new Map(ppl.map((p) => [p.id, p.full_name]));
  return {
    org: {
      id: o.id,
      name: o.name,
      plan: o.plan,
      subdomain: o.subdomain ?? null,
      createdAt: o.created_at,
      trialEndsAt: o.trial_ends_at,
      isTrial: !!o.is_trial,
      active: o.active !== false,
      frozen: !!o.frozen_at,
      crmEnabled: o.crm_enabled !== false,
    },
    people: { total: ppl.length, active7d, seatLimit, lastSeenAt },
    people_list: ppl.map((p) => ({
      id: p.id,
      name: p.full_name ?? "—",
      role: String(p.role),
      email: p.email,
      lastSeenAt: lastSeen.get(p.id) ?? null,
    })),
    payments: (payments.data ?? []).map((p) => ({
      id: p.id,
      amount: Number(p.amount) || 0,
      status: p.status,
      provider: p.provider,
      plan: p.plan,
      createdAt: p.created_at,
      paidAt: p.paid_at,
    })),
    daysLeft,
    errors: (errors.data ?? []).map((e) => ({
      id: e.id,
      message: e.message.slice(0, 300),
      route: e.route,
      resolved: e.resolved,
      createdAt: e.created_at,
    })),
    support: (support.data ?? []).map((m) => ({
      id: m.id,
      direction: m.direction,
      text: m.text.slice(0, 600),
      author: m.direction === "in" ? (names.get(m.user_id) ?? null) : "SalesIQ",
      createdAt: m.created_at,
    })),
    health: companyHealth({
      activeUsers: active7d,
      users: ppl.length,
      seatLimit,
      daysLeft,
      openIssues,
      idleDays: lastSeenAt ? Math.floor((Date.now() - new Date(lastSeenAt).getTime()) / DAY) : null,
      frozen: !!o.frozen_at,
    }),
  };
}

// ---------------------------------------------------------------- cron

type TaskRow = {
  id: string;
  application_id: string | null;
  organization_id: string | null;
  title: string;
  body: string;
  due_at: string | null;
  audience: string;
  done_at: string | null;
  notified_at: string | null;
};

/**
 * Due owner tasks go out once (to the owner, the company's admins or both),
 * and a booked call is reminded an hour before, to both sides.
 */
export async function runPlatformLeadTasks(
  now = new Date(),
): Promise<{ tasks: number; calls: number }> {
  const { data, error } = await supabaseAdmin
    .from("platform_lead_tasks")
    .select(
      "id, application_id, organization_id, title, body, due_at, audience, done_at, notified_at",
    )
    .is("done_at", null)
    .is("notified_at", null)
    .lte("due_at", now.toISOString())
    .limit(50);
  if (error) return { tasks: 0, calls: 0 };
  let tasks = 0;
  for (const t of dueTasks((data ?? []) as TaskRow[], now)) {
    const { data: claimed } = await supabaseAdmin
      .from("platform_lead_tasks")
      .update({ notified_at: now.toISOString() })
      .eq("id", t.id)
      .is("notified_at", null)
      .select("id");
    if (!claimed?.length) continue;
    tasks++;
    let company = "";
    if (t.application_id) {
      const { data: app } = await supabaseAdmin
        .from("platform_applications")
        .select("company, name")
        .eq("id", t.application_id)
        .maybeSingle();
      company = app?.company || app?.name || "";
    }
    if (t.audience !== "company") {
      await notifyPlatformOwners(
        [
          `⏰ <b>Vazifa vaqti keldi</b>${company ? ` · ${esc(company)}` : ""}`,
          esc(t.title),
          t.body ? esc(t.body.slice(0, 600)) : "",
        ]
          .filter(Boolean)
          .join("\n"),
      ).catch(() => undefined);
    }
    if (t.audience !== "owner" && t.organization_id) {
      await notifyOrgAdmins(t.organization_id, {
        title: `📌 SalesIQ: ${t.title}`.slice(0, 200),
        body: t.body || t.title,
        html: [
          `📌 <b>SalesIQ jamoasidan</b>`,
          esc(t.title),
          t.body ? esc(t.body.slice(0, 800)) : "",
        ]
          .filter(Boolean)
          .join("\n"),
        link: "/",
        tag: `platform-task:${t.id}`,
      }).catch(() => 0);
    }
  }

  // Calls in the next hour, reminded once (platform_ops_log claims the key).
  let calls = 0;
  const { data: soon } = await supabaseAdmin
    .from("platform_applications")
    .select("id, name, company, phone, meeting_at, organization_id, status")
    .gte("meeting_at", now.toISOString())
    .lte("meeting_at", new Date(now.getTime() + 60 * 60_000).toISOString())
    .neq("status", "lost");
  for (const a of soon ?? []) {
    if (!a.meeting_at) continue;
    const { error: claimErr } = await supabaseAdmin
      .from("platform_ops_log")
      .insert({ key: `lead-call:${a.id}:${a.meeting_at}` });
    if (claimErr) continue;
    calls++;
    const when = tashkentTime(a.meeting_at);
    await notifyPlatformOwners(
      `📞 <b>Suhbat ${when} da</b>\n🏢 ${esc(a.company || a.name)} · ${esc(a.phone)}`,
    ).catch(() => undefined);
    if (a.organization_id) {
      await notifyOrgAdmins(a.organization_id, {
        title: `📞 SalesIQ bilan suhbat ${when} da`,
        body: "Mutaxassisimiz siz bilan bog'lanadi va platformani sozlashga yordam beradi.",
        html: `📞 <b>SalesIQ bilan suhbat bugun ${when} da</b>\nMutaxassisimiz siz bilan bog'lanadi va platformani sozlashga yordam beradi.`,
        link: "/",
        type: "PlatformMeeting",
        tag: `lead-call:${a.id}`,
      }).catch(() => 0);
    }
  }
  return { tasks, calls };
}

/** The company's own booked call (shown on its home page). */
export async function myMeeting(orgId: string): Promise<{ at: string; status: string } | null> {
  const { data, error } = await supabaseAdmin
    .from("platform_applications")
    .select("meeting_at, status")
    .eq("organization_id", orgId)
    .gte("meeting_at", new Date(Date.now() - 2 * 3_600_000).toISOString())
    .neq("status", "lost")
    .order("meeting_at", { ascending: true })
    .limit(1);
  if (error || !data?.[0]?.meeting_at) return null;
  return { at: data[0].meeting_at, status: data[0].status };
}
