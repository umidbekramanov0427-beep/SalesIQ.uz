import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  attendanceReportText,
  dayStart as ruleDayStart,
  firstContact,
  distanceM,
  dueReminder,
  hoursText,
  isWorkday,
  lateMinutes,
  localClock,
  parseAttendanceRules,
  shiftFor,
  workedMinutes,
  type AttendanceRules,
  type ReportPerson,
} from "@/lib/attendance-rules";
import { sendTelegramMessage, sendTelegramMessageWithMarkup } from "@/lib/telegram-report.server";

// Davomat through the Telegram bot: a linked employee presses
// "📍 Ishga keldim" (a location-request button), Telegram sends their
// location, and it opens today's work session when they are within the
// office radius (Admin -> Davomat qoidalari); the same button turns into
// "🏁 Ishdan ketdim" and closes it. The evening report goes to admins and
// heads of sales from the 5-minute /telegram/send-daily-report cron.

export const CHECK_IN_TEXT = "📍 Ishga keldim";
export const CHECK_OUT_TEXT = "🏁 Ishdan ketdim";
const COMMAND_RE = /^\/(keldim|ketdim|davomat)(@\w+)?\s*$/i;

type TgLocationMessage = {
  text?: string;
  location?: { latitude?: number; longitude?: number; horizontal_accuracy?: number };
  forward_origin?: unknown;
  forward_date?: number;
};

type Settings = { rules: AttendanceRules; timeZone: string };

async function loadSettings(orgId: string): Promise<Settings> {
  const { data } = await supabaseAdmin
    .from("org_general_settings")
    .select("*")
    .eq("organization_id", orgId)
    .maybeSingle();
  const row = (data ?? {}) as { attendance_rules?: unknown; timezone?: string | null };
  return {
    rules: parseAttendanceRules(row.attendance_rules),
    timeZone: row.timezone || "Asia/Tashkent",
  };
}

/** Start of the company's current day as a UTC moment. */
function dayStart(now: Date, timeZone: string): Date {
  const c = localClock(now, timeZone);
  return new Date(
    now.getTime() - c.minutes * 60_000 - now.getUTCSeconds() * 1000 - now.getUTCMilliseconds(),
  );
}

const hm = (d: Date, timeZone: string) =>
  d.toLocaleTimeString("en-GB", { timeZone, hour: "2-digit", minute: "2-digit", hourCycle: "h23" });

