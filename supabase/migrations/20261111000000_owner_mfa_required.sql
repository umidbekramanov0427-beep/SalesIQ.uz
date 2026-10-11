-- Two-step sign-in for platform-owner powers. Once a user has a verified
-- authenticator (auth.mfa_factors), a password-only session ("aal1") no
-- longer counts as that user's platform-owner role in RLS -- only a session
-- where the 6-digit code was entered ("aal2") does. So a leaked owner
-- password can't read other companies' data through the API. Users with no
-- authenticator are unaffected, and server-side writes (auth.uid() null)
-- never match a profile anyway. The app enforces the same rule in
-- src/lib/auth.server.ts and asks for the code in MfaGate.

create or replace function public.mfa_satisfied()
returns boolean
language sql
stable
security definer
set search_path = public, auth
as $$
  select coalesce(auth.jwt() ->> 'aal', 'aal1') = 'aal2'
      or not exists (
        select 1 from auth.mfa_factors f
        where f.user_id = auth.uid() and f.status = 'verified'
      );
$$;

create or replace function public.is_platform_owner()
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  select exists (
    select 1 from public.profiles where id = auth.uid() and role = 'platform_owner'
  ) and public.mfa_satisfied();
$$;

create or replace function public.current_user_role()
returns app_role
language sql
stable
security definer
set search_path to 'public'
as $$
  select case
    when p.role = 'platform_owner' and not public.mfa_satisfied() then null
    else p.role
  end
  from public.profiles p
  where p.id = auth.uid();
$$;
