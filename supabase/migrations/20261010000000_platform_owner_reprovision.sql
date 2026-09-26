-- Hardens the platform-owner bootstrap (20260918010000): previously, if a
-- profiles row already existed for this exact auth.users.id (e.g. because
-- the owner had earlier tried email/password sign-up under the same
-- Google account, or a prior sign-in attempt half-completed), the
-- `on conflict (id) do nothing` silently kept whatever role that row
-- already had -- the owner could sign in via Google forever and never
-- actually become platform_owner. Now the same is_owner_bootstrap check
-- that gates the fresh-insert case also re-provisions an existing row for
-- that id, so simply signing in again with Google self-heals it. This
-- does nothing for a DIFFERENT auth.users.id that already holds the
-- platform_owner role (is_owner_bootstrap is false in that case, same as
-- before) -- that's an existing-data question, not something a trigger
-- should silently override.
create or replace function public.handle_new_user()
returns trigger
language plpgsql security definer set search_path = public as $$
declare
  meta_role text := new.raw_user_meta_data ->> 'role';
  meta_org text := new.raw_user_meta_data ->> 'organization_id';
  is_owner_bootstrap boolean :=
    lower(new.email) = lower('umidbekramanov0427@gmail.com')
    and not exists (select 1 from public.profiles where role = 'platform_owner');
begin
  if not exists (select 1 from public.profiles where id = new.id)
     and nullif(meta_org, '') is null
     and not is_owner_bootstrap then
    raise exception 'SalesIQ: this account has not been set up by an administrator';
  end if;

  insert into public.profiles (id, email, full_name, role, organization_id)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'full_name', split_part(new.email, '@', 1)),
    case
      when is_owner_bootstrap then 'platform_owner'::public.app_role
      when meta_role in ('super_admin', 'rop', 'sotuv_menejeri') then meta_role::public.app_role
      else 'sotuv_menejeri'::public.app_role
    end,
    nullif(meta_org, '')::uuid
  )
  on conflict (id) do update
    set role = 'platform_owner'::public.app_role, organization_id = null
    where is_owner_bootstrap;
  return new;
end; $$;
