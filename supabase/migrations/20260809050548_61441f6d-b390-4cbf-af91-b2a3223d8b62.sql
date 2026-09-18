create extension if not exists pgcrypto;

do $$ begin create type public.app_role as enum ('super_admin','manager','rep'); exception when duplicate_object then null; end $$;
do $$ begin create type public.priority_level as enum ('Urgent','High','Normal','Low'); exception when duplicate_object then null; end $$;
do $$ begin create type public.lead_temperature as enum ('Hot','Warm','Cold'); exception when duplicate_object then null; end $$;
do $$ begin create type public.task_status as enum ('Todo','In progress','Review','Done'); exception when duplicate_object then null; end $$;
do $$ begin create type public.deal_status as enum ('open','won','lost'); exception when duplicate_object then null; end $$;

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

create table if not exists public.lead_activities (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.leads(id) on delete cascade,
  type text not null,
  content text not null,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

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

create table if not exists public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references public.profiles(id) on delete set null,
  action text not null,
  entity_type text not null,
  entity_id uuid,
  meta jsonb not null default '{}',
  created_at timestamptz not null default now()
);

create table if not exists public.integration_settings (
  key text primary key,
  enabled boolean not null default false,
  config jsonb not null default '{}',
  updated_by uuid references public.profiles(id) on delete set null,
  updated_at timestamptz not null default now()
);

grant select, insert, update, delete on public.profiles, public.pipeline_stages, public.companies, public.contacts, public.leads, public.deals, public.lead_activities, public.tasks, public.task_comments, public.notifications, public.audit_logs, public.integration_settings to authenticated;
grant all on public.profiles, public.pipeline_stages, public.companies, public.contacts, public.leads, public.deals, public.lead_activities, public.tasks, public.task_comments, public.notifications, public.audit_logs, public.integration_settings to service_role;

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