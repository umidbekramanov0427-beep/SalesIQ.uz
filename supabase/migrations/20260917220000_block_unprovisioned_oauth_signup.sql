-- Google (and any future OAuth provider) sign-in reuses Supabase's normal
-- signup path: a brand-new email creates a brand-new auth.users row, which
-- fires this same handle_new_user() trigger. Without this guard, anyone
-- with a Google account could sign into the app and get a real, working
-- profile (defaulting to sotuv_menejeri, no organization) -- reopening the
-- self-serve signup hole this platform deliberately closed earlier
-- (employee accounts are only ever created by an admin, with an
-- organization_id passed explicitly in user_metadata).
--
-- This only blocks a genuinely new person: an existing employee whose
-- email an admin already provisioned links their Google account to their
-- existing profile automatically (Supabase auto-links a verified email
-- across providers), so `on conflict (id) do nothing` below still applies
-- to them exactly as before -- this new check only ever fires on the
-- INSERT path, for an identity with no profile row yet.
create or replace function public.handle_new_user()
returns trigger
language plpgsql security definer set search_path = public as $$
declare
  meta_role text := new.raw_user_meta_data ->> 'role';
  meta_org text := new.raw_user_meta_data ->> 'organization_id';
begin
  if not exists (select 1 from public.profiles where id = new.id)
     and nullif(meta_org, '') is null then
    raise exception 'SalesIQ: this account has not been set up by an administrator';
  end if;

  insert into public.profiles (id, email, full_name, role, organization_id)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'full_name', split_part(new.email, '@', 1)),
    case
      when meta_role in ('super_admin', 'rop', 'sotuv_menejeri') then meta_role::public.app_role
      else 'sotuv_menejeri'::public.app_role
    end,
    nullif(meta_org, '')::uuid
  )
  on conflict (id) do nothing;
  return new;
end; $$;
