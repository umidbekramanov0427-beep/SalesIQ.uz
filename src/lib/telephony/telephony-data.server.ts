// Server-only. Credentials CRUD and call/SMS logging for the telephony /
// integrations module. Each provider now keeps its OWN row
// (organization_id, provider) instead of one row per org total -- an org
// can have OnlinePBX, Binotel and the generic API integration all
// configured and "Yoqilgan" at the same time, exactly like the reference
// product's "Integratsiyalar" page this UI was rebuilt to match ("Bir
// nechta manbani birga ishlatish mumkin").
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import type { Json } from "@/integrations/supabase/types";
import { initiateClickToCall, sendOnlinePbxSms, testOnlinePbxConnection } from "./onlinepbx.server";
import { initiateSipuniClickToCall, sendSipuniSms, testSipuniConnection } from "./sipuni.server";
import {
  initiateMoizvonkiClickToCall,
  sendMoizvonkiSms,
  testMoizvonkiConnection,
} from "./moizvonki.server";
import { initiateBinotelClickToCall, testBinotelConnection } from "./binotel.server";
import { testOutboundWebhook } from "./generic-api.server";
import { hasEskizCredentials, sendEskizSms } from "../sms/eskiz.server";
import { getTelephonyProviderMeta, type TelephonyProvider } from "./provider-meta";
import { dispatchOutgoingWebhooks } from "../webhooks/outgoing-webhooks.server";

export type { TelephonyProvider };

export type ExtensionLink = { code: string; profileId: string };

export type TelephonyCredentialsStatus = {
  provider: TelephonyProvider;
  connected: boolean;
  apiKeySet: boolean;
  apiSecretSet: boolean;
  pbxDomain: string | null;
  callerId: string | null;
  smsSenderName: string | null;
  connectedAt: string | null;
  lastEventAt: string | null;
  extensionLinks: ExtensionLink[];
};

type CredentialsRow = {
  provider: string;
  api_key: string | null;
  api_secret: string | null;
  pbx_domain: string | null;
  caller_id: string | null;
  sms_sender_name: string | null;
  connected_at: string | null;
  last_event_at: string | null;
  extension_links: Json;
};

function parseExtensionLinks(raw: Json): ExtensionLink[] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((entry) => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) return [];
    const code = (entry as Record<string, unknown>)["code"];
    const profileId = (entry as Record<string, unknown>)["profileId"];
    return typeof code === "string" && typeof profileId === "string" ? [{ code, profileId }] : [];
  });
}

function toStatus(row: CredentialsRow): TelephonyCredentialsStatus {
  const provider = row.provider as TelephonyProvider;
  const meta = getTelephonyProviderMeta(provider);
  const dbValue: Record<string, string | null> = {
    apiKey: row.api_key,
    apiSecret: row.api_secret,
    pbxDomain: row.pbx_domain,
    callerId: row.caller_id,
    smsSenderName: row.sms_sender_name,
  };
  // Agent-token providers (FreePBX/Issabel) have no required "fields" of
  // their own -- the UI just generates a token -- so connected-ness there
  // means "a token exists" rather than "every required field is filled".
  const connected =
    meta.fields.length === 0
      ? !!row.api_key
      : meta.fields.filter((f) => f.required).every((f) => !!dbValue[f.key]);
  return {
    provider,
    connected,
    apiKeySet: !!row.api_key,
    apiSecretSet: !!row.api_secret,
    pbxDomain: row.pbx_domain,
    callerId: row.caller_id,
    smsSenderName: row.sms_sender_name,
    connectedAt: row.connected_at,
    lastEventAt: row.last_event_at,
    extensionLinks: parseExtensionLinks(row.extension_links),
  };
}

