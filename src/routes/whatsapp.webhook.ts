import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { logIncomingWhatsAppMessage } from "@/lib/whatsapp/whatsapp-data.server";
import { handleIncomingLeadMessage } from "@/lib/automations/engine.server";

// Meta's Cloud API webhook payload shape (developers.facebook.com/docs/
// whatsapp/cloud-api/guides/set-up-webhooks). `metadata.phone_number_id` is
// how we know which org this belongs to -- each org connects its own
// WhatsApp Business phone number, so this is the equivalent of Telegram's
// per-bot routing, just keyed differently since every org shares Meta's one
// webhook URL/app instead of having its own bot token.
type WhatsAppWebhookPayload = {
  entry?: {
    changes?: {
      value?: {
        metadata?: { phone_number_id?: string };
        messages?: { from?: string; id?: string; text?: { body?: string }; type?: string }[];
      };
    }[];
  }[];
};

export const Route = createFileRoute("/whatsapp/webhook")({
  server: {
    handlers: {
      // Meta's one-time webhook subscription handshake: it calls this with
      // hub.verify_token, and expects hub.challenge echoed back verbatim if
      // (and only if) the token matches what was configured in the Meta App
      // dashboard.
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const mode = url.searchParams.get("hub.mode");
        const token = url.searchParams.get("hub.verify_token");
        const challenge = url.searchParams.get("hub.challenge");
        const expected = process.env["WHATSAPP_VERIFY_TOKEN"];
        if (mode === "subscribe" && expected && token === expected && challenge) {
          return new Response(challenge, { status: 200 });
        }
        return new Response("Forbidden", { status: 403 });
      },
      POST: async ({ request }) => {
        const payload = (await request.json().catch(() => ({}))) as WhatsAppWebhookPayload;

        for (const entry of payload.entry ?? []) {
          for (const change of entry.changes ?? []) {
            const phoneNumberId = change.value?.metadata?.phone_number_id;
            if (!phoneNumberId) continue;

            const { data: creds } = await supabaseAdmin
              .from("org_whatsapp_credentials")
              .select("organization_id")
              .eq("phone_number_id", phoneNumberId)
              .maybeSingle();
            if (!creds) continue;

            for (const message of change.value?.messages ?? []) {
              if (message.type !== "text" || !message.from || !message.text?.body) continue;
              const leadId = await logIncomingWhatsAppMessage(
                creds.organization_id,
                message.from,
                message.text.body,
                message.id ?? null,
              ).catch(() => null);
              // A salesbot may be waiting for exactly this answer.
              if (leadId) {
                await handleIncomingLeadMessage(
                  creds.organization_id,
                  leadId,
                  message.text.body,
                ).catch(() => undefined);
              }
            }
          }
        }

        // Meta requires a fast 200 regardless of outcome, or it retries
        // (and eventually disables) the webhook.
        return Response.json({ ok: true });
      },
    },
  },
});
