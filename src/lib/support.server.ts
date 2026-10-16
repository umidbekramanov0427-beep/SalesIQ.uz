import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { sendPush } from "@/lib/push/push.server";
import {
  average,
  supportResponseTimes,
  SUPPORT_PER_HOUR,
  type SupportMessage,
} from "@/lib/support";

// Live support: a person's question (the assistant's "Operator" tab) goes
// to every platform owner's Telegram; an owner answers by replying to that
// Telegram message or from Platforma -> Yordam so'rovlari. The answer shows
// in the person's Operator tab and, when they linked the bot, in their own
// Telegram, where a reply continues the thread.

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const ROLE_LABEL: Record<string, string> = {
  super_admin: "Super Admin",
  rop: "ROP",
  sotuv_menejeri: "Sotuv menejeri",
  platform_owner: "Platforma egasi",
};

/** The table isn't there until its migration has run. */
export function isMissingTable(error: { code?: string; message?: string } | null): boolean {
  return (
    !!error &&
    (error.code === "42P01" ||
      error.code === "PGRST205" ||
      /schema cache|does not exist/.test(error.message ?? ""))
  );
}

type Person = {
  id: string;
  full_name: string | null;
  email: string | null;
  role: string | null;
  is_intern: boolean | null;
  telegram_chat_id: number | null;
  organization_id: string | null;
  organizations: { name: string | null; plan: string | null; is_trial: boolean | null } | null;
};

/** People with their company (two plain queries: profiles <-> organizations has two links). */
async function loadPeople(ids: string[]): Promise<Map<string, Person>> {
  const people = new Map<string, Person>();
  for (let i = 0; i < ids.length; i += 200) {
    const { data: rows } = await supabaseAdmin
      .from("profiles")
      .select("id, full_name, email, role, is_intern, telegram_chat_id, organization_id")
      .in("id", ids.slice(i, i + 200));
    const orgIds = [...new Set((rows ?? []).map((r) => r.organization_id).filter(Boolean))];
    const { data: orgs } = orgIds.length
      ? await supabaseAdmin
          .from("organizations")
          .select("id, name, plan, is_trial")
          .in("id", orgIds as string[])
      : { data: [] };
    const orgById = new Map((orgs ?? []).map((o) => [o.id, o]));
    for (const r of rows ?? []) {
      const org = r.organization_id ? orgById.get(r.organization_id) : undefined;
      people.set(r.id, {
        ...r,
        telegram_chat_id: r.telegram_chat_id == null ? null : Number(r.telegram_chat_id),
        organizations: org ? { name: org.name, plan: org.plan, is_trial: org.is_trial } : null,
      } as Person);
    }
  }
  return people;
}

async function loadPerson(userId: string): Promise<Person | null> {
  return (await loadPeople([userId])).get(userId) ?? null;
}

/** Sends `text` to a person's own chat (shared bot); returns the "<chat>:<message>" ref. */
async function sendToPerson(chatId: number, text: string): Promise<string | null> {
  const { sendTelegramMessageForReply } = await import("@/lib/telegram-report.server");
  const id = await sendTelegramMessageForReply(chatId, text).catch(() => null);
  return id ? `${chatId}:${id}` : null;
}

function questionText(person: Person, text: string, page: string | null): string {
  const org = person.organizations;
  const who = [
    `<b>${esc(person.full_name || person.email || "Foydalanuvchi")}</b>`,
    person.role
      ? (ROLE_LABEL[person.role] ?? person.role) + (person.is_intern ? " (stajyor)" : "")
      : null,
    org?.name
      ? esc(org.name) + (org.plan ? ` · ${esc(org.plan)}` : "") + (org.is_trial ? " · sinov" : "")
      : null,
  ]
    .filter(Boolean)
    .join(" · ");
  return (
    `🆘 <b>Yordam so'rovi</b>\n${who}\n` +
    (person.email ? `${esc(person.email)}\n` : "") +
    (page ? `Sahifa: <code>${esc(page)}</code>\n` : "") +
    `\n${esc(text)}\n\n<i>↩️ Javob berish uchun shu xabarga reply qiling.</i>`
  );
}

async function saveRefs(id: string, refs: (string | null)[]) {
  const clean = refs.filter((r): r is string => !!r);
  if (clean.length) {
    await supabaseAdmin.from("support_messages").update({ telegram_refs: clean }).eq("id", id);
  }
}

export type SendResult =
  | { ok: true; message: SupportMessage; personName?: string }
  | { ok: false; status: number; error: string };

/**
 * A person's question: saved to their thread and sent to the platform
 * owners (through the monitoring bot when there is one). The rate check and
 * the sender's details load together; the Telegram copies go out in
 * parallel.
 */
