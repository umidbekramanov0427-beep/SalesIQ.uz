// Server-only. Marketing paneli -> Manbalar -> Meta reklama: the company
// signs in with Facebook (ads_read only), picks its ad accounts, and every
// hour the campaigns' daily spend, impressions, clicks and leads for the last
// 30 days land in marketing_ad_spend. The token is sealed; it lasts ~60 days.
//   META_APP_ID / META_APP_SECRET   (else the Instagram app's id / secret)
//   META_REDIRECT_URI               (default https://salesiq.uz/marketing-api/meta-callback;
//                                    add it to the Meta app's valid OAuth redirect URIs)
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { openSecret, sealSecret } from "@/lib/secret-box.server";
import { parseInsights, type InsightRow } from "@/lib/meta-ads";

const GRAPH = "https://graph.facebook.com/v21.0";
const env = (k: string) => process.env[k] || undefined;
const appId = () => env("META_APP_ID") ?? env("INSTAGRAM_APP_ID");
const appSecret = () => env("META_APP_SECRET") ?? env("INSTAGRAM_APP_SECRET");
export const metaRedirectUri = () =>
  env("META_REDIRECT_URI") ?? "https://salesiq.uz/marketing-api/meta-callback";

export function metaConfigured(): boolean {
  return !!(appId() && appSecret());
}

/** Facebook's sign-in page; the state carries who asked and where to return (sealed). */
export function metaStartUrl(orgId: string, userId: string, back: string): string {
  const state = sealSecret(JSON.stringify({ orgId, userId, back, ts: Date.now() }));
  const u = new URL("https://www.facebook.com/v21.0/dialog/oauth");
  u.searchParams.set("client_id", appId() ?? "");
  u.searchParams.set("redirect_uri", metaRedirectUri());
  u.searchParams.set("scope", "ads_read");
  u.searchParams.set("response_type", "code");
  u.searchParams.set("state", state);
  return u.toString();
}

export function readState(
  state: string | null,
): { orgId: string; userId: string; back: string } | null {
  const raw = openSecret(state);
  if (!raw) return null;
  try {
    const v = JSON.parse(raw) as { orgId?: string; userId?: string; back?: string; ts?: number };
    if (!v.orgId || !v.userId || !v.back || !v.ts || Date.now() - v.ts > 30 * 60_000) return null;
    return { orgId: v.orgId, userId: v.userId, back: v.back };
  } catch {
    return null;
  }
}

async function graph<T>(path: string, params: Record<string, string>): Promise<T> {
  const u = new URL(path.startsWith("http") ? path : `${GRAPH}${path}`);
  for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v);
  const res = await fetch(u, { signal: AbortSignal.timeout(30_000) });
  const json = (await res.json().catch(() => ({}))) as T & { error?: { message?: string } };
  if (!res.ok || json.error) throw new Error(json.error?.message ?? `Meta ${res.status}`);
  return json;
}

/** Code -> long-lived token -> the person and their ad accounts, saved for the company. */
export async function metaFinish(orgId: string, userId: string, code: string): Promise<void> {
  const short = await graph<{ access_token: string }>("/oauth/access_token", {
    client_id: appId() ?? "",
    client_secret: appSecret() ?? "",
    redirect_uri: metaRedirectUri(),
    code,
  });
  const long = await graph<{ access_token: string; expires_in?: number }>("/oauth/access_token", {
    grant_type: "fb_exchange_token",
    client_id: appId() ?? "",
    client_secret: appSecret() ?? "",
    fb_exchange_token: short.access_token,
  });
  const token = long.access_token;
  const me = await graph<{ name?: string }>("/me", { fields: "name", access_token: token });
  const accounts = await graph<{ data?: { id: string; name?: string; currency?: string }[] }>(
    "/me/adaccounts",
    { fields: "name,currency", limit: "100", access_token: token },
  );
  const list = (accounts.data ?? []).map((a) => ({
    id: a.id,
    name: a.name ?? a.id,
    currency: a.currency ?? "USD",
  }));
  const { error } = await supabaseAdmin.from("marketing_meta_accounts").upsert(
    {
      organization_id: orgId,
      token_sealed: sealSecret(token),
      expires_at: long.expires_in
        ? new Date(Date.now() + long.expires_in * 1000).toISOString()
        : null,
      meta_user: me.name ?? null,
      ad_accounts: list,
      // The first account is picked to begin with.
      selected: list.slice(0, 1).map((a) => a.id),
      last_error: null,
      connected_by: userId,
      connected_at: new Date().toISOString(),
    },
    { onConflict: "organization_id" },
  );
  if (error) throw error;
}

