-- Eslatmalar: a manager reminds only themself and sees only their own; a
-- head of sales may remind others; other companies see nothing; bad repeat
-- values and empty text are refused.
begin;
insert into organizations (id, name) values
  ('00000000-0000-0000-0000-0000000000d1', 'D'),
  ('00000000-0000-0000-0000-0000000000d2', 'E');
insert into profiles (id, organization_id, role) values
  ('10000000-0000-0000-0000-0000000000d1', '00000000-0000-0000-0000-0000000000d1', 'rop'),
  ('10000000-0000-0000-0000-0000000000d2', '00000000-0000-0000-0000-0000000000d1', 'sotuv_menejeri'),
  ('10000000-0000-0000-0000-0000000000d3', '00000000-0000-0000-0000-0000000000d1', 'sotuv_menejeri'),
  ('10000000-0000-0000-0000-0000000000d4', '00000000-0000-0000-0000-0000000000d2', 'super_admin');
do $$ begin
  begin
    insert into reminders (organization_id, profile_id, text, remind_at, repeat)
    values ('00000000-0000-0000-0000-0000000000d1', '10000000-0000-0000-0000-0000000000d2', 'x', now(), 'hourly');
    assert false, 'an unknown repeat is refused';
  exception when check_violation then null;
  end;
  begin
    insert into reminders (organization_id, profile_id, text, remind_at)
    values ('00000000-0000-0000-0000-0000000000d1', '10000000-0000-0000-0000-0000000000d2', '  ', now());
    assert false, 'empty text is refused';
  exception when check_violation then null;
  end;
end $$;
insert into reminders (organization_id, profile_id, created_by, text, remind_at) values
  ('00000000-0000-0000-0000-0000000000d1', '10000000-0000-0000-0000-0000000000d3', '10000000-0000-0000-0000-0000000000d3', 'Boshqasi', now()),
  ('00000000-0000-0000-0000-0000000000d2', '10000000-0000-0000-0000-0000000000d4', '10000000-0000-0000-0000-0000000000d4', 'Boshqa kompaniya', now());
grant usage on schema auth to authenticated;
grant select on profiles to authenticated;
grant select, insert, update, delete on reminders to authenticated;
set local role authenticated;
-- The manager.
select set_config('test.uid', '10000000-0000-0000-0000-0000000000d2', true);
insert into reminders (organization_id, profile_id, created_by, text, remind_at)
values ('00000000-0000-0000-0000-0000000000d1', '10000000-0000-0000-0000-0000000000d2', '10000000-0000-0000-0000-0000000000d2', 'Bankka qo''ng''iroq', now());
do $$ begin
  assert (select count(*) from reminders) = 1, 'a manager sees only their own reminders';
  begin
    insert into reminders (organization_id, profile_id, created_by, text, remind_at)
    values ('00000000-0000-0000-0000-0000000000d1', '10000000-0000-0000-0000-0000000000d3', '10000000-0000-0000-0000-0000000000d2', 'Senga', now());
    assert false, 'a manager cannot remind a colleague';
  exception when insufficient_privilege then null;
  end;
end $$;
-- The head of sales.
select set_config('test.uid', '10000000-0000-0000-0000-0000000000d1', true);
insert into reminders (organization_id, profile_id, created_by, text, remind_at)
values ('00000000-0000-0000-0000-0000000000d1', '10000000-0000-0000-0000-0000000000d3', '10000000-0000-0000-0000-0000000000d1', 'Mijozga qayta qo''ng''iroq', now());
do $$ begin
  assert (select count(*) from reminders) = 3, 'the head of sales sees the company''s reminders, not another company''s';
end $$;
rollback;
