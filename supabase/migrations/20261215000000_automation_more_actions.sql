-- More automation actions and triggers (5CRM's catalogue).
--
-- Actions (apply_automation_actions):
--   delay        {minutes}    the actions after it run that much later
--                             (queued as one 'run_actions' item in the outbox)
--   close_tasks               closes the lead's open tasks
--   move_funnel  {funnel}     to another funnel's first open stage
--   distribute   {ownerIds}   in turn: whoever of them has the fewest open leads
-- Triggers:
--   owner_changed             the lead got another responsible person
--   daily        trigger_stage_id + trigger_time: every day at that time
--                (Tashkent) for the leads in that stage, once a day each
-- Everything else stays as it was.

alter table public.automation_rules add column if not exists trigger_time time;

alter table public.automation_rules drop constraint if exists automation_rules_trigger_type_check;
alter table public.automation_rules add constraint automation_rules_trigger_type_check
  check (trigger_type in (
    'stage_enter', 'lead_created', 'tag_added', 'lead_won', 'lead_lost',
    'stage_stuck', 'message_received', 'owner_changed', 'daily'
  ));

create or replace function public.apply_automation_actions(
  p_actions jsonb,
  p_lead_id uuid,
  p_organization_id uuid,
  p_rule_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  action jsonb;
  applied jsonb := '[]'::jsonb;
  lead_row public.leads%rowtype;
  target_stage uuid;
  t text;
  idx bigint;
  target_owner uuid;
begin
  for action, idx in
    select value, ordinality from jsonb_array_elements(coalesce(p_actions, '[]'::jsonb)) with ordinality
  loop
    t := action->>'type';
    select * into lead_row from public.leads where id = p_lead_id;
    if not found then exit; end if;

    if t = 'assign_owner' and coalesce(action->>'ownerId', '') <> '' then
      update public.leads set owner_id = (action->>'ownerId')::uuid where id = p_lead_id;

    elsif t = 'add_tag' and coalesce(action->>'tag', '') <> '' then
      update public.leads
        set tags = case when (action->>'tag') = any(tags) then tags
                        else array_append(tags, action->>'tag') end
        where id = p_lead_id;

    elsif t = 'remove_tag' and coalesce(action->>'tag', '') <> '' then
      update public.leads set tags = array_remove(tags, action->>'tag') where id = p_lead_id;

    elsif t = 'create_task' and coalesce(action->>'title', '') <> '' then
      insert into public.tasks
        (organization_id, lead_id, title, description, assignee_id, due_date, priority)
      values (
        p_organization_id,
        p_lead_id,
        action->>'title',
        nullif(action->>'description', ''),
        coalesce(nullif(action->>'assigneeId', '')::uuid, lead_row.owner_id),
        case
          when coalesce(action->>'dueInMinutes', '') <> ''
            then now() + (((action->>'dueInMinutes')::int) || ' minutes')::interval
          when coalesce(action->>'dueInDays', '') <> ''
            then now() + (((action->>'dueInDays')::int) || ' days')::interval
          else null
        end,
        coalesce(nullif(action->>'priority', '')::public.priority_level, 'Normal')
      );

    elsif t = 'add_note' and coalesce(action->>'text', '') <> '' then
      insert into public.lead_activities (organization_id, lead_id, type, content)
      values (p_organization_id, p_lead_id, 'note', action->>'text');

    elsif t = 'move_stage' and coalesce(action->>'stageId', '') <> '' then
      select id into target_stage from public.pipeline_stages
        where id = (action->>'stageId')::uuid and organization_id = p_organization_id;
      if target_stage is not null then
        update public.leads set stage_id = target_stage,
          funnel = coalesce((select pipeline_name from public.pipeline_stages where id = target_stage), funnel)
          where id = p_lead_id;
      end if;

    elsif t in ('close_won', 'close_lost') then
      select id into target_stage from public.pipeline_stages
        where organization_id = p_organization_id
          and coalesce(pipeline_name, 'Direct Sales') = coalesce(lead_row.funnel, 'Direct Sales')
          and (case when t = 'close_won' then is_won else is_lost end)
        order by position
        limit 1;
      if target_stage is not null then
        update public.leads
          set stage_id = target_stage,
              loss_reason = case when t = 'close_lost'
                                 then coalesce(nullif(action->>'reason', ''), loss_reason)
                                 else loss_reason end
          where id = p_lead_id;
      end if;

    elsif t = 'set_field' and coalesce(action->>'field', '') <> '' then
      if action->>'field' = 'budget' then
        update public.leads set budget = nullif(action->>'value', '')::numeric where id = p_lead_id;
      elsif action->>'field' = 'priority' then
        update public.leads set priority = (action->>'value')::public.priority_level where id = p_lead_id;
      elsif action->>'field' = 'temperature' then
        update public.leads set temperature = (action->>'value')::public.lead_temperature where id = p_lead_id;
      elsif action->>'field' = 'source' then
        update public.leads set source = action->>'value' where id = p_lead_id;
      elsif action->>'field' like 'custom:%' then
        update public.leads
          set custom_fields = coalesce(custom_fields, '{}'::jsonb)
            || jsonb_build_object(substr(action->>'field', 8), action->>'value')
          where id = p_lead_id;
      end if;

    elsif t = 'delay' and coalesce(action->>'minutes', '') <> '' then
      -- The actions after a delay run later, from the outbox.
      insert into public.automation_outbox (organization_id, rule_id, lead_id, action, run_after)
      values (
        p_organization_id, p_rule_id, p_lead_id,
        jsonb_build_object(
          'type', 'run_actions',
          'actions', coalesce(
            (select jsonb_agg(e.value order by e.ordinality)
               from jsonb_array_elements(p_actions) with ordinality e
              where e.ordinality > idx),
            '[]'::jsonb)
        ),
        now() + (greatest(1, least(43200, (action->>'minutes')::int)) || ' minutes')::interval
      );
      applied := applied || jsonb_build_array(action);
      exit;

    elsif t = 'close_tasks' then
      update public.tasks set status = 'Done'
        where lead_id = p_lead_id and organization_id = p_organization_id and status <> 'Done';

    elsif t = 'move_funnel' and coalesce(action->>'funnel', '') <> '' then
      select id into target_stage from public.pipeline_stages
        where organization_id = p_organization_id
          and coalesce(pipeline_name, 'Direct Sales') = action->>'funnel'
          and not is_won and not is_lost
        order by position
        limit 1;
      if target_stage is not null then
        update public.leads set stage_id = target_stage, funnel = action->>'funnel'
          where id = p_lead_id;
      end if;

    elsif t = 'distribute' and jsonb_typeof(action->'ownerIds') = 'array'
          and jsonb_array_length(action->'ownerIds') > 0 then
      -- In turn: the chosen person with the fewest open leads gets it.
      select u.id into target_owner
      from (
        select (x)::uuid as id
        from jsonb_array_elements_text(action->'ownerIds') x
      ) u
      join public.profiles p on p.id = u.id and p.organization_id = p_organization_id
      order by (
        select count(*) from public.leads l
        left join public.pipeline_stages s on s.id = l.stage_id
        where l.owner_id = u.id and not coalesce(s.is_won, false) and not coalesce(s.is_lost, false)
      ), random()
      limit 1;
      if target_owner is not null then
        update public.leads set owner_id = target_owner where id = p_lead_id;
      end if;

    elsif t in ('send_message', 'webhook', 'start_salesbot', 'dedupe') then
      insert into public.automation_outbox (organization_id, rule_id, lead_id, action)
      values (p_organization_id, p_rule_id, p_lead_id, action);

    else
      continue;
    end if;

    applied := applied || jsonb_build_array(action);
  end loop;
  return applied;
end;
$$;

revoke execute on function public.apply_automation_actions(jsonb, uuid, uuid, uuid) from anon, authenticated, public;
grant execute on function public.apply_automation_actions(jsonb, uuid, uuid, uuid) to service_role;

-- owner_changed: fired from the same lead trigger as stage / tag events.
create or replace function public.run_lead_owner_automations()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if pg_trigger_depth() > 4 or new.organization_id is null then
    return new;
  end if;
  if new.owner_id is not null and old.owner_id is distinct from new.owner_id then
    perform public.fire_lead_automations(new, 'owner_changed');
  end if;
  return new;
end;
$$;

revoke execute on function public.run_lead_owner_automations() from anon, authenticated, public;

drop trigger if exists run_lead_owner_automations on public.leads;
create trigger run_lead_owner_automations
  after update of owner_id on public.leads
  for each row execute function public.run_lead_owner_automations();

-- daily: every few minutes, rules whose time has come today (Tashkent) run
-- once for each lead in their stage.
create or replace function public.process_daily_automations()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  rule record;
  lead_row record;
  applied jsonb;
  err text;
  local_now timestamp := now() at time zone 'Asia/Tashkent';
  day_start timestamptz := (date_trunc('day', now() at time zone 'Asia/Tashkent')) at time zone 'Asia/Tashkent';
begin
  for rule in
    select r.* from public.automation_rules r
    join public.organizations o on o.id = r.organization_id and o.crm_enabled
    where r.enabled and r.trigger_type = 'daily'
      and r.trigger_stage_id is not null and r.trigger_time is not null
      and local_now::time >= r.trigger_time
  loop
    for lead_row in
      select l.* from public.leads l
      where l.organization_id = rule.organization_id
        and l.stage_id = rule.trigger_stage_id
        and not exists (
          select 1 from public.automation_rule_runs rr
          where rr.rule_id = rule.id and rr.lead_id = l.id and rr.ran_at >= day_start
        )
      limit 500
    loop
      if not public.automation_condition_matches(
        to_jsonb(lead_row), rule.condition_field, rule.condition_operator, rule.condition_value
      ) then
        continue;
      end if;
      applied := '[]'::jsonb;
      err := null;
      begin
        applied := public.apply_automation_actions(rule.actions, lead_row.id, rule.organization_id, rule.id);
      exception when others then
        err := sqlerrm;
      end;
      insert into public.automation_rule_runs (rule_id, lead_id, organization_id, actions_applied, error)
      values (rule.id, lead_row.id, rule.organization_id, applied, err);
    end loop;
  end loop;
end;
$$;

revoke execute on function public.process_daily_automations() from anon, authenticated, public;
grant execute on function public.process_daily_automations() to service_role;

do $$
begin
  perform cron.schedule('automations-daily-5min', '*/5 * * * *', 'select public.process_daily_automations()');
exception
  when undefined_table or invalid_schema_name or undefined_function then
    raise notice 'pg_cron not available; schedule process_daily_automations manually';
end $$;
