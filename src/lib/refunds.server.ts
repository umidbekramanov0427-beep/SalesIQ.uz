import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { sanitizeFileName } from "@/lib/lead-files.server";
import {
  sendTelegramFile,
  sendTelegramMessage,
  telegramFileKind,
} from "@/lib/telegram-report.server";
import { orgManagers, sendPush } from "@/lib/push/push.server";
import { insertLeadChatMessage } from "@/lib/telegram/lead-chat.server";
import {
  clientRefundText,
  groupRefundText,
  parseRefundRules,
  refundDue,
  refundNeedsReminder,
  type RefundRow,
  type RefundRules,
} from "@/lib/refunds";
import { companyOrigin } from "@/lib/subdomain";

// Pul qaytarish on the server: the receipt of the transfer goes into the
// private lead-files storage, the refund is marked refunded, and the bot
// sends the receipt to the client's Telegram chat (when the lead has one)
// with "Pulingiz qaytarildi" -- logged in the lead's chat like any message.

const BUCKET = "lead-files";
export const MAX_RECEIPT_BYTES = 10 * 1024 * 1024;

export async function callerRole(userId: string, orgId: string): Promise<string | null> {
  const { data } = await supabaseAdmin
    .from("profiles")
    .select("role, organization_id")
    .eq("id", userId)
    .maybeSingle();
  return data && data.organization_id === orgId ? data.role : null;
}

export const canSettleRefunds = (role: string | null) =>
  role === "super_admin" || role === "platform_owner" || role === "rop";

const money = (n: number) =>
  `${Math.round(n)
    .toLocaleString("ru-RU")
    .replace(/\u00a0/g, " ")} so'm`;

