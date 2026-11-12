-- Marketing paneli -> Kanallar va Vebinarlar (src/lib/webinars.ts):
--   marketing_channels       a company's Telegram channels; the platform's
--                            bot reads the subscriber count every hour
--   marketing_channel_days   subscribers per day (last count, low, high)
--   marketing_webinars       a live webinar on YouTube (counted by itself
--                            through the YouTube API) or Telegram (typed in)
--   marketing_webinar_samples  viewers at a moment
--   marketing_webinar_marks  moments the host marked: intro, lesson, price...
-- Admins, marketologs and people given marketing access keep them. Adds
-- tables and one helper; nothing existing is changed.

create or replace function public.can_use_marketing()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and (p.role::text in ('super_admin', 'platform_owner', 'marketolog') or p.marketing_access)
  );
$$;
revoke all on function public.can_use_marketing() from public, anon;
grant execute on function public.can_use_marketing() to authenticated, service_role;

create table if not exists public.marketing_channels (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  title text not null default '',
  username text not null check (username ~ '^[A-Za-z][A-Za-z0-9_]{3,31}$'),
  chat_id bigint,
  members integer,
  members_checked_at timestamptz,
  last_error text,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (organization_id, username)
);

create table if not exists public.marketing_channel_days (
  channel_id uuid not null references public.marketing_channels(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  day date not null,
  members integer not null,
  min_members integer not null,
  max_members integer not null,
  primary key (channel_id, day)
);

create table if not exists public.marketing_webinars (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  title text not null check (length(btrim(title)) between 1 and 200),
  platform text not null default 'youtube' check (platform in ('youtube', 'telegram', 'other')),
  youtube_video_id text check (youtube_video_id is null or youtube_video_id ~ '^[A-Za-z0-9_-]{11}$'),
  channel_id uuid references public.marketing_channels(id) on delete set null,
  starts_at timestamptz,
  ended_at timestamptz,
  status text not null default 'planned' check (status in ('planned', 'live', 'ended')),
  registrations integer check (registrations is null or registrations >= 0),
  poll_error text,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.marketing_webinar_samples (
  webinar_id uuid not null references public.marketing_webinars(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  at timestamptz not null default now(),
  viewers integer not null check (viewers >= 0),
  source text not null default 'manual' check (source in ('youtube', 'manual')),
  primary key (webinar_id, at)
);

create table if not exists public.marketing_webinar_marks (
  id uuid primary key default gen_random_uuid(),
  webinar_id uuid not null references public.marketing_webinars(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  at timestamptz not null default now(),
  kind text not null default 'custom'
    check (kind in ('intro', 'lesson', 'price', 'offer', 'qa', 'custom')),
  label text check (label is null or length(label) <= 120)
);

create index if not exists marketing_webinars_live_idx
  on public.marketing_webinars (status) where status <> 'ended';

do $$
declare
  t text;
begin
  foreach t in array array[
    'marketing_channels', 'marketing_channel_days', 'marketing_webinars',
    'marketing_webinar_samples', 'marketing_webinar_marks'
  ] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists %I on public.%I', t || '_rw', t);
    execute format(
      'create policy %I on public.%I for all to authenticated
         using (organization_id = public.current_user_org_id() and public.can_use_marketing())
         with check (organization_id = public.current_user_org_id() and public.can_use_marketing())',
      t || '_rw', t
    );
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
    execute format('grant all on public.%I to service_role', t);
  end loop;
end $$;

notify pgrst, 'reload schema';
