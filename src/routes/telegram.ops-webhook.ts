import crypto from "node:crypto";
import { createFileRoute } from "@tanstack/react-router";
import { appUrl, isOwnerChat, opsWebhookSecret, sendToOwner } from "@/lib/ops/bot.server";
import { parseOpsCommand } from "@/lib/ops/health";
import { replyToOpsCommand } from "@/lib/ops/health.server";
import { handleSupportTelegramReply } from "@/lib/support.server";
import { BACKUP_BIND_RE, handleBackupBind } from "@/lib/telegram-backup.server";
import { refreshBotTokens, withBot } from "@/lib/bot-tokens.server";

// The platform owner's monitoring bot (OPS_TELEGRAM_BOT_TOKEN or saved in
// Platforma -> Botlar, see
// src/lib/ops/bot.server.ts). It only talks to platform owners: commands
// (/holat, /kompaniyalar, /integratsiyalar, /xatolar, /yordam) and replies
// to support questions.

type OpsUpdate = {
  channel_post?: { chat?: { id?: number; title?: string }; text?: string };
  message?: {
    message_id?: number;
    text?: string;
    chat?: { id?: number; type?: string; title?: string };
    reply_to_message?: { message_id?: number };
  };
};

export const Route = createFileRoute("/telegram/ops-webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        await refreshBotTokens();
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
        // Platforma -> Zaxira: "/zaxira CODE" in the backup channel (or group)
        // binds it; the backups then come through this bot.
        {
          const post = update.channel_post ?? update.message;
          const m = (post?.text ?? "").match(BACKUP_BIND_RE);
          if (m && post?.chat?.id) {
            const chat = { id: post.chat.id, title: post.chat.title ?? null };
            await withBot("ops", () => handleBackupBind(chat, m[1]!)).catch((err) =>
              console.error("[ops] backup bind", err),
            );
            return Response.json({ ok: true });
          }
        }
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
