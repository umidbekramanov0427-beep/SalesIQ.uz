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
create table if not exists lead_telegram_messages (id uuid primary key default gen_random_uuid(), organization_id uuid not null, lead_id uuid not null references leads(id) on delete cascade, direction text not null, text text not null default '', sent_by uuid, channel text not null default 'telegram', ext_message_id text, created_at timestamptz not null default now());
create table if not exists lead_telegram_links (id uuid primary key default gen_random_uuid(), organization_id uuid not null, lead_id uuid not null references leads(id) on delete cascade, chat_id bigint not null);
alter table leads add column if not exists expected_revenue numeric not null default 0, add column if not exists budget numeric not null default 0, add column if not exists updated_at timestamptz default now();
-- Sales growth pack (20261207000000_sales_growth_pack).
alter table leads add column if not exists campaign text;
alter table leads add column if not exists source text;
create table if not exists lessons (id uuid primary key default gen_random_uuid());
create table if not exists lead_payment_links (id uuid primary key default gen_random_uuid(), organization_id uuid not null, lead_id uuid not null references leads(id) on delete cascade, amount bigint not null, status text not null default 'pending', provider text, paid_at timestamptz, description text, created_by uuid, created_at timestamptz not null default now());
-- Live notifications (20261208000000_live_notifications).
alter table tasks add column if not exists amocrm_task_id bigint, add column if not exists overdue_notified_at timestamptz;
create table if not exists notifications (id uuid primary key default gen_random_uuid(), organization_id uuid, user_id uuid, type text not null default 'info', title text not null, body text, link text, read boolean not null default false, created_at timestamptz not null default now());
create or replace function public.tasks_rearm_overdue() returns trigger language plpgsql as $$ begin return new; end; $$;
create trigger tasks_rearm_overdue before update of due_date on tasks for each row execute function public.tasks_rearm_overdue();
-- Platform settings singleton (sign-in code switch, 20261213000000_login_codes).
create table if not exists platform_settings (id boolean primary key default true);
-- Funnel duplicate modes (20261214000000): pipelines, won stages and the
-- client lookup from 20261027000000.
create table if not exists pipelines (id uuid primary key default gen_random_uuid(), organization_id uuid, name text);
alter table pipeline_stages add column if not exists is_won boolean not null default false;
alter table org_general_settings add column if not exists dedupe_match_email boolean default false;
create or replace function public.phone9(p text) returns text language sql immutable as $$
  select case when length(regexp_replace(coalesce(p, ''), '\D', '', 'g')) >= 7
    then right(regexp_replace(p, '\D', '', 'g'), 9) end $$;
create or replace function public.funnel_lead_for_client(p_org uuid, p_funnel text, p_phone text, p_email text, p_exclude uuid default null)
returns uuid language sql stable as $$
  select l.id from public.leads l join public.contacts c on c.id = l.contact_id
  where l.organization_id = p_org and l.amocrm_id is null and l.bitrix24_deal_id is null
    and coalesce(l.funnel, 'Direct Sales') = coalesce(p_funnel, 'Direct Sales')
    and (p_exclude is null or l.id <> p_exclude)
    and public.phone9(c.phone) = public.phone9(p_phone)
  order by l.created_at limit 1 $$;
alter table organizations add column if not exists crm_enabled boolean not null default true;
alter table pipeline_stages add column if not exists pipeline_name text, add column if not exists position int not null default 0;
create table if not exists automation_rules (id uuid primary key default gen_random_uuid(), organization_id uuid, name text, enabled boolean not null default true, trigger_type text not null default 'stage_enter', trigger_stage_id uuid, condition_field text, condition_operator text, condition_value text, actions jsonb not null default '[]', created_by uuid);
create table if not exists automation_outbox (id uuid primary key default gen_random_uuid(), organization_id uuid not null, rule_id uuid, lead_id uuid, action jsonb not null, status text not null default 'pending', run_after timestamptz not null default now(), created_at timestamptz not null default now());
create table if not exists automation_rule_runs (id uuid primary key default gen_random_uuid(), rule_id uuid, lead_id uuid, organization_id uuid, actions_applied jsonb, error text, ran_at timestamptz not null default now());
create or replace function automation_condition_matches(p_lead jsonb, p_field text, p_op text, p_value text) returns boolean language sql immutable as $$ select true $$;
create or replace function fire_lead_automations(p_lead leads, p_trigger text) returns void language plpgsql as $$ begin insert into lead_activities (organization_id, lead_id, type, content) values (p_lead.organization_id, p_lead.id, 'fired', p_trigger); end $$;
-- Funnel settings (20261218000000): stage -> funnel link and stage moves.
alter table pipeline_stages add column if not exists pipeline_id uuid, add column if not exists is_lost boolean not null default false;
alter table automation_rules add column if not exists trigger_time time;
create table if not exists lead_stage_events (id uuid primary key default gen_random_uuid(), organization_id uuid, lead_id uuid, stage_id uuid, owner_id uuid, entered_at timestamptz default now());
create table if not exists lead_files (id uuid primary key default gen_random_uuid(), organization_id uuid not null references organizations(id) on delete cascade, lead_id uuid not null references leads(id) on delete cascade, file_name text not null, storage_path text not null, mime_type text, size_bytes bigint not null default 0, uploaded_by uuid references profiles(id) on delete set null, created_at timestamptz not null default now());
alter table lead_files enable row level security;
create policy "lead_files_select" on lead_files for select to authenticated using (organization_id = current_user_org_id());
grant select on lead_files to authenticated;
alter table pipeline_stages add column if not exists pipeline_name text, add column if not exists position int not null default 0, add column if not exists is_won boolean not null default false, add column if not exists is_lost boolean not null default false;

-- Davomat (20270101000000_attendance_rules).
create table if not exists work_sessions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid,
  profile_id uuid not null,
  clock_in timestamptz not null default now(),
  clock_out timestamptz,
  created_at timestamptz not null default now()
);
