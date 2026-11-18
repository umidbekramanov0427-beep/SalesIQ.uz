-- Marketing AI: a webinar keeps a YouTube and a Telegram count in the same
-- minute; the new event kinds are accepted; scenario templates follow the
-- marketing rules; the AI tables are closed to the browser.
begin;
insert into organizations (id, name) values
  ('00000000-0000-0000-0000-0000000000d1', 'W'),
  ('00000000-0000-0000-0000-0000000000d2', 'X');
insert into profiles (id, organization_id, role) values
  ('10000000-0000-0000-0000-0000000000d1', '00000000-0000-0000-0000-0000000000d1', 'marketolog'),
  ('10000000-0000-0000-0000-0000000000d2', '00000000-0000-0000-0000-0000000000d1', 'sotuv_menejeri');
insert into marketing_webinars (id, organization_id, title) values
  ('40000000-0000-0000-0000-0000000000d1', '00000000-0000-0000-0000-0000000000d1', 'Ikki efir');

insert into marketing_webinar_samples (webinar_id, organization_id, at, viewers, source) values
  ('40000000-0000-0000-0000-0000000000d1', '00000000-0000-0000-0000-0000000000d1', '2027-01-01 10:00+00', 300, 'youtube'),
  ('40000000-0000-0000-0000-0000000000d1', '00000000-0000-0000-0000-0000000000d1', '2027-01-01 10:00+00', 120, 'telegram');
insert into marketing_webinar_marks (webinar_id, organization_id, kind, seq, auto, meta) values
  ('40000000-0000-0000-0000-0000000000d1', '00000000-0000-0000-0000-0000000000d1', 'timer', 2, false, null),
  ('40000000-0000-0000-0000-0000000000d1', '00000000-0000-0000-0000-0000000000d1', 'sms_sent', 1, true, '{"count": 812}');
do $$ begin
  assert (select count(*) from marketing_webinar_samples) = 2, 'both sources kept in one minute';
  begin
    insert into marketing_webinar_marks (webinar_id, organization_id, kind)
    values ('40000000-0000-0000-0000-0000000000d1', '00000000-0000-0000-0000-0000000000d1', 'nonsense');
    assert false, 'unknown event kinds are refused';
  exception when check_violation then null;
  end;
end $$;

grant usage on schema auth to authenticated;
grant select on profiles to authenticated;
set local role authenticated;

select set_config('test.uid', '10000000-0000-0000-0000-0000000000d1', true);
insert into marketing_webinar_templates (organization_id, name, plan)
values ('00000000-0000-0000-0000-0000000000d1', 'Standart', '[{"kind":"timer","seq":1,"minute":60}]');
do $$ begin
  assert (select count(*) from marketing_webinar_templates) = 1, 'a marketolog keeps scenario templates';
  begin
    perform 1 from marketing_ai_settings;
    assert false, 'AI settings are server-only';
  exception when insufficient_privilege then null;
  end;
  begin
    perform 1 from marketing_ai_usage;
    assert false, 'AI usage is server-only';
  exception when insufficient_privilege then null;
  end;
end $$;

select set_config('test.uid', '10000000-0000-0000-0000-0000000000d2', true);
do $$ begin
  assert (select count(*) from marketing_webinar_templates) = 0, 'a manager without marketing access sees no templates';
end $$;
rollback;
