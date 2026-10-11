import crypto from "node:crypto";
import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  ensureTelegramWebhookSecret,
  sendTelegramMessage,
  telegramWebhookSecret,
} from "@/lib/telegram-report.server";
import { AI_SETUP_QUESTIONS, finishOnboardingInterview } from "@/lib/ai-onboarding.server";
import {
  downloadTelegramAudio,
  loadIntern,
  replyToIntern,
  type InternProfile,
} from "@/lib/intern-mentor.server";
import { internDay } from "@/lib/intern-roadmap";
import { handleIncomingLeadMessage } from "@/lib/automations/engine.server";
import { ingestLead } from "@/lib/leads/lead-intake.server";

type TelegramUpdate = {
  message?: {
    from?: { id?: number; first_name?: string; last_name?: string; username?: string };
    contact?: {
      phone_number?: string;
      first_name?: string;
      last_name?: string;
      user_id?: number;
    };
    text?: string;
    caption?: string;
    voice?: { file_id?: string };
    audio?: { file_id?: string };
    chat?: {
      id?: number;
      type?: string;
      title?: string;
      first_name?: string;
      username?: string;
    };
  };
};

const CODE_RE = /[A-Z0-9]{8}/;
const BIND_RE = /^\/bind[@\w]*\s+([A-Z0-9]{8})/i;
const MENTOR_BIND_RE = /^\/mentor[@\w]*\s+([A-Z0-9]{8})/i;
const BARE_CODE_RE = /^\s*[A-Z0-9]{8}\s*$/;

// Asks the same 5 fields the in-app "AI bot bilan to'ldirish" widget does,
// one per message — since each answer maps to exactly one field, this
// needs no AI parsing (unlike the in-app widget, which extracts fields
// from a free-form transcript).
const ONBOARDING_QUESTIONS: { field: string; text: string }[] = [
  { field: "company_name", text: "Kompaniyangiz nomi qanday?" },
  { field: "description", text: "Biznesingiz haqida qisqacha yozing — nima bilan shug'ullanasiz?" },
  {
    field: "competitors",
    text: "Asosiy raqobatchilaringiz kimlar? Bo'lmasa \"yo'q\" deb yozing.",
  },
  {
    field: "terminology",
    text: "Biznesingizga xos atamalar yoki jargon bormi? Bo'lmasa \"yo'q\" deb yozing.",
  },
  {
    field: "tone",
    text: "AI yordamchi qanday ohangda gapirishini xohlaysiz? (masalan: rasmiy, do'stona, qisqa)",
  },
];

async function continueOnboarding(
  chatId: number,
  profile: { id: string; organization_id: string; telegram_onboarding_step: number | null },
  answerText: string,
) {
  const step = profile.telegram_onboarding_step ?? 0;
  const { data: current } = await supabaseAdmin
    .from("profiles")
    .select("telegram_onboarding_answers")
    .eq("id", profile.id)
    .maybeSingle();
  const answers = {
    ...((current?.telegram_onboarding_answers as Record<string, string> | null) ?? {}),
    [ONBOARDING_QUESTIONS[step]!.field]: answerText.trim(),
  };

  const nextStep = step + 1;
  if (nextStep < ONBOARDING_QUESTIONS.length) {
    await supabaseAdmin
      .from("profiles")
      .update({ telegram_onboarding_step: nextStep, telegram_onboarding_answers: answers })
      .eq("id", profile.id);
    await sendTelegramMessage(chatId, ONBOARDING_QUESTIONS[nextStep]!.text).catch(() => undefined);
    return;
  }

  await supabaseAdmin.from("business_profile").upsert(
    {
      organization_id: profile.organization_id,
      updated_by: profile.id,
      ...answers,
    },
    { onConflict: "organization_id" },
  );
  await supabaseAdmin
    .from("profiles")
    .update({ telegram_onboarding_step: null, telegram_onboarding_answers: null })
    .eq("id", profile.id);
  await sendTelegramMessage(
    chatId,
    "✅ Rahmat! Biznes profili to'ldirildi — buni istalgan vaqt Sozlamalar → Biznes profili bo'limida tahrirlashingiz mumkin.",
  ).catch(() => undefined);
}

