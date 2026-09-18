-- Wraps up the multi-tenant retrofit: fixes the two tables that don't fit
-- the plain organization_id pattern, teaches account creation about
-- organizations, guards role/org changes, and promotes the platform's
-- actual operator out of the default company into the platform_owner
-- role that sits above every company.

-- notification_preferences has no organization_id of its own (1:1 with
-- profiles) — scope its visibility via a same-organization profile join
-- instead of "any authenticated user can see anyone's prefs".
drop policy "notification_prefs_select_authenticated" on public.notification_preferences;
drop policy if exists "notification_prefs_select_same_org" on public.notification_preferences;
create policy "notification_prefs_select_same_org" on public.notification_preferences
  for select to authenticated
  using (
    profile_id = auth.uid()
    or exists (
      select 1 from public.profiles p
      where p.id = notification_preferences.profile_id
        and p.organization_id = public.current_user_org_id()
    )
  );

-- error_logs are technical/debugging records about the app itself, not a
-- company's business data — visible to the platform owner only, not to
-- every company's admins.
drop policy "error_logs_select" on public.error_logs;
drop policy "error_logs_update" on public.error_logs;
drop policy if exists "error_logs_select" on public.error_logs;
create policy "error_logs_select" on public.error_logs for select to authenticated
  using (public.is_platform_owner());
drop policy if exists "error_logs_update" on public.error_logs;
create policy "error_logs_update" on public.error_logs for update to authenticated
  using (public.is_platform_owner());

-- New accounts (both "add employee" and "create organization + its first
-- admin") now pass role + organization_id explicitly via user_metadata —
-- read them here instead of hardcoding a first-user/admin-email special
-- case, which no longer makes sense once there's more than one company.
create or replace function public.handle_new_user()
returns trigger
language plpgsql security definer set search_path = public as $$
declare
  meta_role text := new.raw_user_meta_data ->> 'role';
  meta_org text := new.raw_user_meta_data ->> 'organization_id';
begin
  insert into public.profiles (id, email, full_name, role, organization_id)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'full_name', split_part(new.email, '@', 1)),
    case
      when meta_role in ('super_admin', 'manager', 'rep') then meta_role::public.app_role
      else 'rep'::public.app_role
    end,
    nullif(meta_org, '')::uuid
  )
  on conflict (id) do nothing;
  return new;
end; $$;

-- platform_owner can never be granted/revoked from the app (only by a
-- direct database change, done once below for the real operator), and a
-- profile's organization can never be reassigned from the app either —
-- both would otherwise be reachable through profiles_update_self_or_admin
-- since it lets a user update their own row.
create or replace function public.prevent_role_self_escalation()
returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.role is distinct from old.role then
    if new.role = 'platform_owner' or old.role = 'platform_owner' then
      raise exception 'platform_owner role cannot be changed from the app';
    end if;
    if public.current_user_role() is distinct from 'super_admin'::public.app_role then
      raise exception 'Only a super_admin can change a profile role';
    end if;
  end if;
  if new.organization_id is distinct from old.organization_id and not public.is_platform_owner() then
    raise exception 'organization_id cannot be changed from the app';
  end if;
  return new;
end; $$;

-- Promote the platform's real operator out of the default company and
-- into the platform_owner role. Trigger disabled for this one statement
-- since it's applied directly (no auth.uid() session, so the trigger's
-- own super_admin check would otherwise reject it).
alter table public.profiles disable trigger guard_role_escalation;
update public.profiles
set role = 'platform_owner', organization_id = null
where lower(email) = 'umidbekramanov0427@gmail.com';
alter table public.profiles enable trigger guard_role_escalation;
