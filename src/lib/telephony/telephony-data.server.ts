// Server-only. Credentials CRUD and call/SMS logging for the telephony /
// integrations module. Each provider now keeps its OWN row
// (organization_id, provider) instead of one row per org total -- an org
// can have OnlinePBX, Sipuni and MoiZvonki configured at the same time.
// Rows left behind by providers that are no longer supported are skipped.
import { sendPush } from "@/lib/push/push.server";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { INTEGRATION_PAUSED_MESSAGE, isIntegrationPaused } from "@/lib/integration-pauses.server";
import type { Database, Json } from "@/integrations/supabase/types";
import { initiateClickToCall, sendOnlinePbxSms, testOnlinePbxConnection } from "./onlinepbx.server";
import { initiateSipuniClickToCall, sendSipuniSms, testSipuniConnection } from "./sipuni.server";
import {
  initiateMoizvonkiClickToCall,
  sendMoizvonkiSms,
  testMoizvonkiConnection,
} from "./moizvonki.server";
import { hasEskizCredentials, sendEskizSms } from "../sms/eskiz.server";
import {
  getTelephonyProviderMeta,
  isTelephonyProvider,
  type TelephonyProvider,
} from "./provider-meta";
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
  const connected =
    meta.fields.length > 0 && meta.fields.filter((f) => f.required).every((f) => !!dbValue[f.key]);
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
    if (!isTelephonyProvider(row.provider)) continue;
    out[row.provider] = toStatus(row as CredentialsRow);
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
  // OnlinePBX/MoiZvonki domains are stored as a bare host.
  const pbxDomain = input.pbxDomain.trim().replace(/^https?:\/\//, "") || null;
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

/** "Ulanishni tekshirish" / "Test qilish" for whichever card the user is looking at. */
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
    .in("provider", ["onlinepbx", "sipuni", "moizvonki"])
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
  if (await isIntegrationPaused(organizationId, "sms")) throw new Error(INTEGRATION_PAUSED_MESSAGE);
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
    // The PBX rings the salesperson first: their internal extension (e.g.
    // 105) from the card's "Ichki raqamlar", else their own phone.
    const extension =
      parseExtensionLinks(active.row.extension_links).find((l) => l.profileId === initiatedBy)
        ?.code ?? "";
    if (extension) {
      await supabaseAdmin.from("pbx_calls").update({ extension }).eq("id", row.id);
    }
    if (active.provider === "onlinepbx" && !extension && !profile?.phone) {
      throw new Error(
        "Sizga OnlinePBX ichki raqami biriktirilmagan. Administrator: Integratsiyalar → Telefoniya → OnlinePBX → Ichki raqamlar.",
      );
    }
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
      default:
        ({ externalCallId } = await initiateClickToCall(
          organizationId,
          extension || profile?.phone || "",
          toNumber,
        ));
        break;
    }
    await supabaseAdmin
      .from("pbx_calls")
      .update({ status: "ringing", external_call_id: externalCallId })
      .eq("id", row.id);
  } catch (err) {
    // Kept on the row, so "Ulanmadi" in the call history says why.
    const message = err instanceof Error ? err.message : String(err);
    await supabaseAdmin
      .from("pbx_calls")
      .update({ status: "failed", error: message.slice(0, 500) })
      .eq("id", row.id);
    throw err;
  }
  return { id: row.id };
}

/* ------------------------------------------------------------------ */
/* Every call the PBX reports -- incoming, missed, dialled straight from */
/* a desk phone -- lands in pbx_calls, not only the ones clicked here.   */
/* ------------------------------------------------------------------ */

type PbxStatus = "initiated" | "ringing" | "answered" | "completed" | "failed" | "no_answer";
const STATUS_RANK: Record<PbxStatus, number> = {
  initiated: 0,
  ringing: 1,
  answered: 2,
  completed: 3,
  no_answer: 3,
  failed: 3,
};

export type PbxCallEvent = {
  externalId: string;
  direction: "incoming" | "outgoing";
  /** The salesperson's internal extension, if the PBX says. */
  extension: string | null;
  /** The client's number. */
  clientNumber: string | null;
  startedAt?: string | undefined;
  status?: PbxStatus | undefined;
  talkSeconds?: number | undefined;
  ringSeconds?: number | undefined;
  recordingUrl?: string | undefined;
};

