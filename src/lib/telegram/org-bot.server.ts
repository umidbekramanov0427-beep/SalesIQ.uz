// Server-only. A company's own Telegram bot (Integratsiyalar -> Telegram
// bot): connecting it with the token from @BotFather, pointing its webhook
// at /telegram/org/<company id>, choosing the salesbot its plain link opens,
// and removing it. The token is sealed (secret-box) and never leaves the
// server. Client chats through it are handled in client-chat.server.ts.
import crypto from "node:crypto";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { botToken, forgetOrgBot, getMe, orgBot, publicAppUrl } from "@/lib/bot-tokens.server";
import { sealSecret } from "@/lib/secret-box.server";
import { sharedBotDaysLeft } from "@/lib/telegram/shared-bot";

/** Messages and inline-button presses (Telegram Salesbot «Tugma bosilganda»). */
const ORG_BOT_UPDATES = ["message", "callback_query"];

const TOKEN_RE = /^\d{5,15}:[A-Za-z0-9_-]{30,}$/;

export type OrgBotStatus = {
  ready: boolean;
  bot: {
    username: string;
    link: string;
    defaultSalesbotId: string | null;
    newSubscriberLead: boolean;
    connectedAt: string;
    webhookOk: boolean;
    webhookError: string | null;
  } | null;
  sharedBot: { until: string | null; daysLeft: number | null; username: string | null };
};

function webhookUrl(orgId: string): string {
  return `${publicAppUrl()}/telegram/org/${orgId}`;
}

async function call(token: string, method: string, body: Record<string, unknown>) {
  const res = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(15_000),
  });
  const j = (await res.json().catch(() => ({}))) as {
    ok?: boolean;
    description?: string;
    result?: unknown;
  };
  if (!j.ok) throw new Error(j.description || `Telegram ${method} (${res.status})`);
  return j.result;
}

/** Everything the connect page shows. */
export async function orgBotStatus(orgId: string): Promise<OrgBotStatus> {
  const [{ data: row, error }, { data: org }] = await Promise.all([
    supabaseAdmin.from("org_telegram_bots").select("*").eq("organization_id", orgId).maybeSingle(),
    supabaseAdmin.from("organizations").select("*").eq("id", orgId).maybeSingle(),
  ]);
  const until = (org as { shared_bot_until?: string | null } | null)?.shared_bot_until ?? null;
  const sharedUsername = await sharedBotUsername();
  const sharedBot = { until, daysLeft: sharedBotDaysLeft(until), username: sharedUsername };
  if (error) return { ready: false, bot: null, sharedBot };
  if (!row) return { ready: true, bot: null, sharedBot };
  let webhookOk = false;
  let webhookError: string | null = null;
  const own = await orgBot(orgId);
  if (own) {
    try {
      const info = (await call(own.token, "getWebhookInfo", {})) as {
        url?: string;
        last_error_message?: string;
      };
      webhookOk = info.url === webhookUrl(orgId);
      webhookError = info.last_error_message ?? null;
    } catch (err) {
      webhookError = err instanceof Error ? err.message : "Telegram javob bermadi";
    }
  }
  return {
    ready: true,
    bot: {
      username: row.username,
      link: `https://t.me/${row.username}`,
      defaultSalesbotId: row.default_salesbot_id,
      newSubscriberLead:
        (row as { new_subscriber_lead?: boolean | null }).new_subscriber_lead !== false,
      connectedAt: row.connected_at,
      webhookOk,
      webhookError,
    },
    sharedBot,
  };
}

let sharedName: { at: number; name: string | null } = { at: 0, name: null };

/** The shared (trial) bot's @username, cached for an hour. */
export async function sharedBotUsername(): Promise<string | null> {
  if (Date.now() - sharedName.at < 3_600_000) return sharedName.name;
  const token = botToken("client");
  const me = token ? await getMe(token) : null;
  sharedName = { at: Date.now(), name: me?.username ?? null };
  return sharedName.name;
}