type MetaRow = {
  organization_id: string;
  token_sealed: string;
  ad_accounts: unknown;
  selected: string[];
  last_sync_at: string | null;
};

/** Pulls the last 30 days for one company's chosen ad accounts; returns rows written. */
export async function metaSyncOrg(a: MetaRow): Promise<number> {
  const token = openSecret(a.token_sealed);
  if (!token) throw new Error("Meta tokeni ochilmadi: qayta ulang.");
  const accounts = (Array.isArray(a.ad_accounts) ? a.ad_accounts : []) as {
    id: string;
    currency?: string;
  }[];
  const until = new Date(Date.now() + 5 * 3_600_000).toISOString().slice(0, 10);
  const since = new Date(Date.now() + 5 * 3_600_000 - 30 * 86_400_000).toISOString().slice(0, 10);
  let written = 0;
  for (const id of a.selected) {
    const currency = accounts.find((x) => x.id === id)?.currency ?? "USD";
    let next: string | null = `${GRAPH}/${id}/insights`;
    let params: Record<string, string> = {
      level: "campaign",
      time_increment: "1",
      time_range: JSON.stringify({ since, until }),
      fields: "campaign_id,campaign_name,spend,impressions,clicks,actions,date_start",
      limit: "500",
      access_token: token,
    };
    for (let page = 0; next && page < 20; page++) {
      const r: { data?: InsightRow[]; paging?: { next?: string } } = await graph(next, params);
      const rows = parseInsights(r.data ?? []);
      if (rows.length) {
        const { error } = await supabaseAdmin.from("marketing_ad_spend").upsert(
          rows.map((x) => ({
            organization_id: a.organization_id,
            source: "meta",
            account_id: id,
            currency,
            updated_at: new Date().toISOString(),
            ...x,
          })),
          { onConflict: "organization_id,day,campaign_id" },
        );
        if (error) throw error;
        written += rows.length;
      }
      next = r.paging?.next ?? null;
      params = {};
    }
  }
  await supabaseAdmin
    .from("marketing_meta_accounts")
    .update({ last_sync_at: new Date().toISOString(), last_error: null })
    .eq("organization_id", a.organization_id);
  return written;
}

/** From the 5-minute cron: every connected company, once an hour. */
export async function metaSyncDue(): Promise<number> {
  if (!metaConfigured()) return 0;
  const stale = new Date(Date.now() - 55 * 60_000).toISOString();
  const { data, error } = await supabaseAdmin
    .from("marketing_meta_accounts")
    .select("organization_id, token_sealed, ad_accounts, selected, last_sync_at")
    .or(`last_sync_at.is.null,last_sync_at.lt.${stale}`)
    .limit(50);
  if (error || !data) return 0;
  let n = 0;
  for (const a of data) {
    if (!a.selected?.length) continue;
    try {
      n += await metaSyncOrg(a);
    } catch (err) {
      await supabaseAdmin
        .from("marketing_meta_accounts")
        .update({
          last_sync_at: new Date().toISOString(),
          last_error: err instanceof Error ? err.message.slice(0, 300) : "meta",
        })
        .eq("organization_id", a.organization_id);
    }
  }
  return n;
}
