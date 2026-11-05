-- General settings: the logo must be a small inline image and the date
-- format one of the known ones; after-hours defaults to off.
begin;
insert into organizations (id, name) values ('00000000-0000-0000-0000-0000000000f1', 'A');
insert into org_general_settings (organization_id) values ('00000000-0000-0000-0000-0000000000f1');
do $$ begin
  assert (select after_hours_enabled from org_general_settings
          where organization_id = '00000000-0000-0000-0000-0000000000f1') = false, 'after-hours is off by default';
  update org_general_settings set company_logo_url = 'data:image/png;base64,AAAA', date_format = 'dd.mm.yyyy',
    after_hours_enabled = true, after_hours_text = 'Ertaga javob beramiz'
  where organization_id = '00000000-0000-0000-0000-0000000000f1';
  begin
    update org_general_settings set company_logo_url = 'https://evil.example/x.svg'
    where organization_id = '00000000-0000-0000-0000-0000000000f1';
    assert false, 'a link is not a logo';
  exception when check_violation then null;
  end;
  begin
    update org_general_settings set date_format = 'yy'
    where organization_id = '00000000-0000-0000-0000-0000000000f1';
    assert false, 'unknown date format refused';
  exception when check_violation then null;
  end;
end $$;
rollback;
