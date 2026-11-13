// Server-only. Salespeople's work Telegram accounts (Sozlamalar ->
// «Telegram akkauntim»): connecting one (code or QR through services/tg-live),
// the list tg-live keeps online, a message from it becoming a lead's chat
// line (a new client becomes a lead owned by that salesperson), and a reply
// from the lead card going out through it. Sessions are sealed in
// telegram_user_accounts (server-only); one account per person and one
// person per account.
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { ingestLead } from "@/lib/leads/lead-intake.server";
import { markFollowupsReplied } from "@/lib/followups.server";
import { notifyClientMessage } from "@/lib/live-notifications.server";
import { openSecret, sealSecret } from "@/lib/secret-box.server";
import { insertLeadChatMessage } from "@/lib/telegram/lead-chat.server";
import { tgLiveConfigured, tgLivePost, type CodeInfo } from "@/lib/tg-live.server";
import {
  inboundText,
  maskPhone,
  messageExtId,
  peerName,
  peerPhone,
  roleMayConnect,
  workAccountError,
  WorkError,
  workPolicyOf,
  type WorkPeer,
  type WorkPolicy,
} from "./work-account";

export type WorkAccountStatus = {
  configured: boolean;
  /** The database update has run. */
  ready: boolean;
  account: {
    name: string | null;
    username: string | null;
    phone: string | null;
    status: "ok" | "error";
    lastError: string | null;
    connectedAt: string;
    lastEventAt: string | null;
  } | null;
};

type Me = {
  id?: number | null;
  username?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  phone?: string | null;
};

const missing = (msg: string) => /telegram_user_accounts|does not exist|schema cache/i.test(msg);

export async function workAccountStatus(profileId: string): Promise<WorkAccountStatus> {
  const configured = tgLiveConfigured();
  const { data, error } = await supabaseAdmin
    .from("telegram_user_accounts")
    .select("tg_name, tg_username, phone_masked, status, last_error, connected_at, last_event_at")
    .eq("profile_id", profileId)
    .maybeSingle();
  if (error) return { configured, ready: !missing(error.message), account: null };
  return {
    configured,
    ready: true,
    account: data
      ? {
          name: data.tg_name,
          username: data.tg_username,
          phone: data.phone_masked,
          status: data.status === "error" ? "error" : "ok",
          lastError: data.last_error,
          connectedAt: data.connected_at,
          lastEventAt: data.last_event_at,
        }
      : null,
  };
}

/* ---- Connecting ---------------------------------------------------------- */

export async function workStartLogin(phone: string): Promise<{ loginId: string } & CodeInfo> {
  const r = await tgLivePost<{ loginId: string } & Partial<CodeInfo>>("/v1/login/start", { phone });
  return {
    loginId: r.loginId,
    via: r.via ?? "app",
    next: r.next ?? null,
    timeout: r.timeout ?? null,
  };
}

export async function workResendCode(loginId: string): Promise<CodeInfo> {
  const r = await tgLivePost<Partial<CodeInfo>>("/v1/login/resend", { login_id: loginId });
  return { via: r.via ?? "other", next: r.next ?? null, timeout: r.timeout ?? null };
}

/** Saves the signed-in account for the person (one per person, one person per account). */
async function saveAccount(input: {
  orgId: string;
  profileId: string;
  session: string;
  me: Me | null;
  phone: string | null;
}): Promise<void> {
  const tgId = Number(input.me?.id);
  if (!Number.isFinite(tgId) || tgId <= 0) throw new Error("Telegram akkaunt ma'lumotini bermadi");
  const { data: taken } = await supabaseAdmin
    .from("telegram_user_accounts")
    .select("profile_id")
    .eq("tg_user_id", tgId)
    .maybeSingle();
  if (taken && taken.profile_id !== input.profileId) throw new Error("already_linked");
  const name = [input.me?.firstName, input.me?.lastName].filter(Boolean).join(" ") || null;
  const row = {
    organization_id: input.orgId,
    profile_id: input.profileId,
    tg_user_id: tgId,
    tg_username: input.me?.username ?? null,
    tg_name: name,
    phone_masked: maskPhone(input.me?.phone ?? input.phone),
    session_sealed: sealSecret(input.session),
    status: "ok",
    last_error: null,
    connected_at: new Date().toISOString(),
  };
  const { error } = await supabaseAdmin
    .from("telegram_user_accounts")
    .upsert(row, { onConflict: "profile_id" });
  if (error) throw error;
}

