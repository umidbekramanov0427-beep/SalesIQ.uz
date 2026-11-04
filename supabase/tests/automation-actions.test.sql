-- More automation actions: delay queues the rest, close_tasks, move_funnel,
-- distribute picks the least-loaded person; owner change fires its trigger.
begin;
insert into organizations (id, name) values ('00000000-0000-0000-0000-0000000000a1', 'Auto');
insert into profiles (id, organization_id, full_name) values
  ('10000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000a1', 'Busy'),
  ('10000000-0000-0000-0000-0000000000a2', '00000000-0000-0000-0000-0000000000a1', 'Free');
insert into pipeline_stages (id, organization_id, name, pipeline_name, position) values
  ('20000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000a1', 'Yangi', 'Sotuv', 0),
  ('20000000-0000-0000-0000-0000000000a2', '00000000-0000-0000-0000-0000000000a1', 'Yutuq', 'Kurs', 0),
  ('20000000-0000-0000-0000-0000000000a3', '00000000-0000-0000-0000-0000000000a1', 'Birinchi', 'Kurs', 1);
update pipeline_stages set is_won = true where id = '20000000-0000-0000-0000-0000000000a2';
insert into leads (id, organization_id, name, funnel, stage_id, owner_id) values
  ('40000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000a1', 'L', 'Sotuv', '20000000-0000-0000-0000-0000000000a1', null),
  ('40000000-0000-0000-0000-0000000000a2', '00000000-0000-0000-0000-0000000000a1', 'X', 'Sotuv', '20000000-0000-0000-0000-0000000000a1', '10000000-0000-0000-0000-0000000000a1');
insert into tasks (organization_id, lead_id, title) values
  ('00000000-0000-0000-0000-0000000000a1', '40000000-0000-0000-0000-0000000000a1', 'Call');

select public.apply_automation_actions(
  '[{"type":"close_tasks"},
    {"type":"distribute","ownerIds":["10000000-0000-0000-0000-0000000000a1","10000000-0000-0000-0000-0000000000a2"]},
    {"type":"move_funnel","funnel":"Kurs"},
    {"type":"delay","minutes":30},
    {"type":"add_tag","tag":"later"}]'::jsonb,
  '40000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000a1', null);

do $$
declare l leads; o automation_outbox;
begin
  select * into l from leads where id = '40000000-0000-0000-0000-0000000000a1';
  assert not exists (select 1 from tasks where lead_id = l.id and status <> 'Done'), 'tasks closed';
  assert l.owner_id = '10000000-0000-0000-0000-0000000000a2', 'least-loaded person gets the lead';
  assert l.funnel = 'Kurs' and l.stage_id = '20000000-0000-0000-0000-0000000000a3',
    'moved to the first open stage of the other funnel';
  assert not ('later' = any(l.tags)), 'actions after the delay are not run yet';
  select * into o from automation_outbox where lead_id = l.id;
  assert o.action->>'type' = 'run_actions', 'the rest is queued';
  assert o.action->'actions' = '[{"type":"add_tag","tag":"later"}]'::jsonb, 'only what came after the delay';
  assert o.run_after > now() + interval '29 minutes', 'queued 30 minutes later';
  assert exists (select 1 from lead_activities where lead_id = l.id and type = 'fired' and content = 'owner_changed'),
    'owner change fires the owner_changed trigger';
end $$;

-- daily: once a day for each lead in the stage, after the set time.
insert into automation_rules (organization_id, trigger_type, trigger_stage_id, trigger_time, actions) values
  ('00000000-0000-0000-0000-0000000000a1', 'daily', '20000000-0000-0000-0000-0000000000a1', '00:00',
   '[{"type":"add_note","text":"Kunlik"}]');
select public.process_daily_automations();
select public.process_daily_automations();
do $$ begin
  assert (select count(*) from automation_rule_runs rr join automation_rules r on r.id = rr.rule_id
          where r.trigger_type = 'daily') = 1, 'one run for the one lead left in the stage, not twice';
end $$;
rollback;
