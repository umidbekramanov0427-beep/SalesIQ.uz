import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { crmLeadUrl } from "@/lib/live-notifications";
import { clip } from "@/lib/push/push";
import { orgManagers, sendPush } from "@/lib/push/push.server";
import { matchKeyword, notifiesOwner, parseClientNotify } from "@/lib/client-notify";

// The notifications the open app shows the moment they are written (the
// browser hears new rows over Supabase Realtime, see LiveNotifications):
// a client's message and task reminders. Each also goes out as a web push
// for phones and closed tabs.

/** Kept unread while the person hasn't opened the chat: one row per lead, the newest message in it. */
const MERGE_WINDOW_MS = 6 * 3600_000;

/**
 * A client wrote in the lead's chat: the lead's owner (else the company's
 * admins and heads of sales) gets a bell notification and a push. A burst
 * of messages updates one unread notification instead of stacking many.
 */
export async function notifyClientMessage(input: {
  organizationId: string;
  leadId: string;
  channel: "telegram" | "instagram";
  text: string;
}): Promise<void> {
  const { data: lead } = await supabaseAdmin
    .from("leads")
    .select("name, owner_id")
    .eq("id", input.leadId)
    .eq("organization_id", input.organizationId)
    .maybeSingle();
  if (!lead) return;
  // A blocked chat (Inbox → Bloklash) stays silent; the table is newer.
  const { data: state } = await supabaseAdmin
    .from("inbox_chat_states")
    .select("blocked_at")
    .eq("lead_id", input.leadId)
    .maybeSingle();
  if (state?.blocked_at) return;
  // The company's rules (Bildirishnomalar markazi → Mijoz xabarlari).
  const [{ data: settings }, { count: inbound }] = await Promise.all([
    supabaseAdmin
      .from("org_general_settings")
      .select("ui_settings")
      .eq("organization_id", input.organizationId)
      .maybeSingle(),
    supabaseAdmin
      .from("lead_telegram_messages")
      .select("id", { count: "exact", head: true })
      .eq("lead_id", input.leadId)
      .eq("direction", "in"),
  ]);
  const rules = parseClientNotify(
    (settings?.ui_settings as { notify?: unknown } | null | undefined)?.notify,
  );
  const managers = lead.owner_id ? null : await orgManagers(input.organizationId);
  const recipients = lead.owner_id ? [lead.owner_id] : managers!;
  const icon = input.channel === "instagram" ? "📷" : "💬";
  const title = `${icon} ${lead.name || "Mijoz"}`;
  const body = clip(input.text || "Yangi xabar", 200);
  const link = `/crm/leads/${input.leadId}`;

  // A keyword («narx», «shikoyat»...) raises its own alert.
  const keyword = matchKeyword(input.text, rules.keywords);
  if (keyword) {
    const to = new Set(recipients);
    if (rules.keywordsToManagers) {
      for (const id of managers ?? (await orgManagers(input.organizationId))) to.add(id);
    }
    const kwTitle = `🔔 «${keyword}» — ${lead.name || "Mijoz"}`;
    await Promise.all([
      ...[...to].map((userId) =>
        supabaseAdmin
          .from("notifications")
          .insert({
            organization_id: input.organizationId,
            user_id: userId,
            type: "KeywordAlert",
            title: kwTitle,
            body,
            link,
          })
          .then(
            () => undefined,
            () => undefined,
          ),
      ),
      sendPush(input.organizationId, [...to], {
        kind: "message",
        title: kwTitle,
        body,
        url: crmLeadUrl(link),
        tag: `kw:${input.leadId}`,
      }),
    ]);
  }

  if (!notifiesOwner(rules, (inbound ?? 0) <= 1)) return;
  await Promise.all([
    ...recipients.map((userId) =>
      upsertMessageNotification(input.organizationId, userId, title, body, link).catch(
        () => undefined,
      ),
    ),
    sendPush(input.organizationId, recipients, {
      kind: "message",
      title,
      body,
      url: crmLeadUrl(link),
      tag: `chat:${input.leadId}`,
    }),
  ]);
}

async function upsertMessageNotification(
  organizationId: string,
  userId: string,
  title: string,
  body: string,
  link: string,
): Promise<void> {
  const now = new Date();
  const { data: open } = await supabaseAdmin
    .from("notifications")
    .select("id")
    .eq("organization_id", organizationId)
    .eq("user_id", userId)
    .eq("type", "ClientMessage")
    .eq("link", link)
    .eq("read", false)
    .gte("created_at", new Date(now.getTime() - MERGE_WINDOW_MS).toISOString())
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (open) {
    await supabaseAdmin
      .from("notifications")
      .update({ title, body, created_at: now.toISOString() })
      .eq("id", open.id);
    return;
  }
  await supabaseAdmin.from("notifications").insert({
    organization_id: organizationId,
    user_id: userId,
    type: "ClientMessage",
    title,
    body,
    link,
  });
}

/**
 * Hands out every task reminder that is due (15 minutes before, at the
 * deadline, 15 minutes late) -- the database writes the notifications --
 * and pushes each to its assignee's devices. Run by the minute cron.
 */
export async function runTaskReminders(): Promise<number> {
  const { data, error } = await supabaseAdmin.rpc("claim_task_reminders_for", { p_uid: null });
  // Missing until migration 20261208000000 has run.
  if (error || !data?.length) return 0;
  await Promise.all(
    data.map((r) =>
      sendPush(r.organization_id, [r.user_id], {
        kind: "task",
        title: r.title,
        body: r.body,
        url: crmLeadUrl(r.link),
        tag: `notif:${r.notification_id}`,
        requireInteraction: r.type !== "TaskSoon",
      }),
    ),
  );
  return data.length;
}
