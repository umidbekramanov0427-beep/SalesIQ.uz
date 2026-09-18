-- Multi-tenancy: every company using this platform gets its own
-- organization row. All business data below gets an organization_id
-- column + RLS scoping in the next migration; this one lays the
-- foundation (the table itself + the helper functions/trigger every
-- later policy depends on).
create table if not exists public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  created_by uuid references public.profiles(id)
);

alter table public.organizations enable row level security;

-- Added here (not in the next migration) because current_user_org_id()
-- below references this column — it must exist before that function can
-- be created. The next migration backfills it and adds the not-null
-- constraint for every other table.
alter table public.profiles
  add column if not exists organization_id uuid references public.organizations(id);

-- Resolves the calling user's own organization (null for platform_owner,
-- who doesn't belong to any single company). security definer so it can
-- read profiles regardless of the caller's own RLS visibility, same
-- pattern as the existing current_user_role().
create or replace function public.current_user_org_id()
returns uuid
language sql stable security definer set search_path = public as $$
  select organization_id from public.profiles where id = auth.uid();
$$;

create or replace function public.is_platform_owner()
returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select role from public.profiles where id = auth.uid()) = 'platform_owner', false);
$$;

-- Attached as a BEFORE INSERT trigger on every tenant-scoped table so
-- app code doesn't need to remember to pass organization_id on every
-- insert: it's auto-stamped from the caller's own profile unless
-- explicitly provided (server-side/service-role inserts set it directly,
-- since auth.uid() is null there).
create or replace function public.set_organization_id()
returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.organization_id is null then
    new.organization_id := public.current_user_org_id();
  end if;
  return new;
end; $$;

drop policy if exists "organizations_select" on public.organizations;
create policy "organizations_select" on public.organizations
  for select to authenticated
  using (public.is_platform_owner() or id = public.current_user_org_id());

drop policy if exists "organizations_write" on public.organizations;
create policy "organizations_write" on public.organizations
  for all to authenticated
  using (public.is_platform_owner())
  with check (public.is_platform_owner());
