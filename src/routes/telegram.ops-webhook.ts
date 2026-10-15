import crypto from "node:crypto";
import { createFileRoute } from "@tanstack/react-router";
import { appUrl, isOwnerChat, opsWebhookSecret, sendToOwner } from "@/lib/ops/bot.server";
import { parseOpsCommand } from "@/lib/ops/health";
import { replyToOpsCommand } from "@/lib/ops/health.server";
import { handleSupportTelegramReply } from "@/lib/support.server";

// The platform owner's monitoring bot (OPS_TELEGRAM_BOT_TOKEN, see
// src/lib/ops/bot.server.ts). It only talks to platform owners: commands
// (/holat, /kompaniyalar, /integratsiyalar, /xatolar, /yordam) and replies
// to support questions.

type OpsUpdate = {
  message?: {
    message_id?: number;
    text?: string;
    chat?: { id?: number; type?: string };
    reply_to_message?: { message_id?: number };
  };
};

export const Route = createFileRoute("/telegram/ops-webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const expected = opsWebhookSecret();
        const got = request.headers.get("x-telegram-bot-api-secret-token") ?? "";
        if (
          !expected ||
          got.length !== expected.length ||
          !crypto.timingSafeEqual(Buffer.from(got), Buffer.from(expected))
        ) {
          return Response.json({ ok: false }, { status: 401 });
        }

        const update = (await request.json().catch(() => ({}))) as OpsUpdate;
        const message = update.message;
        const chatId = message?.chat?.id;
        if (!message || !chatId || message.chat?.type !== "private") {
          return Response.json({ ok: true });
        }

        if (!(await isOwnerChat(chatId))) {
          await sendToOwner(
            chatId,
            "Bu bot faqat SalesIQ platforma egasi uchun. Avval asosiy SalesIQ botini platforma egasi akkauntiga ulang.",
          ).catch(() => undefined);
          return Response.json({ ok: true });
        }

        if (message.reply_to_message?.message_id) {
          if (await handleSupportTelegramReply(chatId, message, "ops")) {
            return Response.json({ ok: true });
          }
        }

        const command = parseOpsCommand(message.text ?? "") ?? "help";
        await replyToOpsCommand(chatId, command, appUrl());
        return Response.json({ ok: true });
      },
    },
  },
});
