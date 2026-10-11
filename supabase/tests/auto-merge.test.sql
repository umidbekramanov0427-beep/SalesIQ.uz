-- auto_merge_funnel_duplicates: same funnel + same phone (last 9 digits)
-- fold into the oldest lead with all history; opt-in per organization.
begin;
insert into organizations (id, name) values
  ('00000000-0000-0000-0000-0000000000a1', 'On'), ('00000000-0000-0000-0000-0000000000a2', 'Off');
insert into org_general_settings (organization_id, dedupe_auto_merge) values
  ('00000000-0000-0000-0000-0000000000a1', true), ('00000000-0000-0000-0000-0000000000a2', false);
insert into contacts (id, organization_id, phone) values
  ('c0000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000a1', '+998 90 123-45-67'),
  ('c0000000-0000-0000-0000-0000000000a2', '00000000-0000-0000-0000-0000000000a1', '901234567'),
  ('c0000000-0000-0000-0000-0000000000a3', '00000000-0000-0000-0000-0000000000a2', '901234567');
insert into leads (id, organization_id, name, funnel, contact_id, tags, created_at) values
  ('a0000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000a1', 'Old', 'Sotuv', 'c0000000-0000-0000-0000-0000000000a1', '{vip}', now() - interval '2 days'),
  ('a0000000-0000-0000-0000-0000000000a2', '00000000-0000-0000-0000-0000000000a1', 'New', 'Sotuv', 'c0000000-0000-0000-0000-0000000000a2', '{web}', now() - interval '1 day'),
  ('a0000000-0000-0000-0000-0000000000a3', '00000000-0000-0000-0000-0000000000a1', 'Other funnel', 'Kurs', 'c0000000-0000-0000-0000-0000000000a2', '{}', now()),
  ('a0000000-0000-0000-0000-0000000000a4', '00000000-0000-0000-0000-0000000000a2', 'Off 1', 'Sotuv', 'c0000000-0000-0000-0000-0000000000a3', '{}', now() - interval '1 day'),
  ('a0000000-0000-0000-0000-0000000000a5', '00000000-0000-0000-0000-0000000000a2', 'Off 2', 'Sotuv', 'c0000000-0000-0000-0000-0000000000a3', '{}', now());
insert into tasks (organization_id, title, lead_id) values ('00000000-0000-0000-0000-0000000000a1', 't', 'a0000000-0000-0000-0000-0000000000a2');
insert into lead_scores values ('a0000000-0000-0000-0000-0000000000a1', 1), ('a0000000-0000-0000-0000-0000000000a2', 2);
insert into amocrm_calls (organization_id, lead_id) values ('00000000-0000-0000-0000-0000000000a1', 'a0000000-0000-0000-0000-0000000000a2');

create temp table result as select * from auto_merge_funnel_duplicates();

do $$ begin
  assert (select count(*) from result) = 1, 'only the opted-in org is merged';
  assert not exists (select 1 from leads where id = 'a0000000-0000-0000-0000-0000000000a2'), 'duplicate deleted';
  assert exists (select 1 from leads where id = 'a0000000-0000-0000-0000-0000000000a3'), 'other funnel kept';
  assert (select lead_id from tasks where title = 't') = 'a0000000-0000-0000-0000-0000000000a1', 'task moved';
  assert (select lead_id from amocrm_calls limit 1) = 'a0000000-0000-0000-0000-0000000000a1', 'call (no FK) moved';
  assert (select count(*) from lead_scores) = 1, 'one-row-per-lead table: survivor keeps its row';
  assert (select tags @> '{vip,web,"Qayta murojaat"}' and repeat_count = 1 from leads
          where id = 'a0000000-0000-0000-0000-0000000000a1'), 'tags merged, repeat counted';
  assert (select count(*) from leads where organization_id = '00000000-0000-0000-0000-0000000000a2') = 2,
    'org with the switch off untouched';
end $$;

do $$ begin
  assert (select merged from auto_merge_funnel_duplicates('00000000-0000-0000-0000-0000000000a2')) = 1,
    'a by-hand call for one org merges regardless of the switch';
end $$;
rollback;
