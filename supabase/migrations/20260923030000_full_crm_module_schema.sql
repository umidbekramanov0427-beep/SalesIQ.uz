-- Database schema for the eight full-CRM modules requested on top of the
-- existing analytics/audio-analysis platform: named pipelines with ordered
-- colored stages, a Kanban-ready lead card, mandatory note/task rules on
-- stage transitions, phone-duplicate tracking, OnlinePBX telephony + SMS,
-- external lead-source webhooks (Meta Lead Ads etc.), the platform's own
-- embeddable web forms, and AI auto-fill/auto-task hooks.
--
-- Deliberately reuses what already exists instead of duplicating it:
--   - leads / contacts / companies / deals: already there.
--   - tasks, lead_activities: already the generic "vazifa" and "izoh /
--     suhbat tarixi" tables the Kanban lead card and the AI auto-fill
--     (module 8) both write into -- no new table needed for either.
--   - org_general_settings.ai_task_creation_enabled /
--     crm_task_forwarding_enabled: already the AI-automation on/off
--     switches module 8 needs -- no new setting added.
--   - pipeline_stages: already has color/position/is_won/is_lost -- this
--     migration only adds the missing "named pipeline" layer above it.
create extension if not exists pgcrypto;

/* ------------------------------------------------------------------ */
/* Module 1: Pipelines & Statuses                                      */
/* ------------------------------------------------------------------ */

-- pipeline_stages already stores an amocrm-friendly "pipeline_name" text
-- column but nothing owns that grouping as a first-class, orderable,
-- colorable, admin-manageable object -- this table is that object.
create table if not exists public.pipelines (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  position int not null default 0,
  color text not null default 'bg-primary',
  is_default boolean not null default false,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, name)
);

alter table public.pipelines enable row level security;

drop policy if exists "pipelines_select" on public.pipelines;
create policy "pipelines_select" on public.pipelines for select to authenticated
  using (organization_id = public.current_user_org_id());
drop policy if exists "pipelines_insert" on public.pipelines;
create policy "pipelines_insert" on public.pipelines for insert to authenticated
  with check (organization_id = public.current_user_org_id() and public.is_admin_or_manager());
drop policy if exists "pipelines_update" on public.pipelines;
create policy "pipelines_update" on public.pipelines for update to authenticated
  using (organization_id = public.current_user_org_id() and public.is_admin_or_manager());
drop policy if exists "pipelines_delete" on public.pipelines;
create policy "pipelines_delete" on public.pipelines for delete to authenticated
  using (organization_id = public.current_user_org_id() and public.is_admin_or_manager());

-- Backfill: one pipelines row per distinct pipeline_name pipeline_stages
-- already groups by, per org, so existing stages (AmoCRM-synced or
-- hand-created) attach to a real pipeline immediately instead of every
-- org starting from zero pipelines.
insert into public.pipelines (organization_id, name, position, color, is_default)
select
  organization_id,
  coalesce(nullif(trim(pipeline_name), ''), 'Direct Sales') as name,
  (row_number() over (partition by organization_id order by min(position)) - 1)::int as position,
  'bg-primary' as color,
  (row_number() over (partition by organization_id order by min(position)) = 1) as is_default
from public.pipeline_stages
group by organization_id, coalesce(nullif(trim(pipeline_name), ''), 'Direct Sales')
on conflict (organization_id, name) do nothing;

-- Orgs with zero pipeline_stages rows (brand new, nothing synced yet)
-- still get one default pipeline so the Kanban page always has somewhere
-- to create the first stage into.
insert into public.pipelines (organization_id, name, position, color, is_default)
select o.id, 'Direct Sales', 0, 'bg-primary', true
from public.organizations o
where not exists (select 1 from public.pipelines p where p.organization_id = o.id)
on conflict (organization_id, name) do nothing;

alter table public.pipeline_stages
  add column if not exists pipeline_id uuid references public.pipelines(id) on delete cascade;

