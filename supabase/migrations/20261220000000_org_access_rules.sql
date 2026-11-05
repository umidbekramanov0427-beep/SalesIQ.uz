-- Sozlamalar → Huquqlar (amoCRM-style access): per company, per role
-- (rop, sotuv_menejeri), which sections and funnels they open and whose
-- leads they see (all / their group / only their own). One JSON document
-- per company; everyone in the company reads it (the app hides what the
-- rules close), only the company's super admin changes it -- a ROP must
-- not be able to widen their own access.
--
-- rules = {
--   "rop":            { "leads": "group", "sections": { "inbox": false }, "funnels": { "Kurs savdosi": false } },
--   "sotuv_menejeri": { "leads": "own", ... }
-- }
-- A missing key keeps the default (section/funnel open; rop sees the
-- group, a rep only their own leads).

create table if not exists public.org_access_rules (
  organization_id uuid primary key references public.organizations(id) on delete cascade,
  rules jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles(id) on delete set null
);

alter table public.org_access_rules enable row level security;

drop policy if exists "org_access_rules_select" on public.org_access_rules;
create policy "org_access_rules_select" on public.org_access_rules
  for select to authenticated
  using (organization_id = public.current_user_org_id());

drop policy if exists "org_access_rules_insert" on public.org_access_rules;
create policy "org_access_rules_insert" on public.org_access_rules
  for insert to authenticated
  with check (
    organization_id = public.current_user_org_id()
    and public.current_user_role() = 'super_admin'
  );

drop policy if exists "org_access_rules_update" on public.org_access_rules;
create policy "org_access_rules_update" on public.org_access_rules
  for update to authenticated
  using (
    organization_id = public.current_user_org_id()
    and public.current_user_role() = 'super_admin'
  )
  with check (
    organization_id = public.current_user_org_id()
    and public.current_user_role() = 'super_admin'
  );

revoke all on public.org_access_rules from anon;
grant select, insert, update on public.org_access_rules to authenticated;
grant all on public.org_access_rules to service_role;

notify pgrst, 'reload schema';
