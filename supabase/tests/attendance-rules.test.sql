-- Davomat: work sessions remember how a person checked in; only the site
-- button and the Telegram bot are valid ways.
begin;
do $$
declare
  ok boolean;
begin
  insert into work_sessions (profile_id, method, lat, lng, distance_m)
  values (gen_random_uuid(), 'telegram', 41.31, 69.24, 42);
  insert into work_sessions (profile_id) values (gen_random_uuid());
  assert (select count(*) from work_sessions where method = 'web') = 1, 'web is the default';

  ok := false;
  begin
    insert into work_sessions (profile_id, method) values (gen_random_uuid(), 'gps');
  exception when check_violation then ok := true;
  end;
  assert ok, 'an unknown method is refused';

  insert into org_general_settings (organization_id) values (gen_random_uuid());
  assert (select attendance_rules = '{}'::jsonb and attendance_report_sent_on is null
            from org_general_settings limit 1), 'rules default to {}';
end $$;
rollback;
