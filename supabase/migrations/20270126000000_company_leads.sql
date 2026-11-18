-- Owner -> Arizalar becomes the platform's own small CRM of companies.
--
-- 1. platform_applications: a company lead. New stages
--      new (Yangi lid) -> taken (Ishga olindi) -> informed (Ma'lumot berildi)
--      -> meeting (Suhbat belgilandi) -> contract (Shartnoma qilindi)
--      -> installed (Platforma o'rnatildi), and lost (Yo'qotildi);
--    the plan chosen at sign-up, the three sign-up questions, the booked
--    call, why it was lost, who handles it.
--    Old statuses are renamed: contacted -> taken, demo -> meeting,
--    won -> installed.
-- 2. platform_application_notes: problems ("issue") with when and how they
--    were solved, calls and meetings in the timeline.
-- 3. platform_lead_tasks: the owner's tasks and reminders about a company --
--    for the owner, for the company's admins, or both; sent by Telegram and
--    inside the platform when due (notified_at = sent once).
-- 4. support_threads: the owner's inbox state per company (open/closed,
--    read up to, who answers).
-- 5. platform_settings: when calls can be booked, quick support answers.
-- Server-only tables (RLS on, no policies). Idempotent.

-- 1
alter table public.platform_applications
  add column if not exists plan text,
  add column if not exists business text check (business is null or char_length(business) <= 300),
  add column if not exists sales_reps text check (sales_reps is null or char_length(sales_reps) <= 20),
  add column if not exists current_tool text check (current_tool is null or char_length(current_tool) <= 120),
  add column if not exists meeting_at timestamptz,
  add column if not exists meeting_note text check (meeting_note is null or char_length(meeting_note) <= 500),
  add column if not exists lost_reason text check (lost_reason is null or char_length(lost_reason) <= 500),
  add column if not exists assigned_to uuid references public.profiles(id) on delete set null,
  add column if not exists stage_changed_at timestamptz not null default now(),
  add column if not exists last_activity_at timestamptz not null default now();

alter table public.platform_applications
  drop constraint if exists platform_applications_status_check;

update public.platform_applications
   set status = case status
                  when 'contacted' then 'taken'
                  when 'demo' then 'meeting'
                  when 'won' then 'installed'
                end
 where status in ('contacted', 'demo', 'won');

alter table public.platform_applications
  add constraint platform_applications_status_check
  check (status in ('new', 'taken', 'informed', 'meeting', 'contract', 'installed', 'lost'));

-- One call per time slot (a lost lead frees its slot).
create unique index if not exists platform_applications_meeting_slot
  on public.platform_applications (meeting_at)
  where meeting_at is not null and status <> 'lost';

create index if not exists platform_applications_org
  on public.platform_applications (organization_id);

-- 2
alter table public.platform_application_notes
  add column if not exists resolved_at timestamptz,
  add column if not exists resolution text check (resolution is null or char_length(resolution) <= 2000);

alter table public.platform_application_notes
  drop constraint if exists platform_application_notes_kind_check;
alter table public.platform_application_notes
  add constraint platform_application_notes_kind_check
  check (kind in ('note', 'receipt', 'document', 'file', 'status', 'issue', 'call', 'meeting'));

-- 3
create table if not exists public.platform_lead_tasks (
  id uuid primary key default gen_random_uuid(),
  application_id uuid references public.platform_applications(id) on delete cascade,
  organization_id uuid references public.organizations(id) on delete cascade,
  title text not null check (char_length(title) between 1 and 300),
  body text not null default '' check (char_length(body) <= 2000),
  due_at timestamptz,
  audience text not null default 'owner' check (audience in ('owner', 'company', 'both')),
  done_at timestamptz,
  done_by uuid references public.profiles(id) on delete set null,
  notified_at timestamptz,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  check (application_id is not null or organization_id is not null)
);

create index if not exists platform_lead_tasks_app
  on public.platform_lead_tasks (application_id, created_at desc);
create index if not exists platform_lead_tasks_org
  on public.platform_lead_tasks (organization_id, created_at desc);
create index if not exists platform_lead_tasks_due
  on public.platform_lead_tasks (due_at)
  where done_at is null and notified_at is null;

alter table public.platform_lead_tasks enable row level security;
revoke all on public.platform_lead_tasks from anon, authenticated;
grant all on public.platform_lead_tasks to service_role;

-- 4
create table if not exists public.support_threads (
  organization_id uuid primary key references public.organizations(id) on delete cascade,
  status text not null default 'open' check (status in ('open', 'closed')),
  owner_read_at timestamptz,
  assigned_to uuid references public.profiles(id) on delete set null,
  updated_at timestamptz not null default now()
);

alter table public.support_threads enable row level security;
revoke all on public.support_threads from anon, authenticated;
grant all on public.support_threads to service_role;

-- 5
alter table public.platform_settings
  add column if not exists meeting_settings jsonb not null default '{}'::jsonb,
  add column if not exists support_templates jsonb not null default '[]'::jsonb;

notify pgrst, 'reload schema';
