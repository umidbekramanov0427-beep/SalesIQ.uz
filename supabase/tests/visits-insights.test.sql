-- Closing a session deletes exactly that auth session (or all of the
-- person's when none is named), never anyone else's; only the server may
-- call it.
begin;
insert into auth.users (id) values
  ('d0000000-0000-0000-0000-000000000001'),
  ('d0000000-0000-0000-0000-000000000002');
insert into auth.sessions (id, user_id) values
  ('e0000000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-000000000001'),
  ('e0000000-0000-0000-0000-000000000002', 'd0000000-0000-0000-0000-000000000001'),
  ('e0000000-0000-0000-0000-000000000003', 'd0000000-0000-0000-0000-000000000002');

do $$
begin
  assert public.platform_revoke_auth_sessions(
    'd0000000-0000-0000-0000-000000000001', 'e0000000-0000-0000-0000-000000000001') = 1,
    'one named session closed';
  assert (select count(*) from auth.sessions where user_id = 'd0000000-0000-0000-0000-000000000001') = 1,
    'the other session of that person stays';

  -- A session id of someone else does nothing.
  assert public.platform_revoke_auth_sessions(
    'd0000000-0000-0000-0000-000000000001', 'e0000000-0000-0000-0000-000000000003') = 0,
    'cannot close another person''s session';

  assert public.platform_revoke_auth_sessions('d0000000-0000-0000-0000-000000000001') = 1,
    'all remaining sessions of the person closed';
  assert (select count(*) from auth.sessions) = 1, 'the other person is untouched';

  assert not has_function_privilege('authenticated', 'public.platform_revoke_auth_sessions(uuid, uuid)', 'execute'),
    'signed-in users cannot call it';
  assert not has_function_privilege('anon', 'public.platform_revoke_auth_sessions(uuid, uuid)', 'execute'),
    'visitors cannot call it';

  insert into public.platform_digest_log (digest_date) values ('2026-10-12');
  begin
    insert into public.platform_digest_log (digest_date) values ('2026-10-12');
    assert false, 'second digest the same day must fail';
  exception when unique_violation then
    null;
  end;
end $$;
rollback;
