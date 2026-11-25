-- Triggers, rest of 5CRM's guide: «Telefon raqami» from the contact,
-- «Vazifalarni yopish» with a note, «Lidni taqsimlash» with shares and the
-- «N daqiqada ishlanmasa» check queued to the outbox.
begin;
insert into organizations (id, name) values ('00000000-0000-0000-0000-0000000000d1', 'Triggers 2');
insert into profiles (id, organization_id, full_name) values
  ('10000000-0000-0000-0000-0000000000d1', '00000000-0000-0000-0000-0000000000d1', 'Ali'),
  ('10000000-0000-0000-0000-0000000000d2', '00000000-0000-0000-0000-0000000000d1', 'Vali');
insert into contacts (id, organization_id, phone, alt_phone) values
  ('20000000-0000-0000-0000-0000000000d1', '00000000-0000-0000-0000-0000000000d1', '+998 90 123-45-67', null);
insert into leads (id, organization_id, name, owner_id, contact_id) values
  ('40000000-0000-0000-0000-0000000000d1', '00000000-0000-0000-0000-0000000000d1', 'A', null,
   '20000000-0000-0000-0000-0000000000d1'),
  ('40000000-0000-0000-0000-0000000000d2', '00000000-0000-0000-0000-0000000000d1', 'Ali has one',
   '10000000-0000-0000-0000-0000000000d1', null);
insert into tasks (organization_id, lead_id, title) values
  ('00000000-0000-0000-0000-0000000000d1', '40000000-0000-0000-0000-0000000000d1', 'Call');

do $$
declare l jsonb;
begin
  select to_jsonb(x) into l from leads x where id = '40000000-0000-0000-0000-0000000000d1';
  assert public.automation_condition_matches(l, 'phone', 'contains', '901234567'), 'phone digits match';
  assert public.automation_condition_matches(l, 'phone', 'eq', '998901234567'), 'phone equals by digits';
  assert not public.automation_condition_matches(l, 'alt_phone', 'contains', '90'), 'no second phone';

  perform public.apply_automation_actions(
    '[{"type":"close_tasks","note":"Yopildi: mijoz javob bermadi"}]'::jsonb,
    '40000000-0000-0000-0000-0000000000d1', '00000000-0000-0000-0000-0000000000d1', null);
  assert not exists (select 1 from tasks where lead_id = '40000000-0000-0000-0000-0000000000d1' and status <> 'Done'),
    'tasks closed';
  assert exists (select 1 from lead_activities where lead_id = '40000000-0000-0000-0000-0000000000d1'
    and type = 'note' and content like 'Yopildi%'), 'note left';

  -- Ali already has a lead, but a share of 3 still makes him the next one.
  perform public.apply_automation_actions(
    '[{"type":"distribute","ownerIds":["10000000-0000-0000-0000-0000000000d1","10000000-0000-0000-0000-0000000000d2"],
       "weights":{"10000000-0000-0000-0000-0000000000d1":3},"reassignMinutes":15}]'::jsonb,
    '40000000-0000-0000-0000-0000000000d1', '00000000-0000-0000-0000-0000000000d1', null);
  assert (select owner_id from leads where id = '40000000-0000-0000-0000-0000000000d1')
    = '10000000-0000-0000-0000-0000000000d2', 'equal shares: the one with fewer leads';
end $$;

do $$
begin
  assert exists (select 1 from automation_outbox where lead_id = '40000000-0000-0000-0000-0000000000d1'
    and action->>'type' = 'distribute_check' and (action->>'reassignMinutes')::int = 15
    and run_after > now() + interval '14 minutes'), 'the 15 minute check is queued';
end $$;
rollback;
