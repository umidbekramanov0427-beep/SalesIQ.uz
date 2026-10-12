-- Phone verification can only be set server-side, a phone change clears
-- it; failed sign-ins need no user; session events cascade with sessions.
begin;
insert into organizations (id, name) values ('00000000-0000-0000-0000-0000000000c1', 'Org');
insert into profiles (id, organization_id, role, phone) values
  ('c0000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000c1', 'super_admin', '+998901112233');

do $$
declare
  v_session uuid;
begin
  -- Server (no auth.uid) marks the phone verified.
  perform set_config('test.uid', '', true);
  update profiles set phone_verified_at = now() where id = 'c0000000-0000-0000-0000-000000000001';
  assert (select phone_verified_at is not null from profiles where id = 'c0000000-0000-0000-0000-000000000001'), 'server can verify';

  -- The user can't clear or forge it while keeping the phone...
  perform set_config('test.uid', 'c0000000-0000-0000-0000-000000000001', true);
  update profiles set phone_verified_at = null where id = 'c0000000-0000-0000-0000-000000000001';
  assert (select phone_verified_at is not null from profiles where id = 'c0000000-0000-0000-0000-000000000001'), 'user cannot touch the mark';

  -- ...and changing the phone clears it.
  update profiles set phone = '+998907776655', phone_verified_at = now() where id = 'c0000000-0000-0000-0000-000000000001';
  assert (select phone_verified_at is null from profiles where id = 'c0000000-0000-0000-0000-000000000001'), 'new phone needs verifying again';

  -- A failed sign-in has no user.
  perform set_config('test.uid', '', true);
  insert into user_login_events (kind, device_id, email_attempted, ip) values ('failed_login', 'd1', 'x@y.uz', '1.2.3.4');

  insert into auth.users (id) values ('c0000000-0000-0000-0000-000000000001');
  insert into user_login_events (user_id, organization_id, device_id)
    values ('c0000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000c1', 'd2')
    returning id into v_session;
  insert into user_session_events (session_id, kind, label, path) values (v_session, 'page', 'Page', '/');
  delete from user_login_events where id = v_session;
  assert not exists (select 1 from user_session_events where session_id = v_session), 'events go with their session';
end $$;
rollback;
