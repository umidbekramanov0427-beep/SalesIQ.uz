-- Lidlar savati: a person's delete keeps the lead and its rows in
-- leads_trash; restoring brings them back with the same ids, clears a
-- reference to a manager who has left, moves a lead whose stage was
-- removed to the funnel's first open stage, and fires no trigger.
begin;
-- The real schema's references (the stub leaves them out).
alter table leads add foreign key (owner_id) references profiles(id) on delete set null;
alter table leads add foreign key (stage_id) references pipeline_stages(id);
alter table lead_telegram_messages add foreign key (sent_by) references profiles(id) on delete set null;
insert into organizations (id, name) values ('00000000-0000-0000-0000-0000000000b8', 'T');
insert into profiles (id, organization_id, role) values
  ('10000000-0000-0000-0000-0000000000b8', '00000000-0000-0000-0000-0000000000b8', 'super_admin'),
  ('20000000-0000-0000-0000-0000000000b8', '00000000-0000-0000-0000-0000000000b8', 'sotuv_menejeri');
insert into pipeline_stages (id, organization_id, name, pipeline_name, position) values
  ('50000000-0000-0000-0000-0000000000b8', '00000000-0000-0000-0000-0000000000b8', 'Yangi', 'Sotuv', 1),
  ('60000000-0000-0000-0000-0000000000b8', '00000000-0000-0000-0000-0000000000b8', 'Demo', 'Sotuv', 2);
insert into leads (id, organization_id, name, funnel, owner_id, stage_id) values
  ('40000000-0000-0000-0000-0000000000b8', '00000000-0000-0000-0000-0000000000b8', 'Aziz', 'Sotuv',
   '20000000-0000-0000-0000-0000000000b8', '60000000-0000-0000-0000-0000000000b8');
insert into tasks (organization_id, title, lead_id) values
  ('00000000-0000-0000-0000-0000000000b8', 'Qo''ng''iroq', '40000000-0000-0000-0000-0000000000b8');
insert into lead_telegram_messages (organization_id, lead_id, direction, text, sent_by) values
  ('00000000-0000-0000-0000-0000000000b8', '40000000-0000-0000-0000-0000000000b8', 'in', 'Salom', null),
  ('00000000-0000-0000-0000-0000000000b8', '40000000-0000-0000-0000-0000000000b8', 'out', 'Assalomu alaykum',
   '20000000-0000-0000-0000-0000000000b8');
insert into pbx_calls (organization_id, lead_id, to_number) values
  ('00000000-0000-0000-0000-0000000000b8', '40000000-0000-0000-0000-0000000000b8', '998901112233');

-- A server-side delete (no auth.uid()) is not trashed.
insert into leads (id, organization_id, name) values
  ('70000000-0000-0000-0000-0000000000b8', '00000000-0000-0000-0000-0000000000b8', 'Sync');
delete from leads where id = '70000000-0000-0000-0000-0000000000b8';

select set_config('test.uid', '10000000-0000-0000-0000-0000000000b8', true);
delete from leads where id = '40000000-0000-0000-0000-0000000000b8';
select set_config('test.uid', '', true);

do $$
declare t leads_trash%rowtype;
begin
  assert (select count(*) from leads_trash) = 1, 'only the person''s delete is trashed';
  select * into t from leads_trash;
  assert t.name = 'Aziz' and t.deleted_by = '10000000-0000-0000-0000-0000000000b8', 'who and what';
  assert jsonb_array_length(t.children -> 'tasks') = 1, 'its task is kept';
  assert jsonb_array_length(t.children -> 'lead_telegram_messages') = 2, 'its chat is kept';
  assert jsonb_array_length(t.links -> 'pbx_calls' -> 'ids') = 1, 'its call link is kept';
  assert (select lead_id from pbx_calls) is null, 'the call itself stays, unlinked';
end $$;

-- Meanwhile the manager left and the lead's stage was removed.
delete from profiles where id = '20000000-0000-0000-0000-0000000000b8';
delete from pipeline_stages where id = '60000000-0000-0000-0000-0000000000b8';
do $$
declare v_saved int := (select coalesce(jsonb_array_length(children -> 'lead_activities'), 0) from leads_trash);
begin
  assert restore_trashed_lead('00000000-0000-0000-0000-0000000000a1', '40000000-0000-0000-0000-0000000000b8') = 'missing',
    'another company can''t restore it';
  assert restore_trashed_lead('00000000-0000-0000-0000-0000000000b8', '40000000-0000-0000-0000-0000000000b8') = 'ok',
    'restored';
  assert (select owner_id from leads where id = '40000000-0000-0000-0000-0000000000b8') is null,
    'the manager who left is cleared';
  assert (select stage_id from leads where id = '40000000-0000-0000-0000-0000000000b8')
    = '50000000-0000-0000-0000-0000000000b8', 'the removed stage falls back to the funnel''s first one';
  assert (select count(*) from tasks where lead_id = '40000000-0000-0000-0000-0000000000b8') = 1, 'task back';
  assert (select count(*) from lead_telegram_messages where lead_id = '40000000-0000-0000-0000-0000000000b8') = 2,
    'chat back';
  assert (select sent_by from lead_telegram_messages where direction = 'out') is null,
    'a message by the manager who left loses only its author';
  assert (select lead_id from pbx_calls) = '40000000-0000-0000-0000-0000000000b8', 'call linked back';
  assert (select count(*) from leads_trash) = 0, 'the trash entry is gone';
  assert (select count(*) from lead_activities) = v_saved, 'only the saved notes come back: no automation fired';
  assert current_setting('session_replication_role') = 'origin', 'triggers back on';
end $$;
rollback;
