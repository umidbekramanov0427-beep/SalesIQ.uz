-- Oylik: an employee sees only their own scheme and the company default;
-- a head of sales sees all but can't change them; only the admin writes;
-- another company sees nothing.
begin;
insert into organizations (id, name) values
  ('00000000-0000-0000-0000-0000000000e1', 'P'),
  ('00000000-0000-0000-0000-0000000000e2', 'Q');
insert into profiles (id, organization_id, role) values
  ('10000000-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-0000000000e1', 'super_admin'),
  ('10000000-0000-0000-0000-0000000000e2', '00000000-0000-0000-0000-0000000000e1', 'rop'),
  ('10000000-0000-0000-0000-0000000000e3', '00000000-0000-0000-0000-0000000000e1', 'sotuv_menejeri'),
  ('10000000-0000-0000-0000-0000000000e4', '00000000-0000-0000-0000-0000000000e1', 'sotuv_menejeri'),
  ('10000000-0000-0000-0000-0000000000e5', '00000000-0000-0000-0000-0000000000e2', 'super_admin');
insert into payroll_schemes (organization_id, scope, scheme) values
  ('00000000-0000-0000-0000-0000000000e1', 'base', '{"fixed": 1}'),
  ('00000000-0000-0000-0000-0000000000e1', '10000000-0000-0000-0000-0000000000e3', '{"fixed": 3}'),
  ('00000000-0000-0000-0000-0000000000e1', '10000000-0000-0000-0000-0000000000e4', '{"fixed": 4}'),
  ('00000000-0000-0000-0000-0000000000e2', 'base', '{"fixed": 9}');
do $$ begin
  begin
    insert into payroll_schemes (organization_id, scope) values ('00000000-0000-0000-0000-0000000000e1', 'boss');
    assert false, 'a scope is base or a profile id';
  exception when check_violation then null;
  end;
end $$;
grant usage on schema auth to authenticated;
grant select on profiles to authenticated;
set local role authenticated;

select set_config('test.uid', '10000000-0000-0000-0000-0000000000e3', true);
do $$ begin
  assert (select count(*) from payroll_schemes) = 2, 'a manager sees their own and the default';
  assert not exists (select 1 from payroll_schemes where scope = '10000000-0000-0000-0000-0000000000e4'),
    'not a colleague''s';
  update payroll_schemes set scheme = '{"fixed": 999}' where scope = '10000000-0000-0000-0000-0000000000e3';
  assert (select scheme->>'fixed' from payroll_schemes where scope = '10000000-0000-0000-0000-0000000000e3') = '3',
    'a manager can''t raise their own pay';
end $$;

select set_config('test.uid', '10000000-0000-0000-0000-0000000000e2', true);
do $$ begin
  assert (select count(*) from payroll_schemes) = 3, 'the head of sales sees the company''s schemes';
  begin
    insert into payroll_schemes (organization_id, scope) values ('00000000-0000-0000-0000-0000000000e1', '10000000-0000-0000-0000-0000000000e2');
    assert false, 'the head of sales can''t write';
  exception when insufficient_privilege then null;
  end;
end $$;

select set_config('test.uid', '10000000-0000-0000-0000-0000000000e1', true);
do $$ begin
  update payroll_schemes set scheme = '{"fixed": 5}' where scope = 'base';
  assert (select scheme->>'fixed' from payroll_schemes where scope = 'base') = '5', 'the admin writes';
  assert (select count(*) from payroll_schemes) = 3, 'only their own company';
end $$;
rollback;
