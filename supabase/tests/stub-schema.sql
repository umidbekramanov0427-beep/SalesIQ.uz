-- Minimal stand-in for the parts of the production schema (and of Supabase's
-- auth / pg_cron / pg_net) that the migrations under test touch. Not a copy
-- of the real schema: only the columns these rules read and write.
do $$ begin create role authenticated; create role anon; create role service_role; exception when duplicate_object then null; end $$;
create schema auth;
create or replace function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('test.uid', true), '')::uuid $$;
-- MFA stand-ins: the session's JWT claims (test.aal) and the factor table.
create or replace function auth.jwt() returns jsonb language sql stable as $$ select jsonb_build_object('aal', coalesce(nullif(current_setting('test.aal', true), ''), 'aal1')) $$;
create table auth.mfa_factors (id uuid primary key default gen_random_uuid(), user_id uuid not null, status text not null);
do $$ begin create publication supabase_realtime; exception when duplicate_object then null; end $$;
create table organizations (id uuid primary key default gen_random_uuid(), name text, plan text default 'start_iq', extra_seats int default 0, active boolean default true, is_trial boolean default false, trial_ends_at timestamptz);
create type app_role as enum ('super_admin','rop','sotuv_menejeri','platform_owner');
create table profiles (id uuid primary key default gen_random_uuid(), organization_id uuid references organizations(id), full_name text, role app_role default 'sotuv_menejeri', created_at timestamptz default now(), email text, telegram_chat_id bigint);
create or replace function current_user_org_id() returns uuid language sql stable as $$ select organization_id from profiles where id = auth.uid() $$;
create or replace function current_user_role() returns app_role language sql stable as $$ select role from profiles where id = auth.uid() $$;
create or replace function is_platform_owner() returns boolean language sql stable as $$ select exists (select 1 from profiles where id = auth.uid() and role = 'platform_owner') $$;
create table contacts (id uuid primary key default gen_random_uuid(), organization_id uuid, phone text, alt_phone text, email text, full_name text);
create table pipeline_stages (id uuid primary key default gen_random_uuid(), organization_id uuid, name text);
create table leads (id uuid primary key default gen_random_uuid(), organization_id uuid, name text, funnel text, contact_id uuid references contacts(id), owner_id uuid, stage_id uuid, amocrm_id bigint, bitrix24_deal_id bigint, tags text[] default '{}', repeat_count int not null default 0, last_repeat_at timestamptz, stage_changed_at timestamptz, created_at timestamptz default now());
create type task_status as enum ('Todo','In progress','Review','Done');
create type priority_level as enum ('Urgent','High','Normal','Low');
create table tasks (id uuid primary key default gen_random_uuid(), organization_id uuid, title text, description text, due_date timestamptz, priority priority_level default 'Normal', status task_status default 'Todo', lead_id uuid references leads(id) on delete cascade, assignee_id uuid, progress int default 0, created_at timestamptz default now(), updated_at timestamptz default now());
create table lead_activities (id uuid primary key default gen_random_uuid(), organization_id uuid, lead_id uuid references leads(id) on delete cascade, type text, content text, created_at timestamptz default now());
create table pipeline_stage_rules (id uuid primary key default gen_random_uuid(), organization_id uuid, stage_id uuid, requires_task boolean default false, requires_note boolean default false, task_profiles uuid[] not null default '{}', note_profiles uuid[] not null default '{}');
create table org_general_settings (organization_id uuid primary key, dedupe_funnel_merge boolean default true);
-- a one-row-per-lead table with unique + FK, and a table without FK
create table lead_scores (lead_id uuid unique references leads(id) on delete cascade, score int);
create table amocrm_calls (id uuid primary key default gen_random_uuid(), organization_id uuid, lead_id uuid, recording_url text, analyzed_at timestamptz, analysis_attempts int default 0, analysis_error text, occurred_at timestamptz default now());
create table pbx_calls (id uuid primary key default gen_random_uuid(), organization_id uuid not null, lead_id uuid references leads(id) on delete set null, contact_id uuid, initiated_by uuid, direction text not null default 'outgoing', from_number text, to_number text not null, external_call_id text, status text not null default 'initiated', duration_seconds int not null default 0, ring_seconds int, recording_url text, extension text, created_at timestamptz not null default now(), updated_at timestamptz default now());
create or replace function public.phone9(p text) returns text language sql immutable as $$ select case when length(regexp_replace(coalesce(p, ''), '\D', '', 'g')) >= 7 then right(regexp_replace(p, '\D', '', 'g'), 9) end; $$;

create schema if not exists cron;
create table if not exists cron.job (jobid serial, jobname text unique, schedule text, command text);
create or replace function cron.schedule(n text, s text, c text) returns bigint language sql as $f$
  insert into cron.job (jobname, schedule, command) values (n, s, c)
  on conflict (jobname) do update set schedule = excluded.schedule, command = excluded.command
  returning jobid::bigint
$f$;
create schema if not exists net;
create table if not exists net.calls (url text, headers jsonb, timeout int);
create or replace function net.http_post(url text, body jsonb default '{}', params jsonb default '{}',
  headers jsonb default '{}', timeout_milliseconds int default 5000) returns bigint language sql as $f$
  insert into net.calls values (url, headers, timeout_milliseconds); select 1::bigint
$f$;
-- Owner controls (20261120000000_owner_controls).
alter table profiles add column if not exists phone text;
create table if not exists auth.users (id uuid primary key);
create table if not exists auth.sessions (id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade);
create table if not exists user_login_events (id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade, organization_id uuid references organizations(id) on delete cascade, device_id text not null, device_label text, user_agent text, ip text, city text, country text, created_at timestamptz not null default now());
create or replace function is_admin_or_manager() returns boolean language sql stable as $$ select exists (select 1 from profiles where id = auth.uid() and role in ('super_admin', 'rop')) $$;
alter table pipeline_stages add column if not exists is_won boolean not null default false, add column if not exists is_lost boolean not null default false;
create table if not exists lead_telegram_messages (id uuid primary key default gen_random_uuid(), organization_id uuid not null, lead_id uuid not null references leads(id) on delete cascade, direction text not null, text text not null default '', sent_by uuid, created_at timestamptz not null default now());
create table if not exists lead_telegram_links (id uuid primary key default gen_random_uuid(), organization_id uuid not null, lead_id uuid not null references leads(id) on delete cascade, chat_id bigint not null);
