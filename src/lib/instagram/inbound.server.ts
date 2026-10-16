// Server-only. One Instagram Direct message from the webhook, into the
// company's CRM: a new client becomes a lead (source "Instagram"), the
// message lands in the lead's chat next to Telegram, and the lead's owner
// gets a push. Replies the team sends from the Instagram app itself come
// back as echoes and are kept too, so the chat shows the whole conversation.
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { ingestLead } from "@/lib/leads/lead-intake.server";
import { markFollowupsReplied } from "@/lib/followups.server";
import { orgManagers, sendPush } from "@/lib/push/push.server";
import { fileLabel, insertLeadChatMessage } from "@/lib/telegram/lead-chat.server";
import { accountForIgUser, fetchClientProfile, type IgAccount } from "./instagram.server";
import type { IgMessage } from "./events";

type Link = { lead_id: string; organization_id: string; photo_url: string | null };

async function findLink(account: IgAccount, igsid: string): Promise<Link | null> {
  const { data } = await supabaseAdmin
    .from("lead_instagram_links")
    .select("lead_id, organization_id, photo_url")
    .eq("ig_user_id", account.ig_user_id)
    .eq("igsid", igsid)
    .maybeSingle();
  return data;
}

async function createLeadFor(account: IgAccount, igsid: string): Promise<Link> {
  const profile = await fetchClientProfile(account.token, igsid);
  const name = profile.name || (profile.username ? `@${profile.username}` : "Instagram mijoz");
  const { leadId } = await ingestLead(account.organization_id, {
    name,
    source: "Instagram",
    duplicateSource: "webhook",
    note: profile.username ? `Instagram: @${profile.username}` : "Instagram Direct",
    tags: ["instagram"],
  });
  const { error } = await supabaseAdmin.from("lead_instagram_links").insert({
    organization_id: account.organization_id,
    lead_id: leadId,
    ig_user_id: account.ig_user_id,
    igsid,
    username: profile.username,
    name: profile.name,
    photo_url: profile.photo,
  });
  // Two webhooks for the same new client at once: the other one won.
  if (error) {
    const again = await findLink(account, igsid);
    if (again) return again;
    throw error;
  }
  return { lead_id: leadId, organization_id: account.organization_id, photo_url: profile.photo };
}

export async function handleInstagramMessage(m: IgMessage): Promise<void> {
  const account = await accountForIgUser(m.accountId);
  if (!account) return;

  if (m.mid) {
    const { data: seen } = await supabaseAdmin
      .from("lead_telegram_messages")
      .select("id")
      .eq("ext_message_id", m.mid)
      .maybeSingle();
    if (seen) return;
  }

  let link = await findLink(account, m.clientId);
  if (!link) {
    // A message our side started from the Instagram app to someone who
    // isn't a lead yet stays out of the CRM until they answer.
    if (m.echo) return;
    link = await createLeadFor(account, m.clientId);
  }

  try {
    await insertLeadChatMessage({
      organization_id: link.organization_id,
      lead_id: link.lead_id,
      direction: m.echo ? "out" : "in",
      text: m.text,
      channel: "instagram",
      ext_message_id: m.mid,
      file_kind: m.file?.kind ?? null,
      file_id: m.file?.url ?? null,
      file_name: null,
    });
  } catch (err) {
    // The same mid arriving twice at once: the unique index kept one.
    if (/duplicate|unique/i.test(err instanceof Error ? err.message : String(err))) return;
    throw err;
  }

  const now = new Date().toISOString();
  await supabaseAdmin
    .from("instagram_accounts")
    .update({ last_event_at: now })
    .eq("id", account.id)
    .then(
      () => undefined,
      () => undefined,
    );
  if (m.echo) return;

  const preview = m.text || (m.file ? fileLabel(m.file.kind, null) : "");
  await Promise.all([
    supabaseAdmin
      .from("lead_instagram_links")
      .update({ last_inbound_at: now })
      .eq("lead_id", link.lead_id)
      .then(
        () => undefined,
        () => undefined,
      ),
    markFollowupsReplied(link.lead_id).catch(() => undefined),
    pushInstagramMessage(link, preview).catch(() => undefined),
  ]);
}

async function pushInstagramMessage(link: Link, text: string): Promise<void> {
  const { data: lead } = await supabaseAdmin
    .from("leads")
    .select("name, owner_id")
    .eq("id", link.lead_id)
    .maybeSingle();
  if (!lead) return;
  await sendPush(
    link.organization_id,
    lead.owner_id ? [lead.owner_id] : await orgManagers(link.organization_id),
    {
      kind: "message",
      title: `📷 ${lead.name || "Mijoz"}`,
      body: text || "Yangi xabar",
      url: `/crm/leads/${link.lead_id}`,
      tag: `chat:${link.lead_id}`,
    },
  );
}