const last9 = (v: string | null | undefined) => (v ?? "").replace(/\D/g, "").slice(-9);

/** The org's contact (and its newest lead) with this phone number, if any. */
async function findByPhone(
  organizationId: string,
  phone: string,
): Promise<{ contactId: string | null; leadId: string | null }> {
  const digits = last9(phone);
  if (digits.length < 7) return { contactId: null, leadId: null };
  const { data: contacts } = await supabaseAdmin
    .from("contacts")
    .select("id")
    .eq("organization_id", organizationId)
    .or(`phone.ilike.%${digits},alt_phone.ilike.%${digits}`)
    .limit(1);
  const contactId = contacts?.[0]?.id ?? null;
  if (!contactId) return { contactId: null, leadId: null };
  const { data: leads } = await supabaseAdmin
    .from("leads")
    .select("id")
    .eq("organization_id", organizationId)
    .eq("contact_id", contactId)
    .order("created_at", { ascending: false })
    .limit(1);
  return { contactId, leadId: leads?.[0]?.id ?? null };
}

/**
 * A recording link arrives in a webhook payload, so it is outside data: it
 * must point at a public internet host, never at localhost, a private or
 * link-local address (cloud metadata lives at 169.254.169.254) -- otherwise
 * a forged event could make the server fetch internal URLs (SSRF).
 */
export function isPublicHttpUrl(raw: string): boolean {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return false;
  }
  if (u.protocol !== "https:" && u.protocol !== "http:") return false;
  if (u.username || u.password) return false;
  const host = u.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (!host.includes(".") && !host.includes(":")) return false; // "localhost", bare names
  if (/(^|\.)(localhost|local|internal)$/.test(host)) return false;
  const v4 = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (v4) {
    const [a, b] = [Number(v4[1]), Number(v4[2])];
    if (a === 10 || a === 127 || a === 0 || a >= 224) return false;
    if (a === 169 && b === 254) return false;
    if (a === 172 && b >= 16 && b <= 31) return false;
    if (a === 192 && b === 168) return false;
    if (a === 100 && b >= 64 && b <= 127) return false;
  }
  if (host.includes(":")) {
    if (host === "::1" || host === "::" || /^f[cd]/.test(host) || /^fe80/.test(host)) return false;
    if (host.startsWith("::ffff:")) return false;
  }
  return true;
}

const RECORDINGS_BUCKET = "call-recordings";

/**
 * Copies a talked call's recording from the PBX (whose links expire) into
 * our own storage and points the row at it. Unanswered calls keep none.
 * Best effort: on any failure the PBX link stays and a later sync retries.
 */
async function keepRecording(organizationId: string, callId: string, url: string): Promise<void> {
  const { data: bucket } = supabaseAdmin.storage.from(RECORDINGS_BUCKET).getPublicUrl("x");
  const ours = bucket.publicUrl.replace(/\/x$/, "");
  if (url.startsWith(ours)) return;
  if (!isPublicHttpUrl(url)) return;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30_000);
  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) return;
    const type = res.headers.get("content-type") ?? "audio/mpeg";
    // Only audio is kept (some PBXs serve it as a generic binary) -- the
    // webhook is public, so a link to anything else is not stored or
    // sent to AI analysis.
    if (!/^(audio\/|application\/octet-stream|video\/)/i.test(type)) return;
    const bytes = new Uint8Array(await res.arrayBuffer());
    if (bytes.byteLength === 0 || bytes.byteLength > 50 * 1024 * 1024) return;
    const ext = type.includes("wav") ? "wav" : type.includes("ogg") ? "ogg" : "mp3";
    const path = `pbx/${organizationId}/${callId}.${ext}`;
    const { error } = await supabaseAdmin.storage
      .from(RECORDINGS_BUCKET)
      .upload(path, bytes, { contentType: type, upsert: true });
    if (error) return;
    const { data } = supabaseAdmin.storage.from(RECORDINGS_BUCKET).getPublicUrl(path);
    await supabaseAdmin
      .from("pbx_calls")
      .update({ recording_url: data.publicUrl })
      .eq("id", callId);
    await queueAiCallAnalysis(organizationId, callId);
  } catch {
    /* keep the PBX link; retried on the next sync */
  } finally {
    clearTimeout(timer);
  }
}