update public.pipeline_stages ps
set pipeline_id = p.id
from public.pipelines p
where ps.pipeline_id is null
  and p.organization_id = ps.organization_id
  and p.name = coalesce(nullif(trim(ps.pipeline_name), ''), 'Direct Sales');

create index if not exists idx_pipeline_stages_pipeline_id on public.pipeline_stages(pipeline_id);

/* ------------------------------------------------------------------ */
/* Module 3: Validation Rules -- mandatory note / task on stage entry  */
/* (placed before module 2 since the Kanban card enforces this table's */
/* rules and both belong to the same pipeline_stages foreign key)      */
/* ------------------------------------------------------------------ */

create table if not exists public.pipeline_stage_rules (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  stage_id uuid not null unique references public.pipeline_stages(id) on delete cascade,
  requires_note boolean not null default false,
  requires_task boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.pipeline_stage_rules enable row level security;

drop policy if exists "pipeline_stage_rules_select" on public.pipeline_stage_rules;
create policy "pipeline_stage_rules_select" on public.pipeline_stage_rules for select to authenticated
  using (organization_id = public.current_user_org_id());
drop policy if exists "pipeline_stage_rules_write" on public.pipeline_stage_rules;
create policy "pipeline_stage_rules_write" on public.pipeline_stage_rules for all to authenticated
  using (organization_id = public.current_user_org_id() and public.is_admin_or_manager())
  with check (organization_id = public.current_user_org_id() and public.is_admin_or_manager());

/* ------------------------------------------------------------------ */
/* Module 4: Duplicate Control                                         */
/* ------------------------------------------------------------------ */

-- Leads don't carry a phone column themselves (it lives on contacts, via
-- leads.contact_id) -- the duplicate check is a lookup against contacts.
create index if not exists idx_contacts_org_phone
  on public.contacts(organization_id, phone) where phone is not null;

