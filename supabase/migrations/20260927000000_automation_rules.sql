-- Automation / workflow builder: admin-defined rules that fire the moment a
-- lead enters a given pipeline stage (created there, or moved there from
-- another stage) and run one or more actions (assign owner, add tag, create
-- task, add a note). Actions live as a single jsonb array per rule rather
-- than a join table, since a rule's actions are always read/executed as one
-- unit and never queried individually.
--
-- This is implemented as a genuine database trigger on leads.stage_id (not
-- app code in one particular route) so it fires no matter which path
-- changed the stage: the manual stage dropdown, the pipeline board
-- drag/drop, the new bulk "change stage" action, or the AmoCRM sync job --
-- all of those write to the same column, and app-level hooks would have had
-- to be duplicated into every one of them to get the same coverage.
create table if not exists public.automation_rules (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  funnel text,
  trigger_stage_id uuid not null references public.pipeline_stages(id) on delete cascade,
  actions jsonb not null default '[]'::jsonb,
  enabled boolean not null default true,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists automation_rules_trigger_idx
  on public.automation_rules(trigger_stage_id) where enabled;

alter table public.automation_rules enable row level security;

drop trigger if exists set_org_id on public.automation_rules;
create trigger set_org_id before insert on public.automation_rules
  for each row execute function public.set_organization_id();

drop trigger if exists set_updated_at on public.automation_rules;
create trigger set_updated_at before update on public.automation_rules
  for each row execute function public.set_updated_at();

drop policy if exists "automation_rules_select" on public.automation_rules;
create policy "automation_rules_select" on public.automation_rules for select to authenticated
  using (organization_id = public.current_user_org_id());

drop policy if exists "automation_rules_write" on public.automation_rules;
create policy "automation_rules_write" on public.automation_rules for all to authenticated
  using (organization_id = public.current_user_org_id() and public.is_admin_or_manager())
  with check (organization_id = public.current_user_org_id() and public.is_admin_or_manager());

-- Execution log so admins can see what a rule actually did (or why it
-- failed one time) instead of guessing purely from side effects.
create table if not exists public.automation_rule_runs (
  id uuid primary key default gen_random_uuid(),
  rule_id uuid not null references public.automation_rules(id) on delete cascade,
  lead_id uuid not null references public.leads(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  actions_applied jsonb not null default '[]'::jsonb,
  error text,
  ran_at timestamptz not null default now()
);

create index if not exists automation_rule_runs_rule_idx
  on public.automation_rule_runs(rule_id, ran_at desc);

alter table public.automation_rule_runs enable row level security;

drop policy if exists "automation_rule_runs_select" on public.automation_rule_runs;
create policy "automation_rule_runs_select" on public.automation_rule_runs for select to authenticated
  using (organization_id = public.current_user_org_id());

-- No insert/update/delete policy for clients: every row here is written by
-- the trigger function below, which runs as security definer.

-- security definer (with a pinned search_path, so it can't be tricked by a
-- hostile search_path) so the rule still runs its actions in full even when
-- the rep who happened to move the stage wouldn't otherwise have rights to,
-- say, create a task for a teammate or tag someone else's lead.
create or replace function public.run_lead_stage_automations()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  rule record;
  action jsonb;
  applied jsonb;
  err text;
begin
  if tg_op = 'UPDATE' and old.stage_id is not distinct from new.stage_id then
    return new;
  end if;
  if new.stage_id is null or new.organization_id is null then
    return new;
  end if;

  for rule in
    select * from public.automation_rules
    where enabled
      and organization_id = new.organization_id
      and trigger_stage_id = new.stage_id
      and (funnel is null or funnel = new.funnel)
  loop
    applied := '[]'::jsonb;
    err := null;
    begin
      for action in select * from jsonb_array_elements(coalesce(rule.actions, '[]'::jsonb))
      loop
        if action->>'type' = 'assign_owner' and coalesce(action->>'ownerId', '') <> '' then
          update public.leads set owner_id = (action->>'ownerId')::uuid where id = new.id;
          applied := applied || jsonb_build_array(action);
        elsif action->>'type' = 'add_tag' and coalesce(action->>'tag', '') <> '' then
          update public.leads
            set tags = case when (action->>'tag') = any(tags) then tags
                            else array_append(tags, action->>'tag') end
            where id = new.id;
          applied := applied || jsonb_build_array(action);
        elsif action->>'type' = 'create_task' and coalesce(action->>'title', '') <> '' then
          insert into public.tasks
            (organization_id, lead_id, title, description, assignee_id, due_date, priority)
          values (
            new.organization_id,
            new.id,
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
          values (new.organization_id, new.id, 'note', action->>'text');
          applied := applied || jsonb_build_array(action);
        end if;
      end loop;
    exception when others then
      err := sqlerrm;
    end;

    insert into public.automation_rule_runs (rule_id, lead_id, organization_id, actions_applied, error)
    values (rule.id, new.id, new.organization_id, applied, err);
  end loop;

  return new;
end;
$$;

drop trigger if exists run_stage_automations on public.leads;
create trigger run_stage_automations
  after insert or update of stage_id on public.leads
  for each row execute function public.run_lead_stage_automations();