/**
 * A talked call's stored recording goes into the same AI analysis as
 * uploaded and amoCRM calls (amocrm_calls, source "pbx"): scores for Audio
 * tahlil, and the AI writes what it learned about the client into the
 * lead's notes. Started right away; the analyze-pending cron and the
 * lead card's own queue pick it up if this attempt is cut short.
 */
async function queueAiCallAnalysis(organizationId: string, pbxCallId: string): Promise<void> {
  const { data: c } = await supabaseAdmin
    .from("pbx_calls")
    .select(
      "id, lead_id, direction, duration_seconds, created_at, from_number, to_number, initiated_by, recording_url",
    )
    .eq("id", pbxCallId)
    .maybeSingle();
  if (!c?.recording_url || c.duration_seconds <= 0) return;
  const inbound = c.direction === "incoming";
  const { data: row, error } = await supabaseAdmin
    .from("amocrm_calls")
    .insert({
      organization_id: organizationId,
      source: "pbx",
      pbx_call_id: c.id,
      lead_id: c.lead_id,
      direction: inbound ? "in" : "out",
      phone: inbound ? c.from_number : c.to_number,
      duration_seconds: c.duration_seconds,
      connected: true,
      recording_url: c.recording_url,
      occurred_at: c.created_at,
      created_by: c.initiated_by,
    })
    .select("id")
    .single();
  // 23505: already queued. Any other error (migration not applied yet):
  // the call simply isn't analyzed, the rest of the call record stands.
  if (error || !row) return;
  void import("@/routes/audio-analytics.analyze")
    .then(({ analyzeCallById }) => analyzeCallById(organizationId, row.id))
    .catch(() => undefined);
}

/**
 * Creates or updates the pbx_calls row for one PBX call event. One PBX call
 * (one uuid) is always exactly one row however many events or history
 * pulls mention it; every separate call -- even the fifth to the same
 * client that day -- is a row of its own.
 */
