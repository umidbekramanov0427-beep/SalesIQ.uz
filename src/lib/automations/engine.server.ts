// Server-only. The half of the digital pipeline Postgres can't do itself:
// sending messages, calling webhooks, resolving duplicates and running
// salesbots. Rules and in-database actions live in
// 20261017000000_digital_pipeline_salesbots.sql; anything that needs the
// outside world lands in automation_outbox and is processed here by
// /automations/tick (every minute). Salesbot runs advance here too: when a
// client replies (the Telegram webhook calls handleIncomingLeadMessage)
// or when a wait/delay expires (tick).
import { createHmac } from "node:crypto";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { sendBulkMessage, type BulkMessageChannel } from "@/lib/bulk-message.server";
import {
  sendTelegramFileAs,
  sendTelegramMessage,
  sendTelegramMessageWithMarkup,
  telegramFileKind,
} from "@/lib/telegram-report.server";
import { insertLeadChatMessage } from "@/lib/telegram/lead-chat.server";
import { readBulkUpload } from "@/lib/bulk-uploads.server";
import { mergeLeads } from "@/lib/leads/lead-merge.server";
import {
  matchButton,
  renderTemplate,
  type AutomationAction,
  type BotStep,
  type MessageButton,
  type MessageChannel,
  type MessageFile,
} from "@/lib/automation-types";

const APP_URL = (process.env["PUBLIC_APP_URL"] ?? "https://salesiq.uz").replace(/\/$/, "");

/* ------------------------------ helpers ------------------------------ */

type LeadContext = {
  lead: {
    id: string;
    name: string;
    organization_id: string;
    owner_id: string | null;
    company_name: string;
    source: string | null;
    funnel: string | null;
    stage_id: string | null;
    tags: string[];
    budget: number;
    created_at: string;
    contact_id: string | null;
    custom_fields: unknown;
  };
  contact: { phone: string | null; email: string | null; telegram: string | null } | null;
  ownerName: string | null;
};

