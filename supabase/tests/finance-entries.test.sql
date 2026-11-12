-- Moliya: only the company's admin sees and writes income/expense lines;
-- a head of sales and a manager see nothing; amounts must be positive.
begin;
insert into organizations (id, name) values
  ('00000000-0000-0000-0000-0000000000f1', 'F'),
  ('00000000-0000-0000-0000-0000000000f2', 'G');
insert into profiles (id, organization_id, role) values
  ('10000000-0000-0000-0000-0000000000f1', '00000000-0000-0000-0000-0000000000f1', 'super_admin'),
  ('10000000-0000-0000-0000-0000000000f2', '00000000-0000-0000-0000-0000000000f1', 'rop'),
  ('10000000-0000-0000-0000-0000000000f3', '00000000-0000-0000-0000-0000000000f2', 'super_admin');
insert into finance_entries (organization_id, kind, category, source, amount) values
  ('00000000-0000-0000-0000-0000000000f1', 'expense', 'marketing', 'Instagram', 2000000),
  ('00000000-0000-0000-0000-0000000000f2', 'income', 'other', null, 5);
do $$ begin
  begin
    insert into finance_entries (organization_id, kind, category, amount)
    values ('00000000-0000-0000-0000-0000000000f1', 'expense', 'rent', 0);
    assert false, 'a zero amount is refused';
  exception when check_violation then null;
  end;
  begin
    insert into finance_entries (organization_id, kind, category, amount)
    values ('00000000-0000-0000-0000-0000000000f1', 'loan', 'x', 1);
    assert false, 'kind is income or expense';
  exception when check_violation then null;
  end;
end $$;
grant usage on schema auth to authenticated;
grant select on profiles to authenticated;
set local role authenticated;

select set_config('test.uid', '10000000-0000-0000-0000-0000000000f2', true);
do $$ begin
  assert (select count(*) from finance_entries) = 0, 'a head of sales sees no finance lines';
end $$;

select set_config('test.uid', '10000000-0000-0000-0000-0000000000f1', true);
insert into finance_entries (organization_id, kind, category, amount)
values ('00000000-0000-0000-0000-0000000000f1', 'expense', 'rent', 8000000);
do $$ begin
  assert (select count(*) from finance_entries) = 2, 'the admin sees only their company''s lines';
  begin
    insert into finance_entries (organization_id, kind, category, amount)
    values ('00000000-0000-0000-0000-0000000000f2', 'expense', 'rent', 1);
    assert false, 'not into another company';
  exception when insufficient_privilege then null;
  end;
end $$;
rollback;