-- An audit trail of every duplicate the platform actually caught (and
-- whether the rep created the lead anyway) -- not required for the check
-- itself (that's a live query against contacts), but the only way to ever
-- answer "how often does this happen" without one.
create table if not exists public.lead_duplicate_flags (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  phone text not null,
  matched_contact_id uuid references public.contacts(id) on delete set null,
  matched_lead_id uuid references public.leads(id) on delete set null,
  new_lead_id uuid references public.leads(id) on delete set null,
  source text not null default 'manual' check (source in ('manual', 'webhook', 'web_form')),
  attempted_by uuid references public.profiles(id) on delete set null,
  overridden boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists idx_lead_duplicate_flags_org_phone
  on public.lead_duplicate_flags(organization_id, phone);

alter table public.lead_duplicate_flags enable row level security;

drop policy if exists "lead_duplicate_flags_select" on public.lead_duplicate_flags;
create policy "lead_duplicate_flags_select" on public.lead_duplicate_flags for select to authenticated
  using (organization_id = public.current_user_org_id());
drop policy if exists "lead_duplicate_flags_insert" on public.lead_duplicate_flags;
create policy "lead_duplicate_flags_insert" on public.lead_duplicate_flags for insert to authenticated
  with check (organization_id = public.current_user_org_id());

/* ------------------------------------------------------------------ */
/* Module 5: Telephony (OnlinePBX) & SMS                                */
/* ------------------------------------------------------------------ */

-- Same "RLS enabled, zero client policies" shape as amocrm_connection /
-- org_external_api_tokens -- OnlinePBX's API key/secret are read and
-- written exclusively by service-role server routes, never by the browser.
create table if not exists public.org_telephony_credentials (
  organization_id uuid primary key references public.organizations(id) on delete cascade,
  provider text not null default 'onlinepbx',
  api_key text,
  api_secret text,
  pbx_domain text,
  caller_id text,
  sms_sender_name text,
  connected_by uuid references public.profiles(id) on delete set null,
  connected_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.org_telephony_credentials enable row level security;

-- Click-to-call attempts and their outcome, correlated to OnlinePBX's own
-- call id so its status-change webhook can update the same row instead of
-- creating a new one.
create table if not exists public.pbx_calls (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  lead_id uuid references public.leads(id) on delete set null,
  contact_id uuid references public.contacts(id) on delete set null,
  initiated_by uuid references public.profiles(id) on delete set null,
  direction text not null default 'outgoing' check (direction in ('outgoing', 'incoming')),
  from_number text,
  to_number text not null,
  external_call_id text,
  status text not null default 'initiated'
    check (status in ('initiated', 'ringing', 'answered', 'completed', 'failed', 'no_answer')),
  duration_seconds int not null default 0,
  recording_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_pbx_calls_org_created on public.pbx_calls(organization_id, created_at desc);
create index if not exists idx_pbx_calls_external_id
  on public.pbx_calls(external_call_id) where external_call_id is not null;

alter table public.pbx_calls enable row level security;

drop policy if exists "pbx_calls_select" on public.pbx_calls;
create policy "pbx_calls_select" on public.pbx_calls for select to authenticated
  using (organization_id = public.current_user_org_id() and (initiated_by = auth.uid() or public.is_admin_or_manager()));
drop policy if exists "pbx_calls_insert" on public.pbx_calls;
create policy "pbx_calls_insert" on public.pbx_calls for insert to authenticated
  with check (organization_id = public.current_user_org_id() and initiated_by = auth.uid());
drop policy if exists "pbx_calls_update" on public.pbx_calls;
create policy "pbx_calls_update" on public.pbx_calls for update to authenticated
  using (organization_id = public.current_user_org_id() and (initiated_by = auth.uid() or public.is_admin_or_manager()));

create table if not exists public.sms_log (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  lead_id uuid references public.leads(id) on delete set null,
  contact_id uuid references public.contacts(id) on delete set null,
  sent_by uuid references public.profiles(id) on delete set null,
  to_number text not null,
  message text not null,
  status text not null default 'queued' check (status in ('queued', 'sent', 'delivered', 'failed')),
  external_message_id text,
  created_at timestamptz not null default now()
);

create index if not exists idx_sms_log_org_created on public.sms_log(organization_id, created_at desc);

alter table public.sms_log enable row level security;

drop policy if exists "sms_log_select" on public.sms_log;
create policy "sms_log_select" on public.sms_log for select to authenticated
  using (organization_id = public.current_user_org_id() and (sent_by = auth.uid() or public.is_admin_or_manager()));
drop policy if exists "sms_log_insert" on public.sms_log;
create policy "sms_log_insert" on public.sms_log for insert to authenticated
  with check (organization_id = public.current_user_org_id() and sent_by = auth.uid());

/* ------------------------------------------------------------------ */
/* Module 6: Lead Sources & incoming webhooks (Meta Lead Ads etc.)     */
/* ------------------------------------------------------------------ */

create table if not exists public.lead_sources (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  source_type text not null default 'webhook'
    check (source_type in ('webhook', 'meta_lead_ads', 'web_form', 'manual')),
  -- the unguessable path segment for POST /api/leads/incoming/:webhook_token --
  -- this endpoint is hit by an external ad platform with no Supabase session,
  -- so the token itself (not a JWT) is what identifies the org and source.
  webhook_token text not null unique default encode(gen_random_bytes(20), 'hex'),
  default_pipeline_id uuid references public.pipelines(id) on delete set null,
  default_stage_id uuid references public.pipeline_stages(id) on delete set null,
  default_owner_id uuid references public.profiles(id) on delete set null,
  field_mapping jsonb not null default '{}'::jsonb,
  active boolean not null default true,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.lead_sources enable row level security;

drop policy if exists "lead_sources_select" on public.lead_sources;
create policy "lead_sources_select" on public.lead_sources for select to authenticated
  using (organization_id = public.current_user_org_id() and public.is_admin_or_manager());
drop policy if exists "lead_sources_write" on public.lead_sources;
create policy "lead_sources_write" on public.lead_sources for all to authenticated
  using (organization_id = public.current_user_org_id() and public.is_admin_or_manager())
  with check (organization_id = public.current_user_org_id() and public.is_admin_or_manager());

-- Every hit on the incoming-lead webhook, successful or not -- the only
-- way to debug a marketing platform whose payload shape doesn't match
-- what field_mapping expects, without that being a silent black hole.
create table if not exists public.incoming_lead_log (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations(id) on delete cascade,
  lead_source_id uuid references public.lead_sources(id) on delete set null,
  payload jsonb not null,
  created_lead_id uuid references public.leads(id) on delete set null,
  status text not null default 'received'
    check (status in ('received', 'processed', 'duplicate', 'failed')),
  error text,
  created_at timestamptz not null default now()
);

create index if not exists idx_incoming_lead_log_org_created
  on public.incoming_lead_log(organization_id, created_at desc);

alter table public.incoming_lead_log enable row level security;

drop policy if exists "incoming_lead_log_select" on public.incoming_lead_log;
create policy "incoming_lead_log_select" on public.incoming_lead_log for select to authenticated
  using (organization_id = public.current_user_org_id() and public.is_admin_or_manager());
-- No insert/update policy: every row is written by the webhook route
-- itself via the service-role key, since the caller (Meta, Zapier, ...)
-- never carries a Supabase session.

/* ------------------------------------------------------------------ */
/* Module 7: The platform's own embeddable Web Forms                   */
/* ------------------------------------------------------------------ */

create table if not exists public.web_forms (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  -- the public path segment for the hosted form page (salesiq.uz/f/:slug)
  -- and for POST /api/forms/:slug/submit.
  slug text not null unique default encode(gen_random_bytes(6), 'hex'),
  fields jsonb not null default '[]'::jsonb,
  default_pipeline_id uuid references public.pipelines(id) on delete set null,
  default_stage_id uuid references public.pipeline_stages(id) on delete set null,
  default_owner_id uuid references public.profiles(id) on delete set null,
  success_message text,
  active boolean not null default true,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.web_forms enable row level security;

drop policy if exists "web_forms_select" on public.web_forms;
create policy "web_forms_select" on public.web_forms for select to authenticated
  using (organization_id = public.current_user_org_id() and public.is_admin_or_manager());
drop policy if exists "web_forms_write" on public.web_forms;
create policy "web_forms_write" on public.web_forms for all to authenticated
  using (organization_id = public.current_user_org_id() and public.is_admin_or_manager())
  with check (organization_id = public.current_user_org_id() and public.is_admin_or_manager());
-- The public form page itself is rendered by a server route keyed on
-- `slug` via the service-role key (visitors have no Supabase session
-- either), so this table needs no public-facing RLS policy.

create table if not exists public.web_form_submissions (
  id uuid primary key default gen_random_uuid(),
  form_id uuid not null references public.web_forms(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  data jsonb not null,
  created_lead_id uuid references public.leads(id) on delete set null,
  ip_address text,
  user_agent text,
  created_at timestamptz not null default now()
);

create index if not exists idx_web_form_submissions_form
  on public.web_form_submissions(form_id, created_at desc);

alter table public.web_form_submissions enable row level security;

drop policy if exists "web_form_submissions_select" on public.web_form_submissions;
create policy "web_form_submissions_select" on public.web_form_submissions for select to authenticated
  using (organization_id = public.current_user_org_id() and public.is_admin_or_manager());
-- No insert policy: rows are written exclusively by the public
-- form-submit route via the service-role key.

/* ------------------------------------------------------------------ */
/* Module 8: AI Auto-fill & Auto-tasks                                  */
/* ------------------------------------------------------------------ */
-- No new tables. This module is pure application logic wiring together
-- what already exists:
--   - the call-analysis pipeline's summary/next-step output writes a row
--     into lead_activities (type = 'ai_note') instead of a new "notes"
--     table;
--   - "book a task for the agreed follow-up time" creates a row in the
--     existing tasks table (already has lead_id, assignee_id, due_date);
--   - org_general_settings.ai_task_creation_enabled and
--     crm_task_forwarding_enabled (already in the schema) are the on/off
--     switches the admin panel needs -- nothing new to add here either.
