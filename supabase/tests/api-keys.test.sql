-- API kalitlari: only known scopes, at least one; a key hash is unique;
-- the company's people can't read keys from the browser (no policies).
begin;
insert into organizations (id, name) values ('00000000-0000-0000-0000-0000000000e1', 'E');
insert into profiles (id, organization_id, role) values
  ('10000000-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-0000000000e1', 'super_admin');
insert into org_api_keys (organization_id, name, prefix, key_hash, scopes)
values ('00000000-0000-0000-0000-0000000000e1', 'Sayt', 'sq_live_abcd', 'h1', '{leads:read,leads:write}');
do $$ begin
  begin
    insert into org_api_keys (organization_id, name, prefix, key_hash, scopes)
    values ('00000000-0000-0000-0000-0000000000e1', 'X', 'p', 'h2', '{admin:all}');
    assert false, 'an unknown scope is refused';
  exception when check_violation then null;
  end;
  begin
    insert into org_api_keys (organization_id, name, prefix, key_hash, scopes)
    values ('00000000-0000-0000-0000-0000000000e1', 'X', 'p', 'h3', '{}');
    assert false, 'a key with no scope is refused';
  exception when check_violation then null;
  end;
  begin
    insert into org_api_keys (organization_id, name, prefix, key_hash)
    values ('00000000-0000-0000-0000-0000000000e1', 'Y', 'p', 'h1');
    assert false, 'the same key hash twice is refused';
  exception when unique_violation then null;
  end;
end $$;
grant usage on schema auth to authenticated;
grant select on profiles, org_api_keys to authenticated;
set local role authenticated;
select set_config('test.uid', '10000000-0000-0000-0000-0000000000e1', true);
do $$ begin
  assert (select count(*) from org_api_keys) = 0, 'even a super admin reads no keys from the browser';
end $$;
rollback;
