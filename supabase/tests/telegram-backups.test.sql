-- Kunlik zaxira: the backup functions read one company's rows of any table
-- with an organization_id, refuse anything else, and are server-only.
begin;
insert into organizations (id, name) values
  ('00000000-0000-0000-0000-0000000000f1', 'A'),
  ('00000000-0000-0000-0000-0000000000f2', 'B');
insert into contacts (organization_id, phone, full_name) values
  ('00000000-0000-0000-0000-0000000000f1', '+998901112233', 'Ali'),
  ('00000000-0000-0000-0000-0000000000f1', '+998904445566', 'Vali'),
  ('00000000-0000-0000-0000-0000000000f2', '+998907778899', 'Boshqa');
insert into platform_settings (id) values (true) on conflict (id) do nothing;
update platform_settings set backup_time = '04:30', backup_enabled = true where id;
do $$ begin
  assert exists (select 1 from backup_org_tables() where table_name = 'contacts'), 'contacts is a company table';
  assert not exists (select 1 from backup_org_tables() where table_name = 'platform_settings'), 'platform settings are not';
  assert jsonb_array_length(backup_org_table('contacts', '00000000-0000-0000-0000-0000000000f1')) = 2,
    'only the company''s own rows';
  assert jsonb_array_length(backup_org_table('contacts', '00000000-0000-0000-0000-0000000000f2')) = 1;
  begin
    perform backup_org_table('platform_settings', '00000000-0000-0000-0000-0000000000f1');
    assert false, 'a table without organization_id is refused';
  exception when raise_exception then null;
  end;
  begin
    update platform_settings set backup_time = '25:00' where id;
    assert false, 'the time is HH:MM';
  exception when check_violation then null;
  end;
end $$;
set local role authenticated;
do $$ begin
  begin
    perform backup_org_tables();
    assert false, 'signed-in people cannot list them';
  exception when insufficient_privilege then null;
  end;
  begin
    perform backup_org_table('contacts', '00000000-0000-0000-0000-0000000000f1');
    assert false, 'nor read another company through them';
  exception when insufficient_privilege then null;
  end;
end $$;
rollback;