async function openSession(profileId: string, since: Date) {
  const { data } = await supabaseAdmin
    .from("work_sessions")
    .select("*")
    .eq("profile_id", profileId)
    .is("clock_out", null)
    .gte("clock_in", since.toISOString())
    .order("clock_in", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data;
}

function keyboard(open: boolean) {
  return {
    keyboard: [[{ text: open ? CHECK_OUT_TEXT : CHECK_IN_TEXT, request_location: true }]],
    resize_keyboard: true,
  };
}

/**
 * An attendance command, button text or location from a linked employee.
 * Returns false when the message is not about attendance (the webhook goes on).
 */
export async function handleAttendanceTelegram(
  chatId: number,
  profile: { id: string; organization_id: string | null },
  message: TgLocationMessage,
): Promise<boolean> {
  const text = (message.text ?? "").trim();
  const isCommand = COMMAND_RE.test(text) || text === CHECK_IN_TEXT || text === CHECK_OUT_TEXT;
  if (!message.location && !isCommand) return false;
  if (!profile.organization_id) return false;

  const { rules, timeZone } = await loadSettings(profile.organization_id);
  if (!rules.methods.telegram) {
    await sendTelegramMessage(chatId, "Davomatni Telegram orqali belgilash o'chirilgan.");
    return true;
  }
  const now = new Date();
  const open = await openSession(profile.id, dayStart(now, timeZone));

  if (!message.location) {
    await sendTelegramMessageWithMarkup(
      chatId,
      open
        ? `Ishdasiz: ${hm(new Date(open.clock_in), timeZone)} dan beri. Ketayotganda pastdagi tugmani bosing.`
        : "Ishga kelganingizni belgilash uchun pastdagi tugmani bosing — joylashuvingiz yuboriladi.",
      keyboard(!!open),
    );
    return true;
  }

  // A forwarded location could be anyone's: only a fresh one counts.
  if (message.forward_origin || message.forward_date) {
    await sendTelegramMessage(chatId, "Boshqa xabardan uzatilgan joylashuv qabul qilinmaydi.");
    return true;
  }
  const point = { lat: Number(message.location.latitude), lng: Number(message.location.longitude) };
  if (!Number.isFinite(point.lat) || !Number.isFinite(point.lng)) return true;
  const dist = rules.office ? distanceM(rules.office, point) : null;
  if (rules.office && dist != null && dist > rules.office.radiusM) {
    await sendTelegramMessageWithMarkup(
      chatId,
      `❌ Siz ofisdan ${dist} m uzoqdasiz (ruxsat: ${rules.office.radiusM} m). Ofisga yetib kelgach qayta bosing.`,
      keyboard(!!open),
    );
    return true;
  }

  if (open) {
    await supabaseAdmin
      .from("work_sessions")
      .update({ clock_out: now.toISOString(), out_method: "telegram" })
      .eq("id", open.id);
    const worked = workedMinutes(new Date(open.clock_in), now, rules);
    await sendTelegramMessageWithMarkup(
      chatId,
      `🏁 Ishdan ketdingiz: <b>${hm(now, timeZone)}</b>\nBugun: ${hoursText(worked)}. Yaxshi dam oling!`,
      keyboard(false),
    );
    return true;
  }

  const { error } = await supabaseAdmin.from("work_sessions").insert({
    organization_id: profile.organization_id,
    profile_id: profile.id,
    clock_in: now.toISOString(),
    method: "telegram",
    lat: point.lat,
    lng: point.lng,
    distance_m: dist,
  });
  if (error) {
    console.error("[attendance] telegram check-in failed", error.message);
    await sendTelegramMessage(chatId, "Belgilab bo'lmadi, birozdan keyin qayta urinib ko'ring.");
    return true;
  }
  const late = lateMinutes(now, shiftFor(rules, profile.id), rules.graceMin, timeZone);
  await sendTelegramMessageWithMarkup(
    chatId,
    late > 0
      ? `⏰ Ishga keldingiz: <b>${hm(now, timeZone)}</b> — ${late} daqiqa kechikdingiz.`
      : `✅ Ishga keldingiz: <b>${hm(now, timeZone)}</b>. Omadli kun!`,
    keyboard(true),
  );
  return true;
}

const MONTHS = [
  "yanvar",
  "fevral",
  "mart",
  "aprel",
  "may",
  "iyun",
  "iyul",
  "avgust",
  "sentabr",
  "oktabr",
  "noyabr",
  "dekabr",
];

/** Each company's evening attendance report, once a day at its report time. */
export async function sendAttendanceReports(now = new Date()): Promise<{ sent: number }> {
  const { data: rows } = await supabaseAdmin
    .from("org_general_settings")
    .select("*")
    .neq("attendance_rules", {});
  let sent = 0;
  for (const raw of rows ?? []) {
    const row = raw as {
      organization_id: string;
      attendance_rules?: unknown;
      attendance_report_sent_on?: string | null;
      timezone?: string | null;
    };
    const rules = parseAttendanceRules(row.attendance_rules);
    if (!rules.report.enabled) continue;
    const timeZone = row.timezone || "Asia/Tashkent";
    const c = localClock(now, timeZone);
    const target = Number(rules.report.time.slice(0, 2)) * 60 + Number(rules.report.time.slice(3));
    // The cron ticks every 5 minutes: a 30-minute window survives a missed tick.
    if (c.minutes < target || c.minutes >= target + 30) continue;
    if (row.attendance_report_sent_on === c.date) continue;

    // Claim the day first so an overlapping tick skips it.
    const { data: claimed } = await supabaseAdmin
      .from("org_general_settings")
      .update({ attendance_report_sent_on: c.date })
      .eq("organization_id", row.organization_id)
      .or(`attendance_report_sent_on.is.null,attendance_report_sent_on.neq.${c.date}`)
      .select("organization_id");
    if (!claimed?.length) continue;

    try {
      sent += await sendOrgReport(row.organization_id, rules, timeZone, now, c);
    } catch (err) {
      console.error("[attendance] report failed", row.organization_id, err);
    }
  }
  return { sent };
}

async function sendOrgReport(
  orgId: string,
  rules: AttendanceRules,
  timeZone: string,
  now: Date,
  c: ReturnType<typeof localClock>,
): Promise<number> {
  const { data: org } = await supabaseAdmin
    .from("organizations")
    .select("name, active, frozen_at")
    .eq("id", orgId)
    .maybeSingle();
  if (!org || org.active === false || org.frozen_at) return 0;

  const { data: people } = await supabaseAdmin
    .from("profiles")
    .select("id, full_name, email, role, manager_id, telegram_chat_id")
    .eq("organization_id", orgId)
    .neq("role", "platform_owner");
  const staff = people ?? [];
  const readers = staff.filter(
    (p) => (p.role === "super_admin" || p.role === "rop") && p.telegram_chat_id,
  );
  if (!readers.length) return 0;

  const since = dayStart(now, timeZone);
  const { data: sessions } = await supabaseAdmin
    .from("work_sessions")
    .select("*")
    .eq("organization_id", orgId)
    .gte("clock_in", since.toISOString())
    .order("clock_in", { ascending: true });
  // People who never pressed anything but were on the phone count as come.
  const { data: calls } = await supabaseAdmin
    .from("pbx_calls")
    .select("initiated_by, created_at")
    .eq("organization_id", orgId)
    .gte("created_at", since.toISOString())
    .not("initiated_by", "is", null)
    .order("created_at", { ascending: true })
    .limit(5000);

  // Messages to clients count as the first contact too, when the rule says so.
  const { data: msgs } =
    rules.startMode !== "button" && rules.contact.messages
      ? await supabaseAdmin
          .from("lead_telegram_messages")
          .select("sent_by, created_at")
          .eq("organization_id", orgId)
          .eq("direction", "out")
          .gte("created_at", since.toISOString())
          .not("sent_by", "is", null)
          .order("created_at", { ascending: true })
          .limit(5000)
      : { data: [] as { sent_by: string | null; created_at: string }[] };

  const byPerson = new Map<string, ReportPerson>();
  for (const p of staff) {
    const shift = shiftFor(rules, p.id);
    const mine = (sessions ?? []).filter((s) => s.profile_id === p.id);
    const firstCall = (calls ?? []).find((x) => x.initiated_by === p.id)?.created_at ?? null;
    const firstMsg = (msgs ?? []).find((x) => x.sent_by === p.id)?.created_at ?? null;
    const first = mine[0] ?? null;
    // When the day started under the company's rule (Davomat qoidalari).
    const contact = firstContact(rules, firstCall, firstMsg);
    const start = ruleDayStart(rules, first?.clock_in ?? null, contact?.at ?? null);
    const clockIn = start.at ? new Date(start.at) : null;
    const worked = mine.reduce(
      (sum, s) =>
        sum +
        workedMinutes(new Date(s.clock_in), s.clock_out ? new Date(s.clock_out) : null, rules, now),
      0,
    );
    byPerson.set(p.id, {
      name: p.full_name || p.email || "—",
      clockIn: clockIn ? hm(clockIn, timeZone) : null,
      method:
        start.by === "checkin" && first
          ? first.method === "telegram"
            ? "telegram"
            : "web"
          : start.by === "contact"
            ? contact?.kind === "message"
              ? "messages"
              : "calls"
            : null,
      lateMin: clockIn ? lateMinutes(clockIn, shift, rules.graceMin, timeZone) : 0,
      workedMin: worked,
      dayOff: !isWorkday(shift, now, timeZone),
    });
  }

  const [, mm, dd] = c.date.split("-");
  const dateLabel = `${Number(dd)}-${MONTHS[Number(mm) - 1]}`;
  let sent = 0;
  for (const r of readers) {
    // A head of sales hears about their own team; admins about everyone.
    const team =
      r.role === "rop"
        ? staff.filter((p) => p.manager_id === r.id || p.id === r.id)
        : staff.filter((p) => p.role !== "super_admin" || p.id !== r.id);
    const list = team.map((p) => byPerson.get(p.id)!).filter(Boolean);
    if (!list.length) continue;
    try {
      await sendTelegramMessage(
        Number(r.telegram_chat_id),
        attendanceReportText(org.name || "SalesIQ", dateLabel, list),
      );
      sent++;
    } catch {
      // Bot blocked by this person: the others still get it.
    }
  }
  return sent;
}

/* ---- Davomat eslatmalari (Admin -> Davomat -> Eslatmalar) ------------- */

let remindersPurgedAt = 0;

/**
 * From the 5-minute cron: each company's Telegram reminders around its
 * people's shifts (dueReminder in attendance-rules.ts) -- before the start
 * to those not checked in, while late, and before / at the end to those
 * still at work. Each one once per person and day (platform_ops_log
 * "attrem:<person>:<day>:<key>"); rows older than two days are removed.
 */
export async function sendAttendanceReminders(now = new Date()): Promise<{ sent: number }> {
  if (Date.now() - remindersPurgedAt > 3_600_000) {
    remindersPurgedAt = Date.now();
    await supabaseAdmin
      .from("platform_ops_log")
      .delete()
      .like("key", "attrem:%")
      .lt("created_at", new Date(now.getTime() - 2 * 86_400_000).toISOString());
  }
  const { data: rows } = await supabaseAdmin
    .from("org_general_settings")
    .select("*")
    .neq("attendance_rules", {});
  let sent = 0;
  for (const raw of rows ?? []) {
    const row = raw as {
      organization_id: string;
      attendance_rules?: unknown;
      timezone?: string | null;
    };
    const rules = parseAttendanceRules(row.attendance_rules);
    if (!rules.reminders.enabled) continue;
    try {
      sent += await sendOrgReminders(
        row.organization_id,
        rules,
        row.timezone || "Asia/Tashkent",
        now,
      );
    } catch (err) {
      console.error("[attendance] reminders failed", row.organization_id, err);
    }
  }
  return { sent };
}

async function sendOrgReminders(
  orgId: string,
  rules: AttendanceRules,
  timeZone: string,
  now: Date,
): Promise<number> {
  const { data: org } = await supabaseAdmin
    .from("organizations")
    .select("active, frozen_at")
    .eq("id", orgId)
    .maybeSingle();
  if (!org || org.active === false || org.frozen_at) return 0;

  const c = localClock(now, timeZone);
  const { data: people } = await supabaseAdmin
    .from("profiles")
    .select("id, full_name, role, telegram_chat_id")
    .eq("organization_id", orgId)
    .neq("role", "platform_owner")
    .not("telegram_chat_id", "is", null);
  const staff = (people ?? []).filter((p) => p.telegram_chat_id);
  if (!staff.length) return 0;

  // Only people with something possibly due need the day's facts.
  const maybe = staff.filter(
    (p) =>
      dueReminder(rules.reminders, shiftFor(rules, p.id), c, {
        checkedIn: false,
        open: false,
        name: null,
      }) ||
      dueReminder(rules.reminders, shiftFor(rules, p.id), c, {
        checkedIn: true,
        open: true,
        name: null,
      }),
  );
  if (!maybe.length) return 0;

  const since = dayStart(now, timeZone).toISOString();
  const ids = maybe.map((p) => p.id);
  const { data: sessions } = await supabaseAdmin
    .from("work_sessions")
    .select("profile_id, clock_out")
    .in("profile_id", ids)
    .gte("clock_in", since);
  // Under "first contact" rules a call or a message to a client starts the day.
  const contacted = new Set<string>();
  if (rules.startMode !== "button") {
    if (rules.contact.calls) {
      const { data } = await supabaseAdmin
        .from("pbx_calls")
        .select("initiated_by")
        .eq("organization_id", orgId)
        .in("initiated_by", ids)
        .gte("created_at", since)
        .limit(2000);
      for (const x of data ?? []) if (x.initiated_by) contacted.add(x.initiated_by);
    }
    if (rules.contact.messages) {
      const { data } = await supabaseAdmin
        .from("lead_telegram_messages")
        .select("sent_by")
        .eq("organization_id", orgId)
        .eq("direction", "out")
        .in("sent_by", ids)
        .gte("created_at", since)
        .limit(2000);
      for (const x of data ?? []) if (x.sent_by) contacted.add(x.sent_by);
    }
  }

  let sent = 0;
  for (const p of maybe) {
    const mine = (sessions ?? []).filter((s) => s.profile_id === p.id);
    const checkedIn = mine.length > 0 || (rules.startMode !== "button" && contacted.has(p.id));
    const open = mine.some((s) => !s.clock_out);
    const due = dueReminder(rules.reminders, shiftFor(rules, p.id), c, {
      checkedIn,
      open,
      name: p.full_name,
    });
    if (!due) continue;
    // Claim it first: an overlapping tick or a restart never sends it twice.
    const { error: claimErr } = await supabaseAdmin
      .from("platform_ops_log")
      .insert({ key: `attrem:${p.id}:${c.date}:${due.key}` });
    if (claimErr) continue;
    const chatId = Number(p.telegram_chat_id);
    try {
      if (rules.methods.telegram) {
        await sendTelegramMessageWithMarkup(
          chatId,
          due.text,
          keyboard(due.kind === "endBefore" || due.kind === "end"),
        );
      } else {
        await sendTelegramMessage(chatId, due.text);
      }
      sent++;
    } catch (err) {
      console.error("[attendance] reminder not sent", p.id, err);
    }
  }
  return sent;
}