export async function sendSupportQuestion(input: {
  userId: string;
  organizationId: string;
  text: string;
  page: string | null;
  person?: Person | null;
}): Promise<SendResult> {
  const since = new Date(Date.now() - 3_600_000).toISOString();
  const [{ count, error: countError }, person] = await Promise.all([
    supabaseAdmin
      .from("support_messages")
      .select("id", { count: "exact", head: true })
      .eq("user_id", input.userId)
      .eq("direction", "in")
      .gte("created_at", since),
    input.person !== undefined ? Promise.resolve(input.person) : loadPerson(input.userId),
  ]);
  if (countError) {
    return isMissingTable(countError)
      ? { ok: false, status: 503, error: "SUPPORT_NOT_READY" }
      : { ok: false, status: 500, error: countError.message };
  }
  if ((count ?? 0) >= SUPPORT_PER_HOUR) return { ok: false, status: 429, error: "RATE_LIMIT" };

  const { data: row, error } = await supabaseAdmin
    .from("support_messages")
    .insert({
      organization_id: input.organizationId,
      user_id: input.userId,
      direction: "in",
      text: input.text,
      page: input.page,
    })
    .select("id, direction, text, created_at")
    .single();
  if (error || !row) return { ok: false, status: 500, error: error?.message ?? "Insert failed" };

  if (person) {
    const { notifyOwners } = await import("@/lib/ops/bot.server");
    const refs = await notifyOwners(questionText(person, input.text, input.page)).catch(() => []);
    await saveRefs(row.id, refs);
  }
  return { ok: true, message: row as SupportMessage };
}

/** The support team's answer to one person: saved and sent to their Telegram if linked. */
export async function sendSupportAnswer(input: {
  userId: string;
  text: string;
  sentBy: string;
  person?: Person | null;
}): Promise<SendResult> {
  const person = input.person ?? (await loadPerson(input.userId));
  if (!person?.organization_id) return { ok: false, status: 404, error: "User not found" };
  const { data: row, error } = await supabaseAdmin
    .from("support_messages")
    .insert({
      organization_id: person.organization_id,
      user_id: person.id,
      direction: "out",
      text: input.text,
      sent_by: input.sentBy,
    })
    .select("id, direction, text, created_at")
    .single();
  if (error || !row) {
    return isMissingTable(error)
      ? { ok: false, status: 503, error: "SUPPORT_NOT_READY" }
      : { ok: false, status: 500, error: error?.message ?? "Insert failed" };
  }
  if (person.telegram_chat_id) {
    const ref = await sendToPerson(
      Number(person.telegram_chat_id),
      `💬 <b>SalesIQ yordam xizmati</b>\n\n${esc(input.text)}\n\n` +
        `<i>Javob yozish uchun shu xabarga reply qiling yoki saytdagi yordamchi oynasining "Operator" bo'limida yozing.</i>`,
    );
    await saveRefs(row.id, [ref]);
  }
  await sendPush(person.organization_id, [person.id], {
    kind: "support",
    title: "💬 SalesIQ yordam xizmati",
    body: input.text,
    url: "/?support=1",
    tag: "support",
  });
  return {
    ok: true,
    message: row as SupportMessage,
    personName: person.full_name || person.email || "foydalanuvchi",
  };
}

type TgReply = {
  text?: string;
  reply_to_message?: { message_id?: number };
};

/**
 * A Telegram reply to one of the support copies: from a platform owner it
 * answers that thread; from the thread's own person it is a new question.
 * `via` is the bot it came through ("ops" = the monitoring bot). Returns
 * false when the message isn't a reply to a support copy.
 */
