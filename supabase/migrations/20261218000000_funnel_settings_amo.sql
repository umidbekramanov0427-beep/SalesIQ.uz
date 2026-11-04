-- Funnel settings the amoCRM way, with what 5CRM adds (Voronkalar -> Sozlash):
--   pipelines.unsorted_enabled    "Saralanmagan": when off, incoming leads skip
--                                 the funnel's first (incoming) stage
--   pipelines.celebrate_stage_id  "Sotuv bayrami": a lead reaching this stage for
--                                 the first time shows confetti to the whole team
--   pipelines.loss_reason_required / loss_reasons
--                                 "Rad sabablari": whether a lost lead must give a
--                                 reason, and the company's own list of reasons
--   pipeline_stages.hidden        the eye: the column is hidden on the board
--   org_general_settings.morning_boost_*   "Ertalabki zaryad" screen once a day
--   org_general_settings.notify_*  notification center switches: lead assigned,
--                                 stage changed by someone else, sale
--                                 congratulations, task reminders
--   automation_rules.note         a note on a trigger
--   apply_automation_rule_to_stage(rule)  runs a stage trigger for the leads
--                                 already in that stage ("mavjud lidlarga ham")
-- Columns have defaults that keep today's behaviour.

alter table public.pipeline_stages add column if not exists hidden boolean not null default false;

alter table public.pipelines
  add column if not exists unsorted_enabled boolean not null default true,
  add column if not exists celebrate_stage_id uuid references public.pipeline_stages(id) on delete set null,
  add column if not exists loss_reason_required boolean not null default true,
  add column if not exists loss_reasons text[];

alter table public.org_general_settings
  add column if not exists morning_boost_enabled boolean not null default false,
  add column if not exists morning_boost_animation text not null default 'sun',
  add column if not exists morning_boost_texts jsonb,
  add column if not exists morning_boost_reset_at timestamptz,
  add column if not exists notify_lead_assigned boolean not null default true,
  add column if not exists notify_stage_changed boolean not null default true,
  add column if not exists notify_sale_congrats boolean not null default true,
  add column if not exists notify_task_reminder boolean not null default true;

alter table public.automation_rules add column if not exists note text;

-- Task reminders respect the company's "Vazifa eslatmasi" switch (the tasks
-- are still marked as reminded, so switching it back on sends no backlog).
create or replace function public.claim_task_reminders_for(p_uid uuid)
returns table (
  notification_id uuid,
  user_id uuid,
  organization_id uuid,
  type text,
  title text,
  body text,
  link text
)
language plpgsql volatile security definer set search_path = public as $$
#variable_conflict use_column
begin
  update public.tasks t
     set soon_notified_at = coalesce(t.soon_notified_at, now()),
         due_notified_at = coalesce(t.due_notified_at, now()),
         overdue_notified_at = now()
   where (p_uid is null or t.assignee_id = p_uid)
     and t.overdue_notified_at is null
     and t.status <> 'Done'
     and t.due_date < now() - interval '1 day';

  return query
  with claimed as (
    update public.tasks t
       set soon_notified_at = coalesce(t.soon_notified_at, now()),
           due_notified_at = case
             when t.due_date <= now() then coalesce(t.due_notified_at, now())
             else t.due_notified_at end,
           overdue_notified_at = case
             when t.due_date <= now() - interval '15 minutes' then now()
             else null end
     where (p_uid is null or t.assignee_id = p_uid)
       and t.assignee_id is not null
       and t.overdue_notified_at is null
       and t.status <> 'Done'
       and t.amocrm_task_id is null
       and t.due_date <= now() + interval '15 minutes'
       and (t.due_date <= now() - interval '15 minutes'
            or (t.due_date <= now() and t.due_notified_at is null)
            or t.soon_notified_at is null)
    returning t.id, t.title, t.lead_id, t.organization_id, t.assignee_id,
      case
        when t.due_date <= now() - interval '15 minutes' then 'TaskOverdue'
        when t.due_date <= now() then 'TaskDue'
        else 'TaskSoon'
      end as kind
  ),
  notified as (
    insert into public.notifications (organization_id, user_id, type, title, body, link)
    select c.organization_id, c.assignee_id, c.kind,
           case c.kind
             when 'TaskSoon' then 'Vazifa vaqti yaqinlashyapti'
             when 'TaskDue' then 'Vazifa vaqti keldi'
             else 'Muddati o''tgan vazifa'
           end,
           coalesce(l.name || ': ', '') || c.title,
           case when c.lead_id is not null then '/crm/leads/' || c.lead_id
                else '/funnels?view=tasks' end
    from claimed c
    left join public.leads l on l.id = c.lead_id
    left join public.org_general_settings g on g.organization_id = c.organization_id
    where coalesce(g.notify_task_reminder, true)
    returning id, user_id, organization_id, type, title, body, link
  )
  select n.id, n.user_id, n.organization_id, n.type, n.title, n.body, n.link
  from notified n;
