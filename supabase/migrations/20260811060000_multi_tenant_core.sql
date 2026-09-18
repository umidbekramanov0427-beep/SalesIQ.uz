-- Core multi-tenancy retrofit: every table that holds a company's business
-- data gets an organization_id column, scoped RLS, and an auto-stamping
-- insert trigger (public.set_organization_id(), from the previous
-- migration). All existing data is backfilled into one default
-- organization so nothing already in the workspace is lost or orphaned.
--
-- Fixed id chosen (rather than gen_random_uuid()) so every backfill
-- statement below can reference the exact same organization without
-- needing a session variable.
insert into public.organizations (id, name)
values ('00000000-0000-0000-0000-000000000001', 'Standart kompaniya');

-- ---------------------------------------------------------------- --
-- profiles: nullable organization_id (platform_owner belongs to none).
-- Column itself was added in the previous migration (current_user_org_id()
-- needed it to exist already); this just backfills + constrains it.
-- ---------------------------------------------------------------- --
update public.profiles set organization_id = '00000000-0000-0000-0000-000000000001';
alter table public.profiles add constraint profiles_org_required_unless_owner
  check (role = 'platform_owner' or organization_id is not null);

drop policy "profiles_select_authenticated" on public.profiles;
drop policy "profiles_update_self_or_admin" on public.profiles;
drop policy "profiles_insert_admin" on public.profiles;
drop policy "profiles_delete_admin" on public.profiles;

drop policy if exists "profiles_select" on public.profiles;
create policy "profiles_select" on public.profiles for select to authenticated
  using (organization_id = public.current_user_org_id() or id = auth.uid());
drop policy if exists "profiles_update_self_or_admin" on public.profiles;
create policy "profiles_update_self_or_admin" on public.profiles for update to authenticated
  using (id = auth.uid() or (public.is_admin_or_manager() and organization_id = public.current_user_org_id()))
  with check (id = auth.uid() or (public.is_admin_or_manager() and organization_id = public.current_user_org_id()));
drop policy if exists "profiles_insert_admin" on public.profiles;
create policy "profiles_insert_admin" on public.profiles for insert to authenticated
  with check (public.current_user_role() = 'super_admin' and organization_id = public.current_user_org_id());
drop policy if exists "profiles_delete_admin" on public.profiles;
create policy "profiles_delete_admin" on public.profiles for delete to authenticated
  using (public.current_user_role() = 'super_admin' and organization_id = public.current_user_org_id());

-- ---------------------------------------------------------------- --
-- pipeline_stages
-- ---------------------------------------------------------------- --
alter table public.pipeline_stages add column if not exists organization_id uuid references public.organizations(id);
update public.pipeline_stages set organization_id = '00000000-0000-0000-0000-000000000001';
alter table public.pipeline_stages alter column organization_id set not null;
drop trigger if exists set_org_id on public.pipeline_stages;
create trigger set_org_id before insert on public.pipeline_stages
  for each row execute function public.set_organization_id();

drop policy "stages_select" on public.pipeline_stages;
drop policy "stages_write" on public.pipeline_stages;
drop policy if exists "stages_select" on public.pipeline_stages;
create policy "stages_select" on public.pipeline_stages for select to authenticated
  using (organization_id = public.current_user_org_id());
drop policy if exists "stages_write" on public.pipeline_stages;
create policy "stages_write" on public.pipeline_stages for all to authenticated
  using (organization_id = public.current_user_org_id() and public.is_admin_or_manager())
  with check (organization_id = public.current_user_org_id() and public.is_admin_or_manager());

-- ---------------------------------------------------------------- --
-- companies / contacts / leads / deals (same shape: owner-or-admin
-- write, org-wide read)
-- ---------------------------------------------------------------- --
alter table public.companies add column if not exists organization_id uuid references public.organizations(id);
update public.companies set organization_id = '00000000-0000-0000-0000-000000000001';
alter table public.companies alter column organization_id set not null;
drop trigger if exists set_org_id on public.companies;
create trigger set_org_id before insert on public.companies
  for each row execute function public.set_organization_id();

drop policy "companies_select" on public.companies;
drop policy "companies_insert" on public.companies;
drop policy "companies_update" on public.companies;
drop policy "companies_delete" on public.companies;
drop policy if exists "companies_select" on public.companies;
create policy "companies_select" on public.companies for select to authenticated
  using (organization_id = public.current_user_org_id());
drop policy if exists "companies_insert" on public.companies;
create policy "companies_insert" on public.companies for insert to authenticated
  with check (organization_id = public.current_user_org_id());
drop policy if exists "companies_update" on public.companies;
create policy "companies_update" on public.companies for update to authenticated
  using (organization_id = public.current_user_org_id() and (owner_id = auth.uid() or public.is_admin_or_manager()));
