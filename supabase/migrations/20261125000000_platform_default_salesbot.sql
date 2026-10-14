-- The platform bot's plain link (t.me/<bot>, without ?start=sb_...) opens
-- one salesbot: someone who is neither a staff member nor a known customer
-- and presses Start lands in it (telegram.webhook.ts). Chosen by the
-- platform owner on Platforma -> Bildirishnomalar; null means the plain
-- link keeps its old behaviour. platform_settings is already readable by
-- every signed-in user and writable only by the platform owner.
alter table public.platform_settings
  add column if not exists default_salesbot_id uuid
    references public.salesbots(id) on delete set null;
