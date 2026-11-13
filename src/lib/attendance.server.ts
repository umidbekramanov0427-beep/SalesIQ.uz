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
import {
  callTelegramMethod,
  sendTelegramMessage,
  sendTelegramMessageWithMarkup,
} from "@/lib/telegram-report.server";
import { sendViaChatBot } from "@/lib/bot-tokens.server";
import { staffStartReply } from "@/lib/staff-bot";
import {
  BTN_MINE,
  BTN_NOTE,
  IN_TEXTS,
  NOTE_CALLBACK_RE,
  NOTE_KINDS,
  OUT_TEXTS,
  attendanceApplies,
  attendanceKeyboard,
  cleanNote,
  dateLine,
  davomatimText,
  lateNoteButton,
  monthSummary,
  noteKind,
  noteWaitFresh,
  type MonthDay,
  type NoteKind,
} from "@/lib/attendance-notes";

// Davomat through the Telegram bot: a linked employee presses "✅ Keldim"
// (a location-request button), Telegram sends their location, and it opens
// today's work session when they are within the office radius (Admin ->
// Davomat qoidalari); the same button turns into "🏁 Ketdim" and closes it.
// Under it: "📝 Izoh yozish" (the next message is kept as a comment on the
// day, shown in Nazorat -> Davomat and the evening report) and
// "📊 Davomatim" (today and the month so far). The evening report goes to
// admins and heads of sales from the 5-minute /telegram/send-daily-report
// cron, and so do the reminders around each shift.

const COMMAND_RE = /^\/(keldim|ketdim|davomat)(@\w+)?\s*$/i;
const NOTE_CMD_RE = /^\/izoh(@\w+)?\s*$/i;
const MINE_CMD_RE = /^\/davomatim(@\w+)?\s*$/i;
const CANCEL_RE = /^\/bekor(@\w+)?\s*$/i;

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

const keyboard = attendanceKeyboard;

/* ---- Comments ("📝 Izoh yozish") ------------------------------------------ */

// While the bot waits for a comment, platform_ops_log holds
// "attnote:<person>:<kind>" (NOTE_WAIT_MIN fresh; purged with the reminders).
const waitPrefix = (profileId: string) => `attnote:${profileId}:`;

async function clearNoteWait(profileId: string): Promise<void> {
  await supabaseAdmin
    .from("platform_ops_log")
    .delete()
    .like("key", `${waitPrefix(profileId)}%`)
    .then(
      () => undefined,
      () => undefined,
    );
}

async function noteWait(profileId: string, now: Date): Promise<NoteKind | null> {
  const { data } = await supabaseAdmin
    .from("platform_ops_log")
    .select("key, created_at")
    .like("key", `${waitPrefix(profileId)}%`)
    .order("created_at", { ascending: false })
    .limit(1);
  const row = data?.[0];
  if (!row || !noteWaitFresh(row.created_at, now)) return null;
  const kind = row.key.slice(waitPrefix(profileId).length) as NoteKind;
  return (NOTE_KINDS as readonly string[]).includes(kind) ? kind : "other";
}

/** Today's sessions (oldest first), the open one and the lateness. */
async function today(profileId: string, settings: Settings, now: Date) {
  const { rules, timeZone } = settings;
  const { data } = await supabaseAdmin
    .from("work_sessions")
    .select("*")
    .eq("profile_id", profileId)
    .gte("clock_in", dayStart(now, timeZone).toISOString())
    .order("clock_in", { ascending: true });
  const sessions = data ?? [];
  const shift = shiftFor(rules, profileId);
  const first = sessions[0] ?? null;
  return {
    sessions,
    shift,
    open: sessions.find((x) => !x.clock_out) ?? null,
    lateMin: first ? lateMinutes(new Date(first.clock_in), shift, rules.graceMin, timeZone) : 0,
  };
}