export async function recordPbxCallEvent(
  organizationId: string,
  provider: TelephonyProvider,
  ev: PbxCallEvent,
  opts: { keepRecording?: boolean } = {},
): Promise<void> {
  if (await isIntegrationPaused(organizationId, "telephony")) return;
  const { data: existingRows } = await supabaseAdmin
    .from("pbx_calls")
    .select("id, status, to_number, from_number, direction, initiated_by, lead_id, recording_url")
    .eq("organization_id", organizationId)
    .eq("external_call_id", ev.externalId)
    .limit(1);
  let existing = existingRows?.[0] ?? null;

  const links = await getCredentialsRow(organizationId, provider).then((r) =>
    r ? parseExtensionLinks(r.extension_links) : [],
  );
  const profileId = ev.extension
    ? (links.find((l) => l.code === ev.extension)?.profileId ?? null)
    : null;

  // The PBX's own record of a call clicked in the platform: adopt the row
  // the click created (same number, same salesperson, the last few
  // minutes, not yet tied to another live call) instead of adding a second.
  if (!existing && ev.direction === "outgoing" && ev.clientNumber) {
    const since = new Date(
      (ev.startedAt ? new Date(ev.startedAt).getTime() : Date.now()) - 5 * 60_000,
    ).toISOString();
    const { data: recent } = await supabaseAdmin
      .from("pbx_calls")
      .select(
        "id, status, to_number, from_number, direction, initiated_by, lead_id, recording_url, external_call_id",
      )
      .eq("organization_id", organizationId)
      .eq("direction", "outgoing")
      .is("from_number", null)
      .in("status", ["initiated", "ringing"])
      .gte("created_at", since)
      .order("created_at", { ascending: true })
      .limit(20);
    const candidates = (recent ?? []).filter(
      (r) =>
        last9(r.to_number) === last9(ev.clientNumber) &&
        (!profileId || !r.initiated_by || r.initiated_by === profileId),
    );
    // A click no PBX call has claimed yet comes first, oldest first.
    existing = candidates.find((r) => !r.external_call_id) ?? candidates[0] ?? null;
  }

  // Only a call someone actually talked on keeps its recording.
  const talked = (ev.talkSeconds ?? 0) > 0 || ev.status === "answered";
  const recordingUrl = talked ? ev.recordingUrl : undefined;

  const patch: Database["public"]["Tables"]["pbx_calls"]["Update"] = {};
  if (ev.status) patch.status = ev.status;
  if (ev.talkSeconds != null) patch.duration_seconds = Math.max(0, Math.round(ev.talkSeconds));
  if (ev.ringSeconds != null) patch.ring_seconds = Math.max(0, Math.round(ev.ringSeconds));
  if (ev.extension) patch.extension = ev.extension;
  // The extension often arrives only on a later event (OnlinePBX's
  // call_user_start); that is when the call gets its salesperson, who is
  // also who sees the incoming-call pop-up.
  if (profileId && existing && !existing.initiated_by) patch.initiated_by = profileId;
  // Never overwrite a recording already copied into our storage.
  if (recordingUrl && !existing?.recording_url?.includes(`/${RECORDINGS_BUCKET}/`)) {
    patch.recording_url = recordingUrl;
  }

  if (existing) {
    // Events can arrive out of order; never step a finished call back.
    const before = STATUS_RANK[existing.status as PbxStatus] ?? 0;
    if (ev.status && STATUS_RANK[ev.status] < before) delete patch.status;
    await supabaseAdmin
      .from("pbx_calls")
      .update({ ...patch, external_call_id: ev.externalId })
      .eq("id", existing.id);
    // The salesperson became known on this event while it still rings.
    if (
      patch.initiated_by &&
      existing.direction === "incoming" &&
      (patch.status ?? existing.status) === "ringing"
    ) {
      await pushIncomingCall(organizationId, patch.initiated_by, {
        clientNumber: ev.clientNumber ?? existing.from_number,
        leadId: existing.lead_id,
        callKey: ev.externalId,
      });
    }
    if (opts.keepRecording !== false && patch.recording_url && ev.status !== "answered") {
      await keepRecording(organizationId, existing.id, patch.recording_url);
    }
    return;
  }

  const match = ev.clientNumber
    ? await findByPhone(organizationId, ev.clientNumber)
    : { contactId: null, leadId: null };
  const client = ev.clientNumber ?? "";
  const ext = ev.extension ?? "";
  const { data: inserted, error } = await supabaseAdmin
    .from("pbx_calls")
    .insert({
      organization_id: organizationId,
      initiated_by: profileId,
      direction: ev.direction,
      // Never null here: a null from_number marks a row created by a click in
      // the platform, which is what the PBX's own events adopt.
      from_number: ev.direction === "incoming" ? client : ext,
      to_number: ev.direction === "incoming" ? ext || "-" : client || "-",
      external_call_id: ev.externalId,
      status: ev.status ?? "ringing",
      duration_seconds: Math.max(0, Math.round(ev.talkSeconds ?? 0)),
      ring_seconds: ev.ringSeconds != null ? Math.max(0, Math.round(ev.ringSeconds)) : null,
      recording_url: recordingUrl ?? null,
      extension: ev.extension,
      lead_id: match.leadId,
      contact_id: match.contactId,
      ...(ev.startedAt ? { created_at: ev.startedAt } : {}),
    })
    .select("id")
    .single();
  // Two events of the same call racing each other: the other one won.
  if (error && error.code === "23505") {
    await supabaseAdmin
      .from("pbx_calls")
      .update(patch)
      .eq("organization_id", organizationId)
      .eq("external_call_id", ev.externalId);
  } else if (error) {
    throw error;
  } else if (inserted && recordingUrl && opts.keepRecording !== false) {
    await keepRecording(organizationId, inserted.id, recordingUrl);
  }
  if (inserted && ev.direction === "incoming" && (ev.status ?? "ringing") === "ringing") {
    await pushIncomingCall(organizationId, profileId, {
      clientNumber: ev.clientNumber,
      leadId: match.leadId,
      callKey: ev.externalId,
    });
  }
}

/**
 * "📞 Kiruvchi qo'ng'iroq" on the salesperson's phone/computer even with no
 * SalesIQ tab open (the open tab shows its own pop-up). Without a known
 * salesperson nobody is woken up: the PBX rings the right desk itself.
 */
async function pushIncomingCall(
  organizationId: string,
  profileId: string | null,
  call: { clientNumber: string | null | undefined; leadId: string | null; callKey: string },
): Promise<void> {
  if (!profileId) return;
  const { data: lead } = call.leadId
    ? await supabaseAdmin.from("leads").select("name").eq("id", call.leadId).maybeSingle()
    : { data: null };
  await sendPush(organizationId, [profileId], {
    kind: "call",
    title: "📞 Kiruvchi qo'ng'iroq",
    body: [lead?.name, call.clientNumber].filter(Boolean).join(" · ") || "Noma'lum raqam",
    url: call.leadId ? `/crm/leads/${call.leadId}` : "/audio-analytics",
    tag: `call:${call.callKey}`,
    requireInteraction: true,
  });
}