/** Every configured integration for this org, keyed by provider -- an unconfigured provider is simply absent from the map (its card renders as "O'chirilgan"/"Sozlanmagan"). */
export async function getAllTelephonyStatuses(
  organizationId: string,
): Promise<Partial<Record<TelephonyProvider, TelephonyCredentialsStatus>>> {
  const { data, error } = await supabaseAdmin
    .from("org_telephony_credentials")
    .select(
      "provider, api_key, api_secret, pbx_domain, caller_id, sms_sender_name, connected_at, last_event_at, extension_links",
    )
    .eq("organization_id", organizationId);
  if (error) throw error;
  const out: Partial<Record<TelephonyProvider, TelephonyCredentialsStatus>> = {};
  for (const row of data ?? []) {
    out[row.provider as TelephonyProvider] = toStatus(row as CredentialsRow);
  }
  return out;
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
  // api_outbound's "pbxDomain" column actually holds the org's own target
  // URL (needs its scheme kept); every self-hosted-domain provider
  // (OnlinePBX/MoiZvonki/FreePBX-style domains) stores a bare host instead.
  const pbxDomain =
    input.provider === "api_outbound"
      ? input.pbxDomain.trim()
      : input.pbxDomain.trim().replace(/^https?:\/\//, "") || null;
  const { error } = await supabaseAdmin.from("org_telephony_credentials").upsert(
    {
      organization_id: organizationId,
      provider: input.provider,
      api_key: input.apiKey.trim() || null,
      api_secret: input.apiSecret.trim() || null,
      pbx_domain: pbxDomain,
      caller_id: input.callerId.trim() || null,
      sms_sender_name: input.smsSenderName.trim() || null,
      connected_by: connectedBy,
      connected_at: new Date().toISOString(),
    },
    { onConflict: "organization_id,provider" },
  );
  if (error) throw error;
}

export async function disconnectTelephony(
  organizationId: string,
  provider: TelephonyProvider,
): Promise<void> {
  const { error } = await supabaseAdmin
    .from("org_telephony_credentials")
    .delete()
    .eq("organization_id", organizationId)
    .eq("provider", provider);
  if (error) throw error;
}

export async function saveExtensionLinks(
  organizationId: string,
  provider: TelephonyProvider,
  links: ExtensionLink[],
): Promise<void> {
  const { error } = await supabaseAdmin.from("org_telephony_credentials").upsert(
    {
      organization_id: organizationId,
      provider,
      extension_links: links as unknown as Json,
    },
    { onConflict: "organization_id,provider" },
  );
  if (error) throw error;
}

async function getCredentialsRow(
  organizationId: string,
  provider: TelephonyProvider,
): Promise<CredentialsRow | null> {
  const { data, error } = await supabaseAdmin
    .from("org_telephony_credentials")
    .select(
      "provider, api_key, api_secret, pbx_domain, caller_id, sms_sender_name, connected_at, last_event_at, extension_links",
    )
    .eq("organization_id", organizationId)
    .eq("provider", provider)
    .maybeSingle();
  if (error) throw error;
  return data as CredentialsRow | null;
}

/** "Ulanishni tekshirish" / "Test qilish" for whichever card the user is looking at. Agent-token providers (FreePBX/Issabel) and the webhook-only ones (New-Tel, api_inbound) have no outbound handshake to test -- only providers with a real API client do. */
export async function testTelephonyConnection(
  organizationId: string,
  provider: TelephonyProvider,
): Promise<{ ok: true; pbxDomain: string | null }> {
  switch (provider) {
    case "sipuni":
      await testSipuniConnection(organizationId);
      return { ok: true, pbxDomain: null };
    case "moizvonki": {
      const result = await testMoizvonkiConnection(organizationId);
      return { ok: true, pbxDomain: result.pbxDomain };
    }
    case "binotel":
      await testBinotelConnection(organizationId);
      return { ok: true, pbxDomain: null };
    case "api_outbound": {
      const result = await testOutboundWebhook(organizationId);
      return { ok: true, pbxDomain: result.status === 200 ? "200 OK" : String(result.status) };
    }
    case "onlinepbx":
    default: {
      const result = await testOnlinePbxConnection(organizationId);
      return { ok: true, pbxDomain: result.pbxDomain };
    }
  }
}

async function pickCallCapableRow(
  organizationId: string,
): Promise<{ provider: TelephonyProvider; row: CredentialsRow } | null> {
  const { data, error } = await supabaseAdmin
    .from("org_telephony_credentials")
    .select(
      "provider, api_key, api_secret, pbx_domain, caller_id, sms_sender_name, connected_at, last_event_at, extension_links",
    )
    .eq("organization_id", organizationId)
    .in("provider", ["onlinepbx", "sipuni", "moizvonki", "binotel"])
    .order("connected_at", { ascending: false });
  if (error) throw error;
  for (const row of data ?? []) {
    const status = toStatus(row as CredentialsRow);
    if (status.connected) return { provider: status.provider, row: row as CredentialsRow };
  }
  return null;
}

/** Starts a click-to-call, logging the attempt regardless of whether the provider itself accepts it. */
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

  void dispatchOutgoingWebhooks(organizationId, "call_created", {
    call_id: row.id,
    to_number: toNumber,
    lead_id: leadId,
    contact_id: contactId,
    direction: "outgoing",
  });

  try {
    const active = await pickCallCapableRow(organizationId);
    if (!active) throw new Error("Hech qanday telefoniya ulanmagan.");
    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("phone")
      .eq("id", initiatedBy)
      .maybeSingle();
    let externalCallId: string | null;
    switch (active.provider) {
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

/** Applied by a provider's own status-change webhook (call answered/completed/failed, recording ready). Scoped by organization_id too -- external_call_id is only unique within one PBX tenant, not across every org on the platform. */
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

  if (patch.recordingUrl) {
    void dispatchOutgoingWebhooks(organizationId, "recording_ready", {
      external_call_id: externalCallId,
      recording_url: patch.recordingUrl,
      duration_seconds: patch.durationSeconds ?? null,
    });
  }
}

/** Marks that a validated inbound event (New-Tel / generic API webhook) was just received for this provider -- shown as "Oxirgi webhook" on its card. */
export async function markTelephonyEventReceived(
  organizationId: string,
  provider: TelephonyProvider,
): Promise<void> {
  await supabaseAdmin
    .from("org_telephony_credentials")
    .update({ last_event_at: new Date().toISOString() })
    .eq("organization_id", organizationId)
    .eq("provider", provider);
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
    let externalMessageId: string | null;
    if (useEskiz) {
      ({ externalMessageId } = await sendEskizSms(organizationId, toNumber, message));
    } else {
      const active = await pickCallCapableRow(organizationId);
      switch (active?.provider) {
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

export { getCredentialsRow };
