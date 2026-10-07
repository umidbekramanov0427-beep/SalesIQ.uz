-- Digital pipeline (amoCRM-style triggers) + Salesbot.
--
-- Before this, automation_rules only knew one trigger ("lead entered stage
-- X") and four in-database actions. This adds:
--   * more triggers: lead created (optionally only from one source), tag
--     added, lead won / lost, lead stuck in a stage for N minutes, incoming
--     client message (Telegram / WhatsApp);
--   * more actions: remove tag, move to stage, close as won / lost, set a
--     field, and actions that need the outside world -- send a message,
--     call a webhook, start a salesbot, resolve a duplicate. Those are
--     queued in automation_outbox and run by the app's /automations/tick
--     route (every minute), since Postgres can't talk to Telegram etc.;
--   * salesbots: step-by-step bots (message / wait for reply / condition /
--     action / delay / hand off to a manager) built in the app, or an
--     external bot connected by URL.
-- Triggers still run inside the database, so they fire however a lead is
-- created or moved: manual, import, web form, webhook, amoCRM sync.

-- 1) When did the lead enter its current stage (for "stuck in stage" rules)
alter table public.leads add column if not exists stage_changed_at timestamptz;
update public.leads
  set stage_changed_at = coalesce(updated_at, created_at)
  where stage_changed_at is null;

create or replace function public.touch_lead_stage_changed_at()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'INSERT' or old.stage_id is distinct from new.stage_id then
    new.stage_changed_at := now();
  end if;
  return new;
end;
$$;

drop trigger if exists touch_lead_stage_changed_at on public.leads;
create trigger touch_lead_stage_changed_at
  before insert or update of stage_id on public.leads
  for each row execute function public.touch_lead_stage_changed_at();

-- 2) Trigger kinds on automation_rules
alter table public.automation_rules
  add column if not exists trigger_type text not null default 'stage_enter',
  add column if not exists trigger_source text,
  add column if not exists trigger_tag text,
  add column if not exists trigger_after_minutes integer,
  add column if not exists trigger_channel text,
  add column if not exists position integer not null default 0;

alter table public.automation_rules alter column trigger_stage_id drop not null;

do $$
begin
  alter table public.automation_rules
    add constraint automation_rules_trigger_type_check
    check (trigger_type in (
      'stage_enter', 'lead_created', 'tag_added', 'lead_won', 'lead_lost',
      'stage_stuck', 'message_received'
    ));
exception when duplicate_object then null;
end $$;

create index if not exists automation_rules_type_idx
  on public.automation_rules(organization_id, trigger_type) where enabled;

-- 3) Outbox for actions the app server performs
create table if not exists public.automation_outbox (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  rule_id uuid references public.automation_rules(id) on delete set null,
  lead_id uuid references public.leads(id) on delete cascade,
  action jsonb not null,
  status text not null default 'pending' check (status in ('pending', 'processing', 'done', 'failed')),
  attempts integer not null default 0,
  error text,
  run_after timestamptz not null default now(),
  created_at timestamptz not null default now(),
  processed_at timestamptz
);

create index if not exists automation_outbox_due_idx
  on public.automation_outbox(run_after) where status = 'pending';

alter table public.automation_outbox enable row level security;
drop policy if exists "automation_outbox_select" on public.automation_outbox;
create policy "automation_outbox_select" on public.automation_outbox for select to authenticated
  using (organization_id = public.current_user_org_id());

