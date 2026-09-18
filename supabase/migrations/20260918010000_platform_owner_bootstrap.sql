-- Lets the platform owner's own account self-provision (via "Sign in with
-- Google" on the login page) as platform_owner -- no organization_id, and
-- bypassing the "an admin must have provisioned this account first" check
-- added by block_unprovisioned_oauth_signup.sql -- so the very first
-- account on a fresh database can be created from the app itself, without
-- ever touching Supabase's own Authentication dashboard. Every company
-- after that is onboarded from the Platform panel (Kompaniyalar -> create
-- organization, which creates that company's first super_admin), never
-- here again.
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
  on conflict (id) do nothing;
  return new;
end; $$;
