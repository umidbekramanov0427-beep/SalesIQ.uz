-- Self-service report builder (recommendation #9): lets a rep pick a
-- group-by dimension, a metric and a set of filters over their own leads
-- and save the resulting view for later, instead of only having the fixed
-- dashboards on /lead-analytics. The whole thing is computed client-side
-- from the same CrmLeadView rows the leads register already loads -- this
-- table only persists the small config a saved report needs to be
-- rebuilt (group_by/metric/chart type/filters), not any computed numbers.
create table if not exists public.custom_reports (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  config jsonb not null default '{}'::jsonb,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists custom_reports_org_idx on public.custom_reports(organization_id, created_at desc);

alter table public.custom_reports enable row level security;

drop policy if exists "custom_reports_select" on public.custom_reports;
create policy "custom_reports_select" on public.custom_reports for select to authenticated
  using (organization_id = public.current_user_org_id());

-- Shared team library, same treatment as automation_rules/tags -- any org
-- member can save a report for the team or remove one, not just its author.
drop policy if exists "custom_reports_insert" on public.custom_reports;
create policy "custom_reports_insert" on public.custom_reports for insert to authenticated
  with check (organization_id = public.current_user_org_id());

drop policy if exists "custom_reports_delete" on public.custom_reports;
create policy "custom_reports_delete" on public.custom_reports for delete to authenticated
  using (organization_id = public.current_user_org_id());
