-- Phones running the SalesIQ app (Android, Firebase Cloud Messaging).
-- Next to push_subscriptions (browsers, web push): sendPush delivers to
-- both. The app registers its token through /notifications/push
-- (register_device), which writes with the service role; people only read
-- their own rows. The token is unique, so a phone handed to someone else
-- belongs to whoever signed in on it last. Re-runnable.

create table if not exists public.push_devices (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  token text not null unique,
  platform text not null default 'android' check (platform in ('android', 'ios')),
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);
create index if not exists push_devices_profile_idx on public.push_devices (profile_id);

alter table public.push_devices enable row level security;
drop policy if exists "push_devices_own" on public.push_devices;
create policy "push_devices_own" on public.push_devices
  for select to authenticated
  using (profile_id = auth.uid() and organization_id = public.current_user_org_id());

notify pgrst, 'reload schema';
