-- Audio-analysis scoring rubric, phase 1 of the config layer the AI call
-- engine will eventually read from: Categories group Stages, Stages contain
-- checklist Steps, each Step is optionally linked to a Skill (radar-chart
-- axis) and carries a point weight. Replaces the flat setting_lists rows for
-- "categories"/"skills"/"sales_stages" with real relational tables — those
-- setting_lists rows are left in place (harmless, just unused going
-- forward) rather than migrated, since there's no reliable way to infer
-- stage->category or step->skill links from flat name-only rows.
create table if not exists public.call_categories (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  name text not null,
  position integer not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.call_skills (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  name text not null,
  color text not null default '#6366f1',
  position integer not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.call_stages (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  category_id uuid references public.call_categories(id) on delete set null,
  name text not null,
  position integer not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.call_stage_steps (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  stage_id uuid not null references public.call_stages(id) on delete cascade,
  skill_id uuid references public.call_skills(id) on delete set null,
  name text not null,
  points numeric not null default 1,
  position integer not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists call_categories_org_idx on public.call_categories(organization_id, position);
create index if not exists call_skills_org_idx on public.call_skills(organization_id, position);
create index if not exists call_stages_org_idx on public.call_stages(organization_id, position);
create index if not exists call_stage_steps_stage_idx on public.call_stage_steps(stage_id, position);
create index if not exists call_stage_steps_org_idx on public.call_stage_steps(organization_id);

alter table public.call_categories enable row level security;
alter table public.call_skills enable row level security;
alter table public.call_stages enable row level security;
alter table public.call_stage_steps enable row level security;

drop trigger if exists set_org_id on public.call_categories;
create trigger set_org_id before insert on public.call_categories
  for each row execute function public.set_organization_id();
drop trigger if exists set_org_id on public.call_skills;
create trigger set_org_id before insert on public.call_skills
  for each row execute function public.set_organization_id();
drop trigger if exists set_org_id on public.call_stages;
create trigger set_org_id before insert on public.call_stages
  for each row execute function public.set_organization_id();
drop trigger if exists set_org_id on public.call_stage_steps;
create trigger set_org_id before insert on public.call_stage_steps
  for each row execute function public.set_organization_id();

drop policy if exists "call_categories_select" on public.call_categories;
create policy "call_categories_select" on public.call_categories for select to authenticated
  using (organization_id = public.current_user_org_id());
drop policy if exists "call_categories_write" on public.call_categories;
create policy "call_categories_write" on public.call_categories for all to authenticated
  using (organization_id = public.current_user_org_id() and public.is_admin_or_manager())
  with check (organization_id = public.current_user_org_id() and public.is_admin_or_manager());

drop policy if exists "call_skills_select" on public.call_skills;
create policy "call_skills_select" on public.call_skills for select to authenticated
  using (organization_id = public.current_user_org_id());
drop policy if exists "call_skills_write" on public.call_skills;
create policy "call_skills_write" on public.call_skills for all to authenticated
  using (organization_id = public.current_user_org_id() and public.is_admin_or_manager())
  with check (organization_id = public.current_user_org_id() and public.is_admin_or_manager());

drop policy if exists "call_stages_select" on public.call_stages;
create policy "call_stages_select" on public.call_stages for select to authenticated
  using (organization_id = public.current_user_org_id());
drop policy if exists "call_stages_write" on public.call_stages;
create policy "call_stages_write" on public.call_stages for all to authenticated
  using (organization_id = public.current_user_org_id() and public.is_admin_or_manager())
  with check (organization_id = public.current_user_org_id() and public.is_admin_or_manager());

drop policy if exists "call_stage_steps_select" on public.call_stage_steps;
create policy "call_stage_steps_select" on public.call_stage_steps for select to authenticated
  using (organization_id = public.current_user_org_id());
drop policy if exists "call_stage_steps_write" on public.call_stage_steps;
create policy "call_stage_steps_write" on public.call_stage_steps for all to authenticated
  using (organization_id = public.current_user_org_id() and public.is_admin_or_manager())
  with check (organization_id = public.current_user_org_id() and public.is_admin_or_manager());
