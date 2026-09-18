-- The 4 tables that used to hold exactly one global row (or one row per
-- fixed key) become one row per organization instead.
--
-- ---------------------------------------------------------------- --
-- business_profile: id boolean singleton -> organization_id primary key
-- ---------------------------------------------------------------- --
alter table public.business_profile add column if not exists organization_id uuid references public.organizations(id);
update public.business_profile set organization_id = '00000000-0000-0000-0000-000000000001';
alter table public.business_profile alter column organization_id set not null;
alter table public.business_profile drop column id cascade;
alter table public.business_profile add primary key (organization_id);

drop policy "business_profile_select" on public.business_profile;
drop policy "business_profile_write" on public.business_profile;
drop policy if exists "business_profile_select" on public.business_profile;
create policy "business_profile_select" on public.business_profile for select to authenticated
  using (organization_id = public.current_user_org_id());
drop policy if exists "business_profile_write" on public.business_profile;
create policy "business_profile_write" on public.business_profile for all to authenticated
  using (organization_id = public.current_user_org_id() and public.is_admin_or_manager())
  with check (organization_id = public.current_user_org_id() and public.is_admin_or_manager());

-- ---------------------------------------------------------------- --
-- integration_settings: key-only PK -> composite (organization_id, key)
-- ---------------------------------------------------------------- --
alter table public.integration_settings add column if not exists organization_id uuid references public.organizations(id);
update public.integration_settings set organization_id = '00000000-0000-0000-0000-000000000001';
alter table public.integration_settings alter column organization_id set not null;
alter table public.integration_settings drop constraint if exists integration_settings_pkey;
alter table public.integration_settings add primary key (organization_id, key);

drop policy "integration_settings_select" on public.integration_settings;
drop policy "integration_settings_write" on public.integration_settings;
drop policy if exists "integration_settings_select" on public.integration_settings;
create policy "integration_settings_select" on public.integration_settings for select to authenticated
  using (organization_id = public.current_user_org_id());
drop policy if exists "integration_settings_write" on public.integration_settings;
create policy "integration_settings_write" on public.integration_settings for all to authenticated
  using (organization_id = public.current_user_org_id() and public.current_user_role() = 'super_admin')
  with check (organization_id = public.current_user_org_id() and public.current_user_role() = 'super_admin');

-- ---------------------------------------------------------------- --
-- ai_agents: kind-only PK -> composite (organization_id, kind)
-- ---------------------------------------------------------------- --
alter table public.ai_agents add column if not exists organization_id uuid references public.organizations(id);
update public.ai_agents set organization_id = '00000000-0000-0000-0000-000000000001';
alter table public.ai_agents alter column organization_id set not null;
alter table public.ai_agents drop constraint if exists ai_agents_pkey;
alter table public.ai_agents add primary key (organization_id, kind);

drop policy "ai_agents_select" on public.ai_agents;
drop policy "ai_agents_write" on public.ai_agents;
drop policy if exists "ai_agents_select" on public.ai_agents;
create policy "ai_agents_select" on public.ai_agents for select to authenticated
  using (organization_id = public.current_user_org_id() and public.current_user_role() = 'super_admin');
drop policy if exists "ai_agents_write" on public.ai_agents;
create policy "ai_agents_write" on public.ai_agents for all to authenticated
  using (organization_id = public.current_user_org_id() and public.current_user_role() = 'super_admin')
  with check (organization_id = public.current_user_org_id() and public.current_user_role() = 'super_admin');

-- ---------------------------------------------------------------- --
-- amocrm_connection: id boolean singleton -> organization_id primary
-- key. Still zero client-facing RLS policies (service-role only, same
-- as before) — server code now passes organization_id explicitly since
-- there's no longer exactly one connection workspace-wide.
-- ---------------------------------------------------------------- --
alter table public.amocrm_connection add column if not exists organization_id uuid references public.organizations(id);
update public.amocrm_connection set organization_id = '00000000-0000-0000-0000-000000000001';
alter table public.amocrm_connection alter column organization_id set not null;
alter table public.amocrm_connection drop column id cascade;
alter table public.amocrm_connection add primary key (organization_id);
