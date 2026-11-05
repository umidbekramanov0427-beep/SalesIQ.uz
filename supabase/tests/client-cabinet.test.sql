-- Mijoz kabineti: one live link per lead (a new one only after the old is
-- revoked), tokens long enough not to be guessed, and the company's people
-- see only their own company's links.
begin;
insert into organizations (id, name) values
  ('00000000-0000-0000-0000-0000000000c9', 'C'),
  ('00000000-0000-0000-0000-0000000000d9', 'D');
insert into profiles (id, organization_id, role) values
  ('10000000-0000-0000-0000-0000000000c9', '00000000-0000-0000-0000-0000000000c9', 'sotuv_menejeri'),
  ('10000000-0000-0000-0000-0000000000d9', '00000000-0000-0000-0000-0000000000d9', 'sotuv_menejeri');
insert into leads (id, organization_id, name) values
  ('40000000-0000-0000-0000-0000000000c9', '00000000-0000-0000-0000-0000000000c9', 'L');
insert into client_cabinets (token, organization_id, lead_id)
values (repeat('a', 32), '00000000-0000-0000-0000-0000000000c9', '40000000-0000-0000-0000-0000000000c9');
do $$ begin
  begin
    insert into client_cabinets (token, organization_id, lead_id)
    values (repeat('b', 32), '00000000-0000-0000-0000-0000000000c9', '40000000-0000-0000-0000-0000000000c9');
    assert false, 'a second live link for the same lead is refused';
  exception when unique_violation then null;
  end;
  begin
    insert into client_cabinets (token, organization_id, lead_id)
    values ('short', '00000000-0000-0000-0000-0000000000c9', '40000000-0000-0000-0000-0000000000c9');
    assert false, 'a short token is refused';
  exception when check_violation then null;
  end;
  update client_cabinets set revoked_at = now() where token = repeat('a', 32);
  insert into client_cabinets (token, organization_id, lead_id)
  values (repeat('b', 32), '00000000-0000-0000-0000-0000000000c9', '40000000-0000-0000-0000-0000000000c9');
end $$;
grant usage on schema auth to authenticated;
grant select on profiles, client_cabinets to authenticated;
set local role authenticated;
select set_config('test.uid', '10000000-0000-0000-0000-0000000000d9', true);
do $$ begin
  assert (select count(*) from client_cabinets) = 0, 'another company sees none';
end $$;
select set_config('test.uid', '10000000-0000-0000-0000-0000000000c9', true);
do $$ begin
  assert (select count(*) from client_cabinets) = 2, 'own company sees its links';
end $$;
rollback;
