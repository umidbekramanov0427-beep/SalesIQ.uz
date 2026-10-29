-- Reja-fakt by stage and day (Nazorat -> Reja va fakt).
--
-- 1. lead_stage_events: one row each time a lead enters a stage, written by
--    a trigger on leads, so "how many leads reached this stage on this day"
--    is counted exactly from now on. Existing leads get one row for the
--    stage they are in now (dated by stage_changed_at) so the current month
--    is not empty.
-- 2. stage_plans: a month's target for each stage, for the whole team
--    (profile_id null) or for one manager.

create table if not exists public.lead_stage_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  lead_id uuid not null references public.leads(id) on delete cascade,
  stage_id uuid not null references public.pipeline_stages(id) on delete cascade,
  owner_id uuid references public.profiles(id) on delete set null,
  entered_at timestamptz not null default now()
);

create index if not exists lead_stage_events_org_time
  on public.lead_stage_events (organization_id, entered_at);
create index if not exists lead_stage_events_lead on public.lead_stage_events (lead_id);

alter table public.lead_stage_events enable row level security;

drop policy if exists lead_stage_events_select on public.lead_stage_events;
create policy lead_stage_events_select on public.lead_stage_events
  for select to authenticated
  using (organization_id = public.current_user_org_id());

grant select on public.lead_stage_events to authenticated;
grant all on public.lead_stage_events to service_role;

create or replace function public.record_lead_stage_event()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.stage_id is not null
     and (tg_op = 'INSERT' or new.stage_id is distinct from old.stage_id) then
    insert into public.lead_stage_events (organization_id, lead_id, stage_id, owner_id)
    values (new.organization_id, new.id, new.stage_id, new.owner_id);
  end if;
  return new;
end;
$$;

revoke execute on function public.record_lead_stage_event() from public, anon, authenticated;

drop trigger if exists leads_record_stage_event on public.leads;
create trigger leads_record_stage_event
  after insert or update of stage_id on public.leads
  for each row execute function public.record_lead_stage_event();

-- Backfill once: the stage each lead is in now.
insert into public.lead_stage_events (organization_id, lead_id, stage_id, owner_id, entered_at)
select l.organization_id, l.id, l.stage_id, l.owner_id,
       coalesce(l.stage_changed_at, l.updated_at, l.created_at)
  from public.leads l
 where l.stage_id is not null
   and not exists (select 1 from public.lead_stage_events e where e.lead_id = l.id);

create table if not exists public.stage_plans (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  month date not null check (extract(day from month) = 1),
  stage_id uuid not null references public.pipeline_stages(id) on delete cascade,
  -- null = the whole team's plan
  profile_id uuid references public.profiles(id) on delete cascade,
  target integer not null default 0 check (target >= 0),
  updated_by uuid references public.profiles(id) on delete set null,
  updated_at timestamptz not null default now()
);

create unique index if not exists stage_plans_one_per_month
  on public.stage_plans (
    organization_id,
    month,
    stage_id,
    coalesce(profile_id, '00000000-0000-0000-0000-000000000000'::uuid)
  );

alter table public.stage_plans enable row level security;

drop policy if exists stage_plans_select on public.stage_plans;
create policy stage_plans_select on public.stage_plans
  for select to authenticated
  using (organization_id = public.current_user_org_id());

drop policy if exists stage_plans_write on public.stage_plans;
create policy stage_plans_write on public.stage_plans
  for all to authenticated
  using (organization_id = public.current_user_org_id() and public.is_admin_or_manager())
  with check (organization_id = public.current_user_org_id() and public.is_admin_or_manager());

grant select, insert, update, delete on public.stage_plans to authenticated;
grant all on public.stage_plans to service_role;
