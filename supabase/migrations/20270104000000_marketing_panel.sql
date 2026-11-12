-- Marketing paneli (marketing.salesiq.uz, <sub>.marketing.salesiq.uz): the
-- same database, a separate panel. Adds:
--   * the role 'marketolog' -- a company member who works only in the
--     marketing panel and never reads the CRM's clients, chats or calls;
--   * profiles.marketing_access -- the admin lets anyone else into the
--     marketing panel too (admins always are);
--   * restrictive policies that keep a marketolog out of the CRM tables
--     (the marketing panel reads its figures through the server);
--   * a marketolog may keep the company's ad-spend lines (finance_entries
--     with category 'marketing').
-- Nothing existing is deleted or rewritten.

alter type public.app_role add value if not exists 'marketolog';

alter table public.profiles
  add column if not exists marketing_access boolean not null default false;

-- Only the company's admin hands out marketing access (or changes a role).
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
  if new.marketing_access is distinct from old.marketing_access
     and public.current_user_role() is distinct from 'super_admin'::public.app_role then
    raise exception 'Only a super_admin can change marketing access';
  end if;
  return new;
end;
$$;

-- A marketolog sees none of the CRM's client data. Restrictive policies are
-- ANDed with the existing ones, so nobody else is affected.
do $$
declare
  t text;
begin
  foreach t in array array[
    'leads', 'contacts', 'deals', 'lead_telegram_messages', 'lead_activities', 'tasks',
    'pbx_calls', 'amocrm_calls', 'call_logs', 'lead_files', 'lead_payments',
    'lead_payment_links', 'lead_stage_events', 'fines', 'work_sessions', 'payroll_schemes'
  ] loop
    if to_regclass('public.' || t) is not null then
      execute format('drop policy if exists marketolog_no_crm on public.%I', t);
      execute format(
        'create policy marketolog_no_crm on public.%I as restrictive for all to authenticated
           using ((select public.current_user_role())::text <> ''marketolog'')
           with check ((select public.current_user_role())::text <> ''marketolog'')',
        t
      );
    end if;
  end loop;
end $$;

-- Ad spend: the admin keeps every line; a marketolog (or someone given
-- marketing access) keeps the 'marketing' ones.
drop policy if exists finance_entries_marketing on public.finance_entries;
create policy finance_entries_marketing on public.finance_entries for all to authenticated
  using (
    organization_id = public.current_user_org_id()
    and category = 'marketing'
    and exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and (p.role::text = 'marketolog' or p.marketing_access)
    )
  )
  with check (
    organization_id = public.current_user_org_id()
    and category = 'marketing'
    and exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and (p.role::text = 'marketolog' or p.marketing_access)
    )
  );

notify pgrst, 'reload schema';
