-- Deepens automation_rules (20260927000000) to match AmoCRM's own
-- Triggers/Digital Pipeline depth: an optional field-value condition (so a
-- rule only fires for, say, "Hot" leads or a budget over a threshold) and
-- an optional delay before its actions run, instead of only "fire the
-- instant a lead enters a stage, unconditionally".

alter table public.automation_rules
  add column if not exists condition_field text,
  add column if not exists condition_operator text,
  add column if not exists condition_value text,
  add column if not exists delay_minutes int not null default 0;

-- Queue for a rule whose delay_minutes > 0 -- the stage-change trigger below
-- inserts a row here instead of running the actions immediately;
-- process_due_automation_runs() (scheduled every minute, see the pg_cron
-- job at the end of this file) applies it once run_at has passed. A lead
-- that moves to a different stage before its delay elapses still gets the
-- delayed action (matching how AmoCRM's own delayed triggers behave) --
-- this only reflects the trigger having fired once, not the lead's current
-- state, which the actions themselves may no longer expect; that tradeoff
-- is the same one AmoCRM's own users accept.
create table if not exists public.automation_pending_runs (
  id uuid primary key default gen_random_uuid(),
  rule_id uuid not null references public.automation_rules(id) on delete cascade,
  lead_id uuid not null references public.leads(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  run_at timestamptz not null,
  processed_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists automation_pending_runs_due_idx
  on public.automation_pending_runs(run_at) where processed_at is null;

alter table public.automation_pending_runs enable row level security;

drop policy if exists "automation_pending_runs_select" on public.automation_pending_runs;
create policy "automation_pending_runs_select" on public.automation_pending_runs for select to authenticated
  using (organization_id = public.current_user_org_id());

-- No write policy for clients: written only by run_lead_stage_automations()
-- and processed only by process_due_automation_runs(), both security
-- definer, same treatment as automation_rule_runs.

-- Shared by both the immediate (trigger) and delayed (cron) execution
-- paths, so the actual action-application logic exists in exactly one
-- place. Returns the actions actually applied, same shape
-- automation_rule_runs.actions_applied already expects.
create or replace function public.apply_automation_actions(
  p_actions jsonb,
  p_lead_id uuid,
  p_organization_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  action jsonb;
  applied jsonb := '[]'::jsonb;
begin
  for action in select * from jsonb_array_elements(coalesce(p_actions, '[]'::jsonb))
  loop
    if action->>'type' = 'assign_owner' and coalesce(action->>'ownerId', '') <> '' then
      update public.leads set owner_id = (action->>'ownerId')::uuid where id = p_lead_id;
      applied := applied || jsonb_build_array(action);
    elsif action->>'type' = 'add_tag' and coalesce(action->>'tag', '') <> '' then
      update public.leads
        set tags = case when (action->>'tag') = any(tags) then tags
                        else array_append(tags, action->>'tag') end
        where id = p_lead_id;
      applied := applied || jsonb_build_array(action);
    elsif action->>'type' = 'create_task' and coalesce(action->>'title', '') <> '' then
      insert into public.tasks
        (organization_id, lead_id, title, description, assignee_id, due_date, priority)
      values (
        p_organization_id,
        p_lead_id,
        action->>'title',
        nullif(action->>'description', ''),
        nullif(action->>'assigneeId', '')::uuid,
        case when coalesce(action->>'dueInDays', '') <> ''
             then now() + (((action->>'dueInDays')::int) || ' days')::interval
             else null end,
        coalesce(nullif(action->>'priority', '')::public.priority_level, 'Normal')
      );
      applied := applied || jsonb_build_array(action);
    elsif action->>'type' = 'add_note' and coalesce(action->>'text', '') <> '' then
      insert into public.lead_activities (organization_id, lead_id, type, content)
      values (p_organization_id, p_lead_id, 'note', action->>'text');
      applied := applied || jsonb_build_array(action);
    end if;
  end loop;
  return applied;
end;
$$;

-- Evaluates a rule's optional condition against the lead's own row, read
-- generically via to_jsonb(new) rather than a hardcoded per-column branch
-- -- works for any leads column (temperature, priority, budget, source,
-- city, ...) without this function needing to know its type up front.
create or replace function public.automation_condition_matches(
  p_lead jsonb,
  p_field text,
  p_operator text,
  p_value text
)
returns boolean
language plpgsql
immutable
as $$
declare
  actual text;
begin
  if p_field is null or p_field = '' then return true; end if;
  actual := p_lead->>p_field;
  if p_operator = 'eq' then
    return coalesce(actual, '') = coalesce(p_value, '');
  elsif p_operator = 'neq' then
    return coalesce(actual, '') <> coalesce(p_value, '');
  elsif p_operator = 'contains' then
    return actual is not null and actual ilike ('%' || p_value || '%');
  elsif p_operator = 'gt' then
    return actual is not null and p_value is not null
      and (actual)::numeric > (p_value)::numeric;
  elsif p_operator = 'lt' then
    return actual is not null and p_value is not null
      and (actual)::numeric < (p_value)::numeric;
  else
    return true;
  end if;
exception when others then
  -- A non-numeric value against gt/lt (or any other cast failure) fails
  -- the condition rather than erroring the whole stage-change out --
  -- a rule with a bad condition should just never fire, not block leads
  -- from moving stage at all.
  return false;
end;
$$;

create or replace function public.run_lead_stage_automations()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  rule record;
  applied jsonb;
  err text;
  lead_json jsonb;
begin
  if tg_op = 'UPDATE' and old.stage_id is not distinct from new.stage_id then
    return new;
  end if;
  if new.stage_id is null or new.organization_id is null then
    return new;
  end if;

  lead_json := to_jsonb(new);

  for rule in
    select * from public.automation_rules
    where enabled
      and organization_id = new.organization_id
      and trigger_stage_id = new.stage_id
      and (funnel is null or funnel = new.funnel)
  loop
    if not public.automation_condition_matches(
      lead_json, rule.condition_field, rule.condition_operator, rule.condition_value
    ) then
      continue;
    end if;

    if coalesce(rule.delay_minutes, 0) > 0 then
      insert into public.automation_pending_runs (rule_id, lead_id, organization_id, run_at)
      values (rule.id, new.id, new.organization_id, now() + (rule.delay_minutes || ' minutes')::interval);
      continue;
    end if;

    applied := '[]'::jsonb;
    err := null;
    begin
      applied := public.apply_automation_actions(rule.actions, new.id, new.organization_id);
    exception when others then
      err := sqlerrm;
    end;

    insert into public.automation_rule_runs (rule_id, lead_id, organization_id, actions_applied, error)
    values (rule.id, new.id, new.organization_id, applied, err);
  end loop;

  return new;
end;
$$;

-- Runs on the pg_cron schedule below -- picks up every pending delayed
-- rule whose run_at has passed and applies it exactly once.
create or replace function public.process_due_automation_runs()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  pending record;
  rule record;
  applied jsonb;
  err text;
begin
  for pending in
    select * from public.automation_pending_runs
    where processed_at is null and run_at <= now()
    order by run_at
    limit 500
  loop
    update public.automation_pending_runs set processed_at = now() where id = pending.id;

    select * into rule from public.automation_rules where id = pending.rule_id;
    if rule is null or not rule.enabled then continue; end if;

    applied := '[]'::jsonb;
    err := null;
    begin
      applied := public.apply_automation_actions(rule.actions, pending.lead_id, pending.organization_id);
    exception when others then
      err := sqlerrm;
    end;

    insert into public.automation_rule_runs (rule_id, lead_id, organization_id, actions_applied, error)
    values (pending.rule_id, pending.lead_id, pending.organization_id, applied, err);
  end loop;
end;
$$;

-- Pure-SQL job (a direct function call, not net.http_post to an app route
-- like the AmoCRM/daily-report crons) -- delayed automations never need
-- anything outside Postgres itself, so there's no reason to round-trip
-- through the app for this one.
create extension if not exists pg_cron with schema extensions;

select cron.schedule(
  'process-due-automation-runs-1min',
  '* * * * *',
  $$ select public.process_due_automation_runs(); $$
);
