-- Card and page settings: an object, empty by default, never a huge blob.
begin;
insert into platform_settings (id) values (true) on conflict (id) do nothing;
insert into org_general_settings (organization_id)
  values ('00000000-0000-0000-0000-0000000000a1') on conflict do nothing;
do $$ begin
  assert (select ui_settings from org_general_settings
          where organization_id = '00000000-0000-0000-0000-0000000000a1') = '{}'::jsonb,
    'empty by default';
  update org_general_settings set ui_settings = '{"cards": {"x": {"hide": true}}}'
    where organization_id = '00000000-0000-0000-0000-0000000000a1';
  update platform_settings set ui_settings = '{"pages": {}}' where id;
  begin
    update platform_settings set ui_settings = '[]' where id;
    assert false, 'must be an object';
  exception when check_violation then null;
  end;
  begin
    update org_general_settings
      set ui_settings = jsonb_build_object('big', repeat(md5(random()::text), 20000))
      where organization_id = '00000000-0000-0000-0000-0000000000a1';
    assert false, 'capped in size';
  exception when check_violation then null;
  end;
end $$;
rollback;