drop policy if exists "companies_delete" on public.companies;
create policy "companies_delete" on public.companies for delete to authenticated
  using (organization_id = public.current_user_org_id() and (owner_id = auth.uid() or public.is_admin_or_manager()));

alter table public.contacts add column if not exists organization_id uuid references public.organizations(id);
update public.contacts set organization_id = '00000000-0000-0000-0000-000000000001';
alter table public.contacts alter column organization_id set not null;
drop trigger if exists set_org_id on public.contacts;
create trigger set_org_id before insert on public.contacts
  for each row execute function public.set_organization_id();

drop policy "contacts_select" on public.contacts;
drop policy "contacts_insert" on public.contacts;
drop policy "contacts_update" on public.contacts;
drop policy "contacts_delete" on public.contacts;
drop policy if exists "contacts_select" on public.contacts;
create policy "contacts_select" on public.contacts for select to authenticated
  using (organization_id = public.current_user_org_id());
drop policy if exists "contacts_insert" on public.contacts;
create policy "contacts_insert" on public.contacts for insert to authenticated
  with check (organization_id = public.current_user_org_id());
drop policy if exists "contacts_update" on public.contacts;
create policy "contacts_update" on public.contacts for update to authenticated
  using (organization_id = public.current_user_org_id() and (owner_id = auth.uid() or public.is_admin_or_manager()));
drop policy if exists "contacts_delete" on public.contacts;
create policy "contacts_delete" on public.contacts for delete to authenticated
  using (organization_id = public.current_user_org_id() and (owner_id = auth.uid() or public.is_admin_or_manager()));

alter table public.leads add column if not exists organization_id uuid references public.organizations(id);
update public.leads set organization_id = '00000000-0000-0000-0000-000000000001';
alter table public.leads alter column organization_id set not null;
drop trigger if exists set_org_id on public.leads;
create trigger set_org_id before insert on public.leads
  for each row execute function public.set_organization_id();

drop policy "leads_select" on public.leads;
drop policy "leads_insert" on public.leads;
drop policy "leads_update" on public.leads;
drop policy "leads_delete" on public.leads;
drop policy if exists "leads_select" on public.leads;
create policy "leads_select" on public.leads for select to authenticated
  using (organization_id = public.current_user_org_id());
drop policy if exists "leads_insert" on public.leads;
create policy "leads_insert" on public.leads for insert to authenticated
  with check (organization_id = public.current_user_org_id());
drop policy if exists "leads_update" on public.leads;
create policy "leads_update" on public.leads for update to authenticated
  using (organization_id = public.current_user_org_id() and (owner_id = auth.uid() or public.is_admin_or_manager()));
drop policy if exists "leads_delete" on public.leads;
create policy "leads_delete" on public.leads for delete to authenticated
  using (organization_id = public.current_user_org_id() and (owner_id = auth.uid() or public.is_admin_or_manager()));

alter table public.deals add column if not exists organization_id uuid references public.organizations(id);
update public.deals set organization_id = '00000000-0000-0000-0000-000000000001';
alter table public.deals alter column organization_id set not null;
drop trigger if exists set_org_id on public.deals;
create trigger set_org_id before insert on public.deals
  for each row execute function public.set_organization_id();

drop policy "deals_select" on public.deals;
drop policy "deals_insert" on public.deals;
drop policy "deals_update" on public.deals;
drop policy "deals_delete" on public.deals;
drop policy if exists "deals_select" on public.deals;
create policy "deals_select" on public.deals for select to authenticated
  using (organization_id = public.current_user_org_id());
drop policy if exists "deals_insert" on public.deals;
create policy "deals_insert" on public.deals for insert to authenticated
  with check (organization_id = public.current_user_org_id());
drop policy if exists "deals_update" on public.deals;
create policy "deals_update" on public.deals for update to authenticated
  using (organization_id = public.current_user_org_id() and (owner_id = auth.uid() or public.is_admin_or_manager()));
drop policy if exists "deals_delete" on public.deals;
create policy "deals_delete" on public.deals for delete to authenticated
  using (organization_id = public.current_user_org_id() and (owner_id = auth.uid() or public.is_admin_or_manager()));

-- ---------------------------------------------------------------- --
-- lead_activities / task_comments (select + insert only, no
-- update/delete policy today)
-- ---------------------------------------------------------------- --
alter table public.lead_activities add column if not exists organization_id uuid references public.organizations(id);
update public.lead_activities set organization_id = '00000000-0000-0000-0000-000000000001';
alter table public.lead_activities alter column organization_id set not null;
drop trigger if exists set_org_id on public.lead_activities;
create trigger set_org_id before insert on public.lead_activities
  for each row execute function public.set_organization_id();

