-- Marketing paneli: loyihalar, arxiv, efir screenshotlari, Telegram akkaunt
-- va Meta reklama kabineti.
--   marketing_projects      a company's projects (a course, a launch): the CRM
--                           funnels and UTM campaign names whose leads are its
--   marketing_shots         proof pictures of a live webinar: a frame (YouTube /
--                           Telegram) or, when no frame could be taken, a card
--                           with the time and the viewer count
--   marketing_tg_accounts   the Telegram account that reads live-stream viewer
--                           counts (session sealed by the server)
--   marketing_meta_accounts the Meta ad account connection (token sealed)
--   marketing_ad_spend      Meta spend per campaign per day
-- Channels and webinars get a project and an archive mark; a private channel
-- may have no @username (it is bound by the bot instead); viewer samples can
-- come from Telegram; finance entries can name a project. Nothing is deleted.

create table if not exists public.marketing_projects (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null check (length(btrim(name)) between 1 and 120),
  color text not null default 'sky' check (length(color) <= 20),
  funnels text[] not null default '{}',
  utm_campaigns text[] not null default '{}',
  note text check (note is null or length(note) <= 500),
  archived_at timestamptz,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists marketing_projects_org_idx
  on public.marketing_projects (organization_id, created_at);

-- Channels: project, purpose, private channels, live tracking, archive.
alter table public.marketing_channels
  add column if not exists project_id uuid references public.marketing_projects(id) on delete set null,
  add column if not exists purpose text not null default 'main',
  add column if not exists invite_link text,
  add column if not exists note text,
  add column if not exists track_live boolean not null default false,
  add column if not exists archived_at timestamptz;
alter table public.marketing_channels alter column username drop not null;
alter table public.marketing_channels drop constraint if exists marketing_channels_username_check;
alter table public.marketing_channels add constraint marketing_channels_username_check
  check (username is null or username ~ '^[A-Za-z][A-Za-z0-9_]{3,31}$');
alter table public.marketing_channels drop constraint if exists marketing_channels_identity_check;
alter table public.marketing_channels add constraint marketing_channels_identity_check
  check (username is not null or chat_id is not null);
alter table public.marketing_channels drop constraint if exists marketing_channels_purpose_check;
alter table public.marketing_channels add constraint marketing_channels_purpose_check
  check (purpose in ('main', 'ads', 'webinar'));
alter table public.marketing_channels drop constraint if exists marketing_channels_text_check;
alter table public.marketing_channels add constraint marketing_channels_text_check
  check ((invite_link is null or length(invite_link) <= 200) and (note is null or length(note) <= 500));
create unique index if not exists marketing_channels_org_chat_key
  on public.marketing_channels (organization_id, chat_id) where chat_id is not null;

-- Webinars: project, archive, the Telegram channel it streams in.
alter table public.marketing_webinars
  add column if not exists project_id uuid references public.marketing_projects(id) on delete set null,
  add column if not exists archived_at timestamptz,
  add column if not exists auto_created boolean not null default false,
  add column if not exists shot_at timestamptz;

-- Viewer samples may come from the Telegram account.
alter table public.marketing_webinar_samples drop constraint if exists marketing_webinar_samples_source_check;
alter table public.marketing_webinar_samples add constraint marketing_webinar_samples_source_check
  check (source in ('youtube', 'manual', 'telegram'));

create table if not exists public.marketing_shots (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  project_id uuid references public.marketing_projects(id) on delete set null,
  webinar_id uuid references public.marketing_webinars(id) on delete cascade,
  channel_id uuid references public.marketing_channels(id) on delete set null,
  at timestamptz not null default now(),
  viewers integer check (viewers is null or viewers >= 0),
  path text check (path is null or length(path) <= 300),
  source text not null default 'manual' check (source in ('youtube', 'telegram', 'manual')),
  kind text not null default 'frame' check (kind in ('frame', 'card')),
  created_by uuid references public.profiles(id) on delete set null
);
create index if not exists marketing_shots_webinar_idx
  on public.marketing_shots (webinar_id, at);
create index if not exists marketing_shots_project_idx
  on public.marketing_shots (organization_id, project_id, at desc);

-- Server-only tables (sealed secrets): no browser policies; the panel reads
-- their status through the app's server routes.
create table if not exists public.marketing_tg_accounts (
  organization_id uuid primary key references public.organizations(id) on delete cascade,
  session_sealed text not null,
  phone_masked text,
  tg_user text,
  status text not null default 'ok' check (status in ('ok', 'error')),
  last_error text,
  connected_by uuid references public.profiles(id) on delete set null,
  connected_at timestamptz not null default now()
);

create table if not exists public.marketing_meta_accounts (
  organization_id uuid primary key references public.organizations(id) on delete cascade,
  token_sealed text not null,
  expires_at timestamptz,
  meta_user text,
  ad_accounts jsonb not null default '[]',
  selected text[] not null default '{}',
  last_sync_at timestamptz,
  last_error text,
  connected_by uuid references public.profiles(id) on delete set null,
  connected_at timestamptz not null default now()
);

create table if not exists public.marketing_ad_spend (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  day date not null,
  source text not null default 'meta' check (source in ('meta')),
  account_id text not null,
  campaign_id text not null,
  campaign_name text not null default '',
  spend numeric(16, 2) not null default 0,
  currency text not null default 'USD',
  impressions bigint not null default 0,
  clicks bigint not null default 0,
  leads integer not null default 0,
  updated_at timestamptz not null default now(),
  primary key (organization_id, day, campaign_id)
);

-- Manual ad spend can name a project.
alter table public.finance_entries
  add column if not exists project_id uuid references public.marketing_projects(id) on delete set null;

do $$
declare
  t text;
begin
  foreach t in array array['marketing_projects', 'marketing_shots', 'marketing_ad_spend'] loop
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
  foreach t in array array['marketing_tg_accounts', 'marketing_meta_accounts'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
    execute format('grant all on public.%I to service_role', t);
  end loop;
end $$;

-- Live pages follow new projects and pictures.
do $$
declare
  t text;
begin
  foreach t in array array['marketing_projects', 'marketing_shots'] loop
    begin
      execute format('alter publication supabase_realtime add table public.%I', t);
    exception
      when duplicate_object then null;
      when undefined_object then raise notice 'supabase_realtime publication not found';
    end;
  end loop;
end $$;

notify pgrst, 'reload schema';