export async function workFinishLogin(input: {
  orgId: string;
  profileId: string;
  loginId: string;
  code: string;
  password?: string | undefined;
  phone: string | null;
}): Promise<{ needPassword: boolean }> {
  const r = await tgLivePost<{ needPassword?: boolean; session?: string; me?: Me }>(
    "/v1/login/code",
    {
      login_id: input.loginId,
      code: input.code,
      ...(input.password ? { password: input.password } : {}),
    },
  );
  if (r.needPassword) return { needPassword: true };
  if (!r.session) throw new Error("Telegram sessiyani bermadi");
  await saveAccount({ ...input, session: r.session, me: r.me ?? null });
  return { needPassword: false };
}

export async function workQrStart(): Promise<{ loginId: string; url: string; svg: string | null }> {
  return tgLivePost("/v1/login/qr/start", {});
}

export async function workQrPoll(input: {
  orgId: string;
  profileId: string;
  loginId: string;
}): Promise<{ status: "pending" | "password" | "done"; url?: string; svg?: string | null }> {
  const r = await tgLivePost<{
    status: "pending" | "password" | "done";
    url?: string;
    svg?: string | null;
    session?: string;
    me?: Me;
  }>("/v1/login/qr/poll", { login_id: input.loginId });
  if (r.status === "done" && r.session) {
    await saveAccount({ ...input, session: r.session, me: r.me ?? null, phone: null });
    return { status: "done" };
  }
  return { status: r.status, ...(r.url ? { url: r.url } : {}), svg: r.svg ?? null };
}

/** The person's account off: tg-live stops it within a minute; the chats stay on the leads. */
export async function workDisconnect(profileId: string): Promise<void> {
  const { error } = await supabaseAdmin
    .from("telegram_user_accounts")
    .delete()
    .eq("profile_id", profileId);
  if (error && !missing(error.message)) throw error;
}

/** For tg-live: every working account with its session. */
export async function activeWorkAccounts(): Promise<
  { id: string; session: string; groups: number[] }[]
> {
  const { data, error } = await supabaseAdmin
    .from("telegram_user_accounts")
    .select("id, session_sealed, organization_id, tg_user_id")
    .eq("status", "ok")
    .limit(2000);
  if (error) return [];
  const { data: off } = await supabaseAdmin
    .from("integration_settings")
    .select("organization_id")
    .eq("key", POLICY_KEY)
    .eq("enabled", false);
  const offOrgs = new Set((off ?? []).map((r) => r.organization_id));
  // The groups each account's person picked (Inbox → «Guruhlar»); none
  // before the groups migration has run.
  const { data: picked } = await supabaseAdmin
    .from("telegram_user_groups")
    .select("account_tg_user_id, chat_id")
    .limit(20000);
  const groupsOf = new Map<number, number[]>();
  for (const g of picked ?? []) {
    const k = Number(g.account_tg_user_id);
    groupsOf.set(k, [...(groupsOf.get(k) ?? []), Number(g.chat_id)]);
  }
  const out: { id: string; session: string; groups: number[] }[] = [];
  for (const r of data ?? []) {
    if (offOrgs.has(r.organization_id)) continue;
    const session = openSecret(r.session_sealed);
    if (session) out.push({ id: r.id, session, groups: groupsOf.get(Number(r.tg_user_id)) ?? [] });
  }
  return out;
}

/* ---- Messages in -------------------------------------------------------- */

type Account = {
  id: string;
  organization_id: string;
  profile_id: string;
  tg_user_id: number;
  session_sealed: string;
};

export type WorkWebhook = {
  accountId?: string;
  error?: string;
  out?: boolean;
  peer?: WorkPeer;
  /** A picked group's message (then `peer` is absent). */
  group?: { id?: number; title?: string | null };
  sender?: { id?: number | null; name?: string | null; username?: string | null };
  message?: {
    id?: number;
    text?: string;
    date?: number;
    media?: string | null;
    fileName?: string | null;
  };
};

