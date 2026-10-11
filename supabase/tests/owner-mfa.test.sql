-- Platform-owner powers need aal2 once the owner has a verified
-- authenticator; owners without one, and other roles, are unaffected.
begin;
insert into organizations (id, name) values ('00000000-0000-0000-0000-0000000000f1', 'Org');
insert into profiles (id, organization_id, role) values
  ('f0000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000f1', 'platform_owner'),
  ('f0000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-0000000000f1', 'super_admin');

do $$ begin
  -- Owner with no authenticator: password session is enough.
  perform set_config('test.uid', 'f0000000-0000-0000-0000-000000000001', true);
  perform set_config('test.aal', 'aal1', true);
  assert is_platform_owner(), 'owner without 2FA keeps powers on aal1';
  assert current_user_role() = 'platform_owner', 'role without 2FA';

  -- Owner sets up an authenticator: aal1 no longer counts.
  insert into auth.mfa_factors (user_id, status) values ('f0000000-0000-0000-0000-000000000001', 'verified');
  assert not is_platform_owner(), 'owner with 2FA on aal1 loses powers';
  assert current_user_role() is null, 'role hidden on aal1';

  perform set_config('test.aal', 'aal2', true);
  assert is_platform_owner(), 'owner with 2FA on aal2 has powers';
  assert current_user_role() = 'platform_owner', 'role back on aal2';

  -- An unfinished (unverified) setup doesn't lock anyone out.
  delete from auth.mfa_factors;
  insert into auth.mfa_factors (user_id, status) values ('f0000000-0000-0000-0000-000000000001', 'unverified');
  perform set_config('test.aal', 'aal1', true);
  assert is_platform_owner(), 'unverified factor ignored';

  -- Other roles are untouched even with 2FA on aal1.
  perform set_config('test.uid', 'f0000000-0000-0000-0000-000000000002', true);
  insert into auth.mfa_factors (user_id, status) values ('f0000000-0000-0000-0000-000000000002', 'verified');
  assert current_user_role() = 'super_admin', 'super_admin role unaffected';
end $$;
rollback;