/** Checks the token with Telegram, points the bot's webhook at us and saves it. */
export async function connectOrgBot(
  orgId: string,
  rawToken: string,
): Promise<{ username: string }> {
  const token = rawToken.trim();
  if (!TOKEN_RE.test(token)) {
    throw new Error("Token noto'g'ri ko'rinishda (masalan 123456789:AA...)");
  }
  if ([botToken("client"), botToken("staff"), botToken("ops")].includes(token)) {
    throw new Error("Bu platformaning boti. @BotFather'da o'zingizga yangi bot oching.");
  }
  const me = await getMe(token);
  if (!me?.username) {
    throw new Error("Telegram bu tokenni qabul qilmadi: @BotFather'dagi tokenni tekshiring");
  }
  const { data: taken } = await supabaseAdmin
    .from("org_telegram_bots")
    .select("organization_id")
    .eq("bot_user_id", me.id ?? -1)
    .neq("organization_id", orgId)
    .maybeSingle();
  if (taken) throw new Error("Bu bot boshqa kompaniyaga ulangan.");

  const secret = crypto.randomBytes(24).toString("hex");
  await call(token, "setWebhook", {
    url: webhookUrl(orgId),
    secret_token: secret,
    allowed_updates: ORG_BOT_UPDATES,
    drop_pending_updates: true,
  });
  await call(token, "setMyCommands", {
    commands: [{ command: "start", description: "Boshlash" }],
  }).catch(() => undefined);

  const { error } = await supabaseAdmin.from("org_telegram_bots").upsert(
    {
      organization_id: orgId,
      bot_user_id: me.id,
      username: me.username,
      token_sealed: sealSecret(token),
      webhook_secret: secret,
      connected_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
    { onConflict: "organization_id" },
  );
  if (error) throw error;
  forgetOrgBot(orgId);
  return { username: me.username };
}

/** Which of the company's salesbots the plain link t.me/<bot> opens (null: none). */
export async function setOrgBotDefault(orgId: string, salesbotId: string | null): Promise<void> {
  if (salesbotId) {
    const { data: sb } = await supabaseAdmin
      .from("salesbots")
      .select("organization_id")
      .eq("id", salesbotId)
      .maybeSingle();
    if (sb?.organization_id !== orgId) throw new Error("Salesbot topilmadi");
  }
  const { error } = await supabaseAdmin
    .from("org_telegram_bots")
    .update({ default_salesbot_id: salesbotId, updated_at: new Date().toISOString() })
    .eq("organization_id", orgId);
  if (error) throw error;
  forgetOrgBot(orgId);
}

/** «Yangi obunachiga lid ochilsin»: whether /start alone makes the client a lead. */
export async function setOrgBotNewSubscriberLead(orgId: string, on: boolean): Promise<void> {
  const { error } = await supabaseAdmin
    .from("org_telegram_bots")
    .update({ new_subscriber_lead: on, updated_at: new Date().toISOString() })
    .eq("organization_id", orgId);
  if (error) throw error;
  forgetOrgBot(orgId);
}

/** Points the webhook at us again (after a server address change, say). */
export async function reconnectOrgBot(orgId: string): Promise<void> {
  const own = await orgBot(orgId);
  if (!own) throw new Error("Bot ulanmagan");
  await call(own.token, "setWebhook", {
    url: webhookUrl(orgId),
    secret_token: own.webhookSecret,
    allowed_updates: ORG_BOT_UPDATES,
  });
}

/**
 * Removes the bot: its webhook is taken off and its clients' chats go back
 * to the shared bot (they can still be reached there only if they started it).
 */
export async function disconnectOrgBot(orgId: string): Promise<void> {
  const own = await orgBot(orgId);
  if (own) await call(own.token, "deleteWebhook", {}).catch(() => undefined);
  await supabaseAdmin.from("org_telegram_bots").delete().eq("organization_id", orgId);
  await supabaseAdmin
    .from("lead_telegram_links")
    .update({ via_org_bot: false })
    .eq("organization_id", orgId)
    .eq("via_org_bot", true)
    .then(
      () => undefined,
      () => undefined,
    );
  forgetOrgBot(orgId);
}
