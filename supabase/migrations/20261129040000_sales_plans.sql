-- Monthly sales plans (Reja va fakt): a target for the whole team and for
-- each manager; the fact is the deals won (closed) in that month.

create table if not exists public.sales_plans (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  -- null = the whole team's plan
  profile_id uuid references public.profiles(id) on delete cascade,
  month date not null check (extract(day from month) = 1),
  target_amount numeric(18, 2) not null default 0 check (target_amount >= 0),
  target_deals integer not null default 0 check (target_deals >= 0),
  updated_by uuid references public.profiles(id) on delete set null,
  updated_at timestamptz not null default now()
);

create unique index if not exists sales_plans_one_per_month
  on public.sales_plans (
    organization_id,
    coalesce(profile_id, '00000000-0000-0000-0000-000000000000'::uuid),
    month
  );

alter table public.sales_plans enable row level security;

drop policy if exists sales_plans_select on public.sales_plans;
create policy sales_plans_select on public.sales_plans
  for select to authenticated
  using (organization_id = public.current_user_org_id());

drop policy if exists sales_plans_write on public.sales_plans;
create policy sales_plans_write on public.sales_plans
  for all to authenticated
  using (organization_id = public.current_user_org_id() and public.is_admin_or_manager())
  with check (organization_id = public.current_user_org_id() and public.is_admin_or_manager());

grant select, insert, update, delete on public.sales_plans to authenticated;
grant all on public.sales_plans to service_role;

-- Deals won in [p_from, p_to), per owner: when the lead entered its won
-- stage (stage_changed_at, else its last update). The caller's company only.
create or replace function public.sales_plan_facts(p_from timestamptz, p_to timestamptz)
returns table (owner_id uuid, deals integer, revenue numeric)
language sql
stable
security invoker
set search_path = public
as $$
  select l.owner_id,
         count(*)::integer,
         coalesce(sum(coalesce(nullif(l.expected_revenue, 0), l.budget, 0)), 0)
    from public.leads l
    join public.pipeline_stages s on s.id = l.stage_id and s.is_won
   where l.organization_id = public.current_user_org_id()
     and coalesce(l.stage_changed_at, l.updated_at, l.created_at) >= p_from
     and coalesce(l.stage_changed_at, l.updated_at, l.created_at) < p_to
   group by l.owner_id;
$$;

revoke execute on function public.sales_plan_facts(timestamptz, timestamptz) from public, anon;
grant execute on function public.sales_plan_facts(timestamptz, timestamptz) to authenticated;
