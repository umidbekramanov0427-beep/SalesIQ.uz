-- Business profile: a single shared row describing the workspace's business
-- context (competitors, terminology, tone) — editable by admins/managers,
-- readable by everyone, and used as extra context for the AI assistant.
-- Run this in the Supabase SQL Editor the same way as the earlier migrations.

create table if not exists public.business_profile (
  id boolean primary key default true,
  company_name text not null default '',
  description text not null default '',
  competitors text not null default '',
  terminology text not null default '',
  tone text not null default '',
  updated_by uuid references public.profiles(id) on delete set null,
  updated_at timestamptz not null default now(),
  constraint business_profile_singleton check (id)
);

alter table public.business_profile enable row level security;

drop policy if exists "business_profile_select" on public.business_profile;
create policy "business_profile_select" on public.business_profile
  for select to authenticated using (true);
drop policy if exists "business_profile_write" on public.business_profile;
create policy "business_profile_write" on public.business_profile
  for all to authenticated
  using (public.is_admin_or_manager()) with check (public.is_admin_or_manager());

drop trigger if exists set_updated_at on public.business_profile;
create trigger set_updated_at before update on public.business_profile
  for each row execute function public.set_updated_at();

insert into public.business_profile (id) values (true)
on conflict (id) do nothing;
