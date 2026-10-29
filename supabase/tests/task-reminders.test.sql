-- Task reminders: 15 minutes before, at the deadline and 15 minutes after,
-- each step once, only the furthest step for a task that is already late,
-- nothing for done/amoCRM/long-missed tasks, and a later deadline re-arms.
begin;
insert into organizations (id, name) values ('d1000000-0000-0000-0000-000000000001', 'Org');
insert into profiles (id, organization_id, role) values
  ('d1000000-0000-0000-0000-0000000000b1', 'd1000000-0000-0000-0000-000000000001', 'sotuv_menejeri'),
  ('d1000000-0000-0000-0000-0000000000b2', 'd1000000-0000-0000-0000-000000000001', 'sotuv_menejeri');
insert into leads (id, organization_id, name) values
  ('d1000000-0000-0000-0000-0000000000a1', 'd1000000-0000-0000-0000-000000000001', 'Ali');
insert into tasks (organization_id, assignee_id, title, due_date, lead_id, status, amocrm_task_id) values
  ('d1000000-0000-0000-0000-000000000001', 'd1000000-0000-0000-0000-0000000000b1', 'soon', now() + interval '10 minutes', 'd1000000-0000-0000-0000-0000000000a1', 'Todo', null),
  ('d1000000-0000-0000-0000-000000000001', 'd1000000-0000-0000-0000-0000000000b1', 'due', now() - interval '2 minutes', null, 'Todo', null),
  ('d1000000-0000-0000-0000-000000000001', 'd1000000-0000-0000-0000-0000000000b1', 'late', now() - interval '20 minutes', null, 'Todo', null),
  ('d1000000-0000-0000-0000-000000000001', 'd1000000-0000-0000-0000-0000000000b1', 'ancient', now() - interval '2 days', null, 'Todo', null),
  ('d1000000-0000-0000-0000-000000000001', 'd1000000-0000-0000-0000-0000000000b1', 'later', now() + interval '2 hours', null, 'Todo', null),
  ('d1000000-0000-0000-0000-000000000001', 'd1000000-0000-0000-0000-0000000000b1', 'done', now() - interval '2 minutes', null, 'Done', null),
  ('d1000000-0000-0000-0000-000000000001', 'd1000000-0000-0000-0000-0000000000b1', 'amo', now() - interval '2 minutes', null, 'Todo', 5),
  ('d1000000-0000-0000-0000-000000000001', 'd1000000-0000-0000-0000-0000000000b2', 'other', now() - interval '2 minutes', null, 'Todo', null);

do $$
declare
  r record;
  kinds text;
begin
  -- Signed out, the wrapper hands out nothing.
  assert (select count(*) from public.claim_task_reminders()) = 0, 'no reminders without a user';

  perform set_config('test.uid', 'd1000000-0000-0000-0000-0000000000b1', true);
  select string_agg(type || ':' || body, ',' order by type) into kinds from public.claim_task_reminders();
  assert kinds = 'TaskDue:due,TaskOverdue:late,TaskSoon:Ali: soon', 'one reminder per task, furthest step: ' || coalesce(kinds, 'none');
  assert (select count(*) from notifications where user_id = 'd1000000-0000-0000-0000-0000000000b1') = 3, 'notifications written';
  assert (select link from notifications where type = 'TaskSoon') = '/crm/leads/d1000000-0000-0000-0000-0000000000a1', 'links to the lead';
  assert (select count(*) from public.claim_task_reminders()) = 0, 'each step only once';
  assert (select overdue_notified_at is not null from tasks where title = 'ancient'), 'long-missed task marked quietly';

  -- The soon task reaches its deadline: the next step arrives.
  update tasks set due_date = now() - interval '1 minute' where title = 'soon';
  select string_agg(type, ',') into kinds from public.claim_task_reminders();
  assert kinds = 'TaskDue', 'deadline step after the early one: ' || coalesce(kinds, 'none');

  -- Everyone (the cron) picks up the other person's task.
  perform set_config('test.uid', '', true);
  select string_agg(body, ',') into kinds from public.claim_task_reminders_for(null);
  assert kinds = 'other', 'cron claims for everyone: ' || coalesce(kinds, 'none');
end $$;
rollback;
