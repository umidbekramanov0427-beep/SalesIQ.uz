-- Marketing AI tahlilchi. Idempotent; nothing is deleted.
--
-- 1. One webinar runs on YouTube and in a Telegram live at the same time:
--    viewer samples are kept per source (the primary key gains `source`, so
--    a YouTube and a Telegram count in the same minute no longer overwrite
--    each other), the peak per source and in total is stored, and the
--    Telegram frames keep their own timer (tg_shot_at).
-- 2. Webinar events: the stream's own moments (YouTube / Telegram live on,
--    SMS sent, course presentation, timer 1/2/3) next to the old ones
--    (intro, lesson, price = tariffs, offer, qa, custom); a number for
--    repeated ones (timer 2, SMS 3), automatic / AI-guessed / confirmed
--    flags and details (how many SMS went out). A webinar's scenario (plan)
--    and reusable scenario templates.
-- 3. AI settings per company (provider, model, the company's own key sealed
--    on the server, daily/monthly limits, how often), every AI call's tokens
--    and cost, cached analyses, the recommendations being tracked, and the
--    marketing chat. The AI tables are server-only: the browser goes through
--    /marketing-ai/* routes.
-- 4. A lead's qualification as the owner defined it: a qualified lead
--    answered the phone AND watched the webinar (marked by the manager, by
--    the client's "Men efirdaman" bot button, or by the AI from the call);
--    a lead that is not qualified carries why (wrong number, no number, did
--    not answer, did not watch, other).

-- 1
alter table public.marketing_webinar_samples
  drop constraint if exists marketing_webinar_samples_pkey;
alter table public.marketing_webinar_samples
  add constraint marketing_webinar_samples_pkey primary key (webinar_id, at, source);

alter table public.marketing_webinars
  add column if not exists peak_youtube integer,
  add column if not exists peak_telegram integer,
  add column if not exists peak_total integer,
  add column if not exists peak_at timestamptz,
  add column if not exists tg_shot_at timestamptz,
  add column if not exists plan jsonb;

-- 2
alter table public.marketing_webinar_marks
  drop constraint if exists marketing_webinar_marks_kind_check;
alter table public.marketing_webinar_marks
  add constraint marketing_webinar_marks_kind_check check (kind in (
    'intro', 'lesson', 'price', 'offer', 'qa', 'custom',
    'yt_live_on', 'tg_live_on', 'sms_sent', 'presentation', 'timer'
  ));

alter table public.marketing_webinar_marks
  add column if not exists seq smallint check (seq is null or seq between 1 and 50),
  add column if not exists auto boolean not null default false,
  add column if not exists ai_guess boolean not null default false,
  add column if not exists confirmed boolean not null default true,
  add column if not exists meta jsonb,
  add column if not exists shot_id uuid references public.marketing_shots(id) on delete set null;

create index if not exists marketing_webinar_marks_webinar_idx
  on public.marketing_webinar_marks (webinar_id, at);

create table if not exists public.marketing_webinar_templates (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null check (length(btrim(name)) between 1 and 120),
  plan jsonb not null default '[]'::jsonb,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

alter table public.marketing_webinar_templates enable row level security;
drop policy if exists marketing_webinar_templates_rw on public.marketing_webinar_templates;
create policy marketing_webinar_templates_rw on public.marketing_webinar_templates
  for all to authenticated
  using (organization_id = public.current_user_org_id() and public.can_use_marketing())
  with check (organization_id = public.current_user_org_id() and public.can_use_marketing());
grant select, insert, update, delete on public.marketing_webinar_templates to authenticated;
grant all on public.marketing_webinar_templates to service_role;

-- 3
create table if not exists public.marketing_ai_settings (
  organization_id uuid primary key references public.organizations(id) on delete cascade,
  enabled boolean not null default true,
  provider text not null default 'gemini' check (provider in ('gemini', 'anthropic', 'openai')),
  model text check (model is null or length(model) <= 80),
  key_sealed text,
  key_last4 text check (key_last4 is null or length(key_last4) <= 4),
  daily_limit_usd numeric(10, 2) check (daily_limit_usd is null or daily_limit_usd >= 0),
  monthly_limit_usd numeric(10, 2) check (monthly_limit_usd is null or monthly_limit_usd >= 0),
  frequency text not null default 'manual' check (frequency in ('manual', 'daily', 'after_webinar')),
  last_auto_at timestamptz,
  updated_by uuid references public.profiles(id) on delete set null,
  updated_at timestamptz not null default now()
);

create table if not exists public.marketing_ai_usage (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  at timestamptz not null default now(),
  feature text not null check (feature in ('analysis', 'chat', 'forecast', 'webinar', 'vision')),
  provider text not null,
  model text not null,
  input_tokens integer not null default 0,
  output_tokens integer not null default 0,
  cost_usd numeric(12, 6) not null default 0,
  cached boolean not null default false,
  ok boolean not null default true,
  error text check (error is null or length(error) <= 500),
  profile_id uuid references public.profiles(id) on delete set null
);
create index if not exists marketing_ai_usage_org_at_idx
  on public.marketing_ai_usage (organization_id, at desc);

create table if not exists public.marketing_ai_runs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  kind text not null check (kind in ('analysis', 'forecast', 'webinar')),
  input_hash text not null,
  scope jsonb not null default '{}'::jsonb,
  period_from date,
  period_to date,
  result jsonb not null,
  provider text,
  model text,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (organization_id, kind, input_hash)
);
create index if not exists marketing_ai_runs_org_idx
  on public.marketing_ai_runs (organization_id, kind, created_at desc);

create table if not exists public.marketing_ai_recommendations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  title text not null check (length(btrim(title)) between 1 and 300),
  problem text check (problem is null or length(problem) <= 2000),
  priority text not null default 'warning' check (priority in ('critical', 'warning', 'opportunity')),
  status text not null default 'new' check (status in ('new', 'in_progress', 'done', 'rejected')),
  assignee_id uuid references public.profiles(id) on delete set null,
  metric_key text check (metric_key is null or length(metric_key) <= 60),
  metric_before numeric,
  metric_after numeric,
  measured_at timestamptz,
  scope jsonb not null default '{}'::jsonb,
  run_id uuid references public.marketing_ai_runs(id) on delete set null,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  done_at timestamptz
);
create index if not exists marketing_ai_recommendations_org_idx
  on public.marketing_ai_recommendations (organization_id, created_at desc);

create table if not exists public.marketing_ai_chats (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  title text not null default '' check (length(title) <= 200),
  scope jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists marketing_ai_chats_owner_idx
  on public.marketing_ai_chats (organization_id, profile_id, updated_at desc);

create table if not exists public.marketing_ai_chat_messages (
  id uuid primary key default gen_random_uuid(),
  chat_id uuid not null references public.marketing_ai_chats(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  role text not null check (role in ('user', 'assistant')),
  content text not null check (length(content) <= 20000),
  meta jsonb,
  created_at timestamptz not null default now()
);
create index if not exists marketing_ai_chat_messages_chat_idx
  on public.marketing_ai_chat_messages (chat_id, created_at);

-- 4
alter table public.leads
  add column if not exists webinar_watched boolean,
  add column if not exists webinar_watched_source text,
  add column if not exists webinar_watched_at timestamptz,
  add column if not exists webinar_id uuid references public.marketing_webinars(id) on delete set null,
  add column if not exists qual_status text,
  add column if not exists not_qual_reason text;

alter table public.leads drop constraint if exists leads_webinar_watched_source_check;
alter table public.leads add constraint leads_webinar_watched_source_check
  check (webinar_watched_source is null or webinar_watched_source in ('manager', 'bot', 'ai'));
alter table public.leads drop constraint if exists leads_qual_status_check;
alter table public.leads add constraint leads_qual_status_check
  check (qual_status is null or qual_status in ('qualified', 'not_qualified'));
alter table public.leads drop constraint if exists leads_not_qual_reason_check;
alter table public.leads add constraint leads_not_qual_reason_check
  check (not_qual_reason is null or not_qual_reason in
    ('wrong_number', 'no_number', 'no_answer', 'no_webinar', 'other'));

create index if not exists leads_webinar_idx on public.leads (webinar_id) where webinar_id is not null;

do $$
declare
  t text;
begin
  foreach t in array array[
    'marketing_ai_settings', 'marketing_ai_usage', 'marketing_ai_runs',
    'marketing_ai_recommendations', 'marketing_ai_chats', 'marketing_ai_chat_messages'
  ] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
    execute format('grant all on public.%I to service_role', t);
  end loop;
end $$;

notify pgrst, 'reload schema';
