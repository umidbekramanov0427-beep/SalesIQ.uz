// Server-only. Continuous sync: Bitrix24 -> SalesIQ leads, contacts and
// pipeline stages. Never import this from a route file or component that
// ships to the client -- it touches the org's Bitrix24 webhook URL (a
// bearer credential) and the Supabase service-role key.
//
// Auth model is deliberately simpler than amocrm/client.server.ts: Bitrix24
// authenticates by "incoming webhook" -- a single long-lived URL an org's
// own Bitrix24 admin generates from their portal (CRM -> Settings ->
// Developer resources -> Other -> Inbound webhook), already scoped to
// whatever permissions they grant it (crm read/write). There is no OAuth
// app registration, no client secret, no access/refresh token pair to
// juggle -- every call is just an HTTPS POST to
// `${webhook_url}${method}.json`.
//
// This sandbox has no network access to a real Bitrix24 portal to test
// against (same caveat as payments.payme/click.webhook.ts) -- the REST
// method names, field names and event payload shapes below follow
// Bitrix24's own public REST API documentation, but a first real
// connection should be watched (sync log + browser network tab on the
// portal's own webhook statistics page) before relying on it.
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export type Bitrix24Connection = {
  organization_id: string;
  webhook_url: string;
  portal_domain: string;
  connected_by: string | null;
  connected_at: string;
  last_synced_at: string | null;
  last_sync_error: string | null;
  sync_in_progress: boolean;
  sync_started_at: string | null;
  events_registered: boolean;
};

export type SyncResult = { synced: number; error?: string; skipped?: boolean };

// A run stuck "in progress" for longer than this is assumed to have died
// (a killed request, a crashed deploy) rather than genuinely still
// running -- same overlap-lock pattern and threshold as AmoCRM's
// SYNC_LOCK_STALE_MS, so one wedged run can't block every sync forever.
const SYNC_LOCK_STALE_MS = 10 * 60 * 1000;

function describeError(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

// Accepts the full webhook URL an org pastes in (e.g.
// "https://example.bitrix24.com/rest/1/abcdEFGH123456/") and normalizes it
// to always end in exactly one trailing slash, so `${webhook_url}method`
// composes correctly regardless of whether they included it.
export function normalizeWebhookUrl(raw: string): { url: string; portalDomain: string } {
  const trimmed = raw.trim();
  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    throw new Error("Bitrix24 webhook manzili noto'g'ri ko'rinishda.");
  }
  if (!/^https?:$/.test(parsed.protocol) || !/\/rest\/\d+\/[\w-]+\/?$/.test(parsed.pathname)) {
    throw new Error(
      "Bu Bitrix24 inbound webhook manziliga o'xshamayapti (masalan: https://portal.bitrix24.com/rest/1/xxxxxxxx/).",
    );
  }
  const url = trimmed.endsWith("/") ? trimmed : `${trimmed}/`;
  return { url, portalDomain: parsed.hostname };
}

async function bxCall<T = unknown>(
  webhookUrl: string,
  method: string,
  params: Record<string, unknown> = {},
): Promise<T> {
  const res = await fetch(`${webhookUrl}${method}.json`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(params),
  });
  const json = (await res.json().catch(() => null)) as {
    result?: T;
    error?: string;
    error_description?: string;
    next?: number;
    total?: number;
  } | null;
  if (!res.ok || !json || json.error) {
    throw new Error(
      `Bitrix24 [${method}]: ${json?.error_description ?? json?.error ?? res.statusText}`,
    );
  }
  return json.result as T;
}

export async function testConnection(webhookUrl: string): Promise<{ ok: boolean; error?: string }> {
  try {
    await bxCall(webhookUrl, "profile");
    return { ok: true };
  } catch (err) {
    return { ok: false, error: describeError(err) };
  }
}

export async function getConnection(organizationId: string): Promise<Bitrix24Connection | null> {
  const { data } = await supabaseAdmin
    .from("bitrix24_connection")
    .select("*")
    .eq("organization_id", organizationId)
    .maybeSingle();
  return data;
}

