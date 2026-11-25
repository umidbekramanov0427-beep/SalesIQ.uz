-- Profile (20270206): the stage-change notice only for the chosen stages
-- and, when asked, also for a trigger's move; the open business card; the
-- bound device kept out of a person's own hands.
begin;
insert into organizations (id, name) values ('00000000-0000-0000-0000-0000000000e1', 'Profil');
insert into profiles (id, organization_id, full_name, position, phone) values
  ('10000000-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-0000000000e1', 'Ali', 'Menejer', '+998901112233'),
  ('10000000-0000-0000-0000-0000000000e2', '00000000-0000-0000-0000-0000000000e1', 'Vali', null, null);
insert into pipeline_stages (id, organization_id, name) values
  ('30000000-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-0000000000e1', 'A'),
  ('30000000-0000-0000-0000-0000000000e2', '00000000-0000-0000-0000-0000000000e1', 'B'),
  ('30000000-0000-0000-0000-0000000000e3', '00000000-0000-0000-0000-0000000000e1', 'C');
insert into org_general_settings (organization_id, notify_stage_ids)
  values ('00000000-0000-0000-0000-0000000000e1', array['30000000-0000-0000-0000-0000000000e2']::uuid[]);
insert into leads (id, organization_id, name, owner_id, stage_id) values
  ('40000000-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-0000000000e1', 'Lid',
   '10000000-0000-0000-0000-0000000000e1', '30000000-0000-0000-0000-0000000000e1');

-- Vali moves Ali's lead to C (not chosen): no notice; to B (chosen): notice.
select set_config('test.uid', '10000000-0000-0000-0000-0000000000e2', true);
update leads set stage_id = '30000000-0000-0000-0000-0000000000e3' where id = '40000000-0000-0000-0000-0000000000e1';
do $$ begin
  assert not exists (select 1 from notifications where type = 'LeadStage'), 'C is not a chosen stage';
end $$;
update leads set stage_id = '30000000-0000-0000-0000-0000000000e2' where id = '40000000-0000-0000-0000-0000000000e1';
do $$ begin
  assert (select count(*) from notifications where type = 'LeadStage') = 1, 'B is chosen';
end $$;

-- A trigger's move (no signed-in person) tells only when «robot» is on.
select set_config('test.uid', '', true);
update leads set stage_id = '30000000-0000-0000-0000-0000000000e1' where id = '40000000-0000-0000-0000-0000000000e1';
update org_general_settings set notify_stage_ids = null where organization_id = '00000000-0000-0000-0000-0000000000e1';
update leads set stage_id = '30000000-0000-0000-0000-0000000000e3' where id = '40000000-0000-0000-0000-0000000000e1';
do $$ begin
  assert (select count(*) from notifications where type = 'LeadStage') = 1, 'robot moves are quiet by default';
end $$;
update org_general_settings set notify_stage_robot = true where organization_id = '00000000-0000-0000-0000-0000000000e1';
update leads set stage_id = '30000000-0000-0000-0000-0000000000e2' where id = '40000000-0000-0000-0000-0000000000e1';
do $$ begin
  assert (select count(*) from notifications where type = 'LeadStage') = 2, 'robot moves tell when on';
end $$;

-- Business card: only with the full code, only the card's fields.
update profiles set vcard_code = 'abcdEFGH1234' where id = '10000000-0000-0000-0000-0000000000e1';
do $$ declare c jsonb; begin
  c := public.public_vcard('abcdEFGH1234');
  assert c->>'name' = 'Ali' and c->>'company' = 'Profil' and c->>'position' = 'Menejer', 'card fields';
  assert not (c ? 'role') and not (c ? 'organization_id'), 'nothing else';
  assert public.public_vcard('abcd') is null, 'a short code finds nothing';
end $$;

-- A person cannot bind or unbind their own device; the server can.
select set_config('test.uid', '10000000-0000-0000-0000-0000000000e1', true);
update profiles set bound_device_id = 'mine' where id = '10000000-0000-0000-0000-0000000000e1';
do $$ begin
  assert (select bound_device_id from profiles where id = '10000000-0000-0000-0000-0000000000e1') is null,
    'not by the person';
end $$;
select set_config('test.uid', '', true);
update profiles set bound_device_id = 'dev-1' where id = '10000000-0000-0000-0000-0000000000e1';
do $$ begin
  assert (select bound_device_id from profiles where id = '10000000-0000-0000-0000-0000000000e1') = 'dev-1',
    'by the server';
end $$;
rollback;
