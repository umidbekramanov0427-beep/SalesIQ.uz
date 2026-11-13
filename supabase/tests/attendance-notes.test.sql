-- Davomat izohlari: a person writes and sees their own; an admin sees the
-- company's; nobody reads or writes another company's.
begin;
insert into organizations (id, name) values
  ('00000000-0000-0000-0000-0000000000b1', 'B1'),
  ('00000000-0000-0000-0000-0000000000b2', 'B2');
insert into profiles (id, organization_id, role) values
  ('10000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-0000000000b1', 'sotuv_menejeri'),
  ('10000000-0000-0000-0000-0000000000b2', '00000000-0000-0000-0000-0000000000b1', 'sotuv_menejeri'),
  ('10000000-0000-0000-0000-0000000000b3', '00000000-0000-0000-0000-0000000000b1', 'super_admin'),
  ('10000000-0000-0000-0000-0000000000b4', '00000000-0000-0000-0000-0000000000b2', 'super_admin');
-- The bot writes server-side (no auth.uid()).
insert into attendance_notes (organization_id, profile_id, day, kind, body, source) values
  ('00000000-0000-0000-0000-0000000000b1', '10000000-0000-0000-0000-0000000000b1', current_date, 'late', 'Tirbandlik', 'telegram'),
  ('00000000-0000-0000-0000-0000000000b1', '10000000-0000-0000-0000-0000000000b2', current_date, 'other', 'Uchrashuvdaman', 'telegram');
do $$ begin
  begin
    insert into attendance_notes (organization_id, profile_id, day, body)
    values ('00000000-0000-0000-0000-0000000000b1', '10000000-0000-0000-0000-0000000000b1', current_date, '');
    assert false, 'an empty comment is refused';
  exception when check_violation then null;
  end;
  begin
    insert into attendance_notes (organization_id, profile_id, day, kind, body)
    values ('00000000-0000-0000-0000-0000000000b1', '10000000-0000-0000-0000-0000000000b1', current_date, 'x', 'a');
    assert false, 'an unknown kind is refused';
  exception when check_violation then null;
  end;
end $$;
grant usage on schema auth to authenticated;
grant select on profiles to authenticated;
set local role authenticated;

-- A rep: only their own.
select set_config('test.uid', '10000000-0000-0000-0000-0000000000b1', true);
do $$ begin
  assert (select count(*) from attendance_notes) = 1, 'a rep sees only their own';
  insert into attendance_notes (organization_id, profile_id, day, body)
  values ('00000000-0000-0000-0000-0000000000b1', '10000000-0000-0000-0000-0000000000b1', current_date, 'Saytdan');
  begin
    insert into attendance_notes (organization_id, profile_id, day, body)
    values ('00000000-0000-0000-0000-0000000000b1', '10000000-0000-0000-0000-0000000000b2', current_date, 'Boshqa uchun');
    assert false, 'nobody writes for someone else';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into attendance_notes (organization_id, profile_id, day, body, source)
    values ('00000000-0000-0000-0000-0000000000b1', '10000000-0000-0000-0000-0000000000b1', current_date, 'x', 'telegram');
    assert false, 'the browser cannot pose as the bot';
  exception when insufficient_privilege then null;
  end;
end $$;

-- The company's admin: everyone in the company.
select set_config('test.uid', '10000000-0000-0000-0000-0000000000b3', true);
do $$ begin
  assert (select count(*) from attendance_notes) = 3, 'an admin sees the company''s';
end $$;

-- Another company's admin: nothing.
select set_config('test.uid', '10000000-0000-0000-0000-0000000000b4', true);
do $$ begin
  assert (select count(*) from attendance_notes) = 0, 'another company sees nothing';
  begin
    insert into attendance_notes (organization_id, profile_id, day, body)
    values ('00000000-0000-0000-0000-0000000000b1', '10000000-0000-0000-0000-0000000000b4', current_date, 'x');
    assert false, 'nor writes into it';
  exception when insufficient_privilege then null;
  end;
end $$;
rollback;
