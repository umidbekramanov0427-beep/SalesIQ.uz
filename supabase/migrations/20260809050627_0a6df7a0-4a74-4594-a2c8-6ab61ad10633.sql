create or replace function public.set_updated_at()
returns trigger language plpgsql set search_path = public as $$
begin new.updated_at = now(); return new; end; $$;

drop trigger if exists set_updated_at on public.profiles;
create trigger set_updated_at before update on public.profiles for each row execute function public.set_updated_at();
drop trigger if exists set_updated_at on public.companies;
create trigger set_updated_at before update on public.companies for each row execute function public.set_updated_at();
drop trigger if exists set_updated_at on public.contacts;
create trigger set_updated_at before update on public.contacts for each row execute function public.set_updated_at();
drop trigger if exists set_updated_at on public.leads;
create trigger set_updated_at before update on public.leads for each row execute function public.set_updated_at();
drop trigger if exists set_updated_at on public.deals;
create trigger set_updated_at before update on public.deals for each row execute function public.set_updated_at();
drop trigger if exists set_updated_at on public.tasks;
create trigger set_updated_at before update on public.tasks for each row execute function public.set_updated_at();

create or replace function public.current_user_role()
returns public.app_role language sql stable security definer set search_path = public as $$
  select role from public.profiles where id = auth.uid();
$$;

create or replace function public.is_admin_or_manager()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select role from public.profiles where id = auth.uid()) in ('super_admin','manager'), false);
$$;

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, full_name, role)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)),
    case
      when lower(new.email) in ('umidbekramanov0427@gmail.com','super@admin.com') then 'super_admin'::public.app_role
      when not exists (select 1 from public.profiles) then 'super_admin'::public.app_role
      else 'rep'::public.app_role
    end
  )
  on conflict (id) do nothing;
  return new;
end; $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

create or replace function public.prevent_role_self_escalation()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.role is distinct from old.role and public.current_user_role() is distinct from 'super_admin'::public.app_role then
    raise exception 'Only a super_admin can change a profile role';
  end if;
  return new;
end; $$;

drop trigger if exists guard_role_escalation on public.profiles;
create trigger guard_role_escalation
  before update on public.profiles
  for each row execute function public.prevent_role_self_escalation();

drop policy if exists "profiles_select_authenticated" on public.profiles;
create policy "profiles_select_authenticated" on public.profiles for select to authenticated using (true);
drop policy if exists "profiles_update_self_or_admin" on public.profiles;
create policy "profiles_update_self_or_admin" on public.profiles for update to authenticated
  using (id = auth.uid() or public.is_admin_or_manager())
  with check (id = auth.uid() or public.is_admin_or_manager());
drop policy if exists "profiles_insert_admin" on public.profiles;
create policy "profiles_insert_admin" on public.profiles for insert to authenticated
  with check (public.current_user_role() = 'super_admin');
drop policy if exists "profiles_delete_admin" on public.profiles;
create policy "profiles_delete_admin" on public.profiles for delete to authenticated
  using (public.current_user_role() = 'super_admin');

drop policy if exists "stages_select" on public.pipeline_stages;
create policy "stages_select" on public.pipeline_stages for select to authenticated using (true);
drop policy if exists "stages_write" on public.pipeline_stages;
create policy "stages_write" on public.pipeline_stages for all to authenticated
  using (public.is_admin_or_manager()) with check (public.is_admin_or_manager());

drop policy if exists "companies_select" on public.companies;
create policy "companies_select" on public.companies for select to authenticated using (true);
drop policy if exists "companies_insert" on public.companies;
create policy "companies_insert" on public.companies for insert to authenticated with check (true);
drop policy if exists "companies_update" on public.companies;
create policy "companies_update" on public.companies for update to authenticated
  using (owner_id = auth.uid() or public.is_admin_or_manager());
drop policy if exists "companies_delete" on public.companies;
create policy "companies_delete" on public.companies for delete to authenticated
  using (owner_id = auth.uid() or public.is_admin_or_manager());