async function loadLeadContext(leadId: string): Promise<LeadContext | null> {
  const { data: lead } = await supabaseAdmin
    .from("leads")
    .select(
      "id, name, organization_id, owner_id, company_name, source, funnel, stage_id, tags, budget, created_at, contact_id, custom_fields",
    )
    .eq("id", leadId)
    .maybeSingle();
  if (!lead) return null;
  const [{ data: contact }, { data: owner }] = await Promise.all([
    lead.contact_id
      ? supabaseAdmin
          .from("contacts")
          .select("phone, email, telegram")
          .eq("id", lead.contact_id)
          .maybeSingle()
      : Promise.resolve({ data: null }),
    lead.owner_id
      ? supabaseAdmin.from("profiles").select("full_name").eq("id", lead.owner_id).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);
  return { lead, contact: contact ?? null, ownerName: owner?.full_name ?? null };
}

function templateVars(ctx: LeadContext, extra: Record<string, string> = {}) {
  return {
    name: ctx.lead.name,
    phone: ctx.contact?.phone ?? "",
    email: ctx.contact?.email ?? "",
    company: ctx.lead.company_name,
    manager: ctx.ownerName ?? "",
    source: ctx.lead.source ?? "",
    ...extra,
  };
}

/** A real profile to record as the sender (several message logs require one). */
async function resolveActor(orgId: string, ...candidates: (string | null | undefined)[]) {
  for (const c of candidates) if (c) return c;
  const { data } = await supabaseAdmin
    .from("profiles")
    .select("id")
    .eq("organization_id", orgId)
    .in("role", ["super_admin", "rop"])
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  return data?.id ?? null;
}

function escapeHtml(text: string) {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/**
 * "auto" picks the channel the client can actually receive on: a linked
 * Telegram chat first, then SMS. Any channel this version doesn't know
 * (a rule saved long ago) is treated as "auto". The chat id comes along
 * so a Telegram message needs no second lookup.
 */
async function pickChannel(
  orgId: string,
  leadId: string,
  channel: MessageChannel,
): Promise<{ channel: BulkMessageChannel; chatId: number | null }> {
  const auto = channel !== "telegram" && channel !== "sms" && channel !== "email";
  if (!auto && channel !== "telegram") return { channel, chatId: null };
  const { data: link } = await supabaseAdmin
    .from("lead_telegram_links")
    .select("chat_id")
    .eq("lead_id", leadId)
    .eq("organization_id", orgId)
    .maybeSingle();
  if (link) return { channel: "telegram", chatId: link.chat_id };
  return { channel: auto ? "sms" : "telegram", chatId: null };
}

type SendExtras = {
  /** Files sent before the text (an offer PDF, a video, an audio). */
  files?: MessageFile[] | undefined;
  /** Answer buttons: Telegram buttons under the text, a numbered list elsewhere. */
  buttons?: string[] | undefined;
  /** Raw Telegram reply_markup for the text (e.g. to take the buttons away). */
  replyMarkup?: Record<string, unknown> | undefined;
};

export async function sendToLead(
  orgId: string,
  actorId: string,
  leadId: string,
  channel: MessageChannel,
  text: string,
  subject?: string,
  extras: SendExtras = {},
): Promise<{ ok: boolean; reason?: string; channel: BulkMessageChannel }> {
  const { channel: ch, chatId } = await pickChannel(orgId, leadId, channel);
  const files = extras.files ?? [];
  const buttons = (extras.buttons ?? []).map((b) => b.trim()).filter(Boolean);
  // Telegram (every salesbot message): straight to the chat -- the files
  // first, then the text with the buttons under it. A single file without
  // buttons carries the text as its caption.
  if (ch === "telegram" && chatId !== null) {
    const base = {
      organization_id: orgId,
      lead_id: leadId,
      direction: "out" as const,
      sent_by: actorId,
    };
    try {
      const captionOnFile = files.length === 1 && buttons.length === 0 && !extras.replyMarkup;
      for (const f of files) {
        const data = await readBulkUpload(orgId, f.path);
        if (!data) throw new Error(`Fayl topilmadi: ${f.name}`);
        const caption = captionOnFile ? text : "";
        const sent = await sendTelegramFileAs(
          chatId,
          { kind: telegramFileKind(f.type, f.name), name: f.name, type: f.type, data },
          caption,
        );
        await insertLeadChatMessage({
          ...base,
          text: caption,
          file_kind: sent.kind,
          file_id: sent.fileId,
          file_name: f.name,
        });
      }
      if (!captionOnFile && (text.trim() || buttons.length > 0)) {
        // Telegram puts buttons only under a message, so they need some text.
        const body = text.trim() ? text : "👇";
        const markup = buttons.length
          ? {
              keyboard: buttons.map((label) => [{ text: label }]),
              resize_keyboard: true,
              one_time_keyboard: true,
            }
          : extras.replyMarkup;
        if (markup) await sendTelegramMessageWithMarkup(chatId, escapeHtml(body), markup);
        else await sendTelegramMessage(chatId, escapeHtml(body));
        const shown = buttons.length
          ? `${body}\n\n${buttons.map((b) => `[ ${b} ]`).join("  ")}`
          : body;
        await supabaseAdmin.from("lead_telegram_messages").insert({ ...base, text: shown });
      }
    } catch (err) {
      return { ok: false, channel: ch, reason: err instanceof Error ? err.message : "error" };
    }
    return { ok: true, channel: ch };
  }
  // SMS / email: buttons become a numbered list to answer with; files go
  // as email attachments (SMS carries text only).
  const listed = buttons.length
    ? `${text}\n\n${buttons.map((b, i) => `${i + 1}. ${b}`).join("\n")}`
    : text;
  const attachments = [];
  if (ch === "email") {
    for (const f of files) {
      const data = await readBulkUpload(orgId, f.path);
      if (data) attachments.push({ name: f.name, type: f.type, data });
    }
  }
  const body = ch === "telegram" ? escapeHtml(listed) : listed;
  const [result] = await sendBulkMessage(orgId, actorId, [leadId], ch, {
    text: body,
    ...(subject ? { subject } : {}),
    ...(attachments.length ? { attachments } : {}),
  });
  return {
    ok: !!result?.ok,
    channel: ch,
    ...(result?.skippedReason ? { reason: result.skippedReason } : {}),
  };
}

function sign(secret: string, body: string) {
  return createHmac("sha256", secret).update(body).digest("hex");
}

async function postJson(url: string, payload: unknown, secret?: string | null) {
  const body = JSON.stringify(payload);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15_000);
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "user-agent": "SalesIQ-Automation/1.0",
        ...(secret ? { "x-salesiq-signature": sign(secret, body) } : {}),
      },
      body,
      signal: controller.signal,
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
  } finally {
    clearTimeout(timer);
  }
}

