// Server-only. Platforma -> Sozlamalar -> Marketing: the platform's own keys
// for the marketing panel, saved from the owner panel (sealed in
// platform_private, migration 20270131) next to the server's .env:
//   - the Meta app that companies connect their ad accounts through
//     (META_APP_ID / META_APP_SECRET on the server win);
//   - a signed-in YouTube account's cookies.txt, handed to the tg-live
//     service when YouTube asks the server to prove it is not a bot.
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { openSecret, sealSecret } from "@/lib/secret-box.server";

const saved: {
  metaAppId: string | null;
  metaSecret: string | null;
  ytCookies: string | null;
  at: number;
} = { metaAppId: null, metaSecret: null, ytCookies: null, at: 0 };

let refreshing: Promise<void> | null = null;

/** Reads the saved keys (at most once a minute unless forced). */
export async function refreshPlatformIntegrations(force = false): Promise<void> {
  if (!force && Date.now() - saved.at < 60_000) return;
  if (refreshing) return refreshing;
  refreshing = (async () => {
    try {
      const { data, error } = await supabaseAdmin
        .from("platform_private")
        .select("meta_app_id, meta_app_secret_sealed, youtube_cookies_sealed")
        .eq("id", true)
        .maybeSingle();
      if (!error) {
        const row = data as {
          meta_app_id?: string | null;
          meta_app_secret_sealed?: string | null;
          youtube_cookies_sealed?: string | null;
        } | null;
        saved.metaAppId = row?.meta_app_id ?? null;
        saved.metaSecret = row?.meta_app_secret_sealed
          ? openSecret(row.meta_app_secret_sealed)
          : null;
        saved.ytCookies = row?.youtube_cookies_sealed
          ? openSecret(row.youtube_cookies_sealed)
          : null;
      }
    } catch {
      // Before the migration: nothing saved.
    } finally {
      saved.at = Date.now();
      refreshing = null;
    }
  })();
  return refreshing;
}

const stale = () => {
  if (Date.now() - saved.at > 60_000) void refreshPlatformIntegrations();
};

export function savedMetaApp(): { id: string | null; secret: string | null } {
  stale();
  return { id: saved.metaAppId, secret: saved.metaSecret };
}

export function youtubeCookies(): string | null {
  stale();
  return saved.ytCookies;
}

async function upsert(patch: Record<string, unknown>) {
  const { error } = await supabaseAdmin
    .from("platform_private")
    .upsert({ id: true, ...patch, updated_at: new Date().toISOString() } as never, {
      onConflict: "id",
    });
  if (error) {
    if (/column|schema cache/i.test(error.message))
      throw new Error("Bazani yangilash kerak: 20270131 migratsiyasini qo'llang");
    throw error;
  }
  await refreshPlatformIntegrations(true);
}

/** Saves the Meta app: the ID, and the secret when one is given (null clears both). */
export async function saveMetaApp(appId: string | null, secret: string | null): Promise<void> {
  if (appId === null) return upsert({ meta_app_id: null, meta_app_secret_sealed: null });
  const id = appId.trim();
  if (!/^\d{5,25}$/.test(id)) throw new Error("App ID faqat raqamlardan iborat bo'ladi");
  const patch: Record<string, unknown> = { meta_app_id: id };
  if (secret !== null) {
    const s = secret.trim();
    if (!/^[a-f0-9]{32}$/i.test(s)) throw new Error("App Secret 32 belgili bo'ladi (0-9, a-f)");
    patch["meta_app_secret_sealed"] = sealSecret(s);
  } else if (!saved.metaSecret) {
    throw new Error("App Secret'ni ham kiriting");
  }
  await upsert(patch);
}

/** Saves a cookies.txt (Netscape format) for YouTube; null removes it. */
export async function saveYoutubeCookies(text: string | null): Promise<void> {
  if (text === null) return upsert({ youtube_cookies_sealed: null });
  const t = text.trim();
  if (!t.includes(".youtube.com") || t.length > 300_000)
    throw new Error(
      "Bu YouTube cookies.txt fayli emas (ichida .youtube.com qatorlari bo'lishi kerak)",
    );
  await upsert({ youtube_cookies_sealed: sealSecret(t) });
}
