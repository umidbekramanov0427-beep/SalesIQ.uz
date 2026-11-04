-- Owner → E'lonlar: messages and banners the platform owner sends to the
-- companies (an update, a late payment, news, a reminder, a warning).
--
-- platform_announcements          one announcement: what it says, how it
--                                 looks, who sees it (every company, those on
--                                 trial / paid / expired, or chosen ones) and
--                                 when; optionally also sent to the company
--                                 owners' Telegram.
-- platform_announcement_dismissals who closed a dismissible banner.
--
-- Both are read and written only through the server (the owner's API and
-- /announcements/active for a company member), so RLS is on with no
-- policies for signed-in users.

create table if not exists public.platform_announcements (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(title) between 1 and 160),
  body text not null default '' check (char_length(body) <= 2000),
  kind text not null default 'news'
    check (kind in ('update', 'payment', 'news', 'reminder', 'warning')),
  audience text not null default 'all'
    check (audience in ('all', 'trial', 'paid', 'expired', 'orgs')),
  org_ids uuid[] not null default '{}',
  link_url text check (link_url is null or char_length(link_url) <= 500),
  link_label text check (link_label is null or char_length(link_label) <= 60),
  dismissible boolean not null default true,
  starts_at timestamptz not null default now(),
  ends_at timestamptz,
  active boolean not null default true,
  telegram_sent_at timestamptz,
  telegram_sent_count integer not null default 0,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists platform_announcements_live
  on public.platform_announcements (active, starts_at desc);

create table if not exists public.platform_announcement_dismissals (
  announcement_id uuid not null references public.platform_announcements(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (announcement_id, user_id)
);

alter table public.platform_announcements enable row level security;
alter table public.platform_announcement_dismissals enable row level security;

revoke all on public.platform_announcements from anon, authenticated;
revoke all on public.platform_announcement_dismissals from anon, authenticated;
grant all on public.platform_announcements to service_role;
grant all on public.platform_announcement_dismissals to service_role;
