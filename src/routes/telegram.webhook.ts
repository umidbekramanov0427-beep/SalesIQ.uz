import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { sendTelegramMessage } from "@/lib/telegram-report.server";

type TelegramUpdate = {
  message?: {
    text?: string;
    chat?: { id?: number };
  };
};

const CODE_RE = /[A-Z0-9]{8}/;

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
        const rawText = update.message?.text ?? "";
        if (!chatId) return Response.json({ ok: true });

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
        // accidentally look like an 8-character link code.
        const { data: linkedProfile } = await supabaseAdmin
          .from("profiles")
          .select("id, organization_id, telegram_onboarding_step")
          .eq("telegram_chat_id", chatId)
          .maybeSingle();
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