async function accountById(id: string): Promise<Account | null> {
  const { data } = await supabaseAdmin
    .from("telegram_user_accounts")
    .select("id, organization_id, profile_id, tg_user_id, session_sealed")
    .eq("id", id)
    .maybeSingle();
  return (data as Account | null) ?? null;
}

type Link = { lead_id: string; organization_id: string };

async function findLink(account: Account, peerId: number): Promise<Link | null> {
  const { data } = await supabaseAdmin
    .from("lead_telegram_user_links")
    .select("lead_id, organization_id")
    .eq("account_tg_user_id", account.tg_user_id)
    .eq("peer_id", peerId)
    .eq("organization_id", account.organization_id)
    .maybeSingle();
  return data;
}

async function createLeadFor(account: Account, peer: WorkPeer): Promise<Link> {
  const { leadId } = await ingestLead(account.organization_id, {
    name: peerName(peer),
    phone: peerPhone(peer.phone),
    telegram: peer.username ?? null,
    source: "Telegram",
    duplicateSource: "webhook",
    defaultOwnerId: account.profile_id,
    note: "Sotuvchining ish Telegram akkauntiga yozdi",
    tags: ["telegram"],
  });
  const { error } = await supabaseAdmin.from("lead_telegram_user_links").insert({
    organization_id: account.organization_id,
    lead_id: leadId,
    account_tg_user_id: account.tg_user_id,
    peer_id: peer.id,
    username: peer.username ?? null,
    name: [peer.firstName, peer.lastName].filter(Boolean).join(" ") || null,
    phone: peerPhone(peer.phone),
  });
  if (error) {
    // Two messages from the same new client at once: the other one won.
    const again = await findLink(account, peer.id);
    if (again) return again;
    throw error;
  }
  return { lead_id: leadId, organization_id: account.organization_id };
}

export async function handleWorkWebhook(body: WorkWebhook): Promise<void> {
  if (!body.accountId) return;
  if (body.error) {
    await supabaseAdmin
      .from("telegram_user_accounts")
      .update({ status: "error", last_error: workAccountError(body.error) })
      .eq("id", body.accountId);
    return;
  }
  if (body.group) {
    const account = await accountById(body.accountId);
    if (account) await handleGroupMessage(account, body);
    return;
  }
  const peer = body.peer;
  const msg = body.message;
  if (!peer || typeof peer.id !== "number" || !msg || typeof msg.id !== "number") return;
  const account = await accountById(body.accountId);
  if (!account) return;

  const ext = messageExtId(account.tg_user_id, peer.id, msg.id);
  const { data: seen } = await supabaseAdmin
    .from("lead_telegram_messages")
    .select("id")
    .eq("ext_message_id", ext)
    .maybeSingle();
  if (seen) return;

  let link = await findLink(account, peer.id);
  if (!link) {
    // The salesperson writing first to someone who is not a lead: it stays
    // out of the CRM until they answer.
    if (body.out) return;
    if (!(await workPolicy(account.organization_id)).createLeads) return;
    link = await createLeadFor(account, peer);
  }

  const text = inboundText(msg.text, msg.media ?? null, msg.fileName ?? null);
  try {
    await insertLeadChatMessage({
      organization_id: link.organization_id,
      lead_id: link.lead_id,
      direction: body.out ? "out" : "in",
      text,
      channel: "telegram_user",
      via_profile_id: account.profile_id,
      ext_message_id: ext,
    });
  } catch (err) {
    if (/duplicate|unique/i.test(err instanceof Error ? err.message : String(err))) return;
    throw err;
  }

  const now = new Date().toISOString();
  await supabaseAdmin
    .from("telegram_user_accounts")
    .update({ last_event_at: now, status: "ok", last_error: null })
    .eq("id", account.id)
    .then(
      () => undefined,
      () => undefined,
    );
  if (body.out) return;
  await Promise.all([
    supabaseAdmin
      .from("lead_telegram_user_links")
      .update({ last_inbound_at: now })
      .eq("lead_id", link.lead_id)
      .eq("account_tg_user_id", account.tg_user_id)
      .then(
        () => undefined,
        () => undefined,
      ),
    markFollowupsReplied(link.lead_id).catch(() => undefined),
    notifyClientMessage({
      organizationId: link.organization_id,
      leadId: link.lead_id,
      channel: "telegram",
      text,
    }).catch(() => undefined),
  ]);
}