function publicLead(ctx: LeadContext) {
  return {
    id: ctx.lead.id,
    name: ctx.lead.name,
    company: ctx.lead.company_name,
    source: ctx.lead.source,
    funnel: ctx.lead.funnel,
    stage_id: ctx.lead.stage_id,
    tags: ctx.lead.tags,
    budget: ctx.lead.budget,
    phone: ctx.contact?.phone ?? null,
    email: ctx.contact?.email ?? null,
    manager: ctx.ownerName,
    custom_fields: ctx.lead.custom_fields,
  };
}

/* ------------------------------ dedupe ------------------------------ */

function phoneKey(phone: string | null | undefined) {
  const d = (phone ?? "").replace(/\D/g, "");
  return d.length >= 7 ? d.slice(-9) : null;
}

async function resolveDuplicate(ctx: LeadContext, mode: "merge" | "tag") {
  const key = phoneKey(ctx.contact?.phone);
  if (!key) return "no_phone";
  const local = key;
  const variants = [ctx.contact!.phone!, local, `998${local}`, `+998${local}`];
  const { data: contacts } = await supabaseAdmin
    .from("contacts")
    .select("id, phone")
    .eq("organization_id", ctx.lead.organization_id)
    .in("phone", variants);
  const contactIds = (contacts ?? []).filter((c) => phoneKey(c.phone) === key).map((c) => c.id);
  if (contactIds.length === 0) return "none";
  const { data: others } = await supabaseAdmin
    .from("leads")
    .select("id, created_at")
    .eq("organization_id", ctx.lead.organization_id)
    .in("contact_id", contactIds)
    .neq("id", ctx.lead.id)
    .order("created_at", { ascending: true })
    .limit(1);
  const original = others?.[0];
  if (!original) return "none";
  if (mode === "merge") {
    await mergeLeads(ctx.lead.organization_id, original.id, ctx.lead.id);
    await supabaseAdmin.from("lead_activities").insert({
      organization_id: ctx.lead.organization_id,
      lead_id: original.id,
      type: "note",
      content: "Avtomatizatsiya: takroriy murojaat shu lidga birlashtirildi.",
    });
    return "merged";
  }
  await supabaseAdmin.rpc("apply_automation_actions", {
    p_actions: [
      { type: "add_tag", tag: "Dublikat" },
      { type: "add_note", text: "Avtomatizatsiya: bu raqam bilan oldin ham lid bo'lgan." },
    ],
    p_lead_id: ctx.lead.id,
    p_organization_id: ctx.lead.organization_id,
  });
  return "tagged";
}

/* ------------------------------ outbox ------------------------------ */

type OutboxRow = {
  id: string;
  organization_id: string;
  rule_id: string | null;
  lead_id: string | null;
  action: AutomationAction;
  attempts: number;
};

async function runOutboxAction(item: OutboxRow): Promise<string | null> {
  if (!item.lead_id) return "no_lead";
  const ctx = await loadLeadContext(item.lead_id);
  if (!ctx) return "lead_deleted";
  const action = item.action;
  let ruleAuthor: string | null = null;
  if (item.rule_id) {
    const { data } = await supabaseAdmin
      .from("automation_rules")
      .select("created_by")
      .eq("id", item.rule_id)
      .maybeSingle();
    ruleAuthor = data?.created_by ?? null;
  }
  const actor = await resolveActor(item.organization_id, ruleAuthor, ctx.lead.owner_id);
  if (!actor) throw new Error("No user to send as");

  if (action.type === "send_message") {
    const text = renderTemplate(action.text, templateVars(ctx));
    const res = await sendToLead(
      item.organization_id,
      actor,
      ctx.lead.id,
      action.channel,
      text,
      action.subject,
      { files: action.files, buttons: action.buttons?.map((b) => b.label) },
    );
    if (!res.ok) throw new Error(res.reason ?? `send failed (${res.channel})`);
    return null;
  }
  if (action.type === "webhook") {
    await postJson(action.url, {
      event: "automation",
      rule_id: item.rule_id,
      lead: publicLead(ctx),
      sent_at: new Date().toISOString(),
    });
    return null;
  }
  if (action.type === "start_salesbot") {
    await startSalesbot(item.organization_id, action.botId, ctx.lead.id, actor);
    return null;
  }
  if (action.type === "dedupe") {
    await resolveDuplicate(ctx, action.mode);
    return null;
  }
  return "unsupported";
}

const MAX_ATTEMPTS = 3;

/**
 * Companies whose CRM module is switched off (organizations.crm_enabled):
 * their queued actions and waiting salesbots are not run. Empty until the
 * CRM-module migration has been applied.
 */