// The "To'liq AI onboarding oqimi" interview -- distinct from
// continueOnboarding() above (business_profile / AI assistant tone), driven
// by telegram_ai_setup_step/telegram_ai_setup_answers so an in-progress
// business-profile chat and an in-progress AI setup chat can never step on
// each other. Started from the Integrations page once an admin's Telegram
// is linked (see onboarding.ai-setup.start.ts); once the last question is
// answered, this hands off to finishOnboardingInterview() to call Gemini
// and save the proposal for in-app review.
async function continueAiSetup(
  chatId: number,
  profile: { id: string; organization_id: string; telegram_ai_setup_step: number | null },
  answerText: string,
) {
  const step = profile.telegram_ai_setup_step ?? 0;
  const { data: current } = await supabaseAdmin
    .from("profiles")
    .select("telegram_ai_setup_answers")
    .eq("id", profile.id)
    .maybeSingle();
  const answers = {
    ...((current?.telegram_ai_setup_answers as Record<string, string> | null) ?? {}),
    [AI_SETUP_QUESTIONS[step]!.field]: answerText.trim(),
  };

  const nextStep = step + 1;
  // Mirrored onto org_ai_onboarding.current_step (not just the profile) so
  // the in-app review page can show live interview progress without
  // reading the interviewing admin's own profile row.
  await supabaseAdmin
    .from("org_ai_onboarding")
    .update({ current_step: nextStep })
    .eq("organization_id", profile.organization_id);

  if (nextStep < AI_SETUP_QUESTIONS.length) {
    await supabaseAdmin
      .from("profiles")
      .update({ telegram_ai_setup_step: nextStep, telegram_ai_setup_answers: answers })
      .eq("id", profile.id);
    await sendTelegramMessage(chatId, AI_SETUP_QUESTIONS[nextStep]!.text).catch(() => undefined);
    return;
  }

  await supabaseAdmin
    .from("profiles")
    .update({ telegram_ai_setup_step: null, telegram_ai_setup_answers: null })
    .eq("id", profile.id);
  await sendTelegramMessage(
    chatId,
    "✅ Rahmat! AI javoblaringizni tahlil qilib, sizga mos sozlamalar taklifini tuzmoqda — bir necha soniyada tayyor bo'ladi. Natijani SalesIQ ➝ Integratsiyalar ➝ AI bilan sozlash bo'limida ko'rasiz.",
  ).catch(() => undefined);

  try {
    await finishOnboardingInterview(profile.organization_id, answers);
    await sendTelegramMessage(
      chatId,
      "🎉 Taklif tayyor! SalesIQ platformasiga kiring va Integratsiyalar ➝ AI bilan sozlash bo'limida ko'rib chiqing.",
    ).catch(() => undefined);
  } catch {
    await sendTelegramMessage(
      chatId,
      "Taklifni tuzishda xatolik yuz berdi. SalesIQ ➝ Integratsiyalar ➝ AI bilan sozlash bo'limidan qaytadan urinib ko'rishingiz mumkin.",
    ).catch(() => undefined);
  }
}

const LOGIN_START_RE = /^\/start login_([A-Za-z0-9]+)/;

// Confirms one Telegram Login handoff (see telegram.login-start.ts /
// telegram.login-status.ts): the visitor's browser only ever holds an
// opaque token, embedded in the t.me deep link they just opened -- this
// is the one place that turns "this Telegram chat sent us this token"
// into an actual, real identity check (their already-linked
// telegram_chat_id) before minting anything sign-in-worthy.
async function handleLoginStart(chatId: number, token: string) {
  const { data: reqRow } = await supabaseAdmin
    .from("telegram_login_requests")
    .select("expires_at")
    .eq("token", token)
    .maybeSingle();
  if (!reqRow || new Date(reqRow.expires_at) < new Date()) {
    await sendTelegramMessage(
      chatId,
      'Bu kirish havolasi eskirgan. Saytda "Telegram orqali kirish"ni qaytadan bosing.',
    ).catch(() => undefined);
    return;
  }

  const { data: profile } = await supabaseAdmin
    .from("profiles")
    .select("id, email, full_name")
    .eq("telegram_chat_id", chatId)
    .maybeSingle();

  if (!profile) {
    await supabaseAdmin
      .from("telegram_login_requests")
      .update({ status: "no_profile" })
      .eq("token", token);
    await sendTelegramMessage(
      chatId,
      "Bu Telegram hisobingiz hali hech qanday SalesIQ profiliga ulanmagan. Avval email/parol bilan tizimga kiring va Sozlamalar ➝ Telegram bot bo'limidan ulang, keyin qaytadan urinib ko'ring.",
    ).catch(() => undefined);
    return;
  }

  const { data: link, error: linkError } = await supabaseAdmin.auth.admin.generateLink({
    type: "magiclink",
    email: profile.email,
  });
  if (linkError || !link?.properties?.hashed_token) {
    await sendTelegramMessage(
      chatId,
      "Kirishni tasdiqlashda xatolik yuz berdi. Birozdan so'ng qaytadan urinib ko'ring.",
    ).catch(() => undefined);
    return;
  }

  await supabaseAdmin
    .from("telegram_login_requests")
    .update({
      status: "confirmed",
      user_id: profile.id,
      token_hash: link.properties.hashed_token,
      email: profile.email,
    })
    .eq("token", token);

  await sendTelegramMessage(
    chatId,
    `✅ Kirish tasdiqlandi, ${profile.full_name || "hurmatli foydalanuvchi"}! Endi brauzeringizga qayting.`,
  ).catch(() => undefined);
}