/* ---- Messages out ------------------------------------------------------- */

/** The lead's chat on a work account, and that account (null when there is none). */
export async function workChatForLead(
  orgId: string,
  leadId: string,
): Promise<{ account: Account; peerId: number; username: string | null } | null> {
  const { data: link } = await supabaseAdmin
    .from("lead_telegram_user_links")
    .select("account_tg_user_id, peer_id, username")
    .eq("organization_id", orgId)
    .eq("lead_id", leadId)
    .order("last_inbound_at", { ascending: false, nullsFirst: false })
    .limit(1)
    .maybeSingle();
  if (!link) return null;
  const { data: account } = await supabaseAdmin
    .from("telegram_user_accounts")
    .select("id, organization_id, profile_id, tg_user_id, session_sealed")
    .eq("organization_id", orgId)
    .eq("tg_user_id", link.account_tg_user_id)
    .maybeSingle();
  if (!account) return null;
  return {
    account: account as Account,
    peerId: Number(link.peer_id),
    username: link.username ?? null,
  };
}

/** A reply from the lead card through the work account; saved in the lead's chat. */
export async function sendWorkMessage(input: {
  orgId: string;
  leadId: string;
  senderId: string;
  text: string;
}): Promise<void> {
  const chat = await workChatForLead(input.orgId, input.leadId);
  if (!chat) throw new Error("Bu lidda ish Telegram suhbati yo'q yoki akkaunt uzilgan.");
  const session = openSecret(chat.account.session_sealed);
  if (!session) throw new Error("session_revoked");
  const r = await tgLivePost<{ messageId: number }>("/v1/user/send", {
    account_id: chat.account.id,
    session,
    peer_id: chat.peerId,
    ...(chat.username ? { username: chat.username } : {}),
    text: input.text,
  });
  const ext = messageExtId(chat.account.tg_user_id, chat.peerId, r.messageId);
  try {
    await insertLeadChatMessage({
      organization_id: input.orgId,
      lead_id: input.leadId,
      direction: "out",
      text: input.text,
      sent_by: input.senderId,
      channel: "telegram_user",
      via_profile_id: chat.account.profile_id,
      ext_message_id: ext,
    });
  } catch (err) {
    // tg-live's echo of the same message got here first: give it its author.
    if (!/duplicate|unique/i.test(err instanceof Error ? err.message : String(err))) throw err;
    await supabaseAdmin
      .from("lead_telegram_messages")
      .update({ sent_by: input.senderId })
      .eq("ext_message_id", ext)
      .eq("organization_id", input.orgId);
  }
}

/* ---- The company's rules and the team (admin) --------------------------- */

const POLICY_KEY = "telegram_user";

export async function workPolicy(orgId: string): Promise<WorkPolicy> {
  const { data } = await supabaseAdmin
    .from("integration_settings")
    .select("enabled, config")
    .eq("organization_id", orgId)
    .eq("key", POLICY_KEY)
    .maybeSingle();
  return workPolicyOf(data);
}

export async function saveWorkPolicy(orgId: string, policy: WorkPolicy): Promise<void> {
  const { error } = await supabaseAdmin.from("integration_settings").upsert(
    {
      organization_id: orgId,
      key: POLICY_KEY,
      enabled: policy.enabled,
      config: { roles: policy.roles, createLeads: policy.createLeads },
    },
    { onConflict: "organization_id,key" },
  );
  if (error) throw error;
}

/** Why this person may not connect an account now (null = they may). */
export async function connectBlockedReason(
  orgId: string,
  profileId: string,
): Promise<string | null> {
  const [policy, { data: me }] = await Promise.all([
    workPolicy(orgId),
    supabaseAdmin.from("profiles").select("role").eq("id", profileId).maybeSingle(),
  ]);
  if (!policy.enabled) return "Kompaniyada ish Telegram akkauntlari o'chirilgan.";
  if (!roleMayConnect(policy, me?.role)) return "Sizning rolingiz uchun ulash yopilgan.";
  return null;
}

