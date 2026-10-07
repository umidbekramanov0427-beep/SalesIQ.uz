// Server-only. The AI mentor for interns (profiles.is_intern): greets them
// on each day of the probation, checks in during the work day, and answers
// their questions -- on the platform and in Telegram (personal chat and the
// intern's onboarding group), all sharing one conversation history in
// intern_mentor_messages.
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { callGemini } from "@/lib/gemini.server";
import { sendTelegramMessage } from "@/lib/telegram-report.server";
import { internDay, lessonsForDay, type RoadmapLesson } from "@/lib/intern-roadmap";

export const MENTOR_SYSTEM_PROMPT = `SalesIQ.uz platformasining shaxsiy sun'iy intellekt (AI) mentori sifatida harakat qil.
Vazifang — kompaniyaga yangi kelgan amaliyotchi sotuvchilarga platformadagi "Sinfxona" darsliklarini o'zlashtirishda ko'maklashish, ularni qutlash va yo'naltirish.
O'zingni doim "SalesIQ.uz dagi AI mentoringiz" deb tanishtir.
Nazorat ham platformaning o'zida, ham Telegram guruhida bir vaqtning o'zida olib boriladi. Amaliyotchining holatini tekshirib tur, tushunmagan joylarini tushuntir, talabchan va ayni paytda rag'batlantiruvchi bo'l.

Qoidalar:
- Amaliyotchi qaysi tilda yozsa, o'sha tilda javob ber (standart: o'zbek tili, lotin yozuvi).
- Qisqa yoz: 2–6 gap. Markdown, jadval, ** belgilari ishlatma — oddiy matn va kerak bo'lsa "• " bilan ro'yxat.
- Faqat berilgan kontekstdagi darsliklar nomini ishlat, darslik o'ylab topma.
- Har bir xabar aniq keyingi qadam bilan tugasin (qaysi darsni ko'rish, nimani yozib yuborish).
- Amaliyotchidan tushunganini o'z so'zlari bilan (matn yoki ovozli xabar) yozib yuborishni so'ra.`;

type MentorKind = "greeting" | "checkin" | "chat";

export type InternProfile = {
  id: string;
  organization_id: string;
  full_name: string;
  is_intern: boolean;
  internship_start_date: string | null;
  internship_days: number;
  telegram_chat_id: number | null;
  intern_group_chat_id: number | null;
  mentor_last_checkin_at: string | null;
};

const INTERN_COLUMNS =
  "id, organization_id, full_name, is_intern, internship_start_date, internship_days, telegram_chat_id, intern_group_chat_id, mentor_last_checkin_at";

export async function loadIntern(internId: string): Promise<InternProfile | null> {
  const { data } = await supabaseAdmin
    .from("profiles")
    .select(INTERN_COLUMNS)
    .eq("id", internId)
    .maybeSingle();
  return (data as InternProfile | null) ?? null;
}

export async function loadActiveInterns(): Promise<InternProfile[]> {
  const { data } = await supabaseAdmin
    .from("profiles")
    .select(INTERN_COLUMNS)
    .eq("is_intern", true)
    .not("internship_start_date", "is", null);
  return ((data as InternProfile[] | null) ?? []).filter((p) => {
    const day = internDay(p.internship_start_date);
    return day != null && day <= p.internship_days;
  });
}

type LessonWithProgress = RoadmapLesson & {
  completed: boolean;
  lastPositionSeconds: number;
  lastWatchedAt: string | null;
};

export type InternContext = {
  intern: InternProfile;
  firstName: string;
  day: number;
  totalDays: number;
  today: LessonWithProgress[];
  completedTotal: number;
  lessonTotal: number;
  lastActivityAt: string | null;
  history: { sender: string; content: string; created_at: string }[];
};

export async function loadInternContext(intern: InternProfile): Promise<InternContext | null> {
  const day = internDay(intern.internship_start_date);
  if (!day) return null;
  const [{ data: lessons }, { data: sections }, { data: progress }, { data: history }] =
    await Promise.all([
      supabaseAdmin
        .from("lessons")
        .select("id, title, section_id, position, intern_day, duration_seconds")
        .eq("organization_id", intern.organization_id),
      supabaseAdmin
        .from("lesson_sections")
        .select("id, position")
        .eq("organization_id", intern.organization_id),
      supabaseAdmin
        .from("lesson_progress")
        .select("lesson_id, completed, last_position_seconds, last_watched_at")
        .eq("user_id", intern.id),
      supabaseAdmin
        .from("intern_mentor_messages")
        .select("sender, content, created_at")
        .eq("intern_id", intern.id)
        .order("created_at", { ascending: false })
        .limit(14),
    ]);
  const progressBy = new Map((progress ?? []).map((p) => [p.lesson_id, p]));
  const todays = lessonsForDay(lessons ?? [], sections ?? [], intern.internship_days, day).map(
    (l): LessonWithProgress => {
      const p = progressBy.get(l.id);
      return {
        ...l,
        completed: p?.completed ?? false,
        lastPositionSeconds: p?.last_position_seconds ?? 0,
        lastWatchedAt: p?.last_watched_at ?? null,
      };
    },
  );
  const lastActivityAt =
    (progress ?? [])
      .map((p) => p.last_watched_at)
      .sort()
      .at(-1) ?? null;
  return {
    intern,
    firstName: (intern.full_name || "").trim().split(/\s+/)[0] || "do'st",
    day,
    totalDays: intern.internship_days,
    today: todays,
    completedTotal: (progress ?? []).filter((p) => p.completed).length,
    lessonTotal: (lessons ?? []).length,
    lastActivityAt,
    history: (history ?? []).reverse(),
  };
}

