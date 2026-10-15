-- Live support: a person reads only their own support thread and cannot
-- write to it directly (messages go through the server).
begin;
insert into organizations (id, name) values
  ('a1000000-0000-0000-0000-000000000001', 'Org A');
insert into profiles (id, organization_id, role) values
  ('a1000000-0000-0000-0000-0000000000a1', 'a1000000-0000-0000-0000-000000000001', 'sotuv_menejeri'),
  ('a1000000-0000-0000-0000-0000000000a2', 'a1000000-0000-0000-0000-000000000001', 'super_admin');
insert into public.support_messages (organization_id, user_id, direction, text) values
  ('a1000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-0000000000a1', 'in', 'Salom'),
  ('a1000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-0000000000a1', 'out', 'Va alaykum'),
  ('a1000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-0000000000a2', 'in', 'Admin savoli');

-- The stub's helpers read profiles as the caller.
grant usage on schema auth to authenticated;
grant select on profiles to authenticated;
set local role authenticated;

set local test.uid = 'a1000000-0000-0000-0000-0000000000a1';
do $$
begin
  assert (select count(*) from public.support_messages) = 2, 'a person sees their own thread';
  assert not exists (select 1 from public.support_messages where text = 'Admin savoli'),
    'a colleague''s thread stays hidden, even from the same company';
  begin
    insert into public.support_messages (organization_id, user_id, direction, text)
    values ('a1000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-0000000000a1', 'out', 'fake');
    assert false, 'a person must not write a support answer';
  exception when insufficient_privilege then
    null;
  end;
end $$;

set local test.uid = 'a1000000-0000-0000-0000-0000000000a2';
do $$
begin
  assert (select count(*) from public.support_messages) = 1, 'the admin sees only their own thread';
end $$;

reset role;
do $$
begin
  assert not has_table_privilege('anon', 'public.support_messages', 'select'),
    'visitors cannot read support messages';
  assert exists (select 1 from pg_publication_tables
                 where pubname = 'supabase_realtime' and tablename = 'support_messages'),
    'answers are pushed to the open chat';
  assert not has_table_privilege('authenticated', 'public.platform_ops_log', 'select'),
    'the monitoring log is server-only';
  begin
    insert into public.support_messages (organization_id, user_id, direction, text)
    values ('a1000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-0000000000a1', 'x', 'bad');
    assert false, 'direction must be in/out';
  exception when check_violation then
    null;
  end;
end $$;
rollback;
