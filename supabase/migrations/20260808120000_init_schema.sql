-- SalesOS Elite CRM — core schema, RLS policies, triggers, and seed data.
-- Run this once on a fresh database.
-- (or via `supabase db push` if you link the project locally).

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------

do $$ begin create type public.app_role as enum ('super_admin', 'manager', 'rep'); exception when duplicate_object then null; end $$;
do $$ begin create type public.priority_level as enum ('Urgent', 'High', 'Normal', 'Low'); exception when duplicate_object then null; end $$;
do $$ begin create type public.lead_temperature as enum ('Hot', 'Warm', 'Cold'); exception when duplicate_object then null; end $$;
do $$ begin create type public.task_status as enum ('Todo', 'In progress', 'Review', 'Done'); exception when duplicate_object then null; end $$;
do $$ begin create type public.deal_status as enum ('open', 'won', 'lost'); exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------------------
-- profiles (1:1 with auth.users)
-- ---------------------------------------------------------------------

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  full_name text not null default '',
  avatar_url text,
  role public.app_role not null default 'rep',
  department text not null default 'Unassigned',
  position text not null default 'Sales Rep',
  team text,
  branch text,
  phone text,
  manager_id uuid references public.profiles(id) on delete set null,
  daily_target numeric not null default 3000,
  monthly_target numeric not null default 63000,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- pipeline_stages
-- ---------------------------------------------------------------------

