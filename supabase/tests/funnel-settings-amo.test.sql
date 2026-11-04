-- Funnel settings: lead notifications follow the company's switches, the
-- celebration stage tells everyone once, a stage trigger runs for the leads
-- already there.
begin;
insert into organizations (id, name) values ('00000000-0000-0000-0000-0000000000f1', 'Amo');
insert into profiles (id, organization_id, full_name, role) values
  ('10000000-0000-0000-0000-0000000000f1', '00000000-0000-0000-0000-0000000000f1', 'Rahbar', 'super_admin'),
  ('10000000-0000-0000-0000-0000000000f2', '00000000-0000-0000-0000-0000000000f1', 'Ali', 'sotuv_menejeri');
insert into pipelines (id, organization_id, name) values
  ('30000000-0000-0000-0000-0000000000f1', '00000000-0000-0000-0000-0000000000f1', 'Sotuv');
insert into pipeline_stages (id, organization_id, name, pipeline_name, pipeline_id, position, is_won) values
  ('20000000-0000-0000-0000-0000000000f1', '00000000-0000-0000-0000-0000000000f1', 'Yangi', 'Sotuv', '30000000-0000-0000-0000-0000000000f1', 0, false),
  ('20000000-0000-0000-0000-0000000000f2', '00000000-0000-0000-0000-0000000000f1', 'Avans', 'Sotuv', '30000000-0000-0000-0000-0000000000f1', 1, false),
  ('20000000-0000-0000-0000-0000000000f3', '00000000-0000-0000-0000-0000000000f1', 'Sotildi', 'Sotuv', '30000000-0000-0000-0000-0000000000f1', 2, true);
insert into org_general_settings (organization_id) values ('00000000-0000-0000-0000-0000000000f1');
insert into leads (id, organization_id, name, funnel, stage_id) values
  ('40000000-0000-0000-0000-0000000000f1', '00000000-0000-0000-0000-0000000000f1', 'Lid', 'Sotuv', '20000000-0000-0000-0000-0000000000f1');

-- The head assigns the lead to Ali and moves it: Ali hears about both.
set local test.uid = '10000000-0000-0000-0000-0000000000f1';
update leads set owner_id = '10000000-0000-0000-0000-0000000000f2' where id = '40000000-0000-0000-0000-0000000000f1';
update leads set stage_id = '20000000-0000-0000-0000-0000000000f2' where id = '40000000-0000-0000-0000-0000000000f1';
do $$ begin
  assert (select count(*) from notifications where user_id = '10000000-0000-0000-0000-0000000000f2' and type = 'LeadOwner') = 1, 'owner told';
  assert (select count(*) from notifications where user_id = '10000000-0000-0000-0000-0000000000f2' and type = 'LeadStage') = 1, 'stage change told';
end $$;

-- Switched off: no stage-change notice; Ali moving his own lead never notifies.
update org_general_settings set notify_stage_changed = false where organization_id = '00000000-0000-0000-0000-0000000000f1';
update leads set stage_id = '20000000-0000-0000-0000-0000000000f1' where id = '40000000-0000-0000-0000-0000000000f1';
do $$ begin
  assert (select count(*) from notifications where type = 'LeadStage') = 1, 'switch respected';
end $$;

-- Celebration on "Avans": everyone in the company, only the first time.
update pipelines set celebrate_stage_id = '20000000-0000-0000-0000-0000000000f2' where id = '30000000-0000-0000-0000-0000000000f1';
insert into lead_stage_events (organization_id, lead_id, stage_id) values
  ('00000000-0000-0000-0000-0000000000f1', '40000000-0000-0000-0000-0000000000f1', '20000000-0000-0000-0000-0000000000f2');
update leads set stage_id = '20000000-0000-0000-0000-0000000000f2' where id = '40000000-0000-0000-0000-0000000000f1';
do $$ begin
  assert (select count(*) from notifications where type = 'SaleCelebrate') = 0, 'a lead back on the stage is not celebrated again';
end $$;
delete from lead_stage_events;
update leads set stage_id = '20000000-0000-0000-0000-0000000000f1' where id = '40000000-0000-0000-0000-0000000000f1';
update leads set stage_id = '20000000-0000-0000-0000-0000000000f2' where id = '40000000-0000-0000-0000-0000000000f1';
do $$ begin
  assert (select count(*) from notifications where type = 'SaleCelebrate') = 2, 'everyone celebrates the first time';
  assert (select title from notifications where type = 'SaleCelebrate' limit 1) = 'Ali', 'with the seller''s name';
end $$;

-- Sale congratulates the owner unless switched off.
update leads set stage_id = '20000000-0000-0000-0000-0000000000f3' where id = '40000000-0000-0000-0000-0000000000f1';
do $$ begin
  assert (select count(*) from notifications where type = 'LeadWon') = 1, 'sale congratulated';
end $$;

-- A stage trigger applied to the leads already in the stage.
insert into automation_rules (id, organization_id, name, trigger_stage_id, actions) values
  ('50000000-0000-0000-0000-0000000000f1', '00000000-0000-0000-0000-0000000000f1', 'Teg',
   '20000000-0000-0000-0000-0000000000f3', '[{"type":"add_tag","tag":"vip"}]');
do $$ begin
  assert public.apply_automation_rule_to_stage('50000000-0000-0000-0000-0000000000f1') = 1, 'one lead in the stage';
  assert (select 'vip' = any(tags) from leads where id = '40000000-0000-0000-0000-0000000000f1'), 'its actions ran';
end $$;
set local test.uid = '10000000-0000-0000-0000-0000000000f2';
do $$ begin
  begin
    perform public.apply_automation_rule_to_stage('50000000-0000-0000-0000-0000000000f1');
    assert false, 'a manager cannot run it';
  exception when others then
    assert sqlerrm = 'not allowed', sqlerrm;
  end;
end $$;
rollback;
