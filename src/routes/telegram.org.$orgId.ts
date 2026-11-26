import crypto from "node:crypto";
import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { forgetChatOrg, orgBot, withOrgBot } from "@/lib/bot-tokens.server";
import { salesbotCodeFromStart, salesbotIdFromStart } from "@/lib/salesbots/start-link";
import {
  logIncomingLeadMessage,
  orgBotNewClient,
  redeemLeadCode,
  startSalesbotChat,
  type TelegramUpdate,
  type TgMessage,
} from "@/lib/telegram/client-chat.server";
import { callTelegramMethod, sendTelegramMessage } from "@/lib/telegram-report.server";
import { startTriggeredBots } from "@/lib/automations/engine.server";

// POST /telegram/org/<company id> -- updates from a company's own Telegram
// bot (Integratsiyalar -> Telegram bot, org-bot.server.ts). Only clients
// talk to it: the plain link opens the company's main salesbot (or just
// makes them a lead), s_<code> / sb_<id> links open a salesbot of this
// company, a lead's link code binds the chat, and every later message lands
// in the lead's chat. Replies go through the same bot.

const PLAIN_START_RE = /^\/start(@\w+)?\s*$/i;
const BARE_CODE_RE = /^\s*([A-Z0-9]{8})\s*$/;

export const Route = createFileRoute("/telegram/org/$orgId")({
  server: {
    handlers: {
      POST: async ({ request, params }) => {
        const orgId = params.orgId;
        const own = /^[0-9a-f-]{36}$/i.test(orgId) ? await orgBot(orgId) : null;
        const got = request.headers.get("x-telegram-bot-api-secret-token") ?? "";
        if (
          !own ||
          got.length !== own.webhookSecret.length ||
          !crypto.timingSafeEqual(Buffer.from(got), Buffer.from(own.webhookSecret))
        ) {
          return Response.json({ ok: false }, { status: 401 });
        }
        const update = (await request.json().catch(() => ({}))) as TelegramUpdate;
        await withOrgBot(orgId, own.token, async () => {
          // An inline button press counts as the client typing its text
          // (Telegram Salesbot «Tugma bosilganda»); the spinner is cleared.
          const cq = update.callback_query;
          if (cq) {
            await callTelegramMethod(own.token, "answerCallbackQuery", {
              callback_query_id: cq.id,
            }).catch(() => undefined);
          }
          const message: TgMessage | undefined =
            update.message ??
            (cq?.data && cq.message?.chat?.id
              ? ({
                  message_id: cq.message.message_id,
                  chat: { id: cq.message.chat.id, type: cq.message.chat.type ?? "private" },
                  text: cq.data,
                } as TgMessage)
              : undefined);
          const chatId = message?.chat?.id;
          // Only private chats with clients; groups and channels are not for this bot.
          if (!message || !chatId || message.chat?.type !== "private") return;
          const text = message.text ?? "";

          const salesbotId = salesbotIdFromStart(text);
          const salesbotCode = salesbotCodeFromStart(text);
          if (salesbotId || salesbotCode) {
            await startSalesbotChat(
              chatId,
              salesbotId ? { id: salesbotId } : { code: salesbotCode! },
              message,
              { viaOrgBot: true, onlyOrg: orgId },
            );
            return;
          }

          const { data: link } = await supabaseAdmin
            .from("lead_telegram_links")
            .select("*")
            .eq("chat_id", chatId)
            .maybeSingle();
          const linked = link?.organization_id === orgId ? link : null;

          if (PLAIN_START_RE.test(text) && !linked && own.defaultSalesbotId) {
            await startSalesbotChat(chatId, { id: own.defaultSalesbotId }, message, {
              viaOrgBot: true,
              onlyOrg: orgId,
            });
            return;
          }
          // «Yangi obunachiga lid ochilsin» off: /start alone only greets;
          // the client becomes a lead when they first write.
          if (PLAIN_START_RE.test(text) && !linked && !own.newSubscriberLead) {
            await sendTelegramMessage(
              chatId,
              "Assalomu alaykum! Savolingizni yozing — menejerimiz tez orada javob beradi.",
            ).catch(() => undefined);
            return;
          }

          // A lead's link code from the manager.
          const code = BARE_CODE_RE.exec(text)?.[1];
          if (code) {
            const { data: pending } = await supabaseAdmin
              .from("lead_telegram_link_codes")
              .select("lead_id, organization_id, expires_at")
              .eq("code", code)
              .eq("organization_id", orgId)
              .maybeSingle();
            if (pending) {
              if (new Date(pending.expires_at).getTime() < Date.now()) {
                await sendTelegramMessage(
                  chatId,
                  "Bu kod eskirgan. Menejerdan yangi kod so'rang.",
                ).catch(() => undefined);
              } else {
                await redeemLeadCode(
                  chatId,
                  message.chat?.first_name ?? null,
                  message.chat?.username ?? null,
                  pending,
                  true,
                );
              }
              return;
            }
          }

          if (linked) {
            if (!(linked as { via_org_bot?: boolean }).via_org_bot) {
              // A client of the shared bot now writes here: replies follow.
              await supabaseAdmin
                .from("lead_telegram_links")
                .update({ via_org_bot: true })
                .eq("chat_id", chatId)
                .then(
                  () => forgetChatOrg(chatId),
                  () => undefined,
                );
            }
            if (!PLAIN_START_RE.test(text)) await logIncomingLeadMessage(linked, message);
            // «Botda /start bosilganda» for a client we already know.
            else await startTriggeredBots(orgId, linked.lead_id, ["tg_start"], "");
            return;
          }

          // Someone new: the company's lead, and what they wrote is kept.
          await orgBotNewClient(orgId, chatId, message, own.username);
        }).catch((err) => console.error("[telegram org bot]", orgId, err));
        return Response.json({ ok: true });
      },
    },
  },
});