drop policy "lead_activities_select" on public.lead_activities;
drop policy "lead_activities_insert" on public.lead_activities;
drop policy if exists "lead_activities_select" on public.lead_activities;
create policy "lead_activities_select" on public.lead_activities for select to authenticated
  using (organization_id = public.current_user_org_id());
drop policy if exists "lead_activities_insert" on public.lead_activities;
create policy "lead_activities_insert" on public.lead_activities for insert to authenticated
  with check (organization_id = public.current_user_org_id());

alter table public.task_comments add column if not exists organization_id uuid references public.organizations(id);
update public.task_comments set organization_id = '00000000-0000-0000-0000-000000000001';
alter table public.task_comments alter column organization_id set not null;
drop trigger if exists set_org_id on public.task_comments;
create trigger set_org_id before insert on public.task_comments
  for each row execute function public.set_organization_id();

drop policy "task_comments_select" on public.task_comments;
drop policy "task_comments_insert" on public.task_comments;
drop policy if exists "task_comments_select" on public.task_comments;
create policy "task_comments_select" on public.task_comments for select to authenticated
  using (organization_id = public.current_user_org_id());
drop policy if exists "task_comments_insert" on public.task_comments;
create policy "task_comments_insert" on public.task_comments for insert to authenticated
  with check (organization_id = public.current_user_org_id());

-- ---------------------------------------------------------------- --
-- tasks
-- ---------------------------------------------------------------- --
alter table public.tasks add column if not exists organization_id uuid references public.organizations(id);
update public.tasks set organization_id = '00000000-0000-0000-0000-000000000001';
alter table public.tasks alter column organization_id set not null;
drop trigger if exists set_org_id on public.tasks;
create trigger set_org_id before insert on public.tasks
  for each row execute function public.set_organization_id();

drop policy "tasks_select" on public.tasks;
drop policy "tasks_insert" on public.tasks;
drop policy "tasks_update" on public.tasks;
drop policy "tasks_delete" on public.tasks;
drop policy if exists "tasks_select" on public.tasks;
create policy "tasks_select" on public.tasks for select to authenticated
  using (organization_id = public.current_user_org_id());
drop policy if exists "tasks_insert" on public.tasks;
create policy "tasks_insert" on public.tasks for insert to authenticated
  with check (organization_id = public.current_user_org_id());
drop policy if exists "tasks_update" on public.tasks;
create policy "tasks_update" on public.tasks for update to authenticated
  using (organization_id = public.current_user_org_id()
    and (assignee_id = auth.uid() or created_by = auth.uid() or public.is_admin_or_manager()));
drop policy if exists "tasks_delete" on public.tasks;
create policy "tasks_delete" on public.tasks for delete to authenticated
  using (organization_id = public.current_user_org_id()
    and (created_by = auth.uid() or public.is_admin_or_manager()));

