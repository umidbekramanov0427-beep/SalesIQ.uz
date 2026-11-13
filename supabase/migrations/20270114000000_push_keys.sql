-- Web push (browser and phone notifications) without setting keys up by
-- hand: when VAPID_* aren't on the server, the platform makes its own key
-- pair once and keeps it here (src/lib/push/push.server.ts vapidKeys). The
-- public key goes to browsers; the private key is sealed. platform_private
-- is server-only. Idempotent: safe to run again.

alter table public.platform_private
  add column if not exists vapid_public_key text,
  add column if not exists vapid_private_key_sealed text;

notify pgrst, 'reload schema';