function minutes(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

function describeContext(ctx: InternContext): string {
  const lessons =
    ctx.today.length === 0
      ? "Bugunga darslik biriktirilmagan (Sinfxonada darslik yo'q yoki hammasi oldingi kunlarga taqsimlangan)."
      : ctx.today
          .map((l, i) => {
            const status = l.completed
              ? "ko'rib bo'lingan"
              : l.lastPositionSeconds > 0
                ? `boshlangan, ${minutes(l.lastPositionSeconds)} da to'xtagan`
                : "hali boshlanmagan";
            return `${i + 1}. "${l.title}" — ${status}`;
          })
          .join("\n");
  const history = ctx.history
    .slice(-10)
    .map((m) => `${m.sender === "mentor" ? "Mentor" : "Amaliyotchi"}: ${m.content}`)
    .join("\n");
  return [
    `Amaliyotchi: ${ctx.intern.full_name} (ismi: ${ctx.firstName})`,
    `Sinov davri: ${ctx.day}-kun / jami ${ctx.totalDays} kun`,
    `Toshkent vaqti: ${new Date(Date.now() + 5 * 3600_000).toISOString().slice(11, 16)}`,
    `Umumiy progress: ${ctx.completedTotal} / ${ctx.lessonTotal} darslik tugatilgan`,
    `Oxirgi darslik faolligi: ${ctx.lastActivityAt ?? "hali yo'q"}`,
    `Bugungi reja (Sinfxona):\n${lessons}`,
    history ? `Oxirgi suhbat:\n${history}` : "Oldin suhbat bo'lmagan.",
  ].join("\n\n");
}

/** Used whenever Gemini is unavailable, so the intern is never left without a message. */
function fallbackMessage(ctx: InternContext, kind: MentorKind): string {
  const first = ctx.today.find((l) => !l.completed);
  if (kind === "greeting") {
    const plan = ctx.today.length
      ? `\n\nBugungi reja:\n${ctx.today.map((l) => `• ${l.title}`).join("\n")}`
      : "";
    return `Salom ${ctx.firstName}! Men SalesIQ.uz dagi shaxsiy sun'iy intellekt (AI) mentoringiz bo'laman. Bugun sinov davringizning ${ctx.day}-kuni, tabriklayman! Keling, birgalikda ishni boshlaymiz.${plan}`;
  }
  if (kind === "checkin") {
    return first
      ? `${ctx.firstName}, ishlar qalay? "${first.title}" darsligini ko'rib chiqdingizmi? Tushunganingizni qisqa qilib (matn yoki ovozli xabar) yozib yuboring.`
      : `${ctx.firstName}, bugungi darsliklarni tugatibsiz — zo'r! Eng muhim deb bilgan 3 ta fikrni yozib yuboring.`;
  }
  return "Savolingizni qabul qildim. AI xizmati hozir band — birozdan so'ng batafsil javob beraman.";
}

function instruction(kind: MentorKind, ctx: InternContext): string {
  if (kind === "greeting") {
    return `Kun boshidagi tabrik xabarini yoz. "Salom ${ctx.firstName}! Men SalesIQ.uz dagi shaxsiy sun'iy intellekt (AI) mentoringiz bo'laman. Bugun sinov davringizning ${ctx.day}-kuni..." ruhida boshla, bugungi darsliklar tartibini "• " ro'yxat qilib ber va birinchi qadamni ayt.`;
  }
  if (kind === "checkin") {
    return "Ish kuni davomidagi nazorat xabarini yoz: progressga qarab holatini so'ra. Darslikni ko'rgan bo'lsa — tushunganini o'z so'zlari bilan matn yoki ovozli xabar qilib yuborishni so'ra; to'xtab qolgan bo'lsa — davom ettirishga undab, qaysi darsdan boshlashni ayt. Avvalgi xabarlaringni takrorlama.";
  }
  return "Amaliyotchining oxirgi xabariga mentor sifatida javob ber: tushunmagan joyini tushuntir, javobini baholab qisqa fikr bildir va keyingi qadamni ayt.";
}

export type IncomingAudio = { mimeType: string; base64: string };

/** Asks Gemini for the mentor's next message. Returns the transcript too when the intern sent a voice note. */
async function generate(
  ctx: InternContext,
  kind: MentorKind,
  userText: string | null,
  audio: IncomingAudio | null,
  timeoutMs: number,
): Promise<{ reply: string; transcript: string | null }> {
  const apiKey = process.env["GEMINI_API_KEY"];
  if (!apiKey) return { reply: fallbackMessage(ctx, kind), transcript: null };

  const parts: unknown[] = [
    {
      text: `${describeContext(ctx)}\n\nVazifa: ${instruction(kind, ctx)}${
        userText ? `\n\nAmaliyotchining yangi xabari: ${userText}` : ""
      }${
        audio
          ? "\n\nAmaliyotchi ovozli xabar yubordi (ilova qilingan). Uni tinglab, mazmunini transcript maydoniga yoz va unga javob ber."
          : ""
      }\n\nFaqat JSON qaytar: {"reply": "...", "transcript": ${audio ? '"..."' : "null"}}`,
    },
  ];
  if (audio) parts.push({ inline_data: { mime_type: audio.mimeType, data: audio.base64 } });

  try {
    const res = await callGemini(
      apiKey,
      {
        systemInstruction: { parts: [{ text: MENTOR_SYSTEM_PROMPT }] },
        contents: [{ role: "user", parts }],
        generationConfig: { temperature: 0.7, responseMimeType: "application/json" },
      },
      timeoutMs,
    );
    if (!res.ok) return { reply: fallbackMessage(ctx, kind), transcript: null };
    const json = (await res.json()) as {
      candidates?: { content?: { parts?: { text?: string }[] } }[];
    };
    const raw = json.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("") ?? "";
    const parsed = JSON.parse(raw) as { reply?: unknown; transcript?: unknown };
    const reply = typeof parsed.reply === "string" ? parsed.reply.trim() : "";
    return {
      reply: reply || fallbackMessage(ctx, kind),
      transcript:
        typeof parsed.transcript === "string" && parsed.transcript.trim()
          ? parsed.transcript.trim()
          : null,
    };
  } catch {
    return { reply: fallbackMessage(ctx, kind), transcript: null };
  }
}

function escapeHtml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

async function sendToTelegram(chatIds: (number | null)[], text: string) {
  const unique = [...new Set(chatIds.filter((c): c is number => c != null))];
  await Promise.all(
    unique.map((chatId) =>
      sendTelegramMessage(chatId, `🎓 <b>AI Mentor</b>\n\n${escapeHtml(text)}`).catch(
        () => undefined,
      ),
    ),
  );
}

async function storeMessage(
  ctx: InternContext,
  row: {
    sender: "mentor" | "intern";
    channel: "platform" | "telegram";
    kind: MentorKind;
    content: string;
  },
) {
  await supabaseAdmin.from("intern_mentor_messages").insert({
    organization_id: ctx.intern.organization_id,
    intern_id: ctx.intern.id,
    day: ctx.day,
    ...row,
  });
}

/** Refreshes the profile's current_day / onboarding_status snapshot (readable from SQL reports). */
async function saveStatus(ctx: InternContext, patch: { mentor_last_checkin_at?: string } = {}) {
  await supabaseAdmin
    .from("profiles")
    .update({
      current_day: ctx.day,
      onboarding_status: {
        day: ctx.day,
        total_days: ctx.totalDays,
        completed_lessons: ctx.completedTotal,
        total_lessons: ctx.lessonTotal,
        today: ctx.today.map((l) => ({
          lesson_id: l.id,
          title: l.title,
          completed: l.completed,
          last_position_seconds: l.lastPositionSeconds,
        })),
        last_activity_at: ctx.lastActivityAt,
        updated_at: new Date().toISOString(),
      },
      ...patch,
    })
    .eq("id", ctx.intern.id);
}

async function hasGreetingToday(ctx: InternContext): Promise<boolean> {
  const { count } = await supabaseAdmin
    .from("intern_mentor_messages")
    .select("id", { count: "exact", head: true })
    .eq("intern_id", ctx.intern.id)
    .eq("kind", "greeting")
    .eq("day", ctx.day);
  return (count ?? 0) > 0;
}

/** Today's greeting, once per day -- on the platform and in Telegram. Returns false if already sent. */
export async function sendGreetingIfDue(intern: InternProfile): Promise<boolean> {
  const ctx = await loadInternContext(intern);
  if (!ctx || ctx.day > ctx.totalDays) return false;
  if (await hasGreetingToday(ctx)) return false;
  const { reply } = await generate(ctx, "greeting", null, null, 25_000);
  // Re-check right before writing: two tabs opening at once must not both greet.
  if (await hasGreetingToday(ctx)) return false;
  await storeMessage(ctx, {
    sender: "mentor",
    channel: "platform",
    kind: "greeting",
    content: reply,
  });
  await saveStatus(ctx, { mentor_last_checkin_at: new Date().toISOString() });
  await sendToTelegram([intern.telegram_chat_id, intern.intern_group_chat_id], reply);
  return true;
}

const CHECKIN_EVERY_MIN = 45;
const QUIET_CHECKIN_EVERY_MIN = 90;
const WORK_START_HOUR = 9;
const WORK_END_HOUR = 19;

/** Called by the cron route for each active intern; decides on its own whether a check-in is due. */
export async function checkInIfDue(intern: InternProfile): Promise<"greeted" | "checked" | "skip"> {
  const tashkent = new Date(Date.now() + 5 * 3600_000);
  const hour = tashkent.getUTCHours();
  if (tashkent.getUTCDay() === 0 || hour < WORK_START_HOUR || hour >= WORK_END_HOUR) return "skip";

  if (await sendGreetingIfDue(intern)) return "greeted";

  const ctx = await loadInternContext(intern);
  if (!ctx) return "skip";
  const last = ctx.history.at(-1);
  // Mid-conversation: the intern wrote in the last 20 minutes -- leave them be.
  if (last?.sender === "intern" && Date.now() - Date.parse(last.created_at) < 20 * 60_000) {
    return "skip";
  }
  // Two unanswered mentor messages in a row -> slow down instead of spamming.
  const lastTwo = ctx.history.slice(-2);
  const unanswered = lastTwo.length === 2 && lastTwo.every((m) => m.sender === "mentor");
  const every = unanswered ? QUIET_CHECKIN_EVERY_MIN : CHECKIN_EVERY_MIN;
  const lastCheck = intern.mentor_last_checkin_at ? Date.parse(intern.mentor_last_checkin_at) : 0;
  if (Date.now() - lastCheck < every * 60_000) return "skip";

  const { reply } = await generate(ctx, "checkin", null, null, 25_000);
  await storeMessage(ctx, {
    sender: "mentor",
    channel: "platform",
    kind: "checkin",
    content: reply,
  });
  await saveStatus(ctx, { mentor_last_checkin_at: new Date().toISOString() });
  await sendToTelegram([intern.telegram_chat_id, intern.intern_group_chat_id], reply);
  return "checked";
}

/**
 * The intern wrote to the mentor (platform chat, Telegram text or voice).
 * Stores both sides; the reply goes back only to the chat it came from
 * (Telegram replies are delivered by the caller's chatId).
 */
export async function replyToIntern(
  intern: InternProfile,
  input: {
    channel: "platform" | "telegram";
    text: string | null;
    audio?: IncomingAudio | null;
    replyChatId?: number | null;
  },
): Promise<{ reply: string } | { error: string }> {
  const ctx = await loadInternContext(intern);
  if (!ctx) return { error: "Amaliyot hali boshlanmagan." };
  const audio = input.audio ?? null;
  const { reply, transcript } = await generate(ctx, "chat", input.text, audio, 30_000);
  const content = audio ? `🎤 ${transcript ?? "Ovozli xabar"}` : (input.text ?? "").trim();
  if (content) {
    await storeMessage(ctx, { sender: "intern", channel: input.channel, kind: "chat", content });
  }
  await storeMessage(ctx, {
    sender: "mentor",
    channel: input.channel,
    kind: "chat",
    content: reply,
  });
  await saveStatus(ctx);
  if (input.replyChatId != null) await sendToTelegram([input.replyChatId], reply);
  return { reply };
}

/** Downloads a Telegram voice/audio file (Bot API getFile) for Gemini. Null if too big or unavailable. */
export async function downloadTelegramAudio(fileId: string): Promise<IncomingAudio | null> {
  const token = process.env["TELEGRAM_BOT_TOKEN"];
  if (!token) return null;
  try {
    const meta = await fetch(
      `https://api.telegram.org/bot${token}/getFile?file_id=${encodeURIComponent(fileId)}`,
    );
    const json = (await meta.json()) as { result?: { file_path?: string; file_size?: number } };
    const path = json.result?.file_path;
    if (!path || (json.result?.file_size ?? 0) > 15 * 1024 * 1024) return null;
    const file = await fetch(`https://api.telegram.org/file/bot${token}/${path}`);
    if (!file.ok) return null;
    const buf = Buffer.from(await file.arrayBuffer());
    const mimeType = path.endsWith(".mp3")
      ? "audio/mpeg"
      : path.endsWith(".m4a")
        ? "audio/mp4"
        : "audio/ogg";
    return { mimeType, base64: buf.toString("base64") };
  } catch {
    return null;
  }
}