export async function saveConnection(
  organizationId: string,
  webhookUrlRaw: string,
  connectedBy: string,
): Promise<Bitrix24Connection> {
  const { url, portalDomain } = normalizeWebhookUrl(webhookUrlRaw);
  const test = await testConnection(url);
  if (!test.ok) {
    throw new Error(test.error ?? "Bitrix24 bilan bog'lanib bo'lmadi.");
  }
  const { data, error } = await supabaseAdmin
    .from("bitrix24_connection")
    .upsert(
      {
        organization_id: organizationId,
        webhook_url: url,
        portal_domain: portalDomain,
        connected_by: connectedBy,
        connected_at: new Date().toISOString(),
        last_sync_error: null,
        events_registered: false,
      },
      { onConflict: "organization_id" },
    )
    .select("*")
    .single();
  if (error) throw error;
  return data;
}

export async function disconnectBitrix24(organizationId: string): Promise<void> {
  await supabaseAdmin.from("bitrix24_connection").delete().eq("organization_id", organizationId);
}

// Subscribes this portal's deal-change events to our webhook receiver, so
// changes made inside Bitrix24 reach us within seconds instead of waiting
// for the next 5-minute cron tick -- the "doimiy" (continuous) half of this
// integration. event.bind works over the same incoming-webhook auth as
// every other call here; org routing on the receiving end works the same
// way AmoCRM's webhook does (an ?org=<id> query param on the handler URL,
// since Bitrix24's own event payload has no tenant identifier we control).
export async function registerEventHandlers(conn: Bitrix24Connection): Promise<void> {
  const base = process.env["APP_URL"] ?? "https://salesiq.uz";
  const handler = `${base}/integrations/bitrix24/webhook?org=${conn.organization_id}`;
  const events = ["ONCRMDEALADD", "ONCRMDEALUPDATE", "ONCRMDEALDELETE"];
  for (const event of events) {
    await bxCall(conn.webhook_url, "event.bind", { event, handler }).catch((err: unknown) => {
      // Best-effort: a portal that already has this exact binding returns
      // an error Bitrix24 itself calls "handler already binded", which is
      // fine to ignore; a genuinely broken binding still leaves the
      // 5-minute cron as a safety net rather than failing the whole
      // connect flow.
      console.error(`[bitrix24] event.bind(${event}) failed`, describeError(err));
    });
  }
  await supabaseAdmin
    .from("bitrix24_connection")
    .update({ events_registered: true })
    .eq("organization_id", conn.organization_id);
}

export async function logBitrix24SyncRun(
  organizationId: string,
  trigger: "manual" | "cron" | "webhook",
  startedAt: string,
  result: SyncResult,
): Promise<void> {
  await supabaseAdmin.from("bitrix24_sync_log").insert({
    organization_id: organizationId,
    trigger,
    started_at: startedAt,
    synced_count: result.synced,
    skipped: !!result.skipped,
    error: result.error ?? null,
  });
}

// --- Pipeline stages -------------------------------------------------

type Bitrix24Category = { ID: number; NAME: string };
type Bitrix24Stage = { STATUS_ID: string; NAME: string; SORT: number; SEMANTICS?: string };

const STAGE_COLOR_ROTATION = [
  "bg-blue-500",
  "bg-violet-500",
  "bg-amber-500",
  "bg-cyan-500",
  "bg-pink-500",
  "bg-lime-500",
];

async function fetchCategories(webhookUrl: string): Promise<Bitrix24Category[]> {
  const result = await bxCall<{ items?: Bitrix24Category[] } | Bitrix24Category[]>(
    webhookUrl,
    "crm.dealcategory.list",
  );
  // Default deal pipeline (category 0, "General") is never itself listed by
  // crm.dealcategory.list -- only custom pipelines are. Always include it.
  const custom = Array.isArray(result) ? result : (result.items ?? []);
  return [{ ID: 0, NAME: "General" }, ...custom];
}

async function fetchCategoryStages(
  webhookUrl: string,
  categoryId: number,
): Promise<Bitrix24Stage[]> {
  const result = await bxCall<{ items?: Bitrix24Stage[] } | Bitrix24Stage[]>(
    webhookUrl,
    "crm.dealcategory.stage.list",
    { id: categoryId },
  );
  return Array.isArray(result) ? result : (result.items ?? []);
}

