-- Platforma -> Sozlamalar -> Marketing: the platform's own keys for the
-- marketing panel, set from the owner panel instead of the server's .env:
-- the Meta app (ID and secret) that companies connect their ad accounts
-- through, and a signed-in YouTube account's cookies for taking live frames
-- when YouTube asks the server to prove it is not a bot. The secret and the
-- cookies are sealed by the app; the table stays server-only.
-- Idempotent: safe to run again. Nothing is deleted.

alter table public.platform_private
  add column if not exists meta_app_id text check (meta_app_id is null or meta_app_id ~ '^[0-9]{5,25}$'),
  add column if not exists meta_app_secret_sealed text,
  add column if not exists youtube_cookies_sealed text;

notify pgrst, 'reload schema';