async function maybeStartOnboarding(
  chatId: number,
  profile: { id: string; full_name: string; organization_id: string; role: string },
) {
  if (profile.role !== "super_admin" && profile.role !== "rop" && profile.role !== "platform_owner")
    return false;
  const { data: bp } = await supabaseAdmin
    .from("business_profile")
    .select("company_name")
    .eq("organization_id", profile.organization_id)
    .maybeSingle();
  if (bp?.company_name?.trim()) return false;

  await supabaseAdmin
    .from("profiles")
    .update({ telegram_onboarding_step: 0, telegram_onboarding_answers: {} })
    .eq("id", profile.id);
  await sendTelegramMessage(
    chatId,
    `Salom, ${profile.full_name || "hurmatli foydalanuvchi"}! Endi biznes profilingizni birga to'ldiramiz — AI yordamchi shu ma'lumotlardan foydalanadi. ${ONBOARDING_QUESTIONS[0]!.text}`,
  ).catch(() => undefined);
  return true;
}

async function handleGroupBind(
  chatId: number,
  chatType: "group" | "channel",
  title: string | null,
  code: string,
): Promise<void> {
  const { data: pending } = await supabaseAdmin
    .from("telegram_bind_codes")
    .select("organization_id, expires_at")
    .eq("code", code)
    .maybeSingle();

  if (!pending || new Date(pending.expires_at).getTime() < Date.now()) {
    await sendTelegramMessage(
      chatId,
      "Bu kod topilmadi yoki eskirgan. Sozlamalar ➝ Bildirishnomalar bo'limidan yangi kod oling.",
    ).catch(() => undefined);
    return;
  }

  const { error } = await supabaseAdmin.from("telegram_bound_chats").upsert(
    {
      organization_id: pending.organization_id,
      chat_id: chatId,
      chat_type: chatType,
      title,
    },
    { onConflict: "organization_id,chat_id" },
  );
  if (error) {
    await sendTelegramMessage(chatId, "Ulashda xatolik yuz berdi. Qayta urinib ko'ring.").catch(
      () => undefined,
    );
    return;
  }

  await supabaseAdmin
    .from("telegram_bind_codes")
    .delete()
    .eq("organization_id", pending.organization_id);

  await sendTelegramMessage(
    chatId,
    "✅ Ulandi! Endi yoqilgan umumiy ogohlantirishlar shu yerga ham keladi.",
  ).catch(() => undefined);
}

// Redeems a /telegram/link-lead code: binds this chat to the lead it was
// generated for. A chat_id or lead_id already bound to something else is
// dropped first (both columns are unique) so this never fails on a stale
// previous link -- a customer switching phones, or a rep re-linking the
// same lead, both just work.
async function handleLeadCodeRedeem(
  chatId: number,
  chatFirstName: string | null,
  chatUsername: string | null,
  pending: { lead_id: string; organization_id: string },
): Promise<void> {
  await supabaseAdmin.from("lead_telegram_links").delete().eq("chat_id", chatId);
  await supabaseAdmin.from("lead_telegram_links").delete().eq("lead_id", pending.lead_id);
  const { error } = await supabaseAdmin.from("lead_telegram_links").insert({
    organization_id: pending.organization_id,
    lead_id: pending.lead_id,
    chat_id: chatId,
    chat_first_name: chatFirstName,
    chat_username: chatUsername,
  });
  if (error) {
    await sendTelegramMessage(chatId, "Ulashda xatolik yuz berdi. Qayta urinib ko'ring.").catch(
      () => undefined,
    );
    return;
  }
  await supabaseAdmin.from("lead_telegram_link_codes").delete().eq("lead_id", pending.lead_id);
  await sendTelegramMessage(
    chatId,
    "✅ Ulandi! Endi yozgan xabarlaringiz to'g'ridan-to'g'ri kompaniya tizimiga tushadi.",
  ).catch(() => undefined);
}

