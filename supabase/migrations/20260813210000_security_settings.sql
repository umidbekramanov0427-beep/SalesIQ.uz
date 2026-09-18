-- Security Center: per-org password policy + a 2FA-required flag. The flag
-- is stored and shown as real config an admin can toggle, but nothing in
-- the login flow enforces it yet (no TOTP enrollment exists) — labelled
-- honestly in the UI as "not yet enforced" rather than faking a working
-- 2FA gate. Password policy (min length + character requirements) IS
-- enforced for real, wired into admin/create-employee.
create table if not exists public.security_settings (
  organization_id uuid primary key references public.organizations(id) on delete cascade,
  min_password_length int not null default 8,
  require_number boolean not null default false,
  require_uppercase boolean not null default false,
  require_symbol boolean not null default false,
  two_factor_required boolean not null default false,
  updated_by uuid references public.profiles(id) on delete set null,
  updated_at timestamptz not null default now()
);

alter table public.security_settings enable row level security;

drop policy if exists "security_settings_select" on public.security_settings;
create policy "security_settings_select" on public.security_settings
  for select to authenticated
  using (organization_id = public.current_user_org_id() or public.is_platform_owner());

drop policy if exists "security_settings_write" on public.security_settings;
create policy "security_settings_write" on public.security_settings
  for all to authenticated
  using (
    organization_id = public.current_user_org_id()
    and public.current_user_role() = 'super_admin'
  )
  with check (
    organization_id = public.current_user_org_id()
    and public.current_user_role() = 'super_admin'
  );

drop trigger if exists set_updated_at on public.security_settings;
create trigger set_updated_at before update on public.security_settings
  for each row execute function public.set_updated_at();
