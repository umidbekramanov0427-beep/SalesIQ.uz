-- Full AI-driven onboarding flow: a Telegram interview about the org's
-- sales process, an AI-generated setup proposal (pipeline stages + lead
-- quality stages), and admin one-click apply -- plus a generic historical
-- data import used both to bootstrap analysis and as the "migrate from
-- another CRM" cutover path (a CSV/Excel upload works for any source
-- system, unlike building a dedicated connector per competitor CRM).
create table if not exists public.org_ai_onboarding (
  organization_id uuid primary key references public.organizations(id) on delete cascade,
  status text not null default 'not_started',
  source_crm text,
  current_step int not null default 0,
  answers jsonb not null default '{}'::jsonb,
  proposal jsonb,
  telegram_chat_id bigint,
  started_by uuid references public.profiles(id) on delete set null,
  started_at timestamptz,
  proposal_generated_at timestamptz,
  applied_at timestamptz,
  applied_by uuid references public.profiles(id) on delete set null,
  updated_at timestamptz not null default now()
);

alter table public.org_ai_onboarding enable row level security;

drop policy if exists "org_ai_onboarding_select" on public.org_ai_onboarding;
create policy "org_ai_onboarding_select" on public.org_ai_onboarding
  for select to authenticated
  using (
    (organization_id = public.current_user_org_id() and public.is_admin_or_manager())
    or public.is_platform_owner()
  );

drop policy if exists "org_ai_onboarding_write" on public.org_ai_onboarding;
create policy "org_ai_onboarding_write" on public.org_ai_onboarding
  for all to authenticated
  using (
    (organization_id = public.current_user_org_id() and public.is_admin_or_manager())
    or public.is_platform_owner()
  )
  with check (
    (organization_id = public.current_user_org_id() and public.is_admin_or_manager())
    or public.is_platform_owner()
  );

drop trigger if exists set_updated_at on public.org_ai_onboarding;
create trigger set_updated_at before update on public.org_ai_onboarding
  for each row execute function public.set_updated_at();

-- Historical data import: one row per uploaded file, whether it's used to
-- bootstrap the AI proposal with real numbers or as the actual cutover
-- import from a previous CRM.
create table if not exists public.org_data_imports (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  source_label text not null,
  status text not null default 'pending',
  row_count int,
  imported_leads int not null default 0,
  imported_contacts int not null default 0,
  imported_deals int not null default 0,
  column_mapping jsonb,
  error text,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  finished_at timestamptz
);

create index if not exists org_data_imports_org_idx
  on public.org_data_imports (organization_id, created_at desc);

alter table public.org_data_imports enable row level security;

drop policy if exists "org_data_imports_select" on public.org_data_imports;
create policy "org_data_imports_select" on public.org_data_imports
  for select to authenticated
  using (
    (organization_id = public.current_user_org_id() and public.is_admin_or_manager())
    or public.is_platform_owner()
  );

drop policy if exists "org_data_imports_write" on public.org_data_imports;
create policy "org_data_imports_write" on public.org_data_imports
  for all to authenticated
  using (
    (organization_id = public.current_user_org_id() and public.is_admin_or_manager())
    or public.is_platform_owner()
  )
  with check (
    (organization_id = public.current_user_org_id() and public.is_admin_or_manager())
    or public.is_platform_owner()
  );

-- A second Telegram conversation state, independent of
-- telegram_onboarding_step/telegram_onboarding_answers (the existing
-- business_profile / AI assistant personalization interview) -- the two
-- flows ask different questions for different purposes and must not
-- collide if both are ever mid-conversation for the same admin.
alter table public.profiles
  add column if not exists telegram_ai_setup_step int,
  add column if not exists telegram_ai_setup_answers jsonb;
