-- A dedicated SMS provider (Eskiz.uz) independent of telephony/calls -- an
-- org can use OnlinePBX or Sipuni for calls and still want SMS sent through
-- Eskiz specifically (it's the most reliable, cheapest option in
-- Uzbekistan and neither telephony provider is a great SMS gateway: Sipuni
-- has none at all, OnlinePBX's is tenant-dependent). Kept as its own table
-- rather than reusing org_telephony_credentials so the two are never forced
-- to agree on a single provider.
create table if not exists public.org_sms_credentials (
  organization_id uuid primary key references public.organizations(id) on delete cascade,
  provider text not null default 'eskiz',
  email text not null,
  password text not null,
  sender_name text,
  -- Eskiz issues a JWT good for ~30 days; cached here so every SMS send
  -- doesn't have to re-authenticate, only once the cached one is close to
  -- expiring.
  token text,
  token_expires_at timestamptz,
  connected_by uuid references public.profiles(id) on delete set null,
  connected_at timestamptz not null default now()
);

alter table public.org_sms_credentials enable row level security;

drop policy if exists "org_sms_credentials_select" on public.org_sms_credentials;
create policy "org_sms_credentials_select" on public.org_sms_credentials for select to authenticated
  using (organization_id = public.current_user_org_id() and public.is_admin_or_manager());

-- No client-facing write policy: credentials (including the plaintext
-- password and cached token) are only ever written by the
-- /integrations/sms/credentials route, which runs as service role after
-- its own requireSuperAdmin check -- same treatment as
-- org_telephony_credentials and org_smtp_credentials.
