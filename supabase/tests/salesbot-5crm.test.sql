-- Salesbot triggers (20270210): the defaults, and the checks on the trigger
-- name and the daily time.
begin;
do $$
declare
  org uuid := '00000000-0000-0000-0000-00000000e101';
  bot uuid;
  failed boolean;
begin
  insert into organizations (id, name) values (org, 'S');
  insert into salesbots (organization_id, name) values (org, 'b') returning id into bot;
  assert (select trigger from salesbots where id = bot) = 'manual', 'default trigger is manual';
  assert (select test_mode from salesbots where id = bot) = false, 'test mode off by default';

  update salesbots set trigger = 'tg_daily', trigger_time = '09:30' where id = bot;

  failed := false;
  begin
    update salesbots set trigger = 'whenever' where id = bot;
  exception when check_violation then failed := true;
  end;
  assert failed, 'an unknown trigger is refused';

  failed := false;
  begin
    update salesbots set trigger_time = '25:00' where id = bot;
  exception when check_violation then failed := true;
  end;
  assert failed, 'a time that is not HH:MM is refused';
end $$;
rollback;