async function crmDisabledOrgIds(): Promise<Set<string>> {
  const { data, error } = await supabaseAdmin
    .from("organizations")
    .select("id")
    .eq("crm_enabled", false);
  if (error) return new Set();
  return new Set((data ?? []).map((o) => o.id));
}

export async function processOutbox(limit = 40) {
  const { data: due } = await supabaseAdmin
    .from("automation_outbox")
    .select("id")
    .eq("status", "pending")
    .lte("run_after", new Date().toISOString())
    .order("run_after", { ascending: true })
    .limit(limit);
  if (!due?.length) return { processed: 0, failed: 0 };
  // Claim atomically so two overlapping ticks never run the same item.
  const { data: claimed } = await supabaseAdmin
    .from("automation_outbox")
    .update({ status: "processing" })
    .eq("status", "pending")
    .in(
      "id",
      due.map((d) => d.id),
    )
    .select("id, organization_id, rule_id, lead_id, action, attempts");
  let failed = 0;
  const crmOff = await crmDisabledOrgIds();
  for (const row of (claimed ?? []) as unknown as OutboxRow[]) {
    try {
      const skipped = crmOff.has(row.organization_id)
        ? "crm_module_off"
        : await runOutboxAction(row);
      await supabaseAdmin
        .from("automation_outbox")
        .update({
          status: "done",
          error: skipped,
          attempts: row.attempts + 1,
          processed_at: new Date().toISOString(),
        })
        .eq("id", row.id);
    } catch (err) {
      failed++;
      const attempts = row.attempts + 1;
      const retry = attempts < MAX_ATTEMPTS;
      await supabaseAdmin
        .from("automation_outbox")
        .update({
          status: retry ? "pending" : "failed",
          attempts,
          error: err instanceof Error ? err.message : String(err),
          run_after: new Date(Date.now() + attempts * 5 * 60_000).toISOString(),
          processed_at: retry ? null : new Date().toISOString(),
        })
        .eq("id", row.id);
    }
  }
  return { processed: claimed?.length ?? 0, failed };
}

/* ------------------------------ salesbot ------------------------------ */

type BotRow = {
  id: string;
  organization_id: string;
  name: string;
  kind: "builtin" | "external";
  channel: MessageChannel;
  steps: BotStep[];
  external_url: string | null;
  external_secret: string | null;
  enabled: boolean;
  created_by: string | null;
};

type RunContext = {
  reply?: string;
  vars?: Record<string, string>;
  buttons?: { label: string; next?: string }[] | undefined;
  actor?: string;
};

type RunRow = {
  id: string;
  organization_id: string;
  bot_id: string;
  lead_id: string;
  status: string;
  current_step: string | null;
  waiting_for: string | null;
  context: RunContext;
  log: { at: string; step?: string; note: string }[];
};

async function loadBot(botId: string): Promise<BotRow | null> {
  const { data } = await supabaseAdmin.from("salesbots").select("*").eq("id", botId).maybeSingle();
  return (data as unknown as BotRow | null) ?? null;
}

async function saveRun(run: RunRow, patch: Record<string, unknown>) {
  await supabaseAdmin
    .from("salesbot_runs")
    .update({
      ...patch,
      context: run.context,
      log: run.log.slice(-60),
      updated_at: new Date().toISOString(),
    } as never)
    .eq("id", run.id);
}

function logLine(run: RunRow, note: string, step?: string) {
  run.log.push({ at: new Date().toISOString(), ...(step ? { step } : {}), note });
}

export async function startSalesbot(
  orgId: string,
  botId: string,
  leadId: string,
  actorId?: string | null,
): Promise<{ runId: string } | { error: string }> {
  const bot = await loadBot(botId);
  if (!bot || bot.organization_id !== orgId) return { error: "Bot not found" };
  if (!bot.enabled) return { error: "Bot is turned off" };
  // One live run per bot and lead.
  await supabaseAdmin
    .from("salesbot_runs")
    .update({ status: "stopped", finished_at: new Date().toISOString() })
    .eq("bot_id", botId)
    .eq("lead_id", leadId)
    .in("status", ["running", "waiting"]);

  const actor = await resolveActor(orgId, actorId, bot.created_by);
  const { data: inserted, error } = await supabaseAdmin
    .from("salesbot_runs")
    .insert({
      organization_id: orgId,
      bot_id: botId,
      lead_id: leadId,
      status: "running",
      current_step: bot.steps[0]?.id ?? null,
      context: { actor } as never,
    })
    .select("*")
    .single();
  if (error || !inserted) return { error: error?.message ?? "Could not start" };
  const run = inserted as unknown as RunRow;

  if (bot.kind === "external") {
    const ctx = await loadLeadContext(leadId);
    if (!ctx || !bot.external_url) {
      await saveRun(run, { status: "failed", error: "No external URL" });
      return { runId: run.id };
    }
    try {
      await postJson(
        bot.external_url,
        {
          event: "start",
          run_id: run.id,
          bot_id: bot.id,
          lead: publicLead(ctx),
          reply_url: `${APP_URL}/salesbots/external-reply`,
        },
        bot.external_secret,
      );
      logLine(run, "Tashqi botga yuborildi");
      await saveRun(run, {});
    } catch (err) {
      await saveRun(run, {
        status: "failed",
        error: err instanceof Error ? err.message : String(err),
      });
    }
    return { runId: run.id };
  }

  await advance(run, bot, null);
  return { runId: run.id };
}