async function syncPipelineStagesFromBitrix24(
  organizationId: string,
  conn: Bitrix24Connection,
): Promise<Map<string, string>> {
  const categories = await fetchCategories(conn.webhook_url);
  const rows: {
    organization_id: string;
    bitrix24_category_id: number;
    bitrix24_stage_id: string;
    key: string;
    name: string;
    pipeline_name: string;
    position: number;
    color: string;
    probability: number;
    is_won: boolean;
    is_lost: boolean;
  }[] = [];

  let index = 0;
  for (const category of categories) {
    const stages = await fetchCategoryStages(conn.webhook_url, category.ID);
    for (const stage of stages) {
      // SEMANTICS: "S" = success/won, "F" = failure/lost, "P" = in
      // progress -- Bitrix24's own generalization of the many differently-
      // named terminal stages each pipeline can have.
      const isWon = stage.SEMANTICS === "S";
      const isLost = stage.SEMANTICS === "F";
      rows.push({
        organization_id: organizationId,
        bitrix24_category_id: category.ID,
        bitrix24_stage_id: stage.STATUS_ID,
        key: `bx24-${category.ID}-${stage.STATUS_ID}`,
        name: stage.NAME,
        pipeline_name: category.NAME?.trim() || "General",
        position: stage.SORT ?? index,
        color: isWon
          ? "bg-success"
          : isLost
            ? "bg-destructive"
            : STAGE_COLOR_ROTATION[index % STAGE_COLOR_ROTATION.length]!,
        probability: isWon ? 100 : isLost ? 0 : Math.min(90, 20 + index * 15),
        is_won: isWon,
        is_lost: isLost,
      });
      index += 1;
    }
  }
  if (rows.length === 0) return new Map();

  const { data, error } = await supabaseAdmin
    .from("pipeline_stages")
    .upsert(rows, { onConflict: "organization_id,bitrix24_category_id,bitrix24_stage_id" })
    .select("id, bitrix24_category_id, bitrix24_stage_id");
  if (error) throw error;

  const stageByKey = new Map<string, string>();
  for (const row of data ?? []) {
    if (row.bitrix24_category_id != null && row.bitrix24_stage_id != null) {
      stageByKey.set(`${row.bitrix24_category_id}:${row.bitrix24_stage_id}`, row.id);
    }
  }
  return stageByKey;
}

// --- User (owner) mapping ---------------------------------------------

type Bitrix24User = { ID: string; EMAIL: string | null };

async function syncUserMapping(webhookUrl: string): Promise<Map<number, string>> {
  const users = await bxCall<Bitrix24User[]>(webhookUrl, "user.get", { ACTIVE: true });
  const emails = (users ?? [])
    .filter((u) => u.EMAIL)
    .map((u) => ({ id: Number(u.ID), email: u.EMAIL!.toLowerCase() }));
  if (emails.length === 0) return new Map();

  const { data: profiles } = await supabaseAdmin
    .from("profiles")
    .select("id, email")
    .in(
      "email",
      emails.map((e) => e.email),
    );
  const profileIdByEmail = new Map((profiles ?? []).map((p) => [p.email.toLowerCase(), p.id]));

  const ownerByBxUserId = new Map<number, string>();
  for (const { id, email } of emails) {
    const profileId = profileIdByEmail.get(email);
    if (profileId) ownerByBxUserId.set(id, profileId);
  }
  return ownerByBxUserId;
}

// --- Contacts -----------------------------------------------------------

type Bitrix24Contact = {
  ID: string;
  NAME?: string;
  LAST_NAME?: string;
  PHONE?: { VALUE: string }[];
  EMAIL?: { VALUE: string }[];
};

async function fetchContactsByIds(
  webhookUrl: string,
  ids: number[],
): Promise<Map<number, Bitrix24Contact>> {
  const map = new Map<number, Bitrix24Contact>();
  if (ids.length === 0) return map;
  const result = await bxCall<Bitrix24Contact[]>(webhookUrl, "crm.contact.list", {
    filter: { "@ID": ids },
    select: ["ID", "NAME", "LAST_NAME", "PHONE", "EMAIL"],
  });
  for (const contact of result ?? []) map.set(Number(contact.ID), contact);
  return map;
}

