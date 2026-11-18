-- Owner panel tools. Adds only; nothing is deleted. Idempotent.
--
-- 1. support_messages: a message may carry a file (photo, document, voice,
--    video) stored in the private lead-files bucket under
--    <org>/support/...; a message is text, a file, or both.
-- 2. support_threads.sla_alerted_at + platform_settings.support_sla_minutes:
--    the owners are told once when a company waits too long for an answer.
-- 3. platform_announcements.plans: an announcement for chosen plans only;
--    platform_announcement_views: who saw it (the owner's statistics).
-- 4. platform_owner_access: which owner-panel sections a platform owner
--    may open (null = all). Server-only.

-- 1
alter table public.support_messages
  add column if not exists file_path text,
  add column if not exists file_name text,
  add column if not exists file_type text,
  add column if not exists file_size integer,
  add column if not exists file_kind text;

alter table public.support_messages drop constraint if exists support_messages_text_check;
alter table public.support_messages drop constraint if exists support_messages_text_or_file;
alter table public.support_messages
  add constraint support_messages_text_or_file
  check (length(text) <= 4000 and (length(text) >= 1 or file_path is not null));

-- 2
alter table public.support_threads
  add column if not exists sla_alerted_at timestamptz;

alter table public.platform_settings
  add column if not exists support_sla_minutes integer not null default 30;

-- 3
alter table public.platform_announcements
  add column if not exists plans text[];

create table if not exists public.platform_announcement_views (
  announcement_id uuid not null references public.platform_announcements(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  organization_id uuid references public.organizations(id) on delete cascade,
  seen_at timestamptz not null default now(),
  primary key (announcement_id, user_id)
);

alter table public.platform_announcement_views enable row level security;
revoke all on public.platform_announcement_views from anon, authenticated;
grant all on public.platform_announcement_views to service_role;

-- 4
create table if not exists public.platform_owner_access (
  profile_id uuid primary key references public.profiles(id) on delete cascade,
  sections text[],
  updated_at timestamptz not null default now()
);

alter table public.platform_owner_access enable row level security;
revoke all on public.platform_owner_access from anon, authenticated;
grant all on public.platform_owner_access to service_role;

notify pgrst, 'reload schema';