function stepIndex(steps: BotStep[], id: string | null | undefined) {
  return id ? steps.findIndex((s) => s.id === id) : -1;
}

/** The step after `step`: its explicit `next`, else the following one in the list. */
function following(steps: BotStep[], step: BotStep, explicit?: string) {
  if (explicit) return explicit;
  const i = stepIndex(steps, step.id);
  return steps[i + 1]?.id ?? null;
}

function explicitNext(step: BotStep): string | undefined {
  return "next" in step ? step.next : undefined;
}

function compare(actual: string, operator: string, expected: string) {
  const a = actual.trim().toLowerCase();
  const e = expected.trim().toLowerCase();
  switch (operator) {
    case "any":
      return a.length > 0;
    case "eq":
      return a === e;
    case "neq":
      return a !== e;
    case "contains":
      return e.split(",").some((part) => part.trim() && a.includes(part.trim()));
    case "gt":
      return Number(a) > Number(e);
    case "lt":
      return Number(a) < Number(e);
    case "phone":
      return a.replace(/\D/g, "").length >= 9;
    default:
      return false;
  }
}

/** Reply options of a message step (link buttons are not answers). */
function replyButtons(step: { buttons?: { label: string; next?: string; url?: string }[] }) {
  return (step.buttons ?? []).filter((b) => !b.url);
}

/** Fills {{reply}} etc. into every string field of an action before it runs. */
function renderAction(action: AutomationAction, vars: Record<string, string>): AutomationAction {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(action)) {
    out[k] = typeof v === "string" && k !== "type" ? renderTemplate(v, vars) : v;
  }
  return out as AutomationAction;
}

/** Salesbot-only action: write a value into the lead's contact (creating one if needed). */
async function setContactField(
  orgId: string,
  lead: LeadContext,
  field: "name" | "phone" | "email",
  rawValue: string,
) {
  let value = rawValue.trim();
  if (!value) return;
  // A name has letters -- never an emoji, a file's icon or a number.
  if (field === "name" && !/\p{L}/u.test(value)) return;
  if (field === "phone") {
    const digits = value.replace(/\D/g, "");
    if (digits.length < 9) return;
    value = `+${digits.length === 9 ? `998${digits}` : digits}`;
  }
  const column = field === "name" ? "full_name" : field;
  if (lead.lead.contact_id) {
    await supabaseAdmin
      .from("contacts")
      .update({ [column]: value } as never)
      .eq("id", lead.lead.contact_id);
  } else {
    const { data: contact } = await supabaseAdmin
      .from("contacts")
      .insert({
        organization_id: orgId,
        full_name: field === "name" ? value : lead.lead.name,
        ...(field === "name" ? {} : { [column]: value }),
        owner_id: lead.lead.owner_id,
      } as never)
      .select("id")
      .single();
    if (contact) {
      await supabaseAdmin.from("leads").update({ contact_id: contact.id }).eq("id", lead.lead.id);
      lead.lead.contact_id = contact.id;
    }
  }
  if (field === "name") {
    await supabaseAdmin.from("leads").update({ name: value }).eq("id", lead.lead.id);
    lead.lead.name = value;
  }
}

type ResumeInput = { reply: string } | { timeout: true } | { delayDone: true };