async function upsertContactsAndGetIds(
  organizationId: string,
  webhookUrl: string,
  bxContactIds: number[],
): Promise<Map<number, string>> {
  const uniqueIds = [...new Set(bxContactIds)];
  const localIdByBxId = new Map<number, string>();
  if (uniqueIds.length === 0) return localIdByBxId;

  const contacts = await fetchContactsByIds(webhookUrl, uniqueIds);
  const rows = uniqueIds
    .map((id) => contacts.get(id))
    .filter((c): c is Bitrix24Contact => !!c)
    .map((c) => ({
      organization_id: organizationId,
      bitrix24_contact_id: Number(c.ID),
      full_name: [c.NAME, c.LAST_NAME].filter(Boolean).join(" ").trim() || `Contact ${c.ID}`,
      phone: c.PHONE?.[0]?.VALUE ?? null,
      email: c.EMAIL?.[0]?.VALUE ?? null,
    }));
  if (rows.length === 0) return localIdByBxId;

  const { data, error } = await supabaseAdmin
    .from("contacts")
    .upsert(rows, { onConflict: "bitrix24_contact_id" })
    .select("id, bitrix24_contact_id");
  if (error) throw error;
  for (const row of data ?? []) {
    if (row.bitrix24_contact_id != null) localIdByBxId.set(row.bitrix24_contact_id, row.id);
  }
  return localIdByBxId;
}

// --- Deals -> leads -------------------------------------------------------

type Bitrix24Deal = {
  ID: string;
  TITLE: string;
  OPPORTUNITY: string | null;
  STAGE_ID: string;
  CATEGORY_ID: string;
  ASSIGNED_BY_ID: string | null;
  CONTACT_ID: string | null;
  DATE_MODIFY: string;
  SOURCE_ID: string | null;
};

const DEALS_PAGE_SIZE = 50;
// A single sync run is capped to this many pages so one very large,
// never-synced-before portal can't run long enough to hit the hosting
// platform's own request-time limit -- the next 5-minute cron tick simply
// continues from wherever DATE_MODIFY filtering leaves off. Deliberately
// simpler than AmoCRM's resumable initial_sync_page cursor: a Bitrix24
// portal backfill that needs more than this many ticks to catch up is rare
// enough that a slower convergence is an acceptable trade for far less
// code to maintain.
const MAX_PAGES_PER_RUN = 20;

export async function syncDealsFromBitrix24(organizationId: string): Promise<SyncResult> {
  const conn0 = await getConnection(organizationId);
  if (!conn0) throw new Error("Bitrix24 hali ulanmagan.");

  if (
    conn0.sync_in_progress &&
    conn0.sync_started_at &&
    Date.now() - new Date(conn0.sync_started_at).getTime() < SYNC_LOCK_STALE_MS
  ) {
    return { synced: 0, skipped: true };
  }

  await supabaseAdmin
    .from("bitrix24_connection")
    .update({ sync_in_progress: true, sync_started_at: new Date().toISOString() })
    .eq("organization_id", organizationId);

  try {
    const [stageByKey, ownerByBxUserId] = await Promise.all([
      syncPipelineStagesFromBitrix24(organizationId, conn0).catch((e: unknown) => {
        throw new Error(`[pipeline stages] ${describeError(e)}`);
      }),
      syncUserMapping(conn0.webhook_url).catch((e: unknown) => {
        throw new Error(`[user mapping] ${describeError(e)}`);
      }),
    ]);

    // 10-minute overlap so a slightly-late run can't drop a deal that
    // changed in the gap since the last successful sync -- same margin
    // AmoCRM's own incremental sync uses.
    const SYNC_OVERLAP_SECONDS = 600;
    const sinceIso = conn0.last_synced_at
      ? new Date(
          new Date(conn0.last_synced_at).getTime() - SYNC_OVERLAP_SECONDS * 1000,
        ).toISOString()
      : null;

    let totalSynced = 0;
    let start = 0;
    for (let pageCount = 0; pageCount < MAX_PAGES_PER_RUN; pageCount++) {
      const deals = await bxCall<Bitrix24Deal[]>(conn0.webhook_url, "crm.deal.list", {
        filter: sinceIso ? { ">DATE_MODIFY": sinceIso } : {},
        select: [
          "ID",
          "TITLE",
          "OPPORTUNITY",
          "STAGE_ID",
          "CATEGORY_ID",
          "ASSIGNED_BY_ID",
          "CONTACT_ID",
          "DATE_MODIFY",
          "SOURCE_ID",
        ],
        start,
      });
      if (!deals || deals.length === 0) break;

      const contactIds = deals
        .map((d) => (d.CONTACT_ID ? Number(d.CONTACT_ID) : null))
        .filter((id): id is number => id != null);
      const localContactIdByBxId = await upsertContactsAndGetIds(
        organizationId,
        conn0.webhook_url,
        contactIds,
      );

      const leadRows = deals.map((deal) => {
        const stageId = stageByKey.get(`${deal.CATEGORY_ID}:${deal.STAGE_ID}`) ?? null;
        const ownerId = deal.ASSIGNED_BY_ID
          ? (ownerByBxUserId.get(Number(deal.ASSIGNED_BY_ID)) ?? null)
          : null;
        const contactId = deal.CONTACT_ID
          ? (localContactIdByBxId.get(Number(deal.CONTACT_ID)) ?? null)
          : null;
        return {
          organization_id: organizationId,
          bitrix24_deal_id: Number(deal.ID),
          name: deal.TITLE || `Deal ${deal.ID}`,
          company_name: "",
          expected_revenue: deal.OPPORTUNITY ? Math.round(Number(deal.OPPORTUNITY)) : 0,
          budget: deal.OPPORTUNITY ? Math.round(Number(deal.OPPORTUNITY)) : 0,
          stage_id: stageId,
          owner_id: ownerId,
          contact_id: contactId,
          source: deal.SOURCE_ID ?? "bitrix24",
        };
      });

      const { error } = await supabaseAdmin
        .from("leads")
        .upsert(leadRows, { onConflict: "bitrix24_deal_id" });
      if (error) throw new Error(`[page ${pageCount} leads-upsert] ${error.message}`);

      totalSynced += leadRows.length;
      if (deals.length < DEALS_PAGE_SIZE) break;
      start += DEALS_PAGE_SIZE;
    }

    await supabaseAdmin
      .from("bitrix24_connection")
      .update({
        last_synced_at: new Date().toISOString(),
        last_sync_error: null,
        sync_in_progress: false,
        sync_started_at: null,
      })
      .eq("organization_id", organizationId);

    return { synced: totalSynced };
  } catch (err) {
    const message = describeError(err);
    await supabaseAdmin
      .from("bitrix24_connection")
      .update({ last_sync_error: message, sync_in_progress: false, sync_started_at: null })
      .eq("organization_id", organizationId);
    return { synced: 0, error: message };
  }
}