export async function handleSupportTelegramReply(
  chatId: number,
  message: TgReply,
  via: "shared" | "ops" = "shared",
): Promise<boolean> {
  const repliedTo = message.reply_to_message?.message_id;
  if (!repliedTo) return false;
  const ref = `${via === "ops" ? "ops:" : ""}${chatId}:${repliedTo}`;
  const [{ data: original, error }, { data: sender }] = await Promise.all([
    supabaseAdmin
      .from("support_messages")
      .select("user_id, organization_id")
      .contains("telegram_refs", [ref])
      .limit(1)
      .maybeSingle(),
    supabaseAdmin
      .from("profiles")
      .select("id, role")
      .eq("telegram_chat_id", chatId)
      .limit(1)
      .maybeSingle(),
  ]);
  if (error || !original) return false;

  const { sendToOwner } = await import("@/lib/ops/bot.server");
  const { sendTelegramMessage } = await import("@/lib/telegram-report.server");
  const answer = (t: string) =>
    (via === "ops" ? sendToOwner(chatId, t) : sendTelegramMessage(chatId, t)).catch(
      () => undefined,
    );
  const text = (message.text ?? "").trim();
  if (!text) {
    await answer("Hozircha faqat matnli javob yuboriladi.");
    return true;
  }

  if (sender?.role === "platform_owner") {
    const result = await sendSupportAnswer({
      userId: original.user_id,
      text: text.slice(0, 4000),
      sentBy: sender.id,
    });
    await answer(
      result.ok
        ? `✅ Javob yuborildi: ${esc(result.personName ?? "foydalanuvchi")}`
        : `⚠️ Javob yuborilmadi: ${esc(result.error)}`,
    );
    return true;
  }

  if (sender?.id === original.user_id) {
    const result = await sendSupportQuestion({
      userId: original.user_id,
      organizationId: original.organization_id,
      text: text.slice(0, 4000),
      page: "Telegram",
    });
    await answer(
      result.ok
        ? "✅ Xabaringiz yordam xizmatiga yuborildi."
        : "⚠️ Xabar yuborilmadi, keyinroq urinib ko'ring.",
    );
    return true;
  }
  return false;
}

export type SupportThreadSummary = {
  userId: string;
  name: string;
  email: string | null;
  role: string | null;
  org: { id: string; name: string; plan: string | null; trial: boolean } | null;
  lastText: string;
  lastDirection: "in" | "out";
  lastAt: string;
  count: number;
  waitingSince: string | null;
  avgResponseMs: number | null;
};

/** Every thread of the last `days` days, waiting ones first, plus overall stats. */
export async function listSupportThreads(days = 30): Promise<{
  ready: boolean;
  threads: SupportThreadSummary[];
  stats: { waiting: number; avgResponseMs: number | null; answered: number; questions: number };
}> {
  const since = new Date(Date.now() - days * 86_400_000).toISOString();
  const { data, error } = await supabaseAdmin
    .from("support_messages")
    .select("id, user_id, direction, text, created_at")
    .gte("created_at", since)
    .order("created_at", { ascending: true })
    .limit(5000);
  if (error) {
    if (isMissingTable(error)) {
      return {
        ready: false,
        threads: [],
        stats: { waiting: 0, avgResponseMs: null, answered: 0, questions: 0 },
      };
    }
    throw new Error(error.message);
  }

  const byUser = new Map<string, SupportMessage[]>();
  for (const r of data ?? []) {
    const list = byUser.get(r.user_id) ?? [];
    list.push({
      id: r.id,
      direction: r.direction as "in" | "out",
      text: r.text,
      created_at: r.created_at,
    });
    byUser.set(r.user_id, list);
  }

  const ids = [...byUser.keys()];
  const people = await loadPeople(ids);

  const allResponses: number[] = [];
  let questions = 0;
  const threads: SupportThreadSummary[] = ids.map((userId) => {
    const msgs = byUser.get(userId)!;
    const last = msgs[msgs.length - 1]!;
    const { responsesMs, waitingSince } = supportResponseTimes(msgs);
    allResponses.push(...responsesMs);
    questions += msgs.filter((m) => m.direction === "in").length;
    const p = people.get(userId);
    return {
      userId,
      name: p?.full_name || p?.email || "—",
      email: p?.email ?? null,
      role: p?.role ?? null,
      org:
        p?.organization_id && p.organizations
          ? {
              id: p.organization_id,
              name: p.organizations.name ?? "—",
              plan: p.organizations.plan,
              trial: !!p.organizations.is_trial,
            }
          : null,
      lastText: last.text,
      lastDirection: last.direction,
      lastAt: last.created_at,
      count: msgs.length,
      waitingSince,
      avgResponseMs: average(responsesMs),
    };
  });
  threads.sort((a, b) => {
    if (!!a.waitingSince !== !!b.waitingSince) return a.waitingSince ? -1 : 1;
    if (a.waitingSince && b.waitingSince) return a.waitingSince.localeCompare(b.waitingSince);
    return b.lastAt.localeCompare(a.lastAt);
  });
  return {
    ready: true,
    threads,
    stats: {
      waiting: threads.filter((t) => t.waitingSince).length,
      avgResponseMs: average(allResponses),
      answered: allResponses.length,
      questions,
    },
  };
}

/** One person's whole thread (last 500 messages). */
export async function loadSupportThread(userId: string): Promise<SupportMessage[]> {
  const { data, error } = await supabaseAdmin
    .from("support_messages")
    .select("id, direction, text, created_at, page")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(500);
  if (error) {
    if (isMissingTable(error)) return [];
    throw new Error(error.message);
  }
  return ((data ?? []) as SupportMessage[]).reverse();
}
