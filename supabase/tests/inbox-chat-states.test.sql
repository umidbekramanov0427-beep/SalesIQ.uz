-- Inbox chat states: a company closes or blocks its own chats; another
-- company neither sees nor writes them.
begin;
insert into organizations (id, name) values
  ('00000000-0000-0000-0000-0000000000d1', 'A'), ('00000000-0000-0000-0000-0000000000d2', 'B');
insert into profiles (id, organization_id, role) values
  ('10000000-0000-0000-0000-0000000000d1', '00000000-0000-0000-0000-0000000000d1', 'sotuv_menejeri'),
  ('10000000-0000-0000-0000-0000000000d2', '00000000-0000-0000-0000-0000000000d2', 'super_admin');
insert into leads (id, organization_id, name) values
  ('40000000-0000-0000-0000-0000000000d1', '00000000-0000-0000-0000-0000000000d1', 'Mijoz');
grant usage on schema auth to authenticated;
grant select on profiles to authenticated;
set local role authenticated;

select set_config('test.uid', '10000000-0000-0000-0000-0000000000d1', true);
insert into inbox_chat_states (lead_id, organization_id, closed_at, closed_by)
values ('40000000-0000-0000-0000-0000000000d1', '00000000-0000-0000-0000-0000000000d1', now(), '10000000-0000-0000-0000-0000000000d1');
update inbox_chat_states set blocked_at = now() where lead_id = '40000000-0000-0000-0000-0000000000d1';
do $$ begin
  assert (select blocked_at is not null and closed_at is not null from inbox_chat_states), 'own company closes and blocks';
end $$;

select set_config('test.uid', '10000000-0000-0000-0000-0000000000d2', true);
do $$ begin
  assert (select count(*) from inbox_chat_states) = 0, 'another company sees nothing';
  begin
    insert into inbox_chat_states (lead_id, organization_id)
    values ('40000000-0000-0000-0000-0000000000d1', '00000000-0000-0000-0000-0000000000d1');
    assert false, 'another company cannot write it';
  exception when insufficient_privilege or unique_violation then
    null;
  end;
end $$;
rollback;
