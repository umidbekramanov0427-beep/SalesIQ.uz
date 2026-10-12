-- Three changes the code relied on that never reached production (applied
-- 2026-10-12 after a column-by-column check of types.ts against the live
-- database). Idempotent.

-- 1) Telephony, as 20261013000000_telephony_multi_provider meant it: one row
--    per (organization, provider), extension links, last webhook time.
--    Without it the telephony page failed to load and saving any provider's
--    keys failed (upserts target organization_id,provider).
alter table public.org_telephony_credentials
  add column if not exists id uuid not null default gen_random_uuid();
alter table public.org_telephony_credentials
  drop constraint if exists org_telephony_credentials_pkey;
alter table public.org_telephony_credentials
  add constraint org_telephony_credentials_pkey primary key (id);
alter table public.org_telephony_credentials
  drop constraint if exists org_telephony_credentials_org_provider_key;
alter table public.org_telephony_credentials
  add constraint org_telephony_credentials_org_provider_key unique (organization_id, provider);
alter table public.org_telephony_credentials
  add column if not exists extension_links jsonb not null default '[]'::jsonb;
alter table public.org_telephony_credentials
  add column if not exists last_event_at timestamptz;

-- 2) amoCRM user -> SalesIQ profile (amoCRM sync matches users by it; no
--    migration had ever created it, so the sync failed at that step).
alter table public.profiles
  add column if not exists amocrm_user_id bigint;
create index if not exists profiles_org_amocrm_user_idx
  on public.profiles (organization_id, amocrm_user_id)
  where amocrm_user_id is not null;

-- 3) Lead card section order (20261009000000 was never run).
alter table public.org_general_settings
  add column if not exists lead_workspace_section_order jsonb;
