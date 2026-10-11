-- stage_task_violations: leads in a task-required stage with no open task.
begin;
insert into organizations (id, name) values ('00000000-0000-0000-0000-0000000000b1', 'Tasks');
insert into profiles (id, organization_id, full_name, role) values
  ('10000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-0000000000b1', 'Rop', 'rop'),
  ('10000000-0000-0000-0000-0000000000b2', '00000000-0000-0000-0000-0000000000b1', 'Rep', 'sotuv_menejeri');
insert into pipeline_stages (id, organization_id, name) values
  ('50000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-0000000000b1', 'Jarayonda');
insert into pipeline_stage_rules (organization_id, stage_id, requires_task) values
  ('00000000-0000-0000-0000-0000000000b1', '50000000-0000-0000-0000-0000000000b1', true);
insert into leads (id, organization_id, name, stage_id, owner_id) values
  ('a0000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-0000000000b1', 'No task', '50000000-0000-0000-0000-0000000000b1', '10000000-0000-0000-0000-0000000000b2'),
  ('a0000000-0000-0000-0000-0000000000b2', '00000000-0000-0000-0000-0000000000b1', 'Has task', '50000000-0000-0000-0000-0000000000b1', '10000000-0000-0000-0000-0000000000b2');
insert into tasks (organization_id, title, lead_id) values
  ('00000000-0000-0000-0000-0000000000b1', 'open', 'a0000000-0000-0000-0000-0000000000b2');

set local test.uid = '10000000-0000-0000-0000-0000000000b1';
do $$ begin
  assert (select count(*) from stage_task_violations()) = 1, 'one lead without a task';
  assert (select lead_name from stage_task_violations()) = 'No task', 'it is the right lead';
end $$;

set local test.uid = '10000000-0000-0000-0000-0000000000b2';
do $$
declare refused boolean := false;
begin
  begin perform * from stage_task_violations(); exception when others then refused := true; end;
  assert refused, 'a rep may not list violations';
end $$;
rollback;
