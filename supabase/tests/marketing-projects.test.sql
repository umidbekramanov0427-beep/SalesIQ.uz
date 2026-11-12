-- Loyihalar, screenshotlar va sealed akkauntlar: marketing people of the
-- company keep projects and pictures; the Telegram/Meta connections are
-- server-only; a private channel needs a chat id when it has no @username.
begin;
insert into organizations (id, name) values
  ('00000000-0000-0000-0000-0000000000d1', 'P'),
  ('00000000-0000-0000-0000-0000000000d2', 'Q');
insert into profiles (id, organization_id, role) values
  ('10000000-0000-0000-0000-0000000000d1', '00000000-0000-0000-0000-0000000000d1', 'marketolog'),
  ('10000000-0000-0000-0000-0000000000d2', '00000000-0000-0000-0000-0000000000d1', 'sotuv_menejeri'),
  ('10000000-0000-0000-0000-0000000000d3', '00000000-0000-0000-0000-0000000000d2', 'super_admin');
insert into marketing_projects (id, organization_id, name, funnels) values
  ('50000000-0000-0000-0000-0000000000d1', '00000000-0000-0000-0000-0000000000d1', 'Ingliz tili', '{Kurslar}'),
  ('50000000-0000-0000-0000-0000000000d2', '00000000-0000-0000-0000-0000000000d2', 'Boshqa', '{}');
insert into marketing_tg_accounts (organization_id, session_sealed)
values ('00000000-0000-0000-0000-0000000000d1', 'sealed');
insert into marketing_channels (organization_id, chat_id, title, project_id)
values ('00000000-0000-0000-0000-0000000000d1', -100123, 'Yopiq kanal', '50000000-0000-0000-0000-0000000000d1');
do $$ begin
  begin
    insert into marketing_channels (organization_id, title) values ('00000000-0000-0000-0000-0000000000d1', 'Hech narsa');
    assert false, 'a channel needs an @username or a chat id';
  exception when check_violation then null;
  end;
  begin
    insert into marketing_channels (organization_id, username, purpose)
    values ('00000000-0000-0000-0000-0000000000d1', 'kanal_nomi', 'boshqa');
    assert false, 'purpose is one of main/ads/webinar';
  exception when check_violation then null;
  end;
end $$;
grant usage on schema auth to authenticated;
grant select on profiles to authenticated;
set local role authenticated;

select set_config('test.uid', '10000000-0000-0000-0000-0000000000d1', true);
insert into marketing_shots (organization_id, project_id, viewers, source, kind)
values ('00000000-0000-0000-0000-0000000000d1', '50000000-0000-0000-0000-0000000000d1', 5456, 'manual', 'card');
update marketing_projects set archived_at = now() where id = '50000000-0000-0000-0000-0000000000d1';
do $$ begin
  assert (select count(*) from marketing_projects) = 1, 'a marketolog sees their company''s projects only';
  assert (select archived_at is not null from marketing_projects), 'and archives them';
  assert (select count(*) from marketing_shots) = 1, 'and keeps proof pictures';
  begin
    perform 1 from marketing_tg_accounts;
    assert false, 'the Telegram session is server-only';
  exception when insufficient_privilege then null;
  end;
end $$;

select set_config('test.uid', '10000000-0000-0000-0000-0000000000d2', true);
do $$ begin
  assert (select count(*) from marketing_projects) = 0, 'a manager without marketing access sees none';
  assert (select count(*) from marketing_shots) = 0, 'nor the pictures';
end $$;
rollback;
