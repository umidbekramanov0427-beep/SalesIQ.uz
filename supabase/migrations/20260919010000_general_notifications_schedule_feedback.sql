-- Backs the four newly-added Settings sections (Umumiy / Bildirishnomalar /
-- Ish jadvali / Muammo haqida xabar berish) with real, per-organization data
-- instead of "Tez orada" stubs.
--
-- org_general_settings: account-level fields not already covered by
-- business_profile (which is AI-context, not account config) -- industry,
-- the org's fixed "business language" (chosen once, then locked -- enforced
-- both client-side and by the trigger below), timezone, and the two
-- workflow toggles shown in the reference screen.
create table if not exists public.org_general_settings (
  organization_id uuid primary key references public.organizations(id) on delete cascade,
  industry text not null default '',
  business_language text,
  timezone text not null default 'Asia/Tashkent',
  crm_task_forwarding_enabled boolean not null default true,
  ai_task_creation_enabled boolean not null default false,
  updated_by uuid references public.profiles(id) on delete set null,
  updated_at timestamptz not null default now()
);

-- Once an org has chosen its business_language, a later update can't
-- change it -- mirrors the UI copy ("bir marta tanlaysiz, keyin
-- o'zgartirib bo'lmaydi") as a real server-side guarantee, not just a
-- disabled dropdown.
create or replace function public.lock_business_language()
returns trigger
language plpgsql
as $$
begin
  if old.business_language is not null then
    new.business_language := old.business_language;
  end if;
  return new;
end;
$$;

drop trigger if exists lock_business_language on public.org_general_settings;
create trigger lock_business_language before update on public.org_general_settings
  for each row execute function public.lock_business_language();

-- org_work_schedule: working hours + alert toggle shown on the "Ish
-- jadvali" page. work_days uses ISO weekday numbers (1 = Monday .. 7 =
-- Sunday) so it sorts/compares naturally without a lookup table.
create table if not exists public.org_work_schedule (
  organization_id uuid primary key references public.organizations(id) on delete cascade,
  alerts_enabled boolean not null default true,
  start_time time not null default '09:00',
  end_time time not null default '18:00',
  work_days smallint[] not null default '{1,2,3,4,5}',
  manager_specific_schedule boolean not null default false,
  updated_by uuid references public.profiles(id) on delete set null,
  updated_at timestamptz not null default now()
);

-- feedback_reports: free-text submissions from "Muammo haqida xabar
-- berish". Every org member may send one; only admins (and the platform
-- owner, across every org) can read the inbox.
create table if not exists public.feedback_reports (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid references public.profiles(id) on delete set null,
  message text not null,
  created_at timestamptz not null default now()
);

create index if not exists feedback_reports_org_idx
  on public.feedback_reports (organization_id, created_at desc);

-- org_notification_settings: which alert types are generated and which
-- channels (Veb / Telegram bot / Telegram guruh / Telegram kanal) each one
-- is routed to, plus the nested low-call-quality sub-settings. Kunlik
-- hisobotlar has no "Veb" column -- there's no in-app notification for it,
-- only Telegram, matching the reference screen's disabled dash.
create table if not exists public.org_notification_settings (
  organization_id uuid primary key references public.organizations(id) on delete cascade,
  performance_web boolean not null default true,
  performance_bot boolean not null default true,
  performance_group boolean not null default false,
  performance_channel boolean not null default false,
  technical_web boolean not null default true,
  technical_bot boolean not null default true,
  technical_group boolean not null default false,
  technical_channel boolean not null default false,
  daily_report_bot boolean not null default true,
  daily_report_group boolean not null default false,
  daily_report_channel boolean not null default false,
  call_analysis_web boolean not null default true,
  call_analysis_bot boolean not null default true,
  call_analysis_group boolean not null default false,
  call_analysis_channel boolean not null default false,
  low_quality_alert_enabled boolean not null default false,
  quality_threshold smallint not null default 30,
  min_call_duration_minutes smallint not null default 5,
  updated_by uuid references public.profiles(id) on delete set null,
  updated_at timestamptz not null default now()
);

-- telegram_bind_codes: one-time, short-lived code an admin generates from
-- the "Manzilni ulash" button and pastes into a Telegram group/channel as
-- `/bind <code>` -- same shape as profiles.telegram_link_code, but scoped
-- to the organization instead of a single user, since a group/channel
-- isn't "owned" by any one person.
create table if not exists public.telegram_bind_codes (
  organization_id uuid primary key references public.organizations(id) on delete cascade,
  code text not null unique,
  created_by uuid references public.profiles(id) on delete set null,
  expires_at timestamptz not null
);

-- telegram_bound_chats: the groups/channels an org has actually connected,
-- once the webhook sees a valid /bind command in them.
create table if not exists public.telegram_bound_chats (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  chat_id bigint not null,
  chat_type text not null check (chat_type in ('group', 'channel')),
  title text,
  bound_by uuid references public.profiles(id) on delete set null,
  bound_at timestamptz not null default now(),
  unique (organization_id, chat_id)
);

