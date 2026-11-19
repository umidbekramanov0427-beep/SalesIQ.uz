// Server-only. Password reset through Telegram -- the work behind
// /account/password-reset (rules in password-reset.ts):
//
// send:   the person types their e-mail or phone; every account it names
//         that has a linked Telegram gets a 6-digit code from the platform
//         bot. The answer never says whether an account exists.
// verify: the code and a new password; the password is set, the person is
//         told on Telegram, and the e-mail is handed back so the page can
//         sign them in.
//
// Until migration 20270130 has run the table is missing and "send" answers
// { fallback: "email" }, so the page keeps the old e-mail link.
import { createHash, randomInt, randomUUID } from "node:crypto";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { sendTelegramMessage } from "@/lib/telegram-report.server";
import { notifyPlatformOwners } from "@/lib/owner-alerts.server";
import { samePhone } from "@/lib/phone-key";
import {
  CODE_TTL_MIN,
  MAX_CODES_PER_HOUR,
  MAX_REQUESTS_PER_IP_HOUR,
  MAX_TRIES,
  changedMessage,
  codeMessage,
  formatCode,
  normalizeCode,
  parseLogin,
  passwordProblem,
  triesLeft,
  type Login,
} from "@/lib/password-reset";

type Person = {
  id: string;
  email: string;
  full_name: string | null;
  role: string;
  telegram_chat_id: number | null;
};

export type SendResult =
  { ok: true } | { ok: false; error: "invalid" | "rate" } | { ok: false; fallback: "email" };

export type VerifyResult =
  | { ok: true; email: string }
  | {
      ok: false;
      error: "invalid" | "password_short" | "password_long" | "expired" | "bad_code";
      triesLeft?: number;
    };

const hourAgo = () => new Date(Date.now() - 3_600_000).toISOString();
const hashOf = (id: string, code: string) =>
  createHash("sha256").update(`${id}:${code}`).digest("hex");
const missingTable = (msg: string | undefined) =>
  !!msg && /password_reset_codes|does not exist|schema cache/i.test(msg);

/** The accounts the typed e-mail or phone names (at most 3). */
async function peopleFor(login: Login): Promise<Person[]> {
  const cols = "id, email, full_name, role, telegram_chat_id";
  if (login.kind === "email") {
    const { data } = await supabaseAdmin.from("profiles").select(cols).eq("email", login.email);
    return (data ?? []) as Person[];
  }
  // Phones are stored in every format: compare by key, among those who can
  // get a code at all (a linked Telegram).
  const { data } = await supabaseAdmin
    .from("profiles")
    .select(`${cols}, phone`)
    .not("phone", "is", null)
    .not("telegram_chat_id", "is", null)
    .limit(5000);
  return ((data ?? []) as (Person & { phone: string | null })[])
    .filter((p) => samePhone(p.phone, login.key))
    .slice(0, 3);
}

