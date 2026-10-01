// Server-only. Credentials CRUD and call/SMS logging for the telephony
// module -- kept separate from the provider clients (onlinepbx.server.ts,
// sipuni.server.ts) so the "read/write our own tables" half of this feature
// never needs to touch either provider's own API surface. Everything here
// that actually talks to a provider dispatches on org_telephony_credentials'
// `provider` column, so adding a third provider later is a matter of
// writing its client file and adding one more case here, not touching the
// routes or UI.
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { initiateClickToCall, sendOnlinePbxSms, testOnlinePbxConnection } from "./onlinepbx.server";
import { initiateSipuniClickToCall, sendSipuniSms, testSipuniConnection } from "./sipuni.server";
import {
  initiateMoizvonkiClickToCall,
  sendMoizvonkiSms,
  testMoizvonkiConnection,
} from "./moizvonki.server";
import { initiateBinotelClickToCall, testBinotelConnection } from "./binotel.server";
import { testFreepbxConnection } from "./freepbx.server";
import { testIssabelConnection } from "./issabel.server";
import { testNewtelConnection } from "./newtel.server";
import { testOutboundWebhook } from "./generic-api.server";
import { hasEskizCredentials, sendEskizSms } from "../sms/eskiz.server";
import { getTelephonyProviderMeta, type TelephonyProvider } from "./provider-meta";

export type { TelephonyProvider };

export type TelephonyCredentialsStatus = {
  connected: boolean;
  provider: TelephonyProvider | null;
  pbxDomain: string | null;
  callerId: string | null;
  smsSenderName: string | null;
  connectedAt: string | null;
};

export async function getTelephonyCredentialsStatus(
  organizationId: string,
): Promise<TelephonyCredentialsStatus> {
  const { data, error } = await supabaseAdmin
    .from("org_telephony_credentials")
    .select("provider, api_key, api_secret, pbx_domain, caller_id, sms_sender_name, connected_at")
    .eq("organization_id", organizationId)
    .maybeSingle();
  if (error) throw error;
  const provider = (data?.provider as TelephonyProvider | null) ?? null;
  // Which columns count as "connected" varies by provider -- api_inbound
  // only ever has an api_key (no secret), api_outbound only a pbx_domain
  // (the target URL) + api_secret (the signing key) -- so this checks
  // whichever fields that provider actually requires instead of assuming
  // every row has both an api_key and an api_secret.
  const dbColumn = {
    apiKey: "api_key",
    apiSecret: "api_secret",
    pbxDomain: "pbx_domain",
    callerId: "caller_id",
    smsSenderName: "sms_sender_name",
  } as const satisfies Record<string, keyof NonNullable<typeof data>>;
  const connected = provider
    ? getTelephonyProviderMeta(provider)
        .fields.filter((f) => f.required)
        .every((f) => !!data?.[dbColumn[f.key]])
    : false;
  return {
    connected,
    provider,
    pbxDomain: data?.pbx_domain ?? null,
    callerId: data?.caller_id ?? null,
    smsSenderName: data?.sms_sender_name ?? null,
    connectedAt: data?.connected_at ?? null,
  };
}

