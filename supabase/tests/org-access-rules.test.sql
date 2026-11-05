-- Access rules: everyone in the company reads them, only its super admin
-- writes them (a ROP can't widen their own access), other companies see
-- nothing.
begin;
insert into organizations (id, name) values
  ('00000000-0000-0000-0000-0000000000e1', 'A'), ('00000000-0000-0000-0000-0000000000e2', 'B');
insert into profiles (id, organization_id, role) values
  ('10000000-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-0000000000e1', 'super_admin'),
  ('10000000-0000-0000-0000-0000000000e2', '00000000-0000-0000-0000-0000000000e1', 'rop'),
  ('10000000-0000-0000-0000-0000000000e3', '00000000-0000-0000-0000-0000000000e2', 'super_admin');
grant usage on schema auth to authenticated;
grant select on profiles to authenticated;
set local role authenticated;

-- The super admin saves the rules.
select set_config('test.uid', '10000000-0000-0000-0000-0000000000e1', true);
insert into org_access_rules (organization_id, rules)
values ('00000000-0000-0000-0000-0000000000e1', '{"rop": {"leads": "group"}}');
update org_access_rules set rules = '{"rop": {"leads": "own"}}'
where organization_id = '00000000-0000-0000-0000-0000000000e1';

-- The ROP reads them but can't change them.
select set_config('test.uid', '10000000-0000-0000-0000-0000000000e2', true);
do $$ begin
  assert (select rules->'rop'->>'leads' from org_access_rules) = 'own', 'the ROP reads the rules';
end $$;
update org_access_rules set rules = '{"rop": {"leads": "all"}}'
where organization_id = '00000000-0000-0000-0000-0000000000e1';
do $$ begin
  assert (select rules->'rop'->>'leads' from org_access_rules) = 'own', 'the ROP cannot widen them';
end $$;

-- Another company sees nothing and can't write ours.
select set_config('test.uid', '10000000-0000-0000-0000-0000000000e3', true);
do $$ begin
  assert (select count(*) from org_access_rules) = 0, 'another company sees nothing';
  begin
    update org_access_rules set rules = '{}' where organization_id = '00000000-0000-0000-0000-0000000000e1';
    insert into org_access_rules (organization_id, rules) values ('00000000-0000-0000-0000-0000000000e1', '{}');
    assert false, 'another company cannot write it';
  exception when insufficient_privilege or unique_violation then
    null;
  end;
end $$;
rollback;