async function advance(run: RunRow, bot: BotRow, input: ResumeInput | null) {
  const steps = bot.steps ?? [];
  const ctx = run.context ?? {};
  run.context = ctx;
  ctx.vars ??= {};
  let stepId: string | null = run.current_step;

  // Resume after a wait.
  if (input) {
    const current = steps[stepIndex(steps, stepId)];
    if (!current) stepId = null;
    else if ("reply" in input) {
      ctx.reply = input.reply;
      logLine(run, `Mijoz: ${input.reply.slice(0, 200)}`, current.id);
      if (current.type === "wait_reply") {
        if (current.saveAs) ctx.vars[current.saveAs] = input.reply;
        stepId = following(steps, current, current.next);
      } else if (current.type === "message" && replyButtons(current).length) {
        const options = replyButtons(current);
        const r = input.reply.trim().toLowerCase();
        const idx = Number(r) - 1;
        const button = options[idx] ?? options.find((b) => b.label.trim().toLowerCase() === r);
        stepId = button?.next ?? following(steps, current, current.next);
        // {{button}} is the chosen option, or what the client typed instead.
        ctx.vars["button"] = button?.label ?? input.reply.trim();
      } else {
        stepId = following(steps, current, explicitNext(current));
      }
    } else if ("timeout" in input) {
      logLine(run, "Javob kutish vaqti tugadi", current.id);
      stepId =
        current.type === "wait_reply"
          ? (current.onTimeout ?? following(steps, current, current.next))
          : following(steps, current, explicitNext(current));
    } else {
      stepId = following(steps, current, explicitNext(current));
    }
    ctx.buttons = undefined;
  }

  const lead = await loadLeadContext(run.lead_id);
  if (!lead) {
    await saveRun(run, { status: "stopped", finished_at: new Date().toISOString() });
    return;
  }
  const actor = ctx.actor ?? (await resolveActor(run.organization_id, bot.created_by));

  for (let guard = 0; guard < 40; guard++) {
    const step = steps[stepIndex(steps, stepId)];
    if (!step) {
      logLine(run, "Bot tugadi");
      await saveRun(run, {
        status: "done",
        current_step: null,
        waiting_for: null,
        wait_until: null,
        finished_at: new Date().toISOString(),
      });
      return;
    }
    const vars = templateVars(lead, { reply: ctx.reply ?? "", ...ctx.vars });

    if (step.type === "message") {
      let text = renderTemplate(step.text, vars);
      const options = replyButtons(step);
      const links = (step.buttons ?? []).filter((b) => b.url);
      if (links.length) {
        text += `\n\n${links.map((b) => `${b.label}: ${b.url}`).join("\n")}`;
      }
      // The answer options are Telegram buttons (a numbered list on SMS).
      const res = actor
        ? await sendToLead(run.organization_id, actor, run.lead_id, bot.channel, text, undefined, {
            buttons: options.map((b) => b.label),
          })
        : { ok: false, reason: "no_actor" };
      if (!res.ok) {
        logLine(run, `Xabar yuborilmadi: ${res.reason ?? "xato"}`, step.id);
        await saveRun(run, {
          status: "failed",
          error: res.reason ?? "send failed",
          current_step: step.id,
          finished_at: new Date().toISOString(),
        });
        return;
      }
      logLine(run, `Bot: ${text.slice(0, 200)}`, step.id);
      if (options.length) {
        ctx.buttons = options;
        await saveRun(run, {
          status: "waiting",
          waiting_for: "reply",
          current_step: step.id,
          wait_until: new Date(Date.now() + 24 * 60 * 60_000).toISOString(),
        });
        return;
      }
      stepId = following(steps, step, step.next);
      continue;
    }

    if (step.type === "wait_reply") {
      await saveRun(run, {
        status: "waiting",
        waiting_for: "reply",
        current_step: step.id,
        // 0 = wait for the client without a time limit.
        wait_until:
          step.timeoutMinutes > 0
            ? new Date(Date.now() + step.timeoutMinutes * 60_000).toISOString()
            : null,
      });
      return;
    }

    if (step.type === "delay") {
      await saveRun(run, {
        status: "waiting",
        waiting_for: "delay",
        current_step: step.id,
        wait_until: new Date(Date.now() + Math.max(1, step.minutes) * 60_000).toISOString(),
      });
      return;
    }

    if (step.type === "condition") {
      let actual = "";
      if (step.source === "reply") actual = ctx.reply ?? "";
      else if (step.field) {
        const l = lead.lead as unknown as Record<string, unknown>;
        actual = step.field.startsWith("custom:")
          ? String(
              ((l["custom_fields"] as Record<string, unknown> | null) ?? {})[step.field.slice(7)] ??
                "",
            )
          : step.field === "tags"
            ? lead.lead.tags.join(",")
            : String(l[step.field] ?? ctx.vars[step.field] ?? "");
      }
      const ok = compare(actual, step.operator, step.value);
      logLine(run, `Shart: ${ok ? "ha" : "yo'q"}`, step.id);
      stepId = ok ? following(steps, step, step.then) : following(steps, step, step.else);
      continue;
    }

    if (step.type === "action") {
      const action = renderAction(step.action, vars);
      if (action.type === "set_contact") {
        await setContactField(run.organization_id, lead, action.field, action.value);
      } else {
        await supabaseAdmin.rpc("apply_automation_actions", {
          p_actions: [action] as never,
          p_lead_id: run.lead_id,
          p_organization_id: run.organization_id,
        });
      }
      logLine(run, `Amal: ${step.action.type}`, step.id);
      stepId = following(steps, step, step.next);
      continue;
    }

    if (step.type === "handoff") {
      await supabaseAdmin.rpc("apply_automation_actions", {
        p_actions: [
          {
            type: "create_task",
            title: `Salesbot "${bot.name}": mijoz bilan bog'laning`,
            description: step.text ?? ctx.reply ?? undefined,
            dueInMinutes: 30,
            priority: "High",
          },
        ] as never,
        p_lead_id: run.lead_id,
        p_organization_id: run.organization_id,
      });
      logLine(run, "Menejerga topshirildi", step.id);
      await saveRun(run, {
        status: "done",
        current_step: step.id,
        waiting_for: null,
        wait_until: null,
        finished_at: new Date().toISOString(),
      });
      return;
    }

    // stop
    logLine(run, "Bot to'xtatildi", step.id);
    await saveRun(run, {
      status: "done",
      current_step: step.id,
      waiting_for: null,
      wait_until: null,
      finished_at: new Date().toISOString(),
    });
    return;
  }

  await saveRun(run, { status: "failed", error: "Too many steps without waiting (loop?)" });
}

