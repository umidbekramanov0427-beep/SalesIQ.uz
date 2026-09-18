-- A per-organization checklist for connecting AmoCRM, mirroring the
-- interactive onboarding checklist pattern from competitor research --
-- adapted to this platform's actual AmoCRM connection steps (there's no
-- AI-interview/calibration/proposal pipeline here, so this only covers
-- what genuinely needs to happen: creating the external integration,
-- connecting via OAuth, verifying pipelines/managers/calls, configuring
-- scoring). One row per organization; checked items are stored as a
-- {itemKey: true} map so toggling one item never needs to read the rest.
create table if not exists public.amocrm_onboarding_checklist (
  organization_id uuid primary key references public.organizations(id) on delete cascade,
  checked jsonb not null default '{}'::jsonb,
  updated_by uuid references public.profiles(id) on delete set null,
  updated_at timestamptz not null default now()
);

alter table public.amocrm_onboarding_checklist enable row level security;

drop policy if exists "amocrm_onboarding_checklist_select" on public.amocrm_onboarding_checklist;
create policy "amocrm_onboarding_checklist_select" on public.amocrm_onboarding_checklist
  for select to authenticated
  using (organization_id = public.current_user_org_id() or public.is_platform_owner());

drop policy if exists "amocrm_onboarding_checklist_write" on public.amocrm_onboarding_checklist;
create policy "amocrm_onboarding_checklist_write" on public.amocrm_onboarding_checklist
  for all to authenticated
  using (
    (organization_id = public.current_user_org_id() and public.is_admin_or_manager())
    or public.is_platform_owner()
  )
  with check (
    (organization_id = public.current_user_org_id() and public.is_admin_or_manager())
    or public.is_platform_owner()
  );

drop trigger if exists set_updated_at on public.amocrm_onboarding_checklist;
create trigger set_updated_at before update on public.amocrm_onboarding_checklist
  for each row execute function public.set_updated_at();