-- 4) Salesbots
create table if not exists public.salesbots (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  description text,
  kind text not null default 'builtin' check (kind in ('builtin', 'external')),
  channel text not null default 'auto' check (channel in ('auto', 'telegram', 'whatsapp', 'sms')),
  steps jsonb not null default '[]'::jsonb,
  external_url text,
  external_secret text,
  enabled boolean not null default true,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists set_org_id on public.salesbots;
create trigger set_org_id before insert on public.salesbots
  for each row execute function public.set_organization_id();
drop trigger if exists set_updated_at on public.salesbots;
create trigger set_updated_at before update on public.salesbots
  for each row execute function public.set_updated_at();

alter table public.salesbots enable row level security;
drop policy if exists "salesbots_select" on public.salesbots;
create policy "salesbots_select" on public.salesbots for select to authenticated
  using (organization_id = public.current_user_org_id());
drop policy if exists "salesbots_write" on public.salesbots;
create policy "salesbots_write" on public.salesbots for all to authenticated
  using (organization_id = public.current_user_org_id() and public.is_admin_or_manager())
  with check (organization_id = public.current_user_org_id() and public.is_admin_or_manager());

create table if not exists public.salesbot_runs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  bot_id uuid not null references public.salesbots(id) on delete cascade,
  lead_id uuid not null references public.leads(id) on delete cascade,
  status text not null default 'running'
    check (status in ('running', 'waiting', 'done', 'failed', 'stopped')),
  current_step text,
  waiting_for text check (waiting_for in ('reply', 'delay')),
  wait_until timestamptz,
  context jsonb not null default '{}'::jsonb,
  log jsonb not null default '[]'::jsonb,
  error text,
  started_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  finished_at timestamptz
);

create index if not exists salesbot_runs_lead_idx on public.salesbot_runs(lead_id, status);
create index if not exists salesbot_runs_due_idx
  on public.salesbot_runs(wait_until) where status = 'waiting';

alter table public.salesbot_runs enable row level security;
drop policy if exists "salesbot_runs_select" on public.salesbot_runs;
create policy "salesbot_runs_select" on public.salesbot_runs for select to authenticated
  using (organization_id = public.current_user_org_id());

-- 5) Actions. In-database ones run immediately; the rest go to the outbox.
drop function if exists public.apply_automation_actions(jsonb, uuid, uuid);

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
begin
  for action in select * from jsonb_array_elements(coalesce(p_actions, '[]'::jsonb))
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

-- 6) One place that runs every matching rule for a lead event
create or replace function public.fire_lead_automations(
  p_lead public.leads,
  p_trigger_type text,
  p_tag text default null,
  p_channel text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  rule record;
  applied jsonb;
  err text;
  lead_json jsonb := to_jsonb(p_lead);
  lead_funnel text := coalesce(p_lead.funnel, 'Direct Sales');
begin
  for rule in
    select * from public.automation_rules r
    where r.enabled
      and r.organization_id = p_lead.organization_id
      and r.trigger_type = p_trigger_type
      and (r.funnel is null or r.funnel = lead_funnel)
      and (p_trigger_type not in ('stage_enter') or r.trigger_stage_id = p_lead.stage_id)
      and (p_trigger_type <> 'lead_created' or coalesce(r.trigger_source, '') = ''
           or coalesce(p_lead.source, '') ilike ('%' || r.trigger_source || '%'))
      and (p_trigger_type <> 'tag_added' or r.trigger_tag = p_tag)
      and (p_trigger_type <> 'message_received' or coalesce(r.trigger_channel, '') = ''
           or r.trigger_channel = p_channel)
    order by r.position, r.created_at
  loop
    if not public.automation_condition_matches(
      lead_json, rule.condition_field, rule.condition_operator, rule.condition_value
    ) then
      continue;
    end if;

    if coalesce(rule.delay_minutes, 0) > 0 then
      insert into public.automation_pending_runs (rule_id, lead_id, organization_id, run_at)
      values (rule.id, p_lead.id, p_lead.organization_id,
              now() + (rule.delay_minutes || ' minutes')::interval);
      continue;
    end if;

    applied := '[]'::jsonb;
    err := null;
    begin
      applied := public.apply_automation_actions(rule.actions, p_lead.id, p_lead.organization_id, rule.id);
    exception when others then
      err := sqlerrm;
    end;

    insert into public.automation_rule_runs (rule_id, lead_id, organization_id, actions_applied, error)
    values (rule.id, p_lead.id, p_lead.organization_id, applied, err);
  end loop;
end;
$$;

-- 7) Lead triggers: created / stage entered (+ won / lost) / tag added
create or replace function public.run_lead_automations()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  stage_row record;
  new_tag text;