export async function settleRefund(
  orgId: string,
  refundId: string,
  actorId: string,
  file: File,
): Promise<{ notified: boolean; notifyError: string | null }> {
  const { data: row } = await supabaseAdmin
    .from("lead_refunds")
    .select("*")
    .eq("id", refundId)
    .eq("organization_id", orgId)
    .maybeSingle();
  const refund = row as RefundRow | null;
  if (!refund) throw new Error("Qaytarish topilmadi.");
  if (refund.status === "cancelled") throw new Error("Bu qaytarish bekor qilingan.");
  if (file.size > MAX_RECEIPT_BYTES) throw new Error("Chek hajmi 10 MB dan oshmasligi kerak.");
  if (!/^(image\/|application\/pdf)/.test(file.type || "")) {
    throw new Error("Chek rasm yoki PDF bo'lishi kerak.");
  }

  const path = `${orgId}/refunds/${refundId}/${crypto.randomUUID()}-${sanitizeFileName(file.name)}`;
  const data = new Uint8Array(await file.arrayBuffer());
  const { error: upErr } = await supabaseAdmin.storage
    .from(BUCKET)
    .upload(path, data, { contentType: file.type || "application/octet-stream" });
  if (upErr) throw upErr;
  if (refund.receipt_path) {
    await supabaseAdmin.storage
      .from(BUCKET)
      .remove([refund.receipt_path])
      .catch(() => undefined);
  }

  const now = new Date().toISOString();
  const { error } = await supabaseAdmin
    .from("lead_refunds")
    .update({
      status: "refunded",
      refunded_at: refund.refunded_at ?? now,
      refunded_by: actorId,
      receipt_path: path,
      receipt_name: file.name.slice(-200),
      updated_at: now,
    })
    .eq("id", refundId);
  if (error) throw error;

  const { data: settings } = await supabaseAdmin
    .from("org_general_settings")
    .select("*")
    .eq("organization_id", orgId)
    .maybeSingle();
  const rules = parseRefundRules((settings as { refund_rules?: unknown } | null)?.refund_rules);
  const amountText = money(Number(refund.amount) || 0);
  const kind = telegramFileKind(file.type, file.name);

  // The client's chat with the bot, when the lead has one.
  let notifyError: string | null = null;
  if (!rules.notifyClient) notifyError = "off";
  else if (!refund.lead_id) notifyError = "no_lead";
  else {
    const { data: link } = await supabaseAdmin
      .from("lead_telegram_links")
      .select("chat_id")
      .eq("lead_id", refund.lead_id)
      .eq("organization_id", orgId)
      .maybeSingle();
    if (!link?.chat_id) notifyError = "no_telegram";
    else {
      const text = clientRefundText(rules, refund.client_name, amountText);
      try {
        const fileId = await sendTelegramFile(
          Number(link.chat_id),
          { kind, name: file.name, type: file.type, data },
          text,
        );
        await insertLeadChatMessage({
          organization_id: orgId,
          lead_id: refund.lead_id,
          direction: "out",
          text,
          sent_by: actorId,
          file_kind: kind,
          file_id: fileId,
          file_name: file.name,
        }).catch(() => undefined);
      } catch (err) {
        notifyError = err instanceof Error ? err.message.slice(0, 300) : "send_failed";
      }
    }
  }
  await supabaseAdmin
    .from("lead_refunds")
    .update(notifyError ? { notify_error: notifyError } : { notified_at: now, notify_error: null })
    .eq("id", refundId);

  // The company's refunds group: the receipt with who, how much and a link
  // straight into the CRM. Only a group the company itself bound.
  if (rules.notifyGroup && rules.chatId != null) {
    const { data: bound } = await supabaseAdmin
      .from("telegram_bound_chats")
      .select("chat_id")
      .eq("organization_id", orgId)
      .eq("chat_id", rules.chatId)
      .maybeSingle();
    if (bound) {
      const [{ data: org }, { data: actor }] = await Promise.all([
        supabaseAdmin.from("organizations").select("subdomain").eq("id", orgId).maybeSingle(),
        supabaseAdmin.from("profiles").select("full_name, email").eq("id", actorId).maybeSingle(),
      ]);
      const origin = companyOrigin(
        (org as { subdomain?: string | null } | null)?.subdomain ?? null,
      );
      const caption = groupRefundText({
        name: refund.client_name,
        phone: refund.phone,
        amountText,
        card: refund.card_number,
        holder: refund.card_holder,
        reason: refund.reason,
        stage: refund.stage,
        by: actor?.full_name || actor?.email || null,
        link: refund.lead_id
          ? `${origin}/crm/leads/${refund.lead_id}`
          : `${origin}/refunds?focus=${refund.id}`,
        notified: !notifyError,
      });
      await sendTelegramFile(
        Number(rules.chatId),
        { kind: kind === "photo" ? "photo" : "document", name: file.name, type: file.type, data },
        caption,
        { html: true },
      ).catch((err) => console.error("[refunds] group send failed", err));
    }
  }
  return { notified: !notifyError, notifyError };
}

export async function receiptUrl(orgId: string, refundId: string): Promise<string | null> {
  const { data } = await supabaseAdmin
    .from("lead_refunds")
    .select("receipt_path, organization_id")
    .eq("id", refundId)
    .maybeSingle();
  if (!data?.receipt_path || data.organization_id !== orgId) return null;
  const { data: signed } = await supabaseAdmin.storage
    .from(BUCKET)
    .createSignedUrl(data.receipt_path, 60 * 10);
  return signed?.signedUrl ?? null;
}

/* ---- Deadline reminders (from the 5-minute cron) ----------------------- */

const escHtml = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/**
 * A pending refund within a day of its deadline (Admin's Pul qaytarish ->
 * Sozlash: days before / after acceptance) or past it: the responsible
 * manager (the lead's owner, else whoever added it) and the company's
 * admins and heads of sales get a bell, a push and a Telegram message --
 * once a day, 09:00-20:00 Tashkent, claimed through lead_refunds.reminded_at.
 */
