-- Rebuilds the telephony/integrations settings page to match a reference
-- product's "Integratsiyalar" page: a grid of provider cards that can each
-- be configured and enabled INDEPENDENTLY (its own intro text says so --
-- "Bir nechta manbani birga ishlatish mumkin"). org_telephony_credentials
-- was previously one row per organization TOTAL (organization_id was the
-- primary key), so saving a second provider silently overwrote the first
-- -- switching from OnlinePBX to Binotel, for example, would have wiped
-- the org's already-working OnlinePBX credentials. This migration makes
-- it one row per (organization_id, provider) instead, so every card keeps
-- its own independent state the way the reference page's cards do.
alter table public.org_telephony_credentials
  drop constraint if exists org_telephony_credentials_pkey;

alter table public.org_telephony_credentials
  add column if not exists id uuid not null default gen_random_uuid();

alter table public.org_telephony_credentials
  add constraint org_telephony_credentials_pkey primary key (id);

alter table public.org_telephony_credentials
  drop constraint if exists org_telephony_credentials_org_provider_key;
alter table public.org_telephony_credentials
  add constraint org_telephony_credentials_org_provider_key unique (organization_id, provider);

-- Maps a provider's own extension/operator/manager code (Issabel's
-- internal numbers, New-Tel's employee extensions, a generic API
-- integration's external manager_id) to one of this org's own profiles --
-- reused by all three of those cards' "menejer moslashtirish" panels
-- instead of three separate mapping tables, since the shape is identical
-- for all of them: one external code, one profile.
alter table public.org_telephony_credentials
  add column if not exists extension_links jsonb not null default '[]'::jsonb;

-- Last time a validated inbound event (New-Tel/generic API webhook) was
-- actually received for this row -- shown as "Oxirgi webhook" on its
-- card instead of always reading a fixed "Hali kelmagan" placeholder.
alter table public.org_telephony_credentials
  add column if not exists last_event_at timestamptz;
