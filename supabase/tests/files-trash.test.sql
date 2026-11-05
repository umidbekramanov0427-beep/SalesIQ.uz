-- Files trash: a trashed file disappears for the company's people (the
-- read policy hides it) but stays in the table for 30 days; the rules'
-- columns accept only sane values.
begin;
insert into organizations (id, name) values ('00000000-0000-0000-0000-0000000000a7', 'A');
insert into profiles (id, organization_id, role) values
  ('10000000-0000-0000-0000-0000000000a7', '00000000-0000-0000-0000-0000000000a7', 'sotuv_menejeri');
insert into leads (id, organization_id, name) values
  ('40000000-0000-0000-0000-0000000000a7', '00000000-0000-0000-0000-0000000000a7', 'L');
insert into lead_files (organization_id, lead_id, file_name, storage_path, size_bytes) values
  ('00000000-0000-0000-0000-0000000000a7', '40000000-0000-0000-0000-0000000000a7', 'keep.pdf', 'p/1', 10),
  ('00000000-0000-0000-0000-0000000000a7', '40000000-0000-0000-0000-0000000000a7', 'gone.pdf', 'p/2', 20);
update lead_files set deleted_at = now() where file_name = 'gone.pdf';
insert into org_general_settings (organization_id) values ('00000000-0000-0000-0000-0000000000a7');
do $$ begin
  begin
    update org_general_settings set file_autoload = 'sometimes';
    assert false, 'unknown autoload mode refused';
  exception when check_violation then null;
  end;
  update org_general_settings set file_autoload = 'smart', file_retention_days = 365;
  begin
    insert into lead_files (organization_id, lead_id, file_name, storage_path, source)
    values ('00000000-0000-0000-0000-0000000000a7', '40000000-0000-0000-0000-0000000000a7', 'x', 'p/3', 'email');
    assert false, 'unknown source refused';
  exception when check_violation then null;
  end;
end $$;
grant usage on schema auth to authenticated;
grant select on profiles to authenticated;
set local role authenticated;
select set_config('test.uid', '10000000-0000-0000-0000-0000000000a7', true);
do $$ begin
  assert (select count(*) from lead_files) = 1, 'only the file not in the trash is visible';
  assert (select file_name from lead_files) = 'keep.pdf', 'the kept file';
end $$;
rollback;
