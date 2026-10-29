-- Reja-fakt by stage: every move of a lead into a stage is written to
-- lead_stage_events (also for a lead created in a stage); a stage plan is
-- one per stage, month and person; only managers set plans.
begin;
insert into organizations (id, name) values ('e1000000-0000-0000-0000-000000000001', 'Org');
insert into profiles (id, organization_id, role) values
  ('e1000000-0000-0000-0000-0000000000a1', 'e1000000-0000-0000-0000-000000000001', 'rop'),
  ('e1000000-0000-0000-0000-0000000000a2', 'e1000000-0000-0000-0000-000000000001', 'sotuv_menejeri');
insert into pipeline_stages (id, organization_id, name, is_won) values
  ('e1000000-0000-0000-0000-0000000000f1', 'e1000000-0000-0000-0000-000000000001', 'New', false),
  ('e1000000-0000-0000-0000-0000000000f2', 'e1000000-0000-0000-0000-000000000001', 'Won', true);

do $$
declare
  lid uuid;
begin
  insert into public.leads (organization_id, name, stage_id, owner_id)
  values ('e1000000-0000-0000-0000-000000000001', 'L', 'e1000000-0000-0000-0000-0000000000f1',
          'e1000000-0000-0000-0000-0000000000a2')
  returning id into lid;
  assert (select count(*) from public.lead_stage_events where lead_id = lid) = 1,
    'a lead created in a stage enters it';
  update public.leads set name = 'L2' where id = lid;
  assert (select count(*) from public.lead_stage_events where lead_id = lid) = 1,
    'other changes write nothing';
  update public.leads set stage_id = 'e1000000-0000-0000-0000-0000000000f2' where id = lid;
  assert (select count(*) from public.lead_stage_events
          where lead_id = lid and stage_id = 'e1000000-0000-0000-0000-0000000000f2') = 1,
    'a stage move is written';
  assert (select owner_id from public.lead_stage_events
          where lead_id = lid and stage_id = 'e1000000-0000-0000-0000-0000000000f2')
         = 'e1000000-0000-0000-0000-0000000000a2', 'with the lead owner';
end $$;

grant usage on schema auth to authenticated;
grant select on profiles, leads, pipeline_stages to authenticated;
set local role authenticated;

set local test.uid = 'e1000000-0000-0000-0000-0000000000a1';
do $$
begin
  insert into public.stage_plans (organization_id, month, stage_id, target)
  values ('e1000000-0000-0000-0000-000000000001', '2026-10-01', 'e1000000-0000-0000-0000-0000000000f1', 90);
  begin
    insert into public.stage_plans (organization_id, month, stage_id, target)
    values ('e1000000-0000-0000-0000-000000000001', '2026-10-01', 'e1000000-0000-0000-0000-0000000000f1', 1);
    assert false, 'one team plan per stage and month';
  exception when unique_violation then null;
  end;
  assert (select count(*) from public.lead_stage_events) >= 2, 'the company sees its stage history';
end $$;

set local test.uid = 'e1000000-0000-0000-0000-0000000000a2';
do $$
begin
  begin
    insert into public.stage_plans (organization_id, month, stage_id, target)
    values ('e1000000-0000-0000-0000-000000000001', '2026-11-01', 'e1000000-0000-0000-0000-0000000000f1', 5);
    assert false, 'a rep cannot set plans';
  exception when insufficient_privilege then null;
  end;
end $$;
rollback;
