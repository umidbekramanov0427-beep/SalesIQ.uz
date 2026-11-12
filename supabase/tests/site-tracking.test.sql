-- Sayt hisoblagichi: marketing people read their company's visits only;
-- only the server writes them.
begin;
insert into organizations (id, name) values
  ('00000000-0000-0000-0000-0000000000a7', 'A'),
  ('00000000-0000-0000-0000-0000000000a8', 'B');
insert into profiles (id, organization_id, role) values
  ('10000000-0000-0000-0000-0000000000a7', '00000000-0000-0000-0000-0000000000a7', 'marketolog'),
  ('10000000-0000-0000-0000-0000000000a8', '00000000-0000-0000-0000-0000000000a7', 'sotuv_menejeri');
insert into site_tracking (organization_id, key) values ('00000000-0000-0000-0000-0000000000a7', 'AbCdEfGhJkMnPqRsTu');
insert into site_visits (organization_id, visitor_id, path) values
  ('00000000-0000-0000-0000-0000000000a7', 'visitor001', '/'),
  ('00000000-0000-0000-0000-0000000000a8', 'visitor002', '/');
do $$ begin
  begin
    insert into site_tracking (organization_id, key) values ('00000000-0000-0000-0000-0000000000a8', 'bad key!');
    assert false, 'keys are letters and digits';
  exception when check_violation then null;
  end;
end $$;
grant usage on schema auth to authenticated;
grant select on profiles to authenticated;
set local role authenticated;
select set_config('test.uid', '10000000-0000-0000-0000-0000000000a7', true);
do $$ begin
  assert (select count(*) from site_visits) = 1, 'a marketolog sees their company''s visits only';
  begin
    insert into site_visits (organization_id, visitor_id) values ('00000000-0000-0000-0000-0000000000a7', 'visitor003');
    assert false, 'only the server records visits';
  exception when insufficient_privilege then null;
  end;
end $$;
select set_config('test.uid', '10000000-0000-0000-0000-0000000000a8', true);
do $$ begin
  assert (select count(*) from site_visits) = 0, 'a manager without marketing access sees none';
end $$;
rollback;
