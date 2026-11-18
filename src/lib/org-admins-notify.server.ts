// Server-only. A message from the platform to a company's admins (its super
// admins): a bell notification inside the platform, a push to their devices
// and a Telegram message (through the staff bot when they linked it).
// Used by the owner's tasks and call reminders (company-leads.server.ts).
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { sendPush } from "@/lib/push/push.server";

export type OrgAdminMessage = {
  /** Bell / push title (plain text). */
  title: string;
  /** Bell / push body (plain text). */
  body: string;
  /** Telegram text (HTML). */
  html: string;
  /** Page opened from the bell / push. */
  link: string;
  /** notifications.type -- how the bell shows it. */
  type?: string;
  tag?: string;
};

/** Sends to every super admin of the company; returns how many were reached. */
export async function notifyOrgAdmins(orgId: string, msg: OrgAdminMessage): Promise<number> {
  const { data: admins } = await supabaseAdmin
    .from("profiles")
    .select("id, telegram_chat_id")
    .eq("organization_id", orgId)
    .eq("role", "super_admin");
  const list = admins ?? [];
  if (!list.length) return 0;
  await supabaseAdmin.from("notifications").insert(
    list.map((a) => ({
      organization_id: orgId,
      user_id: a.id,
      type: msg.type ?? "PlatformTask",
      title: msg.title.slice(0, 300),
      body: msg.body.slice(0, 1000),
      link: msg.link,
    })),
  );
  await sendPush(
    orgId,
    list.map((a) => a.id),
    {
      kind: "reminder",
      title: msg.title,
      body: msg.body,
      url: msg.link,
      ...(msg.tag ? { tag: msg.tag } : {}),
    },
  ).catch(() => 0);
  const { sendTelegramMessage } = await import("@/lib/telegram-report.server");
  let reached = 0;
  for (const a of list) {
    if (!a.telegram_chat_id) continue;
    try {
      await sendTelegramMessage(Number(a.telegram_chat_id), msg.html);
      reached++;
    } catch {
      // Bot blocked: the bell and the push still reach them.
    }
  }
  return reached || list.length;
}