drop policy if exists "contacts_select" on public.contacts;
create policy "contacts_select" on public.contacts for select to authenticated using (true);
drop policy if exists "contacts_insert" on public.contacts;
create policy "contacts_insert" on public.contacts for insert to authenticated with check (true);
drop policy if exists "contacts_update" on public.contacts;
create policy "contacts_update" on public.contacts for update to authenticated
  using (owner_id = auth.uid() or public.is_admin_or_manager());
drop policy if exists "contacts_delete" on public.contacts;
create policy "contacts_delete" on public.contacts for delete to authenticated
  using (owner_id = auth.uid() or public.is_admin_or_manager());

drop policy if exists "leads_select" on public.leads;
create policy "leads_select" on public.leads for select to authenticated using (true);
drop policy if exists "leads_insert" on public.leads;
create policy "leads_insert" on public.leads for insert to authenticated with check (true);
drop policy if exists "leads_update" on public.leads;
create policy "leads_update" on public.leads for update to authenticated
  using (owner_id = auth.uid() or public.is_admin_or_manager());
drop policy if exists "leads_delete" on public.leads;
create policy "leads_delete" on public.leads for delete to authenticated
  using (owner_id = auth.uid() or public.is_admin_or_manager());

drop policy if exists "deals_select" on public.deals;
create policy "deals_select" on public.deals for select to authenticated using (true);
drop policy if exists "deals_insert" on public.deals;
create policy "deals_insert" on public.deals for insert to authenticated with check (true);
drop policy if exists "deals_update" on public.deals;
create policy "deals_update" on public.deals for update to authenticated
  using (owner_id = auth.uid() or public.is_admin_or_manager());
drop policy if exists "deals_delete" on public.deals;
create policy "deals_delete" on public.deals for delete to authenticated
  using (owner_id = auth.uid() or public.is_admin_or_manager());

drop policy if exists "lead_activities_select" on public.lead_activities;
create policy "lead_activities_select" on public.lead_activities for select to authenticated using (true);
drop policy if exists "lead_activities_insert" on public.lead_activities;
create policy "lead_activities_insert" on public.lead_activities for insert to authenticated with check (true);

drop policy if exists "tasks_select" on public.tasks;
create policy "tasks_select" on public.tasks for select to authenticated using (true);
drop policy if exists "tasks_insert" on public.tasks;
create policy "tasks_insert" on public.tasks for insert to authenticated with check (true);
drop policy if exists "tasks_update" on public.tasks;
create policy "tasks_update" on public.tasks for update to authenticated
  using (assignee_id = auth.uid() or created_by = auth.uid() or public.is_admin_or_manager());
drop policy if exists "tasks_delete" on public.tasks;
create policy "tasks_delete" on public.tasks for delete to authenticated
  using (created_by = auth.uid() or public.is_admin_or_manager());

drop policy if exists "task_comments_select" on public.task_comments;
create policy "task_comments_select" on public.task_comments for select to authenticated using (true);
drop policy if exists "task_comments_insert" on public.task_comments;
create policy "task_comments_insert" on public.task_comments for insert to authenticated with check (true);

drop policy if exists "notifications_select" on public.notifications;
create policy "notifications_select" on public.notifications for select to authenticated
  using (user_id = auth.uid() or user_id is null);
drop policy if exists "notifications_insert" on public.notifications;
create policy "notifications_insert" on public.notifications for insert to authenticated with check (true);
drop policy if exists "notifications_update" on public.notifications;
create policy "notifications_update" on public.notifications for update to authenticated
  using (user_id = auth.uid() or user_id is null);

drop policy if exists "audit_logs_select" on public.audit_logs;
create policy "audit_logs_select" on public.audit_logs for select to authenticated
  using (public.is_admin_or_manager());
drop policy if exists "audit_logs_insert" on public.audit_logs;
create policy "audit_logs_insert" on public.audit_logs for insert to authenticated with check (true);

drop policy if exists "integration_settings_select" on public.integration_settings;
create policy "integration_settings_select" on public.integration_settings for select to authenticated using (true);
drop policy if exists "integration_settings_write" on public.integration_settings;
create policy "integration_settings_write" on public.integration_settings for all to authenticated
  using (public.current_user_role() = 'super_admin') with check (public.current_user_role() = 'super_admin');