end;
$$;

-- Notifications about the company's own leads (amoCRM / Bitrix24 leads get
-- theirs from the sync): the new owner is told; the owner is told when
-- someone else moves the lead; a sale congratulates the owner; and a lead
-- reaching the funnel's celebration stage for the first time tells everyone
-- in the company (the open app shows confetti for 'SaleCelebrate').
create or replace function public.notify_lead_changes()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  g public.org_general_settings%rowtype;
  st public.pipeline_stages%rowtype;
  celebrate uuid;
  seller text;
  actor uuid := auth.uid();
  times int := 1;
begin
  if new.amocrm_id is not null or new.bitrix24_deal_id is not null then
    return new;
  end if;
  select * into g from public.org_general_settings where organization_id = new.organization_id;

  if new.owner_id is not null and new.owner_id is distinct from old.owner_id
     and new.owner_id is distinct from actor and coalesce(g.notify_lead_assigned, true) then
    insert into public.notifications (organization_id, user_id, type, title, body, link)
    values (new.organization_id, new.owner_id, 'LeadOwner', 'Sizga lid biriktirildi',
            new.name, '/crm/leads/' || new.id);
  end if;

  if new.stage_id is not distinct from old.stage_id then
    return new;
  end if;
  select * into st from public.pipeline_stages where id = new.stage_id;

  if new.owner_id is not null then
    if coalesce(st.is_won, false) then
      if coalesce(g.notify_sale_congrats, true) then
        insert into public.notifications (organization_id, user_id, type, title, body, link)
        values (new.organization_id, new.owner_id, 'LeadWon', 'Tabriklaymiz, sotuv!',
                new.name, '/crm/leads/' || new.id);
      end if;
    elsif actor is not null and actor is distinct from new.owner_id
          and coalesce(g.notify_stage_changed, true) then
      insert into public.notifications (organization_id, user_id, type, title, body, link)
      values (new.organization_id, new.owner_id, 'LeadStage', 'Lid bosqichi o''zgartirildi',
              new.name || ' → ' || coalesce(st.name, ''), '/crm/leads/' || new.id);
    end if;
  end if;

  select p.celebrate_stage_id into celebrate from public.pipelines p where p.id = st.pipeline_id;
  if celebrate is not null and celebrate = new.stage_id then
    -- lead_stage_events already holds this move (its trigger runs first).
    if to_regclass('public.lead_stage_events') is not null then
      execute 'select count(*) from public.lead_stage_events where lead_id = $1 and stage_id = $2'
        into times using new.id, new.stage_id;
    end if;
    if times <= 1 then
      select coalesce(nullif(full_name, ''), 'Jamoa') into seller
        from public.profiles where id = coalesce(new.owner_id, actor);
      insert into public.notifications (organization_id, user_id, type, title, body, link, read)
      select new.organization_id, p.id, 'SaleCelebrate', coalesce(seller, 'Jamoa'),
             new.name, '/crm/leads/' || new.id, false
        from public.profiles p
       where p.organization_id = new.organization_id;
    end if;
  end if;
  return new;
end;
$$;

revoke execute on function public.notify_lead_changes() from anon, authenticated, public;

drop trigger if exists notify_lead_changes on public.leads;
create trigger notify_lead_changes
  after update of owner_id, stage_id on public.leads
  for each row execute function public.notify_lead_changes();

-- "Mavjud lidlarga ham qo'llash": runs a stage trigger's actions now for the
-- leads already in its stage (at most 500). Heads of the company only.
create or replace function public.apply_automation_rule_to_stage(p_rule_id uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  r public.automation_rules%rowtype;
  lead_id uuid;
  n integer := 0;
begin
  select * into r from public.automation_rules
   where id = p_rule_id and organization_id = public.current_user_org_id();
  if r.id is null then
    raise exception 'rule not found';
  end if;
  if public.current_user_role()::text not in ('super_admin', 'rop', 'platform_owner') then
    raise exception 'not allowed';
  end if;
  if r.trigger_stage_id is null then
    return 0;
  end if;
  for lead_id in
    select l.id from public.leads l
     where l.organization_id = r.organization_id and l.stage_id = r.trigger_stage_id
     order by l.created_at desc
     limit 500
  loop
    perform public.apply_automation_actions(r.actions, lead_id, r.organization_id, r.id);
    n := n + 1;
  end loop;
  return n;
end;
$$;

revoke execute on function public.apply_automation_rule_to_stage(uuid) from anon, public;
grant execute on function public.apply_automation_rule_to_stage(uuid) to authenticated, service_role;