export async function runRefundReminders(now = new Date()): Promise<{ sent: number }> {
  const hour = (now.getUTCHours() + 5) % 24;
  if (hour < 9 || hour >= 20) return { sent: 0 };
  const { data, error } = await supabaseAdmin
    .from("lead_refunds")
    .select(
      "id, organization_id, lead_id, client_name, amount, stage, status, created_at, created_by, reminded_at",
    )
    .eq("status", "pending")
    .lte("created_at", new Date(now.getTime() - 3_600_000).toISOString())
    .limit(1000);
  if (error) {
    // Before migration 20270108000000 there is no reminded_at: nothing to do.
    if (/reminded_at|does not exist|schema cache/i.test(error.message)) return { sent: 0 };
    throw error;
  }
  const rows = (data ?? []) as (Pick<
    RefundRow,
    | "id"
    | "organization_id"
    | "lead_id"
    | "client_name"
    | "amount"
    | "stage"
    | "status"
    | "created_at"
    | "created_by"
  > & { reminded_at: string | null })[];
  const orgs = [...new Set(rows.map((r) => r.organization_id))];
  const rulesOf = new Map<string, RefundRules>();
  if (orgs.length) {
    const { data: settings } = await supabaseAdmin
      .from("org_general_settings")
      .select("*")
      .in("organization_id", orgs);
    for (const s of settings ?? [])
      rulesOf.set(
        s.organization_id,
        parseRefundRules((s as { refund_rules?: unknown }).refund_rules),
      );
  }
  let sent = 0;
  for (const r of rows) {
    const rules = rulesOf.get(r.organization_id) ?? parseRefundRules(null);
    if (!refundNeedsReminder(r, rules, now)) continue;
    let claim = supabaseAdmin
      .from("lead_refunds")
      .update({ reminded_at: now.toISOString() })
      .eq("id", r.id)
      .eq("status", "pending");
    claim = r.reminded_at ? claim.eq("reminded_at", r.reminded_at) : claim.is("reminded_at", null);
    const { data: claimed } = await claim.select("id");
    if (!claimed?.length) continue;
    sent++;

    let owner = r.created_by;
    if (r.lead_id) {
      const { data: lead } = await supabaseAdmin
        .from("leads")
        .select("owner_id")
        .eq("id", r.lead_id)
        .eq("organization_id", r.organization_id)
        .maybeSingle();
      owner = lead?.owner_id ?? owner;
    }
    const people = [
      ...new Set([...(owner ? [owner] : []), ...(await orgManagers(r.organization_id))]),
    ];
    if (!people.length) continue;
    const due = refundDue(r, rules, now);
    const when =
      due.kind === "overdue"
        ? `muddati ${due.days} kun o'tdi`
        : due.kind === "today"
          ? "muddati bugun tugaydi"
          : "muddati ertaga tugaydi";
    const title = due.kind === "overdue" ? "⚠️ Pul qaytarish kechikdi" : "⏰ Pul qaytarish muddati";
    const body = `${r.client_name} — ${money(Number(r.amount) || 0)}: ${when}.`;
    const link = `/refunds?focus=${r.id}`;
    await supabaseAdmin.from("notifications").insert(
      people.map((id) => ({
        organization_id: r.organization_id,
        user_id: id,
        type: "Reminder",
        title,
        body,
        link,
      })),
    );
    await sendPush(r.organization_id, people, {
      kind: "reminder",
      title,
      body,
      url: link,
      tag: `refund:${r.id}`,
    }).catch(() => undefined);
    const [{ data: chats }, { data: org }] = await Promise.all([
      supabaseAdmin.from("profiles").select("telegram_chat_id").in("id", people),
      supabaseAdmin
        .from("organizations")
        .select("subdomain")
        .eq("id", r.organization_id)
        .maybeSingle(),
    ]);
    const url = `${companyOrigin(org?.subdomain ?? null)}${link}`;
    for (const c of chats ?? []) {
      if (!c.telegram_chat_id) continue;
      await sendTelegramMessage(
        Number(c.telegram_chat_id),
        `<b>${escHtml(title)}</b>\n${escHtml(body)}\n<a href="${url}">Pul qaytarishni ochish</a>`,
      ).catch((err) => console.error("[refunds] reminder telegram", err));
    }
  }
  return { sent };
}