create table if not exists public.pipeline_stages (
  id uuid primary key default gen_random_uuid(),
  key text not null unique,
  name text not null,
  position int not null,
  color text not null default 'bg-primary',
  probability int not null default 0,
  is_won boolean not null default false,
  is_lost boolean not null default false,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- companies
-- ---------------------------------------------------------------------

create table if not exists public.companies (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  industry text,
  employees_range text,
  annual_revenue numeric,
  website text,
  city text,
  country text default 'Uzbekistan',
  owner_id uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- contacts
-- ---------------------------------------------------------------------

create table if not exists public.contacts (
  id uuid primary key default gen_random_uuid(),
  company_id uuid references public.companies(id) on delete set null,
  full_name text not null,
  position text,
  phone text,
  alt_phone text,
  email text,
  telegram text,
  whatsapp text,
  birthday date,
  owner_id uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- leads
-- ---------------------------------------------------------------------

create table if not exists public.leads (
  id uuid primary key default gen_random_uuid(),
  contact_id uuid references public.contacts(id) on delete set null,
  company_id uuid references public.companies(id) on delete set null,
  name text not null,
  company_name text not null default '',
  source text,
  campaign text,
  utm text,
  owner_id uuid references public.profiles(id) on delete set null,
  manager_id uuid references public.profiles(id) on delete set null,
  priority public.priority_level not null default 'Normal',
  score int not null default 50,
  temperature public.lead_temperature not null default 'Warm',
  budget numeric not null default 0,
  expected_revenue numeric not null default 0,
  country text default 'Uzbekistan',
  region text,
  city text,
  address text,
  stage_id uuid references public.pipeline_stages(id),
  funnel text default 'Direct Sales',
  next_follow_up timestamptz,
  last_contact_at timestamptz,
  tags text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- deals
-- ---------------------------------------------------------------------

create table if not exists public.deals (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid references public.leads(id) on delete set null,
  company_id uuid references public.companies(id) on delete set null,
  contact_id uuid references public.contacts(id) on delete set null,
  name text not null,
  value numeric not null default 0,
  currency text not null default 'USD',
  probability int not null default 10,
  stage_id uuid references public.pipeline_stages(id),
  pipeline text default 'Direct Sales',
  status public.deal_status not null default 'open',
  close_date date,
  owner_id uuid references public.profiles(id) on delete set null,
  products_count int not null default 1,
  discount numeric not null default 0,
  tax numeric not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- lead_activities (timeline: notes, calls, stage moves, files, AI...)
-- ---------------------------------------------------------------------

create table if not exists public.lead_activities (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.leads(id) on delete cascade,
  type text not null,
  content text not null,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- tasks (Important Tasks + Lead Tasks share one table; lead_id nullable)
-- ---------------------------------------------------------------------

create table if not exists public.tasks (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text,
  priority public.priority_level not null default 'Normal',
  status public.task_status not null default 'Todo',
  due_date timestamptz,
  progress int not null default 0,
  assignee_id uuid references public.profiles(id) on delete set null,
  created_by uuid references public.profiles(id) on delete set null,
  lead_id uuid references public.leads(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.task_comments (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.tasks(id) on delete cascade,
  author_id uuid references public.profiles(id) on delete set null,
  content text not null,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- notifications (Inbox). user_id null = broadcast to everyone.
-- ---------------------------------------------------------------------

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles(id) on delete cascade,
  type text not null default 'Automation',
  title text not null,
  body text,
  link text,
  read boolean not null default false,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- audit_logs
-- ---------------------------------------------------------------------

create table if not exists public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references public.profiles(id) on delete set null,
  action text not null,
  entity_type text not null,
  entity_id uuid,
  meta jsonb not null default '{}',
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- integration_settings (admin-configured keys for OpenAI/Telegram/WhatsApp)
-- ---------------------------------------------------------------------

create table if not exists public.integration_settings (
  key text primary key,
  enabled boolean not null default false,
  config jsonb not null default '{}',
  updated_by uuid references public.profiles(id) on delete set null,
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- updated_at helper trigger
-- ---------------------------------------------------------------------

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_updated_at on public.profiles;
create trigger set_updated_at before update on public.profiles for each row execute function public.set_updated_at();
drop trigger if exists set_updated_at on public.companies;
create trigger set_updated_at before update on public.companies for each row execute function public.set_updated_at();
drop trigger if exists set_updated_at on public.contacts;
create trigger set_updated_at before update on public.contacts for each row execute function public.set_updated_at();
drop trigger if exists set_updated_at on public.leads;
create trigger set_updated_at before update on public.leads for each row execute function public.set_updated_at();
drop trigger if exists set_updated_at on public.deals;
create trigger set_updated_at before update on public.deals for each row execute function public.set_updated_at();
drop trigger if exists set_updated_at on public.tasks;
create trigger set_updated_at before update on public.tasks for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------
-- Role helpers (security definer to avoid recursive RLS lookups)
-- ---------------------------------------------------------------------

create or replace function public.current_user_role()
returns public.app_role
language sql
stable
security definer
set search_path = public
as $$
  select role from public.profiles where id = auth.uid();
$$;

create or replace function public.is_admin_or_manager()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select role from public.profiles where id = auth.uid()) in ('super_admin', 'manager'), false);
$$;

-- ---------------------------------------------------------------------
-- New-user bootstrap: first-time signup creates a profile row.
-- The workspace owner's email is auto-promoted to super_admin.
-- ---------------------------------------------------------------------

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name, role)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)),
    case
      when lower(new.email) = lower('umidbekramanov0427@gmail.com') then 'super_admin'::public.app_role
      else 'rep'::public.app_role
    end
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Hard guard against privilege escalation: only a super_admin may change a
-- profile's role, regardless of what the UPDATE row-level policy allows.
create or replace function public.prevent_role_self_escalation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.role is distinct from old.role and public.current_user_role() is distinct from 'super_admin'::public.app_role then
    raise exception 'Only a super_admin can change a profile role';
  end if;
  return new;
end;
$$;

drop trigger if exists guard_role_escalation on public.profiles;
create trigger guard_role_escalation
  before update on public.profiles
  for each row execute function public.prevent_role_self_escalation();

-- ---------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------

alter table public.profiles enable row level security;
alter table public.pipeline_stages enable row level security;
alter table public.companies enable row level security;
alter table public.contacts enable row level security;
alter table public.leads enable row level security;
alter table public.deals enable row level security;
alter table public.lead_activities enable row level security;
alter table public.tasks enable row level security;
alter table public.task_comments enable row level security;
alter table public.notifications enable row level security;
alter table public.audit_logs enable row level security;
alter table public.integration_settings enable row level security;

-- profiles: everyone signed in can see the team directory; only admins/managers
-- (or the owner) can edit, and only admins can change roles.
drop policy if exists "profiles_select_authenticated" on public.profiles;
create policy "profiles_select_authenticated" on public.profiles
  for select to authenticated using (true);

drop policy if exists "profiles_update_self_or_admin" on public.profiles;
create policy "profiles_update_self_or_admin" on public.profiles
  for update to authenticated
  using (id = auth.uid() or public.is_admin_or_manager())
  with check (
    id = auth.uid() or public.is_admin_or_manager()
  );

drop policy if exists "profiles_insert_admin" on public.profiles;
create policy "profiles_insert_admin" on public.profiles
  for insert to authenticated
  with check (public.current_user_role() = 'super_admin');

drop policy if exists "profiles_delete_admin" on public.profiles;
create policy "profiles_delete_admin" on public.profiles
  for delete to authenticated
  using (public.current_user_role() = 'super_admin');

-- pipeline_stages: readable by all, editable by admins/managers.
drop policy if exists "stages_select" on public.pipeline_stages;
create policy "stages_select" on public.pipeline_stages for select to authenticated using (true);
drop policy if exists "stages_write" on public.pipeline_stages;
create policy "stages_write" on public.pipeline_stages for all to authenticated
  using (public.is_admin_or_manager()) with check (public.is_admin_or_manager());

-- shared workspace tables: any authenticated user can read/create; updates and
-- deletes are restricted to the record owner or an admin/manager.
drop policy if exists "companies_select" on public.companies;
create policy "companies_select" on public.companies for select to authenticated using (true);
drop policy if exists "companies_insert" on public.companies;
create policy "companies_insert" on public.companies for insert to authenticated with check (true);
drop policy if exists "companies_update" on public.companies;
create policy "companies_update" on public.companies for update to authenticated
  using (owner_id = auth.uid() or public.is_admin_or_manager());
drop policy if exists "companies_delete" on public.companies;
create policy "companies_delete" on public.companies for delete to authenticated
  using (owner_id = auth.uid() or public.is_admin_or_manager());

drop policy if exists "contacts_select" on public.contacts;
create policy "contacts_select" on public.contacts for select to authenticated using (true);
drop policy if exists "contacts_insert" on public.contacts;
create policy "contacts_insert" on public.contacts for insert to authenticated with check (true);
drop policy if exists "contacts_update" on public.contacts;
create policy "contacts_update" on public.contacts for update to authenticated
  using (owner_id = auth.uid() or public.is_admin_or_manager());
drop policy if exists "contacts_delete" on public.contacts;
create policy "contacts_delete" on public.contacts for delete to authenticated
  using (owner_id = auth.uid() or public.is_admin_or_manager());

drop policy if exists "leads_select" on public.leads;
create policy "leads_select" on public.leads for select to authenticated using (true);
drop policy if exists "leads_insert" on public.leads;
create policy "leads_insert" on public.leads for insert to authenticated with check (true);
drop policy if exists "leads_update" on public.leads;
create policy "leads_update" on public.leads for update to authenticated
  using (owner_id = auth.uid() or public.is_admin_or_manager());
drop policy if exists "leads_delete" on public.leads;
create policy "leads_delete" on public.leads for delete to authenticated
  using (owner_id = auth.uid() or public.is_admin_or_manager());

drop policy if exists "deals_select" on public.deals;
create policy "deals_select" on public.deals for select to authenticated using (true);
drop policy if exists "deals_insert" on public.deals;
create policy "deals_insert" on public.deals for insert to authenticated with check (true);
drop policy if exists "deals_update" on public.deals;
create policy "deals_update" on public.deals for update to authenticated
  using (owner_id = auth.uid() or public.is_admin_or_manager());
drop policy if exists "deals_delete" on public.deals;
create policy "deals_delete" on public.deals for delete to authenticated
  using (owner_id = auth.uid() or public.is_admin_or_manager());

drop policy if exists "lead_activities_select" on public.lead_activities;
create policy "lead_activities_select" on public.lead_activities for select to authenticated using (true);
drop policy if exists "lead_activities_insert" on public.lead_activities;
create policy "lead_activities_insert" on public.lead_activities for insert to authenticated with check (true);

drop policy if exists "tasks_select" on public.tasks;
create policy "tasks_select" on public.tasks for select to authenticated using (true);
drop policy if exists "tasks_insert" on public.tasks;
create policy "tasks_insert" on public.tasks for insert to authenticated with check (true);
drop policy if exists "tasks_update" on public.tasks;
create policy "tasks_update" on public.tasks for update to authenticated
  using (assignee_id = auth.uid() or created_by = auth.uid() or public.is_admin_or_manager());
drop policy if exists "tasks_delete" on public.tasks;
create policy "tasks_delete" on public.tasks for delete to authenticated
  using (created_by = auth.uid() or public.is_admin_or_manager());

drop policy if exists "task_comments_select" on public.task_comments;
create policy "task_comments_select" on public.task_comments for select to authenticated using (true);
drop policy if exists "task_comments_insert" on public.task_comments;
create policy "task_comments_insert" on public.task_comments for insert to authenticated with check (true);

-- notifications: users only see their own or broadcast (user_id is null) rows.
drop policy if exists "notifications_select" on public.notifications;
create policy "notifications_select" on public.notifications for select to authenticated
  using (user_id = auth.uid() or user_id is null);
drop policy if exists "notifications_insert" on public.notifications;
create policy "notifications_insert" on public.notifications for insert to authenticated with check (true);
drop policy if exists "notifications_update" on public.notifications;
create policy "notifications_update" on public.notifications for update to authenticated
  using (user_id = auth.uid() or user_id is null);

drop policy if exists "audit_logs_select" on public.audit_logs;
create policy "audit_logs_select" on public.audit_logs for select to authenticated
  using (public.is_admin_or_manager());
drop policy if exists "audit_logs_insert" on public.audit_logs;
create policy "audit_logs_insert" on public.audit_logs for insert to authenticated with check (true);

drop policy if exists "integration_settings_select" on public.integration_settings;
create policy "integration_settings_select" on public.integration_settings for select to authenticated using (true);
drop policy if exists "integration_settings_write" on public.integration_settings;
create policy "integration_settings_write" on public.integration_settings for all to authenticated
  using (public.current_user_role() = 'super_admin') with check (public.current_user_role() = 'super_admin');

-- ---------------------------------------------------------------------
-- Seed: pipeline stages
-- ---------------------------------------------------------------------

insert into public.pipeline_stages (key, name, position, color, probability, is_won, is_lost) values
  ('new', 'New Lead', 1, 'bg-primary', 10, false, false),
  ('qualified', 'Qualified', 2, 'bg-info', 25, false, false),
  ('demo', 'Demo', 3, 'bg-warning', 45, false, false),
  ('proposal', 'Proposal', 4, 'bg-mint-border', 65, false, false),
  ('negotiation', 'Negotiation', 5, 'bg-success', 85, false, false),
  ('won', 'Won', 6, 'bg-success', 100, true, false),
  ('lost', 'Lost', 7, 'bg-destructive', 0, false, true)
on conflict (key) do nothing;

insert into public.integration_settings (key, enabled, config) values
  ('openai', false, '{}'),
  ('telegram', false, '{}'),
  ('whatsapp', false, '{}')
on conflict (key) do nothing;