/** "📝 Izoh yozish" or "📝 Sababini yozish": wait for the comment. */
async function askForNote(
  chatId: number,
  profileId: string,
  settings: Settings,
  forced: NoteKind | null,
): Promise<void> {
  const now = new Date();
  const t = await today(profileId, settings, now);
  const c = localClock(now, settings.timeZone);
  const kind =
    forced ??
    noteKind({
      workday: isWorkday(t.shift, now, settings.timeZone),
      shiftStarted:
        c.minutes >=
        Number(t.shift.start.slice(0, 2)) * 60 +
          Number(t.shift.start.slice(3)) +
          settings.rules.graceMin,
      checkedIn: t.sessions.length > 0,
      lateMin: t.lateMin,
    });
  await clearNoteWait(profileId);
  await supabaseAdmin.from("platform_ops_log").insert({ key: `${waitPrefix(profileId)}${kind}` });
  await sendTelegramMessage(
    chatId,
    kind === "late"
      ? "✍️ Kechikish sababini bitta xabar bilan yozing.\nRahbaringiz uni platformada ko'radi.\n\n/bekor — bekor qilish"
      : "✍️ Izohingizni bitta xabar bilan yozing (masalan: kechikish sababi, uchrashuvda ekaningiz, erta ketishingiz).\nRahbaringiz uni platformada ko'radi.\n\n/bekor — bekor qilish",
  );
}

/** The waited-for comment: saved on today's date. */
async function saveNote(
  chatId: number,
  profile: { id: string; organization_id: string },
  settings: Settings,
  kind: NoteKind,
  text: string,
  open: boolean,
): Promise<void> {
  const body = cleanNote(text);
  await clearNoteWait(profile.id);
  if (!body) return;
  const now = new Date();
  const { error } = await supabaseAdmin.from("attendance_notes").insert({
    organization_id: profile.organization_id,
    profile_id: profile.id,
    day: localClock(now, settings.timeZone).date,
    kind,
    body,
    source: "telegram",
  });
  if (error) {
    console.error("[attendance] note not saved", error.message);
    await sendTelegramMessage(
      chatId,
      "Izohni hozircha saqlab bo'lmadi, birozdan keyin qayta yozing.",
    );
    return;
  }
  await sendTelegramMessageWithMarkup(
    chatId,
    "✅ Izohingiz saqlandi. Rahbaringiz uni Nazorat → Davomat'da ko'radi.",
    keyboard(open),
  );
}

/** "📊 Davomatim": today and the month so far. */
async function sendMine(
  chatId: number,
  profile: { id: string; organization_id: string },
  settings: Settings,
): Promise<void> {
  const { rules, timeZone } = settings;
  const now = new Date();
  const c = localClock(now, timeZone);
  const dayNo = Number(c.date.slice(8));
  const monthStart = new Date(dayStart(now, timeZone).getTime() - (dayNo - 1) * 86_400_000);
  const shift = shiftFor(rules, profile.id);
  const [{ data: sessions }, { data: notes, error: notesErr }, { data: me }] = await Promise.all([
    supabaseAdmin
      .from("work_sessions")
      .select("clock_in, clock_out")
      .eq("profile_id", profile.id)
      .gte("clock_in", monthStart.toISOString())
      .order("clock_in", { ascending: true }),
    supabaseAdmin
      .from("attendance_notes")
      .select("day, kind, body")
      .eq("profile_id", profile.id)
      .gte("day", `${c.date.slice(0, 8)}01`)
      .order("created_at", { ascending: false })
      .limit(3),
    supabaseAdmin.from("profiles").select("full_name").eq("id", profile.id).maybeSingle(),
  ]);
  const days: MonthDay[] = [];
  for (let i = 0; i < dayNo; i++) {
    const noon = new Date(monthStart.getTime() + i * 86_400_000 + 12 * 3_600_000);
    const date = localClock(noon, timeZone).date;
    const mine = (sessions ?? []).filter(
      (x) => localClock(new Date(x.clock_in), timeZone).date === date,
    );
    const first = mine[0] ? new Date(mine[0].clock_in) : null;
    days.push({
      date,
      clockIn: first ? hm(first, timeZone) : null,
      lateMin: first ? lateMinutes(first, shift, rules.graceMin, timeZone) : 0,
      workedMin: mine.reduce(
        (sum, x) =>
          sum +
          workedMinutes(
            new Date(x.clock_in),
            x.clock_out ? new Date(x.clock_out) : null,
            rules,
            now,
          ),
        0,
      ),
      workday: isWorkday(shift, noon, timeZone),
    });
  }
  const todayRow = days.find((d) => d.date === c.date) ?? null;
  const open = (sessions ?? []).some(
    (x) => !x.clock_out && localClock(new Date(x.clock_in), timeZone).date === c.date,
  );
  const monthName = MONTHS[Number(c.date.slice(5, 7)) - 1] ?? "";
  await sendTelegramMessageWithMarkup(
    chatId,
    davomatimText({
      name: (me as { full_name?: string | null } | null)?.full_name ?? null,
      today: todayRow,
      shift: todayRow?.workday ? { start: shift.start, end: shift.end } : null,
      open,
      month: monthSummary(days),
      monthName: `${monthName.charAt(0).toUpperCase()}${monthName.slice(1)} oyi`,
      notes: notesErr
        ? []
        : (notes ?? []).map((n) => ({ date: n.day, kind: n.kind as NoteKind, body: n.body })),
    }),
    keyboard(open),
  );
}