export async function saveTelephonyCredentials(
  organizationId: string,
  connectedBy: string,
  input: {
    provider: TelephonyProvider;
    apiKey: string;
    apiSecret: string;
    pbxDomain: string;
    callerId: string;
    smsSenderName: string;
  },
): Promise<void> {
  const { error } = await supabaseAdmin.from("org_telephony_credentials").upsert(
    {
      organization_id: organizationId,
      provider: input.provider,
      api_key: input.apiKey.trim(),
      api_secret: input.apiSecret.trim(),
      // OnlinePBX, MoiZvonki, FreePBX and Issabel are all self-hosted-per-
      // tenant domains; Sipuni/Binotel/New-Tel's APIs live at one fixed
      // address, so they never have a domain to store here. api_outbound
      // repurposes this same column for the org's own full webhook URL --
      // that one must keep its scheme (https://...), so it's the one
      // provider that skips the bare-domain stripping below.
      pbx_domain:
        input.provider === "api_outbound"
          ? input.pbxDomain.trim()
          : input.provider === "onlinepbx" ||
              input.provider === "moizvonki" ||
              input.provider === "freepbx" ||
              input.provider === "issabel"
            ? input.pbxDomain.trim().replace(/^https?:\/\//, "")
            : null,
      caller_id: input.callerId.trim() || null,
      sms_sender_name: input.smsSenderName.trim() || null,
      connected_by: connectedBy,
      connected_at: new Date().toISOString(),
    },
    { onConflict: "organization_id" },
  );
  if (error) throw error;
}

async function getProvider(organizationId: string): Promise<TelephonyProvider> {
  const { data, error } = await supabaseAdmin
    .from("org_telephony_credentials")
    .select("provider")
    .eq("organization_id", organizationId)
    .maybeSingle();
  if (error) throw error;
  return (data?.provider as TelephonyProvider | undefined) ?? "onlinepbx";
}

export async function testTelephonyConnection(
  organizationId: string,
): Promise<{ ok: true; provider: TelephonyProvider; pbxDomain: string | null }> {
  const provider = await getProvider(organizationId);
  switch (provider) {
    case "sipuni":
      await testSipuniConnection(organizationId);
      return { ok: true, provider, pbxDomain: null };
    case "moizvonki": {
      const result = await testMoizvonkiConnection(organizationId);
      return { ok: true, provider, pbxDomain: result.pbxDomain };
    }
    case "binotel":
      await testBinotelConnection(organizationId);
      return { ok: true, provider, pbxDomain: null };
    case "freepbx":
      await testFreepbxConnection(organizationId);
      return { ok: true, provider, pbxDomain: null };
    case "issabel":
      await testIssabelConnection(organizationId);
      return { ok: true, provider, pbxDomain: null };
    case "newtel":
      await testNewtelConnection(organizationId);
      return { ok: true, provider, pbxDomain: null };
    case "api_inbound":
      return { ok: true, provider, pbxDomain: null };
    case "api_outbound":
      await testOutboundWebhook(organizationId);
      return { ok: true, provider, pbxDomain: null };
    case "onlinepbx":
    default: {
      const result = await testOnlinePbxConnection(organizationId);
      return { ok: true, provider, pbxDomain: result.pbxDomain };
    }
  }
}

export async function disconnectTelephony(organizationId: string): Promise<void> {
  const { error } = await supabaseAdmin
    .from("org_telephony_credentials")
    .delete()
    .eq("organization_id", organizationId);
  if (error) throw error;
}

/** Starts a click-to-call, logging the attempt regardless of whether OnlinePBX itself accepts it. */
export async function startPbxCall(
  organizationId: string,
  initiatedBy: string,
  toNumber: string,
  leadId: string | null,
  contactId: string | null,
): Promise<{ id: string }> {
  const { data: row, error: insertError } = await supabaseAdmin
    .from("pbx_calls")
    .insert({
      organization_id: organizationId,
      initiated_by: initiatedBy,
      lead_id: leadId,
      contact_id: contactId,
      direction: "outgoing",
      to_number: toNumber,
      status: "initiated",
    })
    .select("id")
    .single();
  if (insertError) throw insertError;

  try {
    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("phone")
      .eq("id", initiatedBy)
      .maybeSingle();
    const provider = await getProvider(organizationId);
    let externalCallId: string | null;
    switch (provider) {
      case "sipuni":
        ({ externalCallId } = await initiateSipuniClickToCall(
          organizationId,
          profile?.phone ?? "",
          toNumber,
        ));
        break;
      case "moizvonki":
        ({ externalCallId } = await initiateMoizvonkiClickToCall(organizationId, toNumber));
        break;
      case "binotel":
        ({ externalCallId } = await initiateBinotelClickToCall(organizationId, toNumber));
        break;
      case "freepbx":
      case "issabel":
      case "newtel":
      case "api_inbound":
      case "api_outbound":
        throw new Error("Bu integratsiya orqali qo'ng'iroq boshlab bo'lmaydi.");
      case "onlinepbx":
      default:
        ({ externalCallId } = await initiateClickToCall(
          organizationId,
          profile?.phone ?? "",
          toNumber,
        ));
        break;
    }
    await supabaseAdmin
      .from("pbx_calls")
      .update({ status: "ringing", external_call_id: externalCallId })
      .eq("id", row.id);
  } catch (err) {
    await supabaseAdmin.from("pbx_calls").update({ status: "failed" }).eq("id", row.id);
    throw err;
  }
  return { id: row.id };
}

/** Applied by OnlinePBX's own status-change webhook (call answered/completed/failed, recording ready). Scoped by organization_id too -- external_call_id is only unique within one PBX tenant, not across every org on the platform. */
export async function updatePbxCallStatus(
  organizationId: string,
  externalCallId: string,
  patch: {
    status?: "ringing" | "answered" | "completed" | "failed" | "no_answer";
    durationSeconds?: number;
    recordingUrl?: string;
  },
): Promise<void> {
  const { error } = await supabaseAdmin
    .from("pbx_calls")
    .update({
      ...(patch.status ? { status: patch.status } : {}),
      ...(patch.durationSeconds != null ? { duration_seconds: patch.durationSeconds } : {}),
      ...(patch.recordingUrl ? { recording_url: patch.recordingUrl } : {}),
    })
    .eq("organization_id", organizationId)
    .eq("external_call_id", externalCallId);
  if (error) throw error;
}

export async function sendSms(
  organizationId: string,
  sentBy: string,
  toNumber: string,
  message: string,
  leadId: string | null,
  contactId: string | null,
): Promise<{ id: string }> {
  const { data: row, error: insertError } = await supabaseAdmin
    .from("sms_log")
    .insert({
      organization_id: organizationId,
      sent_by: sentBy,
      lead_id: leadId,
      contact_id: contactId,
      to_number: toNumber,
      message,
      status: "queued",
    })
    .select("id")
    .single();
  if (insertError) throw insertError;

  try {
    // A dedicated SMS provider (Eskiz) always wins when configured -- an
    // org can be on OnlinePBX or Sipuni for calls and still want SMS sent
    // through Eskiz specifically, since neither call provider is a great
    // SMS gateway (Sipuni has none at all).
    const useEskiz = await hasEskizCredentials(organizationId);
    const provider = useEskiz ? null : await getProvider(organizationId);
    let externalMessageId: string | null;
    if (useEskiz) {
      ({ externalMessageId } = await sendEskizSms(organizationId, toNumber, message));
    } else {
      switch (provider) {
        case "sipuni":
          ({ externalMessageId } = await sendSipuniSms());
          break;
        case "moizvonki":
          ({ externalMessageId } = await sendMoizvonkiSms());
          break;
        case "onlinepbx":
          ({ externalMessageId } = await sendOnlinePbxSms(organizationId, toNumber, message));
          break;
        default:
          throw new Error("Bu integratsiya SMS yuborishni qo'llab-quvvatlamaydi.");
      }
    }
    await supabaseAdmin
      .from("sms_log")
      .update({ status: "sent", external_message_id: externalMessageId })
      .eq("id", row.id);
  } catch (err) {
    await supabaseAdmin.from("sms_log").update({ status: "failed" }).eq("id", row.id);
    throw err;
  }
  return { id: row.id };
}