/**
 * A client wrote to us (Telegram): resume the bot waiting for them, if any.
 * `text` is what they typed (a file's caption counts); `file` is a one-line
 * label of a file they sent. Only typed words answer our own bots -- a file
 * alone leaves the bot waiting -- while an external bot hears about both.
 */
export async function handleIncomingLeadMessage(
  orgId: string,
  leadId: string,
  text: string,
  file: string | null = null,
) {
  if (text.trim() && (await answerMessageButton(orgId, leadId, text))) return;
  const { data: runs } = await supabaseAdmin
    .from("salesbot_runs")
    .select("*")
    .eq("organization_id", orgId)
    .eq("lead_id", leadId)
    .in("status", ["waiting", "running"])
    .order("updated_at", { ascending: false })
    .limit(1);
  const run = runs?.[0] as unknown as RunRow | undefined;
  if (!run) return;
  const bot = await loadBot(run.bot_id);
  if (!bot) return;
  if (bot.kind === "external") {
    if (!bot.external_url) return;
    const ctx = await loadLeadContext(leadId);
    await postJson(
      bot.external_url,
      {
        event: "message",
        run_id: run.id,
        bot_id: bot.id,
        lead: ctx ? publicLead(ctx) : { id: leadId },
        text: text || file || "",
        ...(file ? { file } : {}),
        reply_url: `${APP_URL}/salesbots/external-reply`,
      },
      bot.external_secret,
    ).catch(() => undefined);
    return;
  }
  if (run.status !== "waiting" || run.waiting_for !== "reply") return;
  if (!text.trim()) return;
  await advance(run, bot, { reply: text });
}

/**
 * A client pressed a button of an automatic message (or typed its label or
 * number): send that button's answer and put its tag on the lead. Only the
 * company's latest automatic message counts, once; what was pressed is kept
 * on that message's outbox row (action.answered). True when it was an
 * answer, so a salesbot doesn't take it too.
 */
