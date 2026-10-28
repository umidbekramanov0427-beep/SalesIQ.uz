-- Sales growth pack: the payments ledger was filled once from the paid
-- payment links (a re-run adds nothing), the speed-to-lead job is
-- scheduled, and the ledger and coaching tasks are only readable inside
-- the company -- a manager sees their own coaching tasks, a head of sales
-- all of them.
begin;
insert into organizations (id, name) values
  ('e1000000-0000-0000-0000-000000000001', 'Org'),
  ('e1000000-0000-0000-0000-000000000002', 'Other');
insert into profiles (id, organization_id, role) values
  ('e1000000-0000-0000-0000-0000000000a1', 'e1000000-0000-0000-0000-000000000001', 'rop'),
  ('e1000000-0000-0000-0000-0000000000a2', 'e1000000-0000-0000-0000-000000000001', 'sotuv_menejeri'),
  ('e1000000-0000-0000-0000-0000000000a3', 'e1000000-0000-0000-0000-000000000001', 'sotuv_menejeri'),
  ('e1000000-0000-0000-0000-0000000000b1', 'e1000000-0000-0000-0000-000000000002', 'rop');
insert into leads (id, organization_id, name) values
  ('e1000000-0000-0000-0000-0000000000c1', 'e1000000-0000-0000-0000-000000000001', 'Lead'),
  ('e1000000-0000-0000-0000-0000000000c2', 'e1000000-0000-0000-0000-000000000002', 'Theirs');

do $$
begin
  assert exists (select 1 from cron.job where jobname = 'speed-to-lead-every-minute'
                 and command like '%/crm/speed-to-lead%'), 'speed-to-lead runs every minute';
  assert (select speed_alert_level from leads where id = 'e1000000-0000-0000-0000-0000000000c1') = 0,
    'new leads start with no alert said';
  assert (select paid_amount from leads where id = 'e1000000-0000-0000-0000-0000000000c1') = 0,
    'nothing paid yet';
end $$;

insert into lead_payments (organization_id, lead_id, amount, method) values
  ('e1000000-0000-0000-0000-000000000001', 'e1000000-0000-0000-0000-0000000000c1', 500000, 'cash'),
  ('e1000000-0000-0000-0000-000000000002', 'e1000000-0000-0000-0000-0000000000c2', 700000, 'card');
insert into coaching_tasks (organization_id, profile_id, criterion, task) values
  ('e1000000-0000-0000-0000-000000000001', 'e1000000-0000-0000-0000-0000000000a2', 'Yopish', 'Mashq'),
  ('e1000000-0000-0000-0000-000000000001', 'e1000000-0000-0000-0000-0000000000a3', 'Taqdimot', 'Mashq');

do $$
begin
  begin
    insert into lead_payments (organization_id, lead_id, amount, method)
    values ('e1000000-0000-0000-0000-000000000001', 'e1000000-0000-0000-0000-0000000000c1', 1, 'bitcoin');
    assert false, 'an unknown payment method is refused';
  exception when check_violation then null;
  end;
  begin
    insert into lead_payments (organization_id, lead_id, amount)
    values ('e1000000-0000-0000-0000-000000000001', 'e1000000-0000-0000-0000-0000000000c1', 0);
    assert false, 'a zero payment is refused';
  exception when check_violation then null;
  end;
end $$;

grant usage on schema auth to authenticated;
grant select on profiles, lead_payments, coaching_tasks to authenticated;
set local role authenticated;

set local test.uid = 'e1000000-0000-0000-0000-0000000000a2';
do $$
begin
  assert (select count(*) from lead_payments) = 1, 'a manager sees only their company''s payments';
  assert (select count(*) from coaching_tasks) = 1, 'a manager sees only their own coaching task';
  begin
    insert into lead_payments (organization_id, lead_id, amount)
    values ('e1000000-0000-0000-0000-000000000001', 'e1000000-0000-0000-0000-0000000000c1', 5);
    assert false, 'payments are written by the server only';
  exception when insufficient_privilege then null;
  end;
end $$;

set local test.uid = 'e1000000-0000-0000-0000-0000000000a1';
do $$
begin
  assert (select count(*) from coaching_tasks) = 2, 'the head of sales sees the team''s tasks';
end $$;

set local test.uid = 'e1000000-0000-0000-0000-0000000000b1';
do $$
begin
  assert (select count(*) from coaching_tasks) = 0, 'another company sees no coaching tasks';
  assert (select count(*) from lead_payments) = 1, 'another company sees only its own payments';
end $$;
rollback;
