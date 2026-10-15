-- Sales plans: one plan per person (or team) per month; only managers set
-- them; the fact counts deals won inside the month, per owner.
begin;
insert into organizations (id, name) values ('d1000000-0000-0000-0000-000000000001', 'Org');
insert into profiles (id, organization_id, role) values
  ('d1000000-0000-0000-0000-0000000000a1', 'd1000000-0000-0000-0000-000000000001', 'rop'),
  ('d1000000-0000-0000-0000-0000000000a2', 'd1000000-0000-0000-0000-000000000001', 'sotuv_menejeri');
insert into pipeline_stages (id, organization_id, name, is_won) values
  ('d1000000-0000-0000-0000-0000000000f1', 'd1000000-0000-0000-0000-000000000001', 'Open', false),
  ('d1000000-0000-0000-0000-0000000000f2', 'd1000000-0000-0000-0000-000000000001', 'Won', true);
insert into leads (organization_id, name, stage_id, owner_id, expected_revenue, budget, stage_changed_at) values
  ('d1000000-0000-0000-0000-000000000001', 'won in Oct', 'd1000000-0000-0000-0000-0000000000f2', 'd1000000-0000-0000-0000-0000000000a2', 1000, 0, '2026-10-10'),
  ('d1000000-0000-0000-0000-000000000001', 'won in Oct, budget only', 'd1000000-0000-0000-0000-0000000000f2', 'd1000000-0000-0000-0000-0000000000a2', 0, 500, '2026-10-20'),
  ('d1000000-0000-0000-0000-000000000001', 'won in Sep', 'd1000000-0000-0000-0000-0000000000f2', 'd1000000-0000-0000-0000-0000000000a2', 9999, 0, '2026-09-30'),
  ('d1000000-0000-0000-0000-000000000001', 'open', 'd1000000-0000-0000-0000-0000000000f1', 'd1000000-0000-0000-0000-0000000000a2', 7777, 0, '2026-10-05');

grant usage on schema auth to authenticated;
grant select on profiles, leads, pipeline_stages to authenticated;
set local role authenticated;

set local test.uid = 'd1000000-0000-0000-0000-0000000000a1';
do $$
begin
  assert (select deals from public.sales_plan_facts('2026-10-01', '2026-11-01')
          where owner_id = 'd1000000-0000-0000-0000-0000000000a2') = 2, 'two deals won in October';
  assert (select revenue from public.sales_plan_facts('2026-10-01', '2026-11-01')
          where owner_id = 'd1000000-0000-0000-0000-0000000000a2') = 1500, 'revenue, budget when no expected revenue';
  insert into public.sales_plans (organization_id, profile_id, month, target_amount)
  values ('d1000000-0000-0000-0000-000000000001', null, '2026-10-01', 10000),
         ('d1000000-0000-0000-0000-000000000001', 'd1000000-0000-0000-0000-0000000000a2', '2026-10-01', 3000);
  begin
    insert into public.sales_plans (organization_id, profile_id, month, target_amount)
    values ('d1000000-0000-0000-0000-000000000001', null, '2026-10-01', 1);
    assert false, 'one team plan per month';
  exception when unique_violation then null;
  end;
  begin
    insert into public.sales_plans (organization_id, profile_id, month) values ('d1000000-0000-0000-0000-000000000001', null, '2026-10-05');
    assert false, 'month must be the 1st';
  exception when check_violation then null;
  end;
end $$;

set local test.uid = 'd1000000-0000-0000-0000-0000000000a2';
do $$
begin
  assert (select count(*) from public.sales_plans) = 2, 'a rep sees the plans';
  begin
    update public.sales_plans set target_amount = 1;
    if found then assert false, 'a rep cannot change plans'; end if;
  exception when insufficient_privilege then null;
  end;
  assert (select min(target_amount) from public.sales_plans) = 3000, 'plans unchanged by the rep';
end $$;
rollback;
