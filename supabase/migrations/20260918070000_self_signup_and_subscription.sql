-- Self-service company signup (/signup) + a lightweight subscription/
-- renewal flow to go with it -- a trial that expires flips
-- organizations.active to false (already handled by
-- deactivate-expired-trials.ts), and this adds the two small pieces of
-- state that flow needs: one platform-wide row of support contact info
-- (Telegram/phone/email, set once by the platform owner, read by every
-- org's own "Obuna" page) and a request queue an org's own admin can use
-- to tell the platform owner "we paid, please reactivate us" without any
-- real payment processor wired up yet.

create table if not exists public.platform_settings (
  id boolean primary key default true,
  support_telegram text,
  support_phone text,
  support_email text,
  updated_at timestamptz not null default now(),
  constraint platform_settings_singleton check (id)
);
insert into public.platform_settings (id) values (true) on conflict (id) do nothing;

alter table public.platform_settings enable row level security;
drop policy if exists "platform_settings_select" on public.platform_settings;
create policy "platform_settings_select" on public.platform_settings
  for select to authenticated using (true);
drop policy if exists "platform_settings_write" on public.platform_settings;
create policy "platform_settings_write" on public.platform_settings
  for all to authenticated
  using (public.is_platform_owner())
  with check (public.is_platform_owner());

create table if not exists public.subscription_requests (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  requested_by uuid references public.profiles(id) on delete set null,
  note text,
  status text not null default 'pending',
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);

alter table public.subscription_requests enable row level security;
drop policy if exists "subscription_requests_insert" on public.subscription_requests;
create policy "subscription_requests_insert" on public.subscription_requests
  for insert to authenticated
  with check (organization_id = public.current_user_org_id());
drop policy if exists "subscription_requests_select" on public.subscription_requests;
create policy "subscription_requests_select" on public.subscription_requests
  for select to authenticated
  using (organization_id = public.current_user_org_id() or public.is_platform_owner());
drop policy if exists "subscription_requests_update" on public.subscription_requests;
create policy "subscription_requests_update" on public.subscription_requests
  for update to authenticated
  using (public.is_platform_owner())
  with check (public.is_platform_owner());
