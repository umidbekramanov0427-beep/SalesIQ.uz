-- Security hardening after a full audit of RLS policies, storage policies
-- and SQL functions. Every statement is idempotent (re-running is harmless)
-- and nothing here deletes or rewrites data.

------------------------------------------------------------------------
-- 1. profiles: nobody may move a profile to another company or hand out
--    the platform-owner role from the app. Before this, any user could set
--    their own organization_id (and so read/write another company's data),
--    and a company super_admin could make themselves platform_owner.
--    Server-side writes (service role: auth.uid() is null) stay trusted.
------------------------------------------------------------------------
create or replace function public.prevent_role_self_escalation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null or public.is_platform_owner() then
    return new;
  end if;
  if new.organization_id is distinct from old.organization_id then
    raise exception 'A profile cannot be moved to another company';
  end if;
  if new.role is distinct from old.role then
    if public.current_user_role() is distinct from 'super_admin'::public.app_role then
      raise exception 'Only a super_admin can change a profile role';
    end if;
    if new.role = 'platform_owner' or old.role = 'platform_owner' then
      raise exception 'The platform-owner role is assigned by the platform only';
    end if;
  end if;
  return new;
end;
$$;

-- Admins / heads of sales edit profiles of their own company only (was: any company).
drop policy if exists profiles_update_self_or_admin on public.profiles;
create policy profiles_update_self_or_admin on public.profiles
  for update to authenticated
  using (id = auth.uid() or (organization_id = public.current_user_org_id() and public.is_admin_or_manager()))
  with check (id = auth.uid() or (organization_id = public.current_user_org_id() and public.is_admin_or_manager()));

drop policy if exists profiles_insert_admin on public.profiles;
create policy profiles_insert_admin on public.profiles
  for insert to authenticated
  with check (
    organization_id = public.current_user_org_id()
    and public.current_user_role() = 'super_admin'::public.app_role
    and role <> 'platform_owner'::public.app_role
  );

drop policy if exists profiles_delete_admin on public.profiles;
create policy profiles_delete_admin on public.profiles
  for delete to authenticated
  using (
    organization_id = public.current_user_org_id()
    and public.current_user_role() = 'super_admin'::public.app_role
    and id <> auth.uid()
  );

------------------------------------------------------------------------
-- 2. integration_settings held another company's amoCRM client_secret
--    readable (and writable by any company's super_admin). Now: own company
--    only; rows with credentials only for admins / heads of sales.
------------------------------------------------------------------------
drop policy if exists integration_settings_select on public.integration_settings;
create policy integration_settings_select on public.integration_settings
  for select to authenticated
  using (
    public.is_platform_owner()
    or (
      organization_id = public.current_user_org_id()
      and (key in ('office_location', 'telegram_bot') or public.is_admin_or_manager())
    )
  );

drop policy if exists integration_settings_write on public.integration_settings;
create policy integration_settings_write on public.integration_settings
  for all to authenticated
  using (organization_id = public.current_user_org_id() and public.current_user_role() = 'super_admin'::public.app_role)
  with check (organization_id = public.current_user_org_id() and public.current_user_role() = 'super_admin'::public.app_role);

------------------------------------------------------------------------
-- 3. Other cross-company reads.
------------------------------------------------------------------------
-- Everyone's notification preferences were readable by everyone; the
-- same-company policy (notification_prefs_select_same_org) stays.
drop policy if exists notification_prefs_select_authenticated on public.notification_preferences;

-- Platform error log (Platforma -> Xatoliklar) is the platform owner's;
-- the app writes and reads it with the service role.
drop policy if exists error_logs_select on public.error_logs;
create policy error_logs_select on public.error_logs
  for select to authenticated using (public.is_platform_owner());
drop policy if exists error_logs_update on public.error_logs;
create policy error_logs_update on public.error_logs
  for update to authenticated using (public.is_platform_owner()) with check (public.is_platform_owner());

------------------------------------------------------------------------
-- 4. Storage: anyone (even signed out) could LIST every file in these
--    buckets and so download every call recording. Files keep their
--    unguessable public links; listing / deleting is limited to the
--    file's own company.
--    call-recordings, hr-chat-attachments: <uploader user id>/...
--    lesson-videos, content-library:      <organization id>/...
------------------------------------------------------------------------
drop policy if exists call_recordings_read on storage.objects;
create policy call_recordings_read on storage.objects
  for select to authenticated
  using (
    bucket_id = 'call-recordings'
    and exists (
      select 1 from public.profiles p
      where p.id::text = (storage.foldername(name))[1]
        and p.organization_id = public.current_user_org_id()
    )
  );

drop policy if exists hr_chat_attachments_read on storage.objects;
create policy hr_chat_attachments_read on storage.objects
  for select to authenticated
  using (
    bucket_id = 'hr-chat-attachments'
    and exists (
      select 1 from public.profiles p
      where p.id::text = (storage.foldername(name))[1]
        and p.organization_id = public.current_user_org_id()
    )
  );

drop policy if exists lesson_videos_read on storage.objects;
create policy lesson_videos_read on storage.objects
  for select to authenticated
  using (bucket_id = 'lesson-videos' and (storage.foldername(name))[1] = public.current_user_org_id()::text);

drop policy if exists lesson_videos_insert on storage.objects;
create policy lesson_videos_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'lesson-videos'
    and (storage.foldername(name))[1] = public.current_user_org_id()::text
    and public.is_admin_or_manager()
  );

drop policy if exists lesson_videos_delete on storage.objects;
create policy lesson_videos_delete on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'lesson-videos'
    and (storage.foldername(name))[1] = public.current_user_org_id()::text
    and public.is_admin_or_manager()
  );