async function answerMessageButton(orgId: string, leadId: string, text: string) {
  const { data } = await supabaseAdmin
    .from("automation_outbox")
    .select("id, rule_id, action")
    .eq("organization_id", orgId)
    .eq("lead_id", leadId)
    .eq("status", "done")
    .is("error", null)
    .eq("action->>type", "send_message")
    .gte("processed_at", new Date(Date.now() - 14 * 24 * 60 * 60_000).toISOString())
    .order("processed_at", { ascending: false })
    .limit(1);
  const row = data?.[0];
  const action = row?.action as
    { buttons?: MessageButton[]; answered?: string; channel?: MessageChannel } | undefined;
  if (!row || !action?.buttons?.length || action.answered) return false;
  const i = matchButton(
    action.buttons.map((b) => b.label),
    text,
  );
  const button = action.buttons[i];
  if (!button) return false;
  await supabaseAdmin
    .from("automation_outbox")
    .update({
      action: { ...action, answered: button.label, answered_at: new Date().toISOString() } as never,
    })
    .eq("id", row.id);
  const ctx = await loadLeadContext(leadId);
  if (!ctx) return true;
  if (button.tag?.trim()) {
    await supabaseAdmin.rpc("apply_automation_actions", {
      p_actions: [{ type: "add_tag", tag: button.tag.trim() }] as never,
      p_lead_id: leadId,
      p_organization_id: orgId,
    });
  }
  if (button.reply?.trim()) {
    let ruleAuthor: string | null = null;
    if (row.rule_id) {
      const { data: rule } = await supabaseAdmin
        .from("automation_rules")
        .select("created_by")
        .eq("id", row.rule_id)
        .maybeSingle();
      ruleAuthor = rule?.created_by ?? null;
    }
    const actor = await resolveActor(orgId, ruleAuthor, ctx.lead.owner_id);
    if (actor) {
      await sendToLead(
        orgId,
        actor,
        leadId,
        "telegram",
        renderTemplate(button.reply, templateVars(ctx, { button: button.label })),
        undefined,
        { replyMarkup: { remove_keyboard: true } },
      );
    }
  }
  return true;
}

/** Waits and delays that have run out. */
export async function processDueRuns(limit = 40) {
  const { data: runs } = await supabaseAdmin
    .from("salesbot_runs")
    .select("*")
    .eq("status", "waiting")
    .lte("wait_until", new Date().toISOString())
    .limit(limit);
  let advanced = 0;
  const crmOff = runs?.length ? await crmDisabledOrgIds() : new Set<string>();
  for (const raw of runs ?? []) {
    const run = raw as unknown as RunRow;
    if (crmOff.has(run.organization_id)) {
      await saveRun(run, { status: "stopped", error: "crm_module_off" });
      continue;
    }
    const bot = await loadBot(run.bot_id);
    if (!bot) continue;
    try {
      await advance(
        run,
        bot,
        run.waiting_for === "delay" ? { delayDone: true } : { timeout: true },
      );
      advanced++;
    } catch (err) {
      await saveRun(run, {
        status: "failed",
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }
  return advanced;
}

/** An external bot's answer, verified with its secret. */
export async function handleExternalReply(
  rawBody: string,
  signature: string | null,
): Promise<{ ok: true } | { error: string; status: number }> {
  let body: {
    run_id?: string;
    text?: string;
    actions?: AutomationAction[];
    finish?: boolean;
  };
  try {
    body = JSON.parse(rawBody) as typeof body;
  } catch {
    return { error: "Invalid JSON", status: 400 };
  }
  if (!body.run_id) return { error: "run_id is required", status: 400 };
  const { data: rawRun } = await supabaseAdmin
    .from("salesbot_runs")
    .select("*")
    .eq("id", body.run_id)
    .maybeSingle();
  const run = rawRun as unknown as RunRow | null;
  if (!run) return { error: "Run not found", status: 404 };
  const bot = await loadBot(run.bot_id);
  if (!bot || bot.kind !== "external" || !bot.external_secret) {
    return { error: "Not an external bot", status: 400 };
  }
  if (!signature || sign(bot.external_secret, rawBody) !== signature) {
    return { error: "Bad signature", status: 401 };
  }
  if (run.status !== "running" && run.status !== "waiting") {
    return { error: "Run already finished", status: 409 };
  }
  run.context ??= {};
  run.log ??= [];
  const actor = run.context.actor ?? (await resolveActor(run.organization_id, bot.created_by));
  if (body.text?.trim() && actor) {
    const res = await sendToLead(run.organization_id, actor, run.lead_id, bot.channel, body.text);
    logLine(run, res.ok ? `Bot: ${body.text.slice(0, 200)}` : `Xabar yuborilmadi: ${res.reason}`);
  }
  if (body.actions?.length) {
    await supabaseAdmin.rpc("apply_automation_actions", {
      p_actions: body.actions as never,
      p_lead_id: run.lead_id,
      p_organization_id: run.organization_id,
    });
    logLine(run, `Amallar: ${body.actions.map((a) => a.type).join(", ")}`);
  }
  await saveRun(run, body.finish ? { status: "done", finished_at: new Date().toISOString() } : {});
  return { ok: true };
}