const num = (v: unknown): number | undefined => {
  const n = typeof v === "number" ? v : typeof v === "string" && v !== "" ? Number(v) : NaN;
  return Number.isFinite(n) ? n : undefined;
};
const str = (v: unknown): string | null =>
  typeof v === "string" && v.trim() ? v.trim() : typeof v === "number" ? String(v) : null;
/** An internal extension is short (101, 1005); a client's number is long. */
const isExtension = (v: string | null) => !!v && /^\d{2,5}$/.test(v);

/** OnlinePBX direction words -> ours; internal calls between colleagues are skipped. */
export function pbxDirection(raw: unknown): "incoming" | "outgoing" | null {
  const v = String(raw ?? "").toLowerCase();
  if (["inbound", "incoming", "in", "входящий"].includes(v)) return "incoming";
  if (["outbound", "outgoing", "out", "исходящий"].includes(v)) return "outgoing";
  return null;
}

/**
 * Pulls OnlinePBX's call history for the last hours into pbx_calls, so the
 * call list and analytics are right even where the PBX webhook isn't set
 * up. Throttled to once every 2 minutes per company.
 */
export async function syncOnlinePbxHistory(
  organizationId: string,
  opts: { force?: boolean; hours?: number } = {},
): Promise<{ synced: number; skipped?: boolean }> {
  const { data: cred } = await supabaseAdmin
    .from("org_telephony_credentials")
    .select("history_synced_at, pbx_domain")
    .eq("organization_id", organizationId)
    .eq("provider", "onlinepbx")
    .maybeSingle();
  if (!cred?.pbx_domain) return { synced: 0, skipped: true };
  const last = cred.history_synced_at ? new Date(cred.history_synced_at).getTime() : 0;
  if (!opts.force && Date.now() - last < 2 * 60_000) return { synced: 0, skipped: true };

  const to = new Date();
  const from =
    last && !opts.hours
      ? new Date(Math.max(last - 15 * 60_000, Date.now() - 7 * 86_400_000))
      : new Date(Date.now() - (opts.hours ?? 48) * 3_600_000);
  const { fetchOnlinePbxHistory } = await import("./onlinepbx.server");
  const rows = await fetchOnlinePbxHistory(organizationId, from, to);
  let synced = 0;
  let copied = 0;
  for (const r of rows) {
    const id = str(r["uuid"] ?? r["call_id"] ?? r["id"]);
    const direction = pbxDirection(r["accountcode"] ?? r["direction"] ?? r["type"]);
    if (!id || !direction) continue;
    const caller = str(r["caller_id_number"] ?? r["caller"] ?? r["from"]);
    const callee = str(r["destination_number"] ?? r["callee"] ?? r["to"]);
    const total = num(r["duration"] ?? r["call_duration"]) ?? 0;
    const talk = num(r["user_talk_time"] ?? r["billsec"] ?? r["dialog_duration"]) ?? 0;
    const started = num(r["start_stamp"] ?? r["date"]);
    await recordPbxCallEvent(
      organizationId,
      "onlinepbx",
      {
        externalId: id,
        direction,
        extension:
          direction === "incoming"
            ? isExtension(callee)
              ? callee
              : null
            : isExtension(caller)
              ? caller
              : null,
        clientNumber: direction === "incoming" ? caller : callee,
        startedAt: started ? new Date(started * 1000).toISOString() : undefined,
        status: talk > 0 ? "completed" : "no_answer",
        talkSeconds: talk,
        ringSeconds: Math.max(0, total - talk),
        recordingUrl: str(r["download_url"] ?? r["record"]) ?? undefined,
      },
      { keepRecording: talk > 0 && copied < 15 },
    );
    if (talk > 0) copied++;
    synced++;
  }
  await supabaseAdmin
    .from("org_telephony_credentials")
    .update({ history_synced_at: to.toISOString() })
    .eq("organization_id", organizationId)
    .eq("provider", "onlinepbx");
  return { synced };
}

export { isExtension as isPbxExtension, num as pbxNumber, str as pbxString };

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

/** Marks that a validated inbound event (OnlinePBX webhook) was just received for this provider -- shown as "Oxirgi webhook" on its card. */
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