drop policy if exists content_library_read on storage.objects;
create policy content_library_read on storage.objects
  for select to authenticated
  using (bucket_id = 'content-library' and (storage.foldername(name))[1] = public.current_user_org_id()::text);

drop policy if exists content_library_insert on storage.objects;
create policy content_library_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'content-library'
    and (storage.foldername(name))[1] = public.current_user_org_id()::text
    and public.current_user_role() = 'super_admin'::public.app_role
  );

drop policy if exists content_library_delete on storage.objects;
create policy content_library_delete on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'content-library'
    and (storage.foldername(name))[1] = public.current_user_org_id()::text
    and public.current_user_role() = 'super_admin'::public.app_role
  );

------------------------------------------------------------------------
-- 5. Functions.
------------------------------------------------------------------------
-- Signed-out visitors never call the database directly (public pages go
-- through server routes), so they get no function at all -- now and for
-- functions created later.
revoke execute on all functions in schema public from anon, public;
alter default privileges for role postgres in schema public revoke execute on functions from anon, public;

-- Trigger functions run as triggers without EXECUTE; nobody calls them directly.
do $$
declare f regprocedure;
begin
  for f in
    select p.oid::regprocedure from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.prorettype = 'trigger'::regtype
  loop
    execute format('revoke execute on function %s from anon, authenticated, public', f);
  end loop;
end $$;

-- Internal: run by pg_cron / triggers / other functions, never by the app's users.
revoke execute on function public.fire_lead_automations(public.leads, text, text, text) from authenticated;
revoke execute on function public.process_due_automation_runs() from authenticated;
revoke execute on function public.mfa_satisfied() from authenticated;
-- Old analytics overloads without role scoping; the app calls the p_since versions.
revoke execute on function public.lead_analytics_current(text, uuid, uuid) from authenticated;
revoke execute on function public.lead_analytics_direction(text, uuid, uuid) from authenticated;
revoke execute on function public.lead_analytics_quality(text, uuid, uuid) from authenticated;

-- check_seat_login: a user may only ask about themself (it revealed any
-- company's seat limit by profile id). The server (auth.uid() null) and the
-- platform owner may ask about anyone.
do $$
declare d text;
begin
  d := pg_get_functiondef('public.check_seat_login(uuid)'::regprocedure);
  if position('p_profile_id = auth.uid()' in d) = 0 then
    d := replace(
      d,
      'select id, organization_id from public.profiles where id = p_profile_id',
      'select id, organization_id from public.profiles where id = p_profile_id'
        || ' and (p_profile_id = auth.uid() or auth.uid() is null or public.is_platform_owner())'
    );
    if position('p_profile_id = auth.uid()' in d) = 0 then
      raise exception 'check_seat_login: expected text not found';
    end if;
    execute d;
  end if;
end $$;

-- lead_analytics_action: scope by role like the other lead_analytics_*
-- functions (a sales rep saw the whole company's numbers and lead lists).
do $$
declare d text;
begin
  d := pg_get_functiondef('public.lead_analytics_action(text,uuid,timestamp with time zone,uuid)'::regprocedure);
  if position('v_scope_owner_ids' in d) = 0 then
    d := replace(
      d,
      E'  v_operator_activity jsonb;\nbegin\n',
      E'  v_operator_activity jsonb;\n  v_scope_owner_ids uuid[];\nbegin\n'
      || E'  select case\n'
      || E'    when public.current_user_role() in (''super_admin'', ''platform_owner'') then null::uuid[]\n'
      || E'    when public.current_user_role() = ''rop'' then (\n'
      || E'      select array_agg(id) from public.profiles\n'
      || E'      where id = auth.uid() or manager_id = auth.uid()\n'
      || E'    )\n'
      || E'    else array[auth.uid()]\n'
      || E'  end into v_scope_owner_ids;\n\n'
    );
    d := replace(
      d,
      'and (p_manager is null or l.owner_id = p_manager)',
      E'and (v_scope_owner_ids is null or l.owner_id = any(v_scope_owner_ids))\n    and (p_manager is null or l.owner_id = p_manager)'
    );
    if position('v_scope_owner_ids is null or l.owner_id' in d) = 0 then
      raise exception 'lead_analytics_action: expected text not found';
    end if;
    execute d;
  end if;
end $$;

-- Pin search_path on the remaining helpers (linter: function_search_path_mutable).
alter function public.lock_business_language() set search_path = public;
alter function public.automation_condition_matches(jsonb, text, text, text) set search_path = public;
alter function public.intern_current_day(date) set search_path = public;
alter function public.touch_lead_stage_changed_at() set search_path = public;
alter function public.phone9(text) set search_path = public;
alter function public.tasks_rearm_overdue() set search_path = public;
alter function public.phone_key(text) set search_path = public;
