import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { sendTelegramMessage } from "@/lib/telegram-report.server";
import { AI_SETUP_QUESTIONS, finishOnboardingInterview } from "@/lib/ai-onboarding.server";

type TelegramUpdate = {
  message?: {
    text?: string;
    chat?: { id?: number; type?: string; title?: string };
  };
};

const CODE_RE = /[A-Z0-9]{8}/;
const BIND_RE = /^\/bind[@\w]*\s+([A-Z0-9]{8})/i;

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

export const Route = createFileRoute("/telegram/webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const expected = process.env["TELEGRAM_WEBHOOK_SECRET"];
        if (expected) {
          const got = request.headers.get("x-telegram-bot-api-secret-token");
          if (got !== expected) return Response.json({ ok: false }, { status: 401 });
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
          const bindMatch = rawText.match(BIND_RE);
          if (bindMatch) {
            await handleGroupBind(
              chatId,
              chatType === "channel" ? "channel" : "group",
              update.message?.chat?.title ?? null,
              bindMatch[1]!.toUpperCase(),
            );
          }
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

        const match = rawText.toUpperCase().match(CODE_RE);
        if (!match) {
          await sendTelegramMessage(
            chatId,
            "Ulash kodini topolmadim. SalesIQ ➝ Sozlamalar ➝ Telegram bot bo'limidan kodni oling va shu yerga yuboring.",
          ).catch(() => undefined);
          return Response.json({ ok: true });
        }

        const code = match[0];
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