/**
 * The staff bot's plain /start for a linked person: the greeting, with the
 * attendance buttons under the chat when attendance applies to them.
 */
export async function sendStaffStart(
  chatId: number,
  profile: { id: string; organization_id: string | null; role?: string | null },
  name: string | null,
): Promise<void> {
  if (!profile.organization_id || !attendanceApplies(profile)) {
    await sendTelegramMessageWithMarkup(chatId, staffStartReply({ name, attendance: false }), {
      remove_keyboard: true,
    });
    return;
  }
  const { rules, timeZone } = await loadSettings(profile.organization_id);
  const open = await openSession(profile.id, dayStart(new Date(), timeZone));
  await sendTelegramMessageWithMarkup(
    chatId,
    staffStartReply({ name, attendance: true }),
    keyboard(!!open, rules.methods.telegram),
  );
}

/**
 * The inline "📝 Sababini yozish" under a late reminder (callback_query).
 * Returns false when the button is not ours.
 */
export async function handleAttendanceCallback(
  chatId: number,
  profile: { id: string; organization_id: string | null } | null,
  callback: { id: string; data?: string },
): Promise<boolean> {
  const m = (callback.data ?? "").match(NOTE_CALLBACK_RE);
  if (!m) return false;
  await sendViaChatBot(chatId, (token) =>
    callTelegramMethod(token, "answerCallbackQuery", { callback_query_id: callback.id }),
  ).catch(() => undefined);
  if (!profile?.organization_id) return true;
  const settings = await loadSettings(profile.organization_id);
  await askForNote(chatId, profile.id, settings, m[1] as NoteKind);
  return true;
}

/**
 * An attendance command, button text or location from a linked employee.
 * Returns false when the message is not about attendance (the webhook goes on).
 */