export type TeamWorkAccount = {
  profileId: string;
  name: string;
  role: string | null;
  account: {
    name: string | null;
    username: string | null;
    phone: string | null;
    status: "ok" | "error";
    lastError: string | null;
    connectedAt: string;
    lastEventAt: string | null;
    chats: number;
  } | null;
};

/** Everyone in the company with their work account (if any) and how many client chats it brought. */
export async function teamWorkAccounts(orgId: string): Promise<TeamWorkAccount[]> {
  const [{ data: people }, { data: accounts, error }] = await Promise.all([
    supabaseAdmin
      .from("profiles")
      .select("id, full_name, email, role")
      .eq("organization_id", orgId)
      .neq("role", "platform_owner")
      .order("full_name"),
    supabaseAdmin
      .from("telegram_user_accounts")
      .select(
        "profile_id, tg_user_id, tg_name, tg_username, phone_masked, status, last_error, connected_at, last_event_at",
      )
      .eq("organization_id", orgId),
  ]);
  if (error && !missing(error.message)) throw error;
  const chats = new Map<number, number>();
  await Promise.all(
    (accounts ?? []).map(async (a) => {
      const { count } = await supabaseAdmin
        .from("lead_telegram_user_links")
        .select("id", { count: "exact", head: true })
        .eq("organization_id", orgId)
        .eq("account_tg_user_id", a.tg_user_id);
      chats.set(Number(a.tg_user_id), count ?? 0);
    }),
  );
  const byProfile = new Map((accounts ?? []).map((a) => [a.profile_id, a]));
  return (people ?? []).map((p) => {
    const a = byProfile.get(p.id);
    return {
      profileId: p.id,
      name: p.full_name || p.email || "—",
      role: p.role,
      account: a
        ? {
            name: a.tg_name,
            username: a.tg_username,
            phone: a.phone_masked,
            status: a.status === "error" ? "error" : "ok",
            lastError: a.last_error,
            connectedAt: a.connected_at,
            lastEventAt: a.last_event_at,
            chats: chats.get(Number(a.tg_user_id)) ?? 0,
          }
        : null,
    };
  });
}

/** An admin turns someone's account off (only inside their own company). */
export async function adminDisconnect(orgId: string, profileId: string): Promise<boolean> {
  const { data } = await supabaseAdmin
    .from("telegram_user_accounts")
    .select("profile_id")
    .eq("organization_id", orgId)
    .eq("profile_id", profileId)
    .maybeSingle();
  if (!data) return false;
  await workDisconnect(profileId);
  return true;
}

/* ---- Finding a lead's client on Telegram by phone (5CRM «Tg nomer — ochiq profil») */

/**
 * The person pressing «Telegram'da topish» on a lead card: their work
 * account looks the lead's phone up on Telegram and, when found, the chat is
 * linked to the lead (so the card can write to the client from the account).
 */
