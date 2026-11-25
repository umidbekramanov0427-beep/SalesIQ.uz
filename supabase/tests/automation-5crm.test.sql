-- Triggers as in 5CRM's guide: several conditions at once, «katta yoki
-- teng», a tag among the tags; «Lid egaligi» to one chosen person and only
-- for leads without an owner; «Lidni taqsimlash» skipping owned leads.
begin;
insert into organizations (id, name) values ('00000000-0000-0000-0000-0000000000c1', 'Triggers');
insert into profiles (id, organization_id, full_name) values
  ('10000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-0000000000c1', 'Ali'),
  ('10000000-0000-0000-0000-0000000000c2', '00000000-0000-0000-0000-0000000000c1', 'Vali');
insert into leads (id, organization_id, name, owner_id, tags, budget) values
  ('40000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-0000000000c1', 'Free', null, '{vip}', 500),
  ('40000000-0000-0000-0000-0000000000c2', '00000000-0000-0000-0000-0000000000c1', 'Owned',
   '10000000-0000-0000-0000-0000000000c1', '{}', 50);

do $$
declare l jsonb;
begin
  select to_jsonb(x) into l from leads x where id = '40000000-0000-0000-0000-0000000000c1';
  assert public.automation_condition_matches(l, 'multi',
    null, '[{"field":"budget","operator":"gte","value":"500"},{"field":"tags","operator":"eq","value":"vip"}]'),
    'all conditions hold';
  assert not public.automation_condition_matches(l, 'multi',
    null, '[{"field":"budget","operator":"gte","value":"501"},{"field":"tags","operator":"eq","value":"vip"}]'),
    'one failing condition stops it';
  assert public.automation_condition_matches(l, 'budget', 'lte', '500'), 'kichik yoki teng';
  assert not public.automation_condition_matches(l, 'budget', 'gte', 'abc'), 'a word against a number fails';
  assert public.automation_condition_matches(l, 'tags', 'neq', 'cold'), 'a tag the lead has not';

  perform public.apply_automation_actions(
    '[{"type":"lead_owner","mode":"specific","ownerId":"10000000-0000-0000-0000-0000000000c2","onlyUnowned":true}]'::jsonb,
    '40000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-0000000000c1', null);
  assert (select owner_id from leads where id = '40000000-0000-0000-0000-0000000000c1')
    = '10000000-0000-0000-0000-0000000000c2', 'the chosen person gets an ownerless lead';

  perform public.apply_automation_actions(
    '[{"type":"lead_owner","mode":"specific","ownerId":"10000000-0000-0000-0000-0000000000c2","onlyUnowned":true}]'::jsonb,
    '40000000-0000-0000-0000-0000000000c2', '00000000-0000-0000-0000-0000000000c1', null);
  assert (select owner_id from leads where id = '40000000-0000-0000-0000-0000000000c2')
    = '10000000-0000-0000-0000-0000000000c1', 'an owned lead keeps its owner';

  perform public.apply_automation_actions(
    '[{"type":"distribute","ownerIds":["10000000-0000-0000-0000-0000000000c2"],"onlyUnowned":true}]'::jsonb,
    '40000000-0000-0000-0000-0000000000c2', '00000000-0000-0000-0000-0000000000c1', null);
  assert (select owner_id from leads where id = '40000000-0000-0000-0000-0000000000c2')
    = '10000000-0000-0000-0000-0000000000c1', 'taqsimlash skips an owned lead';
end $$;
rollback;
