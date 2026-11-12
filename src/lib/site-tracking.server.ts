// Server-only: the website counter's endpoints (/t/visit, /t/lead) and the
// marketing panel's figures. Keys map to companies; everything is per
// company. A tiny in-memory limit per IP keeps a looping page from
// flooding the table.
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { ingestLead } from "@/lib/leads/lead-intake.server";
import { isSpamLead } from "@/lib/leads/intake-clean";
import {
  KEY_RE,
  parseVisit,
  siteStats,
  type SiteStats,
  type SiteVisitRow,
} from "@/lib/site-tracking";

export const CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "POST, OPTIONS",
  "access-control-allow-headers": "content-type",
};

const keyCache = new Map<string, { org: string | null; forms: boolean; at: number }>();

async function orgForKey(key: string): Promise<{ org: string; forms: boolean } | null> {
  const hit = keyCache.get(key);
  if (hit && Date.now() - hit.at < 5 * 60_000)
    return hit.org ? { org: hit.org, forms: hit.forms } : null;
  const { data } = await supabaseAdmin
    .from("site_tracking")
    .select("organization_id, capture_forms")
    .eq("key", key)
    .maybeSingle();
  keyCache.set(key, {
    org: data?.organization_id ?? null,
    forms: data?.capture_forms ?? false,
    at: Date.now(),
  });
  return data ? { org: data.organization_id, forms: data.capture_forms } : null;
}

const hits = new Map<string, { n: number; at: number }>();
/** At most `max` calls a minute from one address. */
function limited(ip: string, max: number): boolean {
  const now = Date.now();
  const h = hits.get(ip);
  if (!h || now - h.at > 60_000) {
    hits.set(ip, { n: 1, at: now });
    if (hits.size > 50_000) hits.clear();
    return false;
  }
  h.n++;
  return h.n > max;
}

const ipOf = (request: Request) =>
  request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";

export async function recordVisit(request: Request): Promise<Response> {
  if (limited(ipOf(request), 120)) return new Response(null, { status: 204, headers: CORS });
  const body = await request.json().catch(() => null);
  const v = parseVisit(body);
  if (!v) return new Response(null, { status: 204, headers: CORS });
  const site = await orgForKey(v.key);
  if (!site) return new Response(null, { status: 204, headers: CORS });
  await supabaseAdmin.from("site_visits").insert({
    organization_id: site.org,
    visitor_id: v.visitorId,
    session_id: v.sessionId,
    path: v.path,
    referrer: v.referrer,
    utm_source: v.utmSource,
    utm_medium: v.utmMedium,
    utm_campaign: v.utmCampaign,
    device: v.device,
  });
  return new Response(null, { status: 204, headers: CORS });
}

const str = (v: unknown, n: number) =>
  typeof v === "string" && v.trim() ? v.trim().slice(0, n) : null;

/** A form with a phone on the company's site: a lead, and the visitor's visits marked. */
export async function recordSiteLead(request: Request): Promise<Response> {
  if (limited(`lead:${ipOf(request)}`, 10)) return Response.json({ ok: true }, { headers: CORS });
  const body = ((await request.json().catch(() => null)) ?? {}) as Record<string, unknown>;
  const key = str(body["k"], 40);
  const vid = str(body["v"], 64);
  if (!key || !KEY_RE.test(key))
    return Response.json({ ok: false }, { status: 400, headers: CORS });
  const site = await orgForKey(key);
  if (!site?.forms) return Response.json({ ok: false }, { status: 404, headers: CORS });
  const name = str(body["name"], 120);
  const phone = str(body["phone"], 40);
  const email = str(body["email"], 160);
  if (!phone || isSpamLead({ name, phone, email, note: null })) {
    return Response.json({ ok: true }, { headers: CORS });
  }
  const utmSource = str(body["us"], 120);
  const utmCampaign = str(body["uc"], 160);
  let page: string | null = null;
  try {
    page = new URL(String(body["u"] ?? "")).hostname || null;
  } catch {
    page = null;
  }
  const result = await ingestLead(site.org, {
    name: name || phone,
    phone,
    email,
    source: utmSource || "Sayt",
    campaign: utmCampaign,
    utm: [utmSource, str(body["um"], 120), utmCampaign].filter(Boolean).join(" / ") || null,
    duplicateSource: "web_form",
    note: page ? `Saytdagi forma: ${page}` : null,
  });
  if (vid) {
    await supabaseAdmin
      .from("site_visits")
      .update({ lead_id: result.leadId })
      .eq("organization_id", site.org)
      .eq("visitor_id", vid)
      .is("lead_id", null);
  }
  return Response.json({ ok: true }, { headers: CORS });
}

/** The marketing panel's site figures for [from, to). */
export async function siteFigures(
  orgId: string,
  fromIso: string,
  toIso: string,
): Promise<SiteStats> {
  const rows: SiteVisitRow[] = [];
  for (let off = 0; off < 100_000; off += 1000) {
    const { data, error } = await supabaseAdmin
      .from("site_visits")
      .select("at, visitor_id, session_id, utm_source, referrer, path, lead_id")
      .eq("organization_id", orgId)
      .gte("at", fromIso)
      .lt("at", toIso)
      .order("at")
      .range(off, off + 999);
    if (error || !data?.length) break;
    rows.push(...(data as SiteVisitRow[]));
    if (data.length < 1000) break;
  }
  return siteStats(rows);
}

/** The company's key (made on first use) and whether forms become leads. */
export async function siteSetup(
  orgId: string,
  patch?: { captureForms?: boolean },
): Promise<{ key: string; captureForms: boolean; lastVisit: string | null }> {
  let { data } = await supabaseAdmin
    .from("site_tracking")
    .select("key, capture_forms")
    .eq("organization_id", orgId)
    .maybeSingle();
  if (!data) {
    const key = [...crypto.getRandomValues(new Uint8Array(18))]
      .map((b) => "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789"[b % 56])
      .join("");
    const ins = await supabaseAdmin
      .from("site_tracking")
      .insert({ organization_id: orgId, key })
      .select("key, capture_forms")
      .single();
    if (ins.error) throw ins.error;
    data = ins.data;
  }
  if (patch?.captureForms != null && patch.captureForms !== data.capture_forms) {
    await supabaseAdmin
      .from("site_tracking")
      .update({ capture_forms: patch.captureForms })
      .eq("organization_id", orgId);
    data = { ...data, capture_forms: patch.captureForms };
    keyCache.delete(data.key);
  }
  const { data: last } = await supabaseAdmin
    .from("site_visits")
    .select("at")
    .eq("organization_id", orgId)
    .order("at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return { key: data.key, captureForms: data.capture_forms, lastVisit: last?.at ?? null };
}
