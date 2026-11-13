-- Ish guruhlari: a group is seen by the person whose account it is and by
-- the company's admins / heads of sales -- not by another salesperson, not
-- by another company; only the server writes.
begin;
insert into organizations (id, name) values
  ('00000000-0000-0000-0000-0000000000d1', 'D1'),
  ('00000000-0000-0000-0000-0000000000d2', 'D2');
insert into profiles (id, organization_id, role) values
  ('10000000-0000-0000-0000-0000000000d1', '00000000-0000-0000-0000-0000000000d1', 'sotuv_menejeri'),
  ('10000000-0000-0000-0000-0000000000d2', '00000000-0000-0000-0000-0000000000d1', 'sotuv_menejeri'),
  ('10000000-0000-0000-0000-0000000000d3', '00000000-0000-0000-0000-0000000000d1', 'rop'),
  ('10000000-0000-0000-0000-0000000000d4', '00000000-0000-0000-0000-0000000000d2', 'super_admin');
insert into telegram_user_groups (id, organization_id, profile_id, account_tg_user_id, chat_id, title)
values ('30000000-0000-0000-0000-0000000000d1', '00000000-0000-0000-0000-0000000000d1',
        '10000000-0000-0000-0000-0000000000d1', 111, -1001, 'Ombor');
insert into telegram_user_group_messages (organization_id, group_id, sender_name, text, ext_message_id)
values ('00000000-0000-0000-0000-0000000000d1', '30000000-0000-0000-0000-0000000000d1', 'Ali', 'Salom', 'g1');
do $$ begin
  begin
    insert into telegram_user_groups (organization_id, profile_id, account_tg_user_id, chat_id)
    values ('00000000-0000-0000-0000-0000000000d1', '10000000-0000-0000-0000-0000000000d1', 111, -1001);
    assert false, 'a group of an account is kept once';
  exception when unique_violation then null;
  end;
end $$;
grant usage on schema auth to authenticated;
grant select on profiles to authenticated;
set local role authenticated;

select set_config('test.uid', '10000000-0000-0000-0000-0000000000d1', true);
do $$ begin
  assert (select count(*) from telegram_user_groups) = 1, 'the owner sees their group';
  assert (select count(*) from telegram_user_group_messages) = 1, 'and its messages';
  begin
    insert into telegram_user_group_messages (organization_id, group_id, text)
    values ('00000000-0000-0000-0000-0000000000d1', '30000000-0000-0000-0000-0000000000d1', 'x');
    assert false, 'messages are written only by the server';
  exception when insufficient_privilege then null;
  end;
end $$;

select set_config('test.uid', '10000000-0000-0000-0000-0000000000d2', true);
do $$ begin
  assert (select count(*) from telegram_user_groups) = 0, 'another salesperson does not see it';
  assert (select count(*) from telegram_user_group_messages) = 0, 'nor its messages';
end $$;

select set_config('test.uid', '10000000-0000-0000-0000-0000000000d3', true);
do $$ begin
  assert (select count(*) from telegram_user_groups) = 1, 'the head of sales sees it';
  assert (select count(*) from telegram_user_group_messages) = 1, 'and its messages';
end $$;

select set_config('test.uid', '10000000-0000-0000-0000-0000000000d4', true);
do $$ begin
  assert (select count(*) from telegram_user_groups) = 0, 'another company sees nothing';
end $$;
rollback;
