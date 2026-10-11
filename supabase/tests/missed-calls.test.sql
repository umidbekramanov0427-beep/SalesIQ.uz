-- Missed incoming call -> call-back task; a later talked call closes it.
begin;
insert into organizations (id, name) values ('00000000-0000-0000-0000-0000000000d1', 'Calls');
insert into profiles (id, organization_id, full_name) values
  ('10000000-0000-0000-0000-0000000000d2', '00000000-0000-0000-0000-0000000000d1', 'Rep');

-- (Explicit times: inside one transaction now() never moves.)
insert into pbx_calls (organization_id, direction, from_number, to_number, status, initiated_by, created_at)
values ('00000000-0000-0000-0000-0000000000d1', 'incoming', '+998 90 111-22-33', '101', 'ringing',
        '10000000-0000-0000-0000-0000000000d2', now() - interval '20 minutes');
update pbx_calls set status = 'no_answer' where organization_id = '00000000-0000-0000-0000-0000000000d1';

do $$ begin
  assert (select missed and missed_task_id is not null from pbx_calls
          where organization_id = '00000000-0000-0000-0000-0000000000d1'), 'missed call gets a task';
  assert (select count(*) from tasks where organization_id = '00000000-0000-0000-0000-0000000000d1'
          and priority = 'High' and status = 'Todo'
          and assignee_id = '10000000-0000-0000-0000-0000000000d2') = 1, 'one High task for the rep';
end $$;

-- A second missed call from the same number reuses the open task.
insert into pbx_calls (organization_id, direction, from_number, to_number, status, created_at)
values ('00000000-0000-0000-0000-0000000000d1', 'incoming', '901112233', '101', 'no_answer',
        now() - interval '10 minutes');
do $$ begin
  assert (select count(*) from tasks where organization_id = '00000000-0000-0000-0000-0000000000d1') = 1,
    'no duplicate task for the same number';
end $$;

-- Inserted already completed (history sync / late webhook): must not fail.
insert into pbx_calls (organization_id, direction, from_number, to_number, status, duration_seconds)
values ('00000000-0000-0000-0000-0000000000d1', 'outgoing', '101', '8 (90) 111 22 33', 'completed', 45);
do $$ begin
  assert (select count(*) from pbx_calls where organization_id = '00000000-0000-0000-0000-0000000000d1'
          and missed and callback_call_id is not null) = 2, 'both missed calls marked called back';
  assert (select status from tasks where organization_id = '00000000-0000-0000-0000-0000000000d1') = 'Done',
    'call-back task closed';
  assert (select missed from missed_call_stats where organization_id = '00000000-0000-0000-0000-0000000000d1') = 2,
    'stats count the missed calls';
end $$;
rollback;
