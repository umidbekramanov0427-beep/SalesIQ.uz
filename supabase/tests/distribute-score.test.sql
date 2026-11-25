-- «Lidni taqsimlash»: distribute_pick_owner -- in turn by load, the cap on
-- unworked leads, and the score mode preferring the better closer.
begin;
do $$
declare
  org uuid := '00000000-0000-0000-0000-00000000d901';
  a uuid := '10000000-0000-0000-0000-00000000d901';
  b uuid := '10000000-0000-0000-0000-00000000d902';
  pl uuid; s1 uuid; won uuid; ld uuid; pick uuid;
  act jsonb;
begin
  insert into organizations (id, name) values (org, 'D');
  insert into profiles (id, organization_id, role) values (a, org, 'sotuv_menejeri'), (b, org, 'sotuv_menejeri');
  insert into pipelines (id, organization_id, name) values (gen_random_uuid(), org, 'Sotuv') returning id into pl;
  insert into pipeline_stages (organization_id, pipeline_id, name, position) values (org, pl, 'Yangi', 1) returning id into s1;
  insert into pipeline_stages (organization_id, pipeline_id, name, position, is_won) values (org, pl, 'Sotildi', 2, true) returning id into won;
  -- a: two open unworked leads; b: none open, one won and contacted fast.
  insert into leads (organization_id, name, stage_id, owner_id) values (org, 'x1', s1, a), (org, 'x2', s1, a);
  insert into leads (organization_id, name, stage_id, owner_id, first_contact_at) values (org, 'y1', won, b, now());
  insert into leads (organization_id, name, stage_id) values (org, 'new', s1) returning id into ld;

  act := jsonb_build_object('ownerIds', jsonb_build_array(a, b));
  pick := distribute_pick_owner(org, act, ld);
  assert pick = b, 'in turn: the one with fewer open leads';

  act := jsonb_build_object('ownerIds', jsonb_build_array(a), 'maxUnworked', 2);
  pick := distribute_pick_owner(org, act, ld);
  assert pick is null, 'a has 2 unworked: the cap gives nothing';

  act := jsonb_build_object('ownerIds', jsonb_build_array(a), 'maxUnworked', 3);
  pick := distribute_pick_owner(org, act, ld);
  assert pick = a, 'under the cap: given';

  act := jsonb_build_object('ownerIds', jsonb_build_array(a, b), 'mode', 'score');
  pick := distribute_pick_owner(org, act, ld);
  assert pick = b, 'score: the better closer';
end $$;
rollback;
