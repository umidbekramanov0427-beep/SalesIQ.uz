-- "Kunlik hisobot" for a sales manager: inside a funnel the manager presses
-- Hisobot and gets today's report text, filled from their own numbers, to
-- copy into the team's Telegram group. The text follows a template the
-- super admin / ROP can edit (org_general_settings.manager_report_template;
-- null = the built-in one).

alter table public.org_general_settings
  add column if not exists manager_report_template text;

-- Saving the template: super admin, ROP (and the platform owner) only.
create or replace function public.set_manager_report_template(p_template text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org uuid := public.current_user_org_id();
  v_text text := nullif(trim(coalesce(p_template, '')), '');
begin
  if v_org is null
     or coalesce(public.current_user_role()::text, '') not in ('super_admin', 'rop', 'platform_owner') then
    raise exception 'forbidden';
  end if;
  update public.org_general_settings
     set manager_report_template = v_text
   where organization_id = v_org;
  if not found then
    insert into public.org_general_settings (organization_id, manager_report_template)
    values (v_org, v_text);
  end if;
end;
$$;

-- Today's numbers for the signed-in manager, in the company's time zone.
-- Calls come from the platform's own telephony (all of today's calls);
-- leads and sales are the manager's own CRM leads in p_funnel.
create or replace function public.my_daily_report(p_funnel text, p_talk_seconds integer default 30)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_org uuid := public.current_user_org_id();
  v_tz text;
  v_from timestamptz;
  v_to timestamptz;
  v_result jsonb;
begin
  if v_uid is null or v_org is null then
    return null;
  end if;
  select coalesce(nullif(s.timezone, ''), 'Asia/Tashkent') into v_tz
  from public.org_general_settings s where s.organization_id = v_org;
  v_tz := coalesce(v_tz, 'Asia/Tashkent');
  v_from := date_trunc('day', now() at time zone v_tz) at time zone v_tz;
  v_to := v_from + interval '1 day';

  with calls as (
    select p.created_at as at,
           case when p.status in ('answered', 'completed') then greatest(p.duration_seconds, 0) else 0 end as dur,
           p.status in ('answered', 'completed') and p.duration_seconds > 0 as answered,
           p.status = 'failed' as failed,
           coalesce(
             nullif(right(regexp_replace(
               case when p.direction = 'incoming' then coalesce(p.from_number, '') else p.to_number end,
               '\D', '', 'g'), 9), ''),
             p.lead_id::text) as who
    from public.pbx_calls p
    where p.organization_id = v_org
      and p.initiated_by = v_uid
      and p.created_at >= v_from and p.created_at < v_to
  ),
  c as (
    select count(*) filter (where not failed) as calls,
           count(*) filter (where answered) as answered,
           count(*) filter (where not answered and not failed) as missed,
           count(distinct who) filter (where not failed) as people_called,
           count(distinct who) filter (where answered and dur >= p_talk_seconds) as people_talked,
           coalesce(sum(dur) filter (where answered), 0) as talk_seconds,
           min(at) as first_call,
           max(at) as last_call
    from calls
  ),
  my_leads as (
    select l.id, l.created_at, l.stage_changed_at,
           coalesce(s.is_won, false) or coalesce(s.counts_as_won_override, false) as won
    from public.leads l
    left join public.pipeline_stages s on s.id = l.stage_id
    where l.organization_id = v_org
      and l.owner_id = v_uid
      and l.amocrm_id is null
      and l.bitrix24_deal_id is null
      and coalesce(nullif(l.funnel, ''), 'Direct Sales') = coalesce(nullif(p_funnel, ''), 'Direct Sales')
  ),
  ld as (
    select count(*) as leads_total,
           count(*) filter (where created_at >= v_from and created_at < v_to) as leads_new_today,
           count(*) filter (where won) as sales_total,
           count(*) filter (where won and stage_changed_at >= v_from and stage_changed_at < v_to) as sales_today
    from my_leads
  ),
  w as (
    select min(ws.clock_in) as work_start,
           case when bool_or(ws.clock_out is null) then null else max(ws.clock_out) end as work_end,
           bool_or(ws.clock_out is null) as working_now
    from public.work_sessions ws
    where ws.profile_id = v_uid
      and ws.clock_in >= v_from and ws.clock_in < v_to
  )
  select jsonb_build_object(
    'timezone', v_tz,
    'day', to_char(now() at time zone v_tz, 'YYYY-MM-DD'),
    'name', (select full_name from public.profiles where id = v_uid),
    'template', (select manager_report_template from public.org_general_settings where organization_id = v_org),
    'calls', c.calls,
    'answered', c.answered,
    'missed', c.missed,
    'people_called', c.people_called,
    'people_talked', c.people_talked,
    'talk_seconds', c.talk_seconds,
    'first_call', c.first_call,
    'last_call', c.last_call,
    'leads_total', ld.leads_total,
    'leads_new_today', ld.leads_new_today,
    'sales_total', ld.sales_total,
    'sales_today', ld.sales_today,
    'work_start', w.work_start,
    'work_end', w.work_end,
    'working_now', coalesce(w.working_now, false)
  ) into v_result
  from c, ld, w;
  return v_result;
end;
$$;

grant execute on function public.set_manager_report_template(text) to authenticated;
grant execute on function public.my_daily_report(text, integer) to authenticated;

notify pgrst, 'reload schema';