begin
  -- An action can itself move the lead or add a tag; cap the chain so two
  -- rules pointing at each other can never loop forever.
  if pg_trigger_depth() > 4 or new.organization_id is null then
    return new;
  end if;
  -- A lead inserted with an old created_at is history arriving (amoCRM /
  -- Bitrix24 sync, a migration), not a new enquiry: don't greet or task it.
  if tg_op = 'INSERT' and new.created_at < now() - interval '1 day' then
    return new;
  end if;

  if tg_op = 'INSERT' then
    perform public.fire_lead_automations(new, 'lead_created');
  end if;

  if new.stage_id is not null
     and (tg_op = 'INSERT' or old.stage_id is distinct from new.stage_id) then
    perform public.fire_lead_automations(new, 'stage_enter');
    select is_won, is_lost into stage_row from public.pipeline_stages where id = new.stage_id;
    if stage_row.is_won then
      perform public.fire_lead_automations(new, 'lead_won');
    elsif stage_row.is_lost then
      perform public.fire_lead_automations(new, 'lead_lost');
    end if;
  end if;

  if coalesce(array_length(new.tags, 1), 0) > 0 then
    for new_tag in
      select unnest(new.tags)
      except
      select unnest(case when tg_op = 'UPDATE' then old.tags else '{}'::text[] end)
    loop
      perform public.fire_lead_automations(new, 'tag_added', new_tag);
    end loop;
  end if;

  return new;
end;
$$;

drop trigger if exists run_stage_automations on public.leads;
drop trigger if exists run_lead_automations on public.leads;
create trigger run_lead_automations
  after insert or update of stage_id, tags on public.leads
  for each row execute function public.run_lead_automations();

-- 8) Incoming client messages
create or replace function public.run_message_automations()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  lead_row public.leads%rowtype;
begin
  if new.direction <> 'in' or new.lead_id is null then
    return new;
  end if;
  select * into lead_row from public.leads where id = new.lead_id;
  if found then
    perform public.fire_lead_automations(
      lead_row,
      'message_received',
      null,
      case when tg_table_name = 'whatsapp_messages' then 'whatsapp' else 'telegram' end
    );
  end if;
  return new;
end;
$$;

drop trigger if exists run_message_automations on public.lead_telegram_messages;
create trigger run_message_automations
  after insert on public.lead_telegram_messages
  for each row execute function public.run_message_automations();

drop trigger if exists run_message_automations on public.whatsapp_messages;
create trigger run_message_automations
  after insert on public.whatsapp_messages
  for each row execute function public.run_message_automations();

-- 9) Every minute: delayed rules + "stuck in stage" rules
create or replace function public.process_due_automation_runs()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  pending record;
  rule record;
  lead_row record;
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
      applied := public.apply_automation_actions(rule.actions, pending.lead_id, pending.organization_id, rule.id);
    exception when others then
      err := sqlerrm;
    end;
    insert into public.automation_rule_runs (rule_id, lead_id, organization_id, actions_applied, error)
    values (rule.id, pending.lead_id, pending.organization_id, applied, err);
  end loop;

  for rule in
    select * from public.automation_rules
    where enabled and trigger_type = 'stage_stuck'
      and trigger_stage_id is not null and coalesce(trigger_after_minutes, 0) > 0
  loop
    for lead_row in
      select l.* from public.leads l
      where l.organization_id = rule.organization_id
        and l.stage_id = rule.trigger_stage_id
        and l.stage_changed_at <= now() - (rule.trigger_after_minutes || ' minutes')::interval
        and not exists (
          select 1 from public.automation_rule_runs rr
          where rr.rule_id = rule.id and rr.lead_id = l.id and rr.ran_at >= l.stage_changed_at
        )
      limit 200
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

-- 10) The app's outbox / salesbot worker, every minute. The job copies the
-- host and x-cron-secret from the existing audio-analysis job rather than
-- repeating the secret in this file.
do $$
declare
  cmd text;
begin
  select command into cmd from cron.job where jobname = 'audio-analysis-auto-5min';
  if cmd is null then
    raise notice 'audio-analysis-auto-5min not found; schedule automations-tick manually';
    return;
  end if;
  perform cron.schedule(
    'automations-tick-1min',
    '* * * * *',
    replace(cmd, '/audio-analytics/analyze-pending', '/automations/tick')
  );
exception
  when undefined_table or invalid_schema_name then
    raise notice 'pg_cron not available; schedule automations-tick manually';
end $$;

notify pgrst, 'reload schema';