async function logIncomingLeadMessage(
  chatId: number,
  link: { lead_id: string; organization_id: string },
  text: string,
): Promise<void> {
  if (!text.trim()) return;
  await supabaseAdmin.from("lead_telegram_messages").insert({
    organization_id: link.organization_id,
    lead_id: link.lead_id,
    direction: "in",
    text,
  });
  // A salesbot may be waiting for exactly this answer.
  await handleIncomingLeadMessage(link.organization_id, link.lead_id, text).catch(() => undefined);
}

function internshipActive(intern: InternProfile | null): intern is InternProfile {
  if (!intern?.is_intern) return false;
  const day = internDay(intern.internship_start_date);
  return day != null && day <= intern.internship_days;
}

// "/mentor CODE" sent in a group: binds that group to the intern who got
// the code (see intern-mentor.group-code.ts), so the AI mentor's greetings
// and check-ins are posted there too and the group can answer back.
async function handleMentorGroupBind(chatId: number, code: string): Promise<void> {
  const { data: intern } = await supabaseAdmin
    .from("profiles")
    .select("id, full_name")
    .eq("intern_group_link_code", code)
    .maybeSingle();
  if (!intern) {
    await sendTelegramMessage(
      chatId,
      "Bu kod topilmadi yoki ishlatilgan. SalesIQ ➝ Sinfxona ➝ Mening rejam bo'limidan yangi kod oling.",
    ).catch(() => undefined);
    return;
  }
  await supabaseAdmin
    .from("profiles")
    .update({ intern_group_chat_id: null })
    .eq("intern_group_chat_id", chatId);
  await supabaseAdmin
    .from("profiles")
    .update({ intern_group_chat_id: chatId, intern_group_link_code: null })
    .eq("id", intern.id);
  await sendTelegramMessage(
    chatId,
    `✅ Ulandi! Endi AI mentor ${intern.full_name || "amaliyotchi"} bilan shu guruhda ham ishlaydi: kunlik reja, nazorat savollari va javoblar shu yerga keladi. Savol yoki tushunganingizni matn yoki ovozli xabar qilib yozing.`,
  ).catch(() => undefined);
}

// A message to the mentor from Telegram (text, voice or audio).
async function forwardToMentor(
  intern: InternProfile,
  chatId: number,
  message: NonNullable<TelegramUpdate["message"]>,
): Promise<void> {
  const fileId = message.voice?.file_id ?? message.audio?.file_id;
  const audio = fileId ? await downloadTelegramAudio(fileId) : null;
  const text = (message.text ?? message.caption ?? "").trim() || null;
  if (!text && !audio) return;
  await replyToIntern(intern, { channel: "telegram", text, audio, replyChatId: chatId });
}

