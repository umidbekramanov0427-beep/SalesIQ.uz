-- block_unprovisioned_oauth_signup.sql (later layered with the platform-
-- owner bootstrap case in platform_owner_bootstrap.sql) assumed Supabase
-- always auto-links a new OAuth identity to an existing auth.users row
-- when the email matches one already used for email/password sign-in --
-- so the "unprovisioned" guard only ever fires for a genuinely new person.
-- That assumption doesn't hold here: an already-provisioned employee
-- clicking "Sign in with Google" for the first time can get a brand-new
-- auth.users id from Supabase instead of being linked to their existing
-- one, which made this trigger see "no profile row for this id, no
-- organization_id in metadata" and reject their own account with "this
-- account has not been set up by an administrator" -- reported as "Google
-- orqali kirib bo'lmay qoldi" right after block_unprovisioned_oauth_signup
-- shipped.
--
-- Fix: before rejecting, also check for an existing profile matching this
-- person's EMAIL (not just this exact auth id). If one exists, this is the
-- same real employee linking a second sign-in method -- carry over their
-- real role/organization_id instead of treating them as an unprovisioned
-- stranger. The platform-owner self-bootstrap path is untouched. A
-- genuinely new person (no profile under this id or this email, no
-- organization_id in metadata, not the bootstrap owner) is still rejected
-- exactly as before.
create or replace function public.handle_new_user()
returns trigger
language plpgsql security definer set search_path = public as $$
declare
  meta_role text := new.raw_user_meta_data ->> 'role';
  meta_org text := new.raw_user_meta_data ->> 'organization_id';
  is_owner_bootstrap boolean :=
    lower(new.email) = lower('umidbekramanov0427@gmail.com')
    and not exists (select 1 from public.profiles where role = 'platform_owner');
  existing_role public.app_role;
  existing_org uuid;
begin
  if exists (select 1 from public.profiles where id = new.id) then
    return new;
  end if;

  select role, organization_id into existing_role, existing_org
  from public.profiles
  where lower(email) = lower(new.email)
  order by created_at asc
  limit 1;

  if existing_role is null and nullif(meta_org, '') is null and not is_owner_bootstrap then
    raise exception 'SalesIQ: this account has not been set up by an administrator';
  end if;

  insert into public.profiles (id, email, full_name, role, organization_id)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'full_name', split_part(new.email, '@', 1)),
    case
      when is_owner_bootstrap then 'platform_owner'::public.app_role
      when existing_role is not null then existing_role
      when meta_role in ('super_admin', 'rop', 'sotuv_menejeri') then meta_role::public.app_role
      else 'sotuv_menejeri'::public.app_role
    end,
    coalesce(existing_org, nullif(meta_org, '')::uuid)
  )
  on conflict (id) do nothing;
  return new;
end; $$;