alter table public.org_general_settings enable row level security;
alter table public.org_work_schedule enable row level security;
alter table public.feedback_reports enable row level security;
alter table public.org_notification_settings enable row level security;
alter table public.telegram_bind_codes enable row level security;
alter table public.telegram_bound_chats enable row level security;

drop trigger if exists set_updated_at on public.org_general_settings;
create trigger set_updated_at before update on public.org_general_settings
  for each row execute function public.set_updated_at();
drop trigger if exists set_updated_at on public.org_work_schedule;
create trigger set_updated_at before update on public.org_work_schedule
  for each row execute function public.set_updated_at();
drop trigger if exists set_updated_at on public.org_notification_settings;
create trigger set_updated_at before update on public.org_notification_settings
  for each row execute function public.set_updated_at();

drop policy if exists "org_general_settings_select" on public.org_general_settings;
create policy "org_general_settings_select" on public.org_general_settings
  for select to authenticated
  using (organization_id = public.current_user_org_id() or public.is_platform_owner());
drop policy if exists "org_general_settings_write" on public.org_general_settings;
create policy "org_general_settings_write" on public.org_general_settings
  for all to authenticated
  using (organization_id = public.current_user_org_id() and public.is_admin_or_manager())
  with check (organization_id = public.current_user_org_id() and public.is_admin_or_manager());

drop policy if exists "org_work_schedule_select" on public.org_work_schedule;
create policy "org_work_schedule_select" on public.org_work_schedule
  for select to authenticated
  using (organization_id = public.current_user_org_id() or public.is_platform_owner());
drop policy if exists "org_work_schedule_write" on public.org_work_schedule;
create policy "org_work_schedule_write" on public.org_work_schedule
  for all to authenticated
  using (organization_id = public.current_user_org_id() and public.is_admin_or_manager())
  with check (organization_id = public.current_user_org_id() and public.is_admin_or_manager());

drop policy if exists "feedback_reports_select" on public.feedback_reports;
create policy "feedback_reports_select" on public.feedback_reports
  for select to authenticated
  using (
    user_id = auth.uid()
    or (organization_id = public.current_user_org_id() and public.is_admin_or_manager())
    or public.is_platform_owner()
  );
drop policy if exists "feedback_reports_insert" on public.feedback_reports;
create policy "feedback_reports_insert" on public.feedback_reports
  for insert to authenticated
  with check (organization_id = public.current_user_org_id() and user_id = auth.uid());

drop policy if exists "org_notification_settings_select" on public.org_notification_settings;
create policy "org_notification_settings_select" on public.org_notification_settings
  for select to authenticated
  using (organization_id = public.current_user_org_id() or public.is_platform_owner());
drop policy if exists "org_notification_settings_write" on public.org_notification_settings;
create policy "org_notification_settings_write" on public.org_notification_settings
  for all to authenticated
  using (organization_id = public.current_user_org_id() and public.is_admin_or_manager())
  with check (organization_id = public.current_user_org_id() and public.is_admin_or_manager());

-- telegram_bind_codes has zero client-facing select policy on purpose --
-- the code is only ever handed back once, in the /telegram/link-group
-- response (service role), never re-read from the browser. Only the write
-- (generate) needs a policy... actually writes also only ever happen
-- through that same service-role route, so this table needs no
-- client-facing policy at all (RLS enabled, no policies = fully server-only,
-- same pattern as amocrm_connection originally used).

drop policy if exists "telegram_bound_chats_select" on public.telegram_bound_chats;
create policy "telegram_bound_chats_select" on public.telegram_bound_chats
  for select to authenticated
  using (organization_id = public.current_user_org_id() or public.is_platform_owner());
drop policy if exists "telegram_bound_chats_delete" on public.telegram_bound_chats;
create policy "telegram_bound_chats_delete" on public.telegram_bound_chats
  for delete to authenticated
  using (organization_id = public.current_user_org_id() and public.is_admin_or_manager());

-- Seed every existing organization with a default row per table.
insert into public.org_general_settings (organization_id, business_language)
select id, 'uz' from public.organizations o
where not exists (select 1 from public.org_general_settings s where s.organization_id = o.id);

insert into public.org_work_schedule (organization_id)
select id from public.organizations o
where not exists (select 1 from public.org_work_schedule s where s.organization_id = o.id);

insert into public.org_notification_settings (organization_id)
select id from public.organizations o
where not exists (select 1 from public.org_notification_settings s where s.organization_id = o.id);

-- Same for every future organization -- a standalone trigger (not folded
-- into seed_new_organization()) so this migration doesn't need to
-- reproduce that function's entire existing body to extend it.
create or replace function public.seed_org_settings_v2()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.org_general_settings (organization_id) values (new.id);
  insert into public.org_work_schedule (organization_id) values (new.id);
  insert into public.org_notification_settings (organization_id) values (new.id);
  return new;
end;
$$;

drop trigger if exists seed_org_settings_v2 on public.organizations;
create trigger seed_org_settings_v2 after insert on public.organizations
  for each row execute function public.seed_org_settings_v2();