// Step 2 of the client Mini App (/tma/lead): Telegram delivers the number
// the client agreed to share as a contact message. It only counts when the
// contact is the sender's own (contact.user_id === from.id) -- a forwarded
// contact card of someone else must never become a lead. The business is
// the one whose Mini App this user opened in the last 30 minutes.
async function handleSharedContact(
  chatId: number,
  message: NonNullable<TelegramUpdate["message"]>,
): Promise<boolean> {
  const contact = message.contact;
  const fromId = message.from?.id;
  if (!contact?.phone_number || !fromId || contact.user_id !== fromId) return false;

  const since = new Date(Date.now() - 30 * 60_000).toISOString();
  const { data: pending } = await supabaseAdmin
    .from("tma_lead_requests")
    .select("id, organization_id, telegram_name, telegram_username")
    .eq("telegram_user_id", fromId)
    .eq("status", "pending")
    .gte("created_at", since)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!pending) return false;

  const phone = contact.phone_number.startsWith("+")
    ? contact.phone_number
    : `+${contact.phone_number}`;
  const name =
    [contact.first_name, contact.last_name].filter(Boolean).join(" ").trim() ||
    pending.telegram_name ||
    phone;
  const username = pending.telegram_username ?? message.from?.username ?? null;

  try {
    const result = await ingestLead(pending.organization_id, {
      name,
      phone,
      source: "Telegram Mini App",
      duplicateSource: "webhook",
      note: username ? `Telegram: @${username}` : "Telegram Mini App orqali yuborildi",
    });
    await supabaseAdmin
      .from("tma_lead_requests")
      .update({ status: "done", lead_id: result.leadId, duplicate: result.duplicate })
      .eq("id", pending.id);
    await sendTelegramMessage(
      chatId,
      "✅ Rahmat! Arizangiz qabul qilindi — menejerimiz tez orada siz bilan bog'lanadi.",
    ).catch(() => undefined);
  } catch (err) {
    console.error("[telegram webhook] mini app lead failed", err);
    await sendTelegramMessage(
      chatId,
      "Arizani saqlashda xatolik yuz berdi. Birozdan so'ng qaytadan urinib ko'ring.",
    ).catch(() => undefined);
  }
  return true;
}