export async function findLeadOnTelegram(input: {
  orgId: string;
  leadId: string;
  profileId: string;
}): Promise<{ username: string | null; name: string | null }> {
  const { data: account } = await supabaseAdmin
    .from("telegram_user_accounts")
    .select("id, organization_id, profile_id, tg_user_id, session_sealed, status")
    .eq("profile_id", input.profileId)
    .eq("organization_id", input.orgId)
    .maybeSingle();
  if (!account || account.status !== "ok") {
    throw new Error("Avval Sozlamalar → «Telegram akkauntim»da ish akkauntingizni ulang.");
  }
  const session = openSecret(account.session_sealed);
  if (!session) throw new Error(workAccountError("session_revoked"));
  const { data: lead } = await supabaseAdmin
    .from("leads")
    .select("id, name, contact_id")
    .eq("id", input.leadId)
    .eq("organization_id", input.orgId)
    .maybeSingle();
  if (!lead) throw new Error("Lid topilmadi.");
  const { data: contact } = lead.contact_id
    ? await supabaseAdmin.from("contacts").select("phone").eq("id", lead.contact_id).maybeSingle()
    : { data: null };
  const phone = peerPhone(contact?.phone);
  if (!phone) throw new Error("Lidda telefon raqam yo'q.");

  let user: WorkPeer | null = null;
  try {
    const r = await tgLivePost<{ user: WorkPeer | null }>("/v1/user/resolve", {
      account_id: account.id,
      session,
      phone,
      name: lead.name,
    });
    user = r.user;
  } catch (e) {
    throw new Error(workAccountError(e instanceof Error ? e.message : String(e)));
  }
  if (!user || typeof user.id !== "number") {
    throw new Error("Bu raqam Telegram'da topilmadi yoki mijoz raqamini yashirgan.");
  }
  const { data: other } = await supabaseAdmin
    .from("lead_telegram_user_links")
    .select("lead_id")
    .eq("organization_id", input.orgId)
    .eq("account_tg_user_id", account.tg_user_id)
    .eq("peer_id", user.id)
    .maybeSingle();
  const name = [user.firstName, user.lastName].filter(Boolean).join(" ") || null;
  if (other && other.lead_id !== input.leadId) {
    throw new Error("Bu Telegram profili boshqa lidga bog'langan.");
  }
  if (!other) {
    const { error } = await supabaseAdmin.from("lead_telegram_user_links").insert({
      organization_id: input.orgId,
      lead_id: input.leadId,
      account_tg_user_id: account.tg_user_id,
      peer_id: user.id,
      username: user.username ?? null,
      name,
      phone,
    });
    if (error) throw error;
  }
  return { username: user.username ?? null, name };
}

/* ---- Work groups (Inbox → «Guruhlar») ----------------------------------- */

const groupExtId = (accountTgUserId: number, chatId: number, messageId: number) =>
  `tgg:${accountTgUserId}:${chatId}:${messageId}`;

async function handleGroupMessage(account: Account, body: WorkWebhook): Promise<void> {
  const chatId = Number(body.group?.id);
  const msg = body.message;
  if (!Number.isFinite(chatId) || !msg || typeof msg.id !== "number") return;
  const { data: group } = await supabaseAdmin
    .from("telegram_user_groups")
    .select("id, title")
    .eq("account_tg_user_id", account.tg_user_id)
    .eq("chat_id", chatId)
    .eq("organization_id", account.organization_id)
    .maybeSingle();
  if (!group) return; // unpicked meanwhile
  const text = inboundText(msg.text, msg.media ?? null, msg.fileName ?? null);
  const at = msg.date ? new Date(msg.date * 1000).toISOString() : new Date().toISOString();
  const { error } = await supabaseAdmin.from("telegram_user_group_messages").insert({
    organization_id: account.organization_id,
    group_id: group.id,
    sender_tg_id: body.sender?.id ?? null,
    sender_name: body.sender?.name || (body.sender?.username ? `@${body.sender.username}` : null),
    text,
    is_out: !!body.out,
    ext_message_id: groupExtId(account.tg_user_id, chatId, msg.id),
    created_at: at,
  });
  if (error && !/duplicate|unique/i.test(error.message)) throw error;
  await supabaseAdmin
    .from("telegram_user_groups")
    .update({
      last_message_at: at,
      last_text: text.slice(0, 200),
      ...(body.group?.title && body.group.title !== group.title ? { title: body.group.title } : {}),
    })
    .eq("id", group.id);
}

async function ownAccount(orgId: string, profileId: string) {
  const { data } = await supabaseAdmin
    .from("telegram_user_accounts")
    .select("id, organization_id, profile_id, tg_user_id, session_sealed, status")
    .eq("profile_id", profileId)
    .eq("organization_id", orgId)
    .maybeSingle();
  if (!data || data.status !== "ok") {
    throw new WorkError("Avval Sozlamalar → «Telegram akkauntim»da ish akkauntingizni ulang.");
  }
  const session = openSecret(data.session_sealed);
  if (!session) throw new Error(workAccountError("session_revoked"));
  return { account: data as Account, session };
}