export async function sendResetCode(rawLogin: string, ip: string | null): Promise<SendResult> {
  const login = parseLogin(rawLogin);
  if (!login) return { ok: false, error: "invalid" };

  if (ip) {
    const { count, error } = await supabaseAdmin
      .from("password_reset_codes")
      .select("id", { count: "exact", head: true })
      .eq("ip", ip)
      .gte("created_at", hourAgo());
    if (error && missingTable(error.message)) return { ok: false, fallback: "email" };
    if ((count ?? 0) >= MAX_REQUESTS_PER_IP_HOUR) return { ok: false, error: "rate" };
  }

  const people = (await peopleFor(login)).filter((p) => p.telegram_chat_id != null);
  for (const p of people) {
    const { count } = await supabaseAdmin
      .from("password_reset_codes")
      .select("id", { count: "exact", head: true })
      .eq("profile_id", p.id)
      .gte("created_at", hourAgo());
    if ((count ?? 0) >= MAX_CODES_PER_HOUR) continue;

    // Only the newest code works: earlier open ones are closed.
    const now = new Date();
    await supabaseAdmin
      .from("password_reset_codes")
      .update({ expires_at: now.toISOString() })
      .eq("profile_id", p.id)
      .is("used_at", null)
      .gt("expires_at", now.toISOString());

    const id = randomUUID();
    const code = formatCode(randomInt(0, 1_000_000));
    const { error } = await supabaseAdmin.from("password_reset_codes").insert({
      id,
      profile_id: p.id,
      code_hash: hashOf(id, code),
      ip,
      expires_at: new Date(now.getTime() + CODE_TTL_MIN * 60_000).toISOString(),
    });
    if (error) {
      if (missingTable(error.message)) return { ok: false, fallback: "email" };
      console.error("[password-reset] insert", error.message);
      continue;
    }
    try {
      await sendTelegramMessage(p.telegram_chat_id!, codeMessage(code, p.full_name));
    } catch (err) {
      console.error("[password-reset] telegram", err);
      await supabaseAdmin.from("password_reset_codes").delete().eq("id", id);
    }
  }
  // The same answer whether or not an account (or its Telegram) exists.
  return { ok: true };
}

export async function verifyResetCode(input: {
  login: string;
  code: string;
  password: string;
}): Promise<VerifyResult> {
  const login = parseLogin(input.login);
  const code = normalizeCode(input.code);
  if (!login || !code) return { ok: false, error: "invalid" };
  const problem = passwordProblem(input.password);
  if (problem)
    return { ok: false, error: problem === "short" ? "password_short" : "password_long" };

  const people = await peopleFor(login);
  if (!people.length) return { ok: false, error: "expired" };
  const { data: open } = await supabaseAdmin
    .from("password_reset_codes")
    .select("id, profile_id, code_hash, attempts")
    .in(
      "profile_id",
      people.map((p) => p.id),
    )
    .is("used_at", null)
    .gt("expires_at", new Date().toISOString())
    .lt("attempts", MAX_TRIES)
    .order("created_at", { ascending: false });
  const rows = open ?? [];
  if (!rows.length) return { ok: false, error: "expired" };

  const hit = rows.find((r) => r.code_hash === hashOf(r.id, code));
  if (!hit) {
    // A wrong code costs a try on every open code of these accounts.
    await Promise.all(
      rows.map((r) =>
        supabaseAdmin
          .from("password_reset_codes")
          .update({ attempts: r.attempts + 1 })
          .eq("id", r.id),
      ),
    );
    const left = triesLeft(rows.map((r) => r.attempts + 1));
    return left > 0
      ? { ok: false, error: "bad_code", triesLeft: left }
      : { ok: false, error: "expired" };
  }

  const person = people.find((p) => p.id === hit.profile_id)!;
  // Claimed first, so the same code can't be used twice at once.
  const { data: claimed } = await supabaseAdmin
    .from("password_reset_codes")
    .update({ used_at: new Date().toISOString() })
    .eq("id", hit.id)
    .is("used_at", null)
    .select("id");
  if (!claimed?.length) return { ok: false, error: "expired" };

  const { error } = await supabaseAdmin.auth.admin.updateUserById(person.id, {
    password: input.password,
  });
  if (error) {
    console.error("[password-reset] update", error.message);
    return { ok: false, error: "expired" };
  }
  // Every other open code of this account stops working.
  await supabaseAdmin
    .from("password_reset_codes")
    .update({ expires_at: new Date().toISOString() })
    .eq("profile_id", person.id)
    .is("used_at", null);

  if (person.telegram_chat_id != null)
    await sendTelegramMessage(person.telegram_chat_id, changedMessage()).catch(() => undefined);
  if (person.role === "platform_owner")
    await notifyPlatformOwners(
      `🔐 Platforma egasi hisobining paroli Telegram kodi orqali o'zgartirildi: ${person.email}`,
    ).catch(() => undefined);

  return { ok: true, email: person.email };
}