export const Route = createFileRoute("/telegram/webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        // Always required (see telegramWebhookSecret): an unsigned update
        // could otherwise confirm a Telegram login for someone else's chat.
        const expected = telegramWebhookSecret();
        const got = request.headers.get("x-telegram-bot-api-secret-token") ?? "";
        if (
          !expected ||
          got.length !== expected.length ||
          !crypto.timingSafeEqual(Buffer.from(got), Buffer.from(expected))
        ) {
          // Most likely Telegram itself, still registered without the
          // secret (right after this check was introduced): re-register the
          // webhook with it. Harmless if someone else triggered this -- it
          // only ever talks to Telegram with our own bot token. Telegram
          // retries the refused update afterwards, now with the header.
          if (!got) {
            await ensureTelegramWebhookSecret(new URL(request.url).origin).catch((err) =>
              console.error("[telegram] could not register webhook secret", err),
            );
          }
          return Response.json({ ok: false }, { status: 401 });
        }

        const update = (await request.json().catch(() => ({}))) as TelegramUpdate;
        const chatId = update.message?.chat?.id;
        const chatType = update.message?.chat?.type;
        const rawText = update.message?.text ?? "";
        if (!chatId) return Response.json({ ok: true });

        // A group/channel is never a real person mid-onboarding -- the
        // only thing it can ever send us that matters is the /bind code
        // from "Bildirishnomalar" ➝ "Manzilni ulash". Handled first and
        // separately from the personal CODE_RE match below, since a bare
        // 8-char code pasted into a group (without the /bind prefix)
        // should NOT be looked up against profiles.telegram_link_code.
        if (chatType === "group" || chatType === "supergroup" || chatType === "channel") {
          const mentorBind = rawText.match(MENTOR_BIND_RE);
          if (mentorBind) {
            await handleMentorGroupBind(chatId, mentorBind[1]!.toUpperCase());
            return Response.json({ ok: true });
          }
          const bindMatch = rawText.match(BIND_RE);
          if (bindMatch) {
            await handleGroupBind(
              chatId,
              chatType === "channel" ? "channel" : "group",
              update.message?.chat?.title ?? null,
              bindMatch[1]!.toUpperCase(),
            );
            return Response.json({ ok: true });
          }
          // An intern's onboarding group: everything that isn't a bot
          // command goes to their AI mentor.
          if (chatType !== "channel" && !rawText.startsWith("/")) {
            const { data: groupIntern } = await supabaseAdmin
              .from("profiles")
              .select("id")
              .eq("intern_group_chat_id", chatId)
              .maybeSingle();
            const intern = groupIntern ? await loadIntern(groupIntern.id) : null;
            if (internshipActive(intern) && update.message) {
              await forwardToMentor(intern, chatId, update.message);
            }
          }
          return Response.json({ ok: true });
        }

        if (update.message?.contact && (await handleSharedContact(chatId, update.message))) {
          return Response.json({ ok: true });
        }

        // A Telegram Login deep link takes priority over everything else
        // below -- it's Telegram's own /start payload format, never
        // something a real onboarding answer or link code could collide
        // with.
        const loginStartMatch = rawText.match(LOGIN_START_RE);
        if (loginStartMatch) {
          await handleLoginStart(chatId, loginStartMatch[1]!);
          return Response.json({ ok: true });
        }

        // A chat already bound to a lead (see /telegram/link-lead) is a
        // customer mid-conversation, never a staff member mid-onboarding --
        // log the message onto that lead's timeline and stop, before any of
        // the staff-only flows below get a chance to run.
        const { data: leadLink } = await supabaseAdmin
          .from("lead_telegram_links")
          .select("lead_id, organization_id")
          .eq("chat_id", chatId)
          .maybeSingle();
        if (leadLink) {
          await logIncomingLeadMessage(chatId, leadLink, rawText);
          return Response.json({ ok: true });
        }

        // An ongoing onboarding conversation takes priority over code
        // matching — an answer like a company name could otherwise
        // accidentally look like an 8-character link code. AI setup is
        // checked first since it's an explicit, admin-initiated action
        // that should never be interrupted by the (auto-started)
        // business-profile flow below.
        const { data: linkedProfile } = await supabaseAdmin
          .from("profiles")
          .select("id, organization_id, telegram_onboarding_step, telegram_ai_setup_step")
          .eq("telegram_chat_id", chatId)
          .maybeSingle();
        if (linkedProfile && linkedProfile.telegram_ai_setup_step !== null) {
          await continueAiSetup(chatId, linkedProfile, rawText);
          return Response.json({ ok: true });
        }
        if (linkedProfile && linkedProfile.telegram_onboarding_step !== null) {
          await continueOnboarding(chatId, linkedProfile, rawText);
          return Response.json({ ok: true });
        }

        // An intern talking to their AI mentor in a personal chat. A bare
        // 8-character code still falls through to the linking flow below.
        if (linkedProfile && !BARE_CODE_RE.test(rawText)) {
          const intern = await loadIntern(linkedProfile.id);
          if (internshipActive(intern) && update.message) {
            await forwardToMentor(intern, chatId, update.message);
            return Response.json({ ok: true });
          }
        }

        const match = rawText.toUpperCase().match(CODE_RE);
        if (!match) {
          await sendTelegramMessage(
            chatId,
            "Ulash kodini topolmadim. SalesIQ ➝ Sozlamalar ➝ Telegram bot bo'limidan kodni oling va shu yerga yuboring.",
          ).catch(() => undefined);
          return Response.json({ ok: true });
        }

        const code = match[0];

        // A lead's own link code takes priority over a personal-account
        // code: the two use the same random alphabet, so a code word could
        // in principle exist in both tables, and it's a customer's chat --
        // whichever code they were actually handed -- that must win.
        const { data: pendingLeadLink } = await supabaseAdmin
          .from("lead_telegram_link_codes")
          .select("lead_id, organization_id, expires_at")
          .eq("code", code)
          .maybeSingle();
        if (pendingLeadLink) {
          if (new Date(pendingLeadLink.expires_at).getTime() < Date.now()) {
            await sendTelegramMessage(
              chatId,
              "Bu kod eskirgan. Menejerdan yangi kod so'rang.",
            ).catch(() => undefined);
            return Response.json({ ok: true });
          }
          await handleLeadCodeRedeem(
            chatId,
            update.message?.chat?.first_name ?? null,
            update.message?.chat?.username ?? null,
            pendingLeadLink,
          );
          return Response.json({ ok: true });
        }

        const { data: profile } = await supabaseAdmin
          .from("profiles")
          .select("id, full_name, organization_id, role")
          .eq("telegram_link_code", code)
          .maybeSingle();

        if (!profile) {
          await sendTelegramMessage(
            chatId,
            "Bu kod topilmadi yoki eskirgan. Sozlamalardan yangi kod oling.",
          ).catch(() => undefined);
          return Response.json({ ok: true });
        }

        await supabaseAdmin
          .from("profiles")
          .update({ telegram_chat_id: chatId, telegram_link_code: null })
          .eq("id", profile.id);

        await sendTelegramMessage(
          chatId,
          `✅ Ulandi! Endi kunlik hisobotlar shu yerga keladi, ${profile.full_name || "hurmatli foydalanuvchi"}.`,
        ).catch(() => undefined);

        await maybeStartOnboarding(chatId, profile);

        return Response.json({ ok: true });
      },
    },
  },
});
