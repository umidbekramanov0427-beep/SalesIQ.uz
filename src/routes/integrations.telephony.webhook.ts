import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { updatePbxCallStatus } from "@/lib/telephony/telephony-data.server";

// OnlinePBX posts call lifecycle events (ringing/answered/hangup, recording
// ready) to whatever URL is configured in its own dashboard -- that URL
// must include ?org=<id> (shown on the telephony settings page) since this
// endpoint doesn't belong to a single tenant. The payload's own "domain"
// field (OnlinePBX includes the sending PBX's host on every event) is
// checked against the org's stored pbx_domain before writing anything, the
// same way the AmoCRM webhook checks account[subdomain] -- otherwise a
// caller who merely guesses an organization_id could write fake call rows
// into another company's account.
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
          const organizationId = new URL(request.url).searchParams.get("org");
          if (!organizationId) return new Response("ok", { status: 200 });

          const { data: creds } = await supabaseAdmin
            .from("org_telephony_credentials")
            .select("provider, pbx_domain, api_key")
            .eq("organization_id", organizationId)
            .maybeSingle();
          if (!creds) return new Response("ok", { status: 200 });

          // The generic "API orqali ulash" integration has no PBX domain to
          // check events against -- it authenticates the sender instead, via
          // the same api_key shown on its card (as a bearer token, or a
          // ?key= query param for callers that can't set headers).
          if (creds.provider === "api_inbound") {
            const auth = request.headers.get("authorization");
            const bearer = auth?.toLowerCase().startsWith("bearer ") ? auth.slice(7).trim() : null;
            const queryKey = new URL(request.url).searchParams.get("key");
            if (!creds.api_key || creds.api_key !== (bearer ?? queryKey)) {
              return new Response("ok", { status: 200 });
            }
          } else if (!creds.pbx_domain) {
            return new Response("ok", { status: 200 });
          }

          const form = await request.formData().catch(() => null);
          const payload = form ?? (await request.json().catch(() => ({})));
          const get = (key: string): string | null => {
            if (form) return typeof form.get(key) === "string" ? (form.get(key) as string) : null;
            const v = (payload as Record<string, unknown>)[key];
            return typeof v === "string" ? v : null;
          };

          if (creds.provider !== "api_inbound" && creds.pbx_domain) {
            const domain = get("domain") ?? get("pbx_domain");
            if (domain && domain.toLowerCase() !== creds.pbx_domain.toLowerCase()) {
              return new Response("ok", { status: 200 });
            }
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
