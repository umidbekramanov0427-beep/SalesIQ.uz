import { createFileRoute } from "@tanstack/react-router";
import crypto from "node:crypto";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  isPbxExtension,
  markTelephonyEventReceived,
  pbxDirection,
  pbxNumber,
  pbxString,
  recordPbxCallEvent,
  updatePbxCallStatus,
} from "@/lib/telephony/telephony-data.server";
import { isTelephonyProvider, type TelephonyProvider } from "@/lib/telephony/provider-meta";

// OnlinePBX (and similarly shaped providers) post call lifecycle events
// (ringing/answered/hangup, recording ready) to whatever URL is configured
// in their own dashboard -- that URL must include ?org=<id> (shown on the
// card) since this endpoint doesn't belong to a single tenant, and now also
// ?provider=<id> so the right row/verification is picked once an org can
// have more than one integration configured at a time. A URL with no
// ?provider= (every link generated before this rebuild) still defaults to
// onlinepbx so existing dashboards keep working unchanged.
function mapOnlinePbxStatus(
  raw: string,
): "ringing" | "answered" | "completed" | "failed" | "no_answer" | null {
  switch (raw) {
    case "ringing":
    case "dial":
      return "ringing";
    case "answer":
    case "answered":
    case "bridge":
      return "answered";
    case "hangup":
    case "hangup_complete":
      return "completed";
    case "no_answer":
    case "noanswer":
      return "no_answer";
    case "failed":
    case "busy":
      return "failed";
    default:
      return null;
  }
}

export const Route = createFileRoute("/integrations/telephony/webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const url = new URL(request.url);
          const organizationId = url.searchParams.get("org");
          if (!organizationId) return new Response("ok", { status: 200 });
          const providerParam = url.searchParams.get("provider") || "onlinepbx";
          if (!isTelephonyProvider(providerParam)) return new Response("ok", { status: 200 });

          const { data: creds } = await supabaseAdmin
            .from("org_telephony_credentials")
            .select("provider, pbx_domain, api_secret")
            .eq("organization_id", organizationId)
            .eq("provider", providerParam)
            .maybeSingle();
          if (!creds) return new Response("ok", { status: 200 });

          const rawBody = await request.text();

          if (creds.provider === "newtel") {
            // New-Tel signs its webhook body with the signing key the admin
            // copied from their New-Tel VPBX dashboard onto this same card
            // ("New-Teldagi imzo kaliti") -- verified here as an HMAC-SHA256
            // over the raw body, the header name New-Tel itself uses is
            // accepted under either common spelling.
            const signature =
              request.headers.get("x-newtel-signature") || request.headers.get("x-signature");
            if (!creds.api_secret || !signature) return new Response("ok", { status: 200 });
            const expected = crypto
              .createHmac("sha256", creds.api_secret)
              .update(rawBody)
              .digest("hex");
            const ok =
              signature.length === expected.length &&
              crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
            if (!ok) return new Response("ok", { status: 200 });
          } else if (creds.pbx_domain) {
            const domainFromBody = (() => {
              try {
                const json = JSON.parse(rawBody) as Record<string, unknown>;
                const v = json["domain"] ?? json["pbx_domain"];
                return typeof v === "string" ? v : null;
              } catch {
                const form = new URLSearchParams(rawBody);
                return form.get("domain") ?? form.get("pbx_domain");
              }
            })();
            const clean = (d: string) =>
              d
                .trim()
                .toLowerCase()
                .replace(/^https?:\/\//, "")
                .replace(/\/.*$/, "");
            // OnlinePBX names its domain in every event; the webhook URL is
            // public, so an event without the org's own domain is ignored.
            if (
              (creds.provider === "onlinepbx" && !domainFromBody) ||
              (domainFromBody && clean(domainFromBody) !== clean(creds.pbx_domain))
            ) {
              return new Response("ok", { status: 200 });
            }
          }

          await markTelephonyEventReceived(organizationId, creds.provider as TelephonyProvider);

          const get = (key: string): string | null => {
            try {
              const json = JSON.parse(rawBody) as Record<string, unknown>;
              const v = json[key];
              return typeof v === "string" ? v : typeof v === "number" ? String(v) : null;
            } catch {
              const form = new URLSearchParams(rawBody);
              return form.get(key);
            }
          };

          const getNum = (key: string): number | undefined => {
            const v = pbxNumber(get(key));
            return v;
          };

          // OnlinePBX's call events (call_start / call_user_start /
          // call_answered / call_end / call_missed) carry the whole call:
          // direction, both numbers, durations, the recording. Every one of
          // them lands in pbx_calls -- incoming, missed, dialled from a desk
          // phone -- not only the calls clicked in the platform.
          const uuid = get("uuid");
          const direction = pbxDirection(get("direction"));
          if (uuid && direction) {
            const event = (get("event") ?? "").toLowerCase();
            const caller = pbxString(get("caller") ?? get("caller_number"));
            const callee = pbxString(get("callee") ?? get("callee_number"));
            const talk = getNum("dialog_duration") ?? getNum("billsec");
            const total = getNum("call_duration") ?? getNum("duration");
            const ended = event === "call_end" || event === "call_missed";
            const status =
              event === "call_answered"
                ? ("answered" as const)
                : ended
                  ? (talk ?? 0) > 0
                    ? ("completed" as const)
                    : ("no_answer" as const)
                  : ("ringing" as const);
            const date = getNum("date");
            await recordPbxCallEvent(organizationId, creds.provider as TelephonyProvider, {
              externalId: uuid,
              direction,
              extension:
                direction === "incoming"
                  ? isPbxExtension(callee)
                    ? callee
                    : null
                  : isPbxExtension(caller)
                    ? caller
                    : null,
              clientNumber: direction === "incoming" ? caller : callee,
              startedAt: date ? new Date(date * 1000).toISOString() : undefined,
              status,
              talkSeconds: ended ? (talk ?? 0) : undefined,
              ringSeconds: ended && total != null ? Math.max(0, total - (talk ?? 0)) : undefined,
              recordingUrl: get("download_url") ?? undefined,
            });
            return new Response("ok", { status: 200 });
          }

          const callId = get("call_id") ?? get("id");
          if (!callId) return new Response("ok", { status: 200 });

          const status = mapOnlinePbxStatus(get("event") ?? get("status") ?? "");
          const durationRaw = get("duration") ?? get("billsec");
          const recordingUrl = get("record") ?? get("recording_url") ?? undefined;

          await updatePbxCallStatus(organizationId, callId, {
            ...(status ? { status } : {}),
            ...(durationRaw ? { durationSeconds: Number(durationRaw) || 0 } : {}),
            ...(recordingUrl ? { recordingUrl } : {}),
          });

          return new Response("ok", { status: 200 });
        } catch (err) {
          console.error("[telephony webhook]", err);
          return new Response("ok", { status: 200 });
        }
      },
    },
  },
});
