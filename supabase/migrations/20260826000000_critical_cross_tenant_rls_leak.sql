-- CRITICAL: live inspection (pg_policies) confirmed the multi-tenancy RLS
-- retrofit from 20260811060000_multi_tenant_core.sql never actually took
-- effect on this database -- leads_select/deals_select/companies_select/
-- contacts_select were all still literally `using (true)` (i.e. every
-- authenticated user on the whole platform could read every other
-- organization's leads, deals, companies and contacts), and their
-- update/delete policies were missing the organization_id check entirely.
-- profiles_select_authenticated (the old `using (true)` policy) was also
-- still present *alongside* the newer org-scoped profiles_select --
-- Postgres ORs multiple permissive policies together, so its bare `true`
-- silently overrode the correct one, which is exactly what let one
-- organization's admin see another organization's accounts.
--
-- This migration re-issues every policy from that original migration
-- idempotently (drop if exists + create) so the end state is correct
-- regardless of whatever partial state each table was actually left in --
-- covering every table that migration touched, not just the four
-- confirmed broken by direct inspection, since they all came from the
-- same never-fully-applied script.
--
-- The whole block is wrapped in a retry loop: pasting many DROP/CREATE
-- POLICY statements together runs them as one long transaction holding an
-- AccessExclusiveLock on every listed table for the entire duration, which
-- kept deadlocking against the AmoCRM sync cron (it touches these same
-- tables every 5 minutes). A short lock_timeout + automatic retry lets the
-- script recover on its own instead of depending on a lucky quiet moment.

do $$
declare
  attempt int := 0;
  max_attempts int := 12;
begin
  loop
    attempt := attempt + 1;
    begin
      perform set_config('lock_timeout', '3s', true);

      -- profiles: only the leftover permissive policy needs removing --
      -- profiles_select itself (org-scoped) already exists and is correct.
      drop policy if exists "profiles_select_authenticated" on public.profiles;

      -- pipeline_stages
      drop policy if exists "stages_select" on public.pipeline_stages;
      drop policy if exists "stages_write" on public.pipeline_stages;
      drop policy if exists "stages_select" on public.pipeline_stages;
      create policy "stages_select" on public.pipeline_stages for select to authenticated
        using (organization_id = public.current_user_org_id());
      drop policy if exists "stages_write" on public.pipeline_stages;
      create policy "stages_write" on public.pipeline_stages for all to authenticated
        using (organization_id = public.current_user_org_id() and public.is_admin_or_manager())
        with check (organization_id = public.current_user_org_id() and public.is_admin_or_manager());

      -- companies
      drop policy if exists "companies_select" on public.companies;
      drop policy if exists "companies_insert" on public.companies;
      drop policy if exists "companies_update" on public.companies;
      drop policy if exists "companies_delete" on public.companies;
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

      -- contacts
      drop policy if exists "contacts_select" on public.contacts;
      drop policy if exists "contacts_insert" on public.contacts;
      drop policy if exists "contacts_update" on public.contacts;
      drop policy if exists "contacts_delete" on public.contacts;
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

      -- leads
      drop policy if exists "leads_select" on public.leads;
      drop policy if exists "leads_insert" on public.leads;
      drop policy if exists "leads_update" on public.leads;
      drop policy if exists "leads_delete" on public.leads;
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

      -- deals
      drop policy if exists "deals_select" on public.deals;
      drop policy if exists "deals_insert" on public.deals;
      drop policy if exists "deals_update" on public.deals;
      drop policy if exists "deals_delete" on public.deals;
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

      -- lead_activities
      drop policy if exists "lead_activities_select" on public.lead_activities;
      drop policy if exists "lead_activities_insert" on public.lead_activities;
      drop policy if exists "lead_activities_select" on public.lead_activities;
      create policy "lead_activities_select" on public.lead_activities for select to authenticated
        using (organization_id = public.current_user_org_id());
      drop policy if exists "lead_activities_insert" on public.lead_activities;
      create policy "lead_activities_insert" on public.lead_activities for insert to authenticated
        with check (organization_id = public.current_user_org_id());

      -- task_comments
      drop policy if exists "task_comments_select" on public.task_comments;
      drop policy if exists "task_comments_insert" on public.task_comments;
      drop policy if exists "task_comments_select" on public.task_comments;
      create policy "task_comments_select" on public.task_comments for select to authenticated
        using (organization_id = public.current_user_org_id());
      drop policy if exists "task_comments_insert" on public.task_comments;
      create policy "task_comments_insert" on public.task_comments for insert to authenticated
        with check (organization_id = public.current_user_org_id());

      -- tasks
      drop policy if exists "tasks_select" on public.tasks;
      drop policy if exists "tasks_insert" on public.tasks;
      drop policy if exists "tasks_update" on public.tasks;
      drop policy if exists "tasks_delete" on public.tasks;
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

      -- notifications
      drop policy if exists "notifications_select" on public.notifications;
      drop policy if exists "notifications_insert" on public.notifications;
      drop policy if exists "notifications_update" on public.notifications;
      drop policy if exists "notifications_select" on public.notifications;
      create policy "notifications_select" on public.notifications for select to authenticated
        using (organization_id = public.current_user_org_id() and (user_id = auth.uid() or user_id is null));
      drop policy if exists "notifications_insert" on public.notifications;
      create policy "notifications_insert" on public.notifications for insert to authenticated
        with check (organization_id = public.current_user_org_id());
      drop policy if exists "notifications_update" on public.notifications;
      create policy "notifications_update" on public.notifications for update to authenticated
        using (organization_id = public.current_user_org_id() and (user_id = auth.uid() or user_id is null));

      -- audit_logs
      drop policy if exists "audit_logs_select" on public.audit_logs;
      drop policy if exists "audit_logs_insert" on public.audit_logs;
      drop policy if exists "audit_logs_select" on public.audit_logs;
      create policy "audit_logs_select" on public.audit_logs for select to authenticated
        using (organization_id = public.current_user_org_id() and public.is_admin_or_manager());
      drop policy if exists "audit_logs_insert" on public.audit_logs;
      create policy "audit_logs_insert" on public.audit_logs for insert to authenticated
        with check (organization_id = public.current_user_org_id());

      -- work_sessions
      drop policy if exists "work_sessions_select" on public.work_sessions;
      drop policy if exists "work_sessions_insert" on public.work_sessions;
      drop policy if exists "work_sessions_update" on public.work_sessions;
      drop policy if exists "work_sessions_select" on public.work_sessions;
      create policy "work_sessions_select" on public.work_sessions for select to authenticated
        using (organization_id = public.current_user_org_id() and (profile_id = auth.uid() or public.is_admin_or_manager()));
      drop policy if exists "work_sessions_insert" on public.work_sessions;
      create policy "work_sessions_insert" on public.work_sessions for insert to authenticated
        with check (organization_id = public.current_user_org_id() and profile_id = auth.uid());
      drop policy if exists "work_sessions_update" on public.work_sessions;
      create policy "work_sessions_update" on public.work_sessions for update to authenticated
        using (organization_id = public.current_user_org_id() and profile_id = auth.uid());

      -- call_logs
      drop policy if exists "call_logs_select" on public.call_logs;
      drop policy if exists "call_logs_insert" on public.call_logs;
      drop policy if exists "call_logs_select" on public.call_logs;
      create policy "call_logs_select" on public.call_logs for select to authenticated
        using (organization_id = public.current_user_org_id() and (profile_id = auth.uid() or public.is_admin_or_manager()));
      drop policy if exists "call_logs_insert" on public.call_logs;
      create policy "call_logs_insert" on public.call_logs for insert to authenticated
        with check (organization_id = public.current_user_org_id() and profile_id = auth.uid());

      -- auto_responders
      drop policy if exists "auto_responders_select" on public.auto_responders;
      drop policy if exists "auto_responders_write" on public.auto_responders;
      drop policy if exists "auto_responders_select" on public.auto_responders;
      create policy "auto_responders_select" on public.auto_responders for select to authenticated
        using (organization_id = public.current_user_org_id() and public.current_user_role() = 'super_admin');
      drop policy if exists "auto_responders_write" on public.auto_responders;
      create policy "auto_responders_write" on public.auto_responders for all to authenticated
        using (organization_id = public.current_user_org_id() and public.current_user_role() = 'super_admin')
        with check (organization_id = public.current_user_org_id() and public.current_user_role() = 'super_admin');

      -- amocrm_calls
      drop policy if exists "amocrm_calls_select" on public.amocrm_calls;
      create policy "amocrm_calls_select" on public.amocrm_calls for select to authenticated
        using (organization_id = public.current_user_org_id());

      exit; -- success, leave the retry loop
    exception
      when sqlstate '40P01' or sqlstate '55P03' then
        if attempt >= max_attempts then
          raise notice 'Giving up after % attempts', attempt;
          raise;
        end if;
        raise notice 'Lock contention on attempt %, retrying...', attempt;
        perform pg_sleep(0.3 * attempt);
    end;
  end loop;
end $$;
