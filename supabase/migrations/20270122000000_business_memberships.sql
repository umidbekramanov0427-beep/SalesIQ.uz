-- Bizneslar (the logo bar → «Biznes»): one person can run several
-- businesses (separate companies -- their own funnels, leads, team and
-- plan) from one sign-in and switch between them. A row here says this
-- person may open this company and with which role; switching moves the
-- person's profiles.organization_id / role to it (server-side only, as
-- before), so every RLS rule keeps working as it is.
--
-- Server-only (it spans companies, so no RLS read for the browser): the
-- app lists and switches through /businesses.
-- Adds a table; nothing is deleted or rewritten. Idempotent.

create table if not exists public.business_memberships (
  profile_id uuid not null references public.profiles(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  role public.app_role not null default 'super_admin',
  created_at timestamptz not null default now(),
  primary key (profile_id, organization_id)
);
create index if not exists business_memberships_org_idx
  on public.business_memberships (organization_id);

alter table public.business_memberships enable row level security;
revoke all on public.business_memberships from anon, authenticated;
grant all on public.business_memberships to service_role;

notify pgrst, 'reload schema';