-- ---------------------------------------------------------------- --
-- notifications (user_id null = broadcast — now broadcast within the
-- recipient's own organization only)
-- ---------------------------------------------------------------- --
alter table public.notifications add column if not exists organization_id uuid references public.organizations(id);
update public.notifications set organization_id = '00000000-0000-0000-0000-000000000001';
alter table public.notifications alter column organization_id set not null;
drop trigger if exists set_org_id on public.notifications;
create trigger set_org_id before insert on public.notifications
  for each row execute function public.set_organization_id();

drop policy "notifications_select" on public.notifications;
drop policy "notifications_insert" on public.notifications;
drop policy "notifications_update" on public.notifications;
drop policy if exists "notifications_select" on public.notifications;
create policy "notifications_select" on public.notifications for select to authenticated
  using (organization_id = public.current_user_org_id() and (user_id = auth.uid() or user_id is null));
drop policy if exists "notifications_insert" on public.notifications;
create policy "notifications_insert" on public.notifications for insert to authenticated
  with check (organization_id = public.current_user_org_id());
drop policy if exists "notifications_update" on public.notifications;
create policy "notifications_update" on public.notifications for update to authenticated
  using (organization_id = public.current_user_org_id() and (user_id = auth.uid() or user_id is null));

-- ---------------------------------------------------------------- --
-- audit_logs
-- ---------------------------------------------------------------- --
alter table public.audit_logs add column if not exists organization_id uuid references public.organizations(id);
update public.audit_logs set organization_id = '00000000-0000-0000-0000-000000000001';
alter table public.audit_logs alter column organization_id set not null;
drop trigger if exists set_org_id on public.audit_logs;
create trigger set_org_id before insert on public.audit_logs
  for each row execute function public.set_organization_id();

drop policy "audit_logs_select" on public.audit_logs;
drop policy "audit_logs_insert" on public.audit_logs;
drop policy if exists "audit_logs_select" on public.audit_logs;
create policy "audit_logs_select" on public.audit_logs for select to authenticated
  using (organization_id = public.current_user_org_id() and public.is_admin_or_manager());
drop policy if exists "audit_logs_insert" on public.audit_logs;
create policy "audit_logs_insert" on public.audit_logs for insert to authenticated
  with check (organization_id = public.current_user_org_id());

-- ---------------------------------------------------------------- --
-- work_sessions / call_logs (attendance)
-- ---------------------------------------------------------------- --
alter table public.work_sessions add column if not exists organization_id uuid references public.organizations(id);
update public.work_sessions set organization_id = '00000000-0000-0000-0000-000000000001';
alter table public.work_sessions alter column organization_id set not null;
drop trigger if exists set_org_id on public.work_sessions;
create trigger set_org_id before insert on public.work_sessions
  for each row execute function public.set_organization_id();

drop policy "work_sessions_select" on public.work_sessions;
drop policy "work_sessions_insert" on public.work_sessions;
drop policy "work_sessions_update" on public.work_sessions;
drop policy if exists "work_sessions_select" on public.work_sessions;
create policy "work_sessions_select" on public.work_sessions for select to authenticated
  using (organization_id = public.current_user_org_id() and (profile_id = auth.uid() or public.is_admin_or_manager()));
drop policy if exists "work_sessions_insert" on public.work_sessions;
create policy "work_sessions_insert" on public.work_sessions for insert to authenticated
  with check (organization_id = public.current_user_org_id() and profile_id = auth.uid());
drop policy if exists "work_sessions_update" on public.work_sessions;
create policy "work_sessions_update" on public.work_sessions for update to authenticated
  using (organization_id = public.current_user_org_id() and profile_id = auth.uid());

alter table public.call_logs add column if not exists organization_id uuid references public.organizations(id);
update public.call_logs set organization_id = '00000000-0000-0000-0000-000000000001';
alter table public.call_logs alter column organization_id set not null;
drop trigger if exists set_org_id on public.call_logs;
create trigger set_org_id before insert on public.call_logs
  for each row execute function public.set_organization_id();

drop policy "call_logs_select" on public.call_logs;
drop policy "call_logs_insert" on public.call_logs;
drop policy if exists "call_logs_select" on public.call_logs;
create policy "call_logs_select" on public.call_logs for select to authenticated
  using (organization_id = public.current_user_org_id() and (profile_id = auth.uid() or public.is_admin_or_manager()));
drop policy if exists "call_logs_insert" on public.call_logs;
create policy "call_logs_insert" on public.call_logs for insert to authenticated
  with check (organization_id = public.current_user_org_id() and profile_id = auth.uid());

-- ---------------------------------------------------------------- --
-- auto_responders
-- ---------------------------------------------------------------- --
alter table public.auto_responders add column if not exists organization_id uuid references public.organizations(id);
update public.auto_responders set organization_id = '00000000-0000-0000-0000-000000000001';
alter table public.auto_responders alter column organization_id set not null;
drop trigger if exists set_org_id on public.auto_responders;
create trigger set_org_id before insert on public.auto_responders
  for each row execute function public.set_organization_id();

drop policy "auto_responders_select" on public.auto_responders;
drop policy "auto_responders_write" on public.auto_responders;
drop policy if exists "auto_responders_select" on public.auto_responders;
create policy "auto_responders_select" on public.auto_responders for select to authenticated
  using (organization_id = public.current_user_org_id() and public.current_user_role() = 'super_admin');
drop policy if exists "auto_responders_write" on public.auto_responders;
create policy "auto_responders_write" on public.auto_responders for all to authenticated
  using (organization_id = public.current_user_org_id() and public.current_user_role() = 'super_admin')
  with check (organization_id = public.current_user_org_id() and public.current_user_role() = 'super_admin');

-- ---------------------------------------------------------------- --
-- amocrm_calls
-- ---------------------------------------------------------------- --
alter table public.amocrm_calls add column if not exists organization_id uuid references public.organizations(id);
update public.amocrm_calls set organization_id = '00000000-0000-0000-0000-000000000001';
alter table public.amocrm_calls alter column organization_id set not null;
drop trigger if exists set_org_id on public.amocrm_calls;
create trigger set_org_id before insert on public.amocrm_calls
  for each row execute function public.set_organization_id();

drop policy "amocrm_calls_select" on public.amocrm_calls;
drop policy "amocrm_calls_insert_manual" on public.amocrm_calls;
drop policy if exists "amocrm_calls_select" on public.amocrm_calls;
create policy "amocrm_calls_select" on public.amocrm_calls for select to authenticated
  using (organization_id = public.current_user_org_id());
drop policy if exists "amocrm_calls_insert_manual" on public.amocrm_calls;
create policy "amocrm_calls_insert_manual" on public.amocrm_calls for insert to authenticated
  with check (
    source = 'manual' and created_by = auth.uid() and amocrm_note_id is null
    and organization_id = public.current_user_org_id()
  );