export async function handleAttendanceTelegram(
  chatId: number,
  profile: { id: string; organization_id: string | null; role?: string | null },
  message: TgLocationMessage,
): Promise<boolean> {
  const text = (message.text ?? "").trim();
  const isNote = text === BTN_NOTE || NOTE_CMD_RE.test(text);
  const isMine = text === BTN_MINE || MINE_CMD_RE.test(text);
  const isCancel = CANCEL_RE.test(text);
  const isCommand = COMMAND_RE.test(text) || IN_TEXTS.includes(text) || OUT_TEXTS.includes(text);
  if (!profile.organization_id || !attendanceApplies(profile)) {
    // The platform owner (or an account without a company) keeps no
    // attendance: say so instead of staying silent.
    if (!isCommand && !isNote && !isMine && !message.location) return false;
    await sendTelegramMessageWithMarkup(
      chatId,
      staffStartReply({ name: null, attendance: false }),
      {
        remove_keyboard: true,
      },
    );
    return true;
  }
  const org = { id: profile.id, organization_id: profile.organization_id };

  // A plain message while the bot waits for a comment is that comment.
  if (!message.location && !isCommand && !isNote && !isMine) {
    if (!text) return false;
    const now = new Date();
    if (isCancel) {
      if (!(await noteWait(profile.id, now))) return false;
      await clearNoteWait(profile.id);
      await sendTelegramMessage(chatId, "Bekor qilindi.");
      return true;
    }
    if (text.startsWith("/")) return false;
    const waiting = await noteWait(profile.id, now);
    if (!waiting) return false;
    const settings = await loadSettings(profile.organization_id);
    const open = await openSession(profile.id, dayStart(now, settings.timeZone));
    await saveNote(chatId, org, settings, waiting, text, !!open);
    return true;
  }

  const settings = await loadSettings(profile.organization_id);
  const { rules, timeZone } = settings;
  if (isNote) {
    await askForNote(chatId, profile.id, settings, null);
    return true;
  }
  if (isMine) {
    await clearNoteWait(profile.id);
    await sendMine(chatId, org, settings);
    return true;
  }
  await clearNoteWait(profile.id);
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
        ? `Ishdasiz: <b>${hm(new Date(open.clock_in), timeZone)}</b> dan beri. Ketayotganda «🏁 Ketdim» tugmasini bosing.`
        : "Ishga kelganingizni belgilash uchun «✅ Keldim» tugmasini bosing — joylashuvingiz yuboriladi.",
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
      ? `⏰ Ishga keldingiz: <b>${hm(now, timeZone)}</b> — <b>${late}</b> daqiqa kechikdingiz.`
      : `✅ Ishga keldingiz: <b>${hm(now, timeZone)}</b>. Omadli kun!`,
    keyboard(true),
  );
  // Late: offer to say why, right under the message.
  if (late > 0) {
    await sendTelegramMessageWithMarkup(
      chatId,
      "Kechikish sababini yozib qo'ysangiz, rahbaringiz ko'radi.",
      lateNoteButton(),
    ).catch(() => undefined);
  }
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

  // Their comments of the day ("📝 Izoh yozish"); none until the migration has run.
  const { data: noteRows } = await supabaseAdmin
    .from("attendance_notes")
    .select("profile_id, body")
    .eq("organization_id", orgId)
    .eq("day", c.date)
    .order("created_at", { ascending: true });
  const notesBy = new Map<string, string[]>();
  for (const n of noteRows ?? []) {
    notesBy.set(n.profile_id, [...(notesBy.get(n.profile_id) ?? []), n.body]);
  }

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
      note: notesBy.get(p.id)?.join(" · ") ?? null,
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
    const old = new Date(now.getTime() - 2 * 86_400_000).toISOString();
    for (const prefix of ["attrem:%", "attnote:%"]) {
      await supabaseAdmin
        .from("platform_ops_log")
        .delete()
        .like("key", prefix)
        .lt("created_at", old);
    }
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
    const atWork = due.kind === "endBefore" || due.kind === "end";
    try {
      // The day's first reminder comes after its date: "📅 Juma, 13-noyabr".
      if (rules.reminders.dateLine) {
        const { error: dateErr } = await supabaseAdmin
          .from("platform_ops_log")
          .insert({ key: `attrem:${p.id}:${c.date}:date` });
        if (!dateErr) {
          const line = dateLine(c.date, c.weekday);
          if (rules.methods.telegram)
            await sendTelegramMessageWithMarkup(chatId, line, keyboard(atWork));
          else await sendTelegramMessage(chatId, line);
        }
      }
      if (due.kind === "late") {
        // Late: the reason can be written straight from the reminder.
        await sendTelegramMessageWithMarkup(chatId, due.text, lateNoteButton());
      } else if (rules.methods.telegram) {
        await sendTelegramMessageWithMarkup(chatId, due.text, keyboard(atWork));
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