// Called from the webhook receiver for a single changed deal -- fetches
// that one deal fresh (the event payload itself only carries the deal ID,
// per Bitrix24's own event contract) and upserts it without touching
// pipeline stages/user mapping, which change far less often and would be
// wasteful to resync on every single deal edit.
export async function upsertSingleDeal(organizationId: string, dealId: number): Promise<void> {
  const conn = await getConnection(organizationId);
  if (!conn) return;

  const deal = await bxCall<Bitrix24Deal | false>(conn.webhook_url, "crm.deal.get", { id: dealId });
  if (!deal) {
    // Bitrix24 returns `false` for a deleted/inaccessible deal -- treat a
    // delete event on an id we don't otherwise know about as a no-op
    // rather than a failed sync.
    return;
  }

  const { data: stageRow } = await supabaseAdmin
    .from("pipeline_stages")
    .select("id")
    .eq("organization_id", organizationId)
    .eq("bitrix24_category_id", Number(deal.CATEGORY_ID))
    .eq("bitrix24_stage_id", deal.STAGE_ID)
    .maybeSingle();

  let ownerId: string | null = null;
  if (deal.ASSIGNED_BY_ID) {
    const ownerByBxUserId = await syncUserMapping(conn.webhook_url);
    ownerId = ownerByBxUserId.get(Number(deal.ASSIGNED_BY_ID)) ?? null;
  }

  let contactId: string | null = null;
  if (deal.CONTACT_ID) {
    const map = await upsertContactsAndGetIds(organizationId, conn.webhook_url, [
      Number(deal.CONTACT_ID),
    ]);
    contactId = map.get(Number(deal.CONTACT_ID)) ?? null;
  }

  await supabaseAdmin.from("leads").upsert(
    {
      organization_id: organizationId,
      bitrix24_deal_id: Number(deal.ID),
      name: deal.TITLE || `Deal ${deal.ID}`,
      company_name: "",
      expected_revenue: deal.OPPORTUNITY ? Math.round(Number(deal.OPPORTUNITY)) : 0,
      budget: deal.OPPORTUNITY ? Math.round(Number(deal.OPPORTUNITY)) : 0,
      stage_id: stageRow?.id ?? null,
      owner_id: ownerId,
      contact_id: contactId,
      source: deal.SOURCE_ID ?? "bitrix24",
    },
    { onConflict: "bitrix24_deal_id" },
  );
}

export async function deleteSyncedDeal(dealId: number): Promise<void> {
  await supabaseAdmin.from("leads").delete().eq("bitrix24_deal_id", dealId);
}