export type WorkGroupChoice = {
  id: number;
  title: string;
  members: number | null;
  picked: boolean;
};

/** The person's Telegram groups, each marked whether it comes into the CRM. */
export async function workGroupChoices(
  orgId: string,
  profileId: string,
): Promise<WorkGroupChoice[]> {
  const { account, session } = await ownAccount(orgId, profileId);
  const [{ groups }, { data: picked }] = await Promise.all([
    tgLivePost<{ groups: { id: number; title: string; members: number | null }[] }>(
      "/v1/user/groups",
      { account_id: account.id, session },
    ),
    supabaseAdmin
      .from("telegram_user_groups")
      .select("chat_id")
      .eq("account_tg_user_id", account.tg_user_id),
  ]);
  const on = new Set((picked ?? []).map((g) => Number(g.chat_id)));
  return groups.map((g) => ({ ...g, picked: on.has(Number(g.id)) }));
}

/** Saves which groups come in: new picks are added, the rest removed (with their messages). */
export async function pickWorkGroups(
  orgId: string,
  profileId: string,
  groups: { id: number; title: string }[],
): Promise<void> {
  const { account } = await ownAccount(orgId, profileId);
  const wanted = new Map(groups.slice(0, 50).map((g) => [Number(g.id), g.title.slice(0, 200)]));
  const { data: current } = await supabaseAdmin
    .from("telegram_user_groups")
    .select("id, chat_id")
    .eq("account_tg_user_id", account.tg_user_id);
  const drop = (current ?? []).filter((g) => !wanted.has(Number(g.chat_id))).map((g) => g.id);
  if (drop.length) {
    const { error } = await supabaseAdmin.from("telegram_user_groups").delete().in("id", drop);
    if (error) throw error;
  }
  const have = new Set((current ?? []).map((g) => Number(g.chat_id)));
  const add = [...wanted].filter(([id]) => !have.has(id));
  if (add.length) {
    const { error } = await supabaseAdmin.from("telegram_user_groups").insert(
      add.map(([chatId, title]) => ({
        organization_id: orgId,
        profile_id: profileId,
        account_tg_user_id: account.tg_user_id,
        chat_id: chatId,
        title,
      })),
    );
    if (error) throw error;
  }
}

/** Writes to a group from Inbox, through the group owner's account (only the owner may). */
export async function sendGroupMessage(input: {
  orgId: string;
  groupId: string;
  senderId: string;
  text: string;
}): Promise<void> {
  const { data: group } = await supabaseAdmin
    .from("telegram_user_groups")
    .select("id, profile_id, chat_id, account_tg_user_id")
    .eq("id", input.groupId)
    .eq("organization_id", input.orgId)
    .maybeSingle();
  if (!group) throw new WorkError("Guruh topilmadi.");
  if (group.profile_id !== input.senderId) {
    throw new WorkError("Guruhga faqat akkaunt egasi yoza oladi.");
  }
  const { account, session } = await ownAccount(input.orgId, input.senderId);
  const r = await tgLivePost<{ messageId: number; date?: number }>("/v1/user/send", {
    account_id: account.id,
    session,
    peer_id: Number(group.chat_id),
    text: input.text,
  });
  const at = new Date().toISOString();
  const { error } = await supabaseAdmin.from("telegram_user_group_messages").insert({
    organization_id: input.orgId,
    group_id: group.id,
    sender_tg_id: account.tg_user_id,
    text: input.text,
    is_out: true,
    sent_by: input.senderId,
    ext_message_id: groupExtId(account.tg_user_id, Number(group.chat_id), r.messageId),
    created_at: at,
  });
  if (error) {
    // tg-live's echo of the same message got here first: give it its author.
    if (!/duplicate|unique/i.test(error.message)) throw error;
    await supabaseAdmin
      .from("telegram_user_group_messages")
      .update({ sent_by: input.senderId })
      .eq("ext_message_id", groupExtId(account.tg_user_id, Number(group.chat_id), r.messageId));
  }
  await supabaseAdmin
    .from("telegram_user_groups")
    .update({ last_message_at: at, last_text: input.text.slice(0, 200) })
    .eq("id", group.id);
}
