-- Automatic follow-up: a lead is due when the company wrote last, the
-- client has been silent longer than the setting, attempts remain, and
-- the lead is open and the company's own.
begin;
insert into organizations (id, name) values ('c1000000-0000-0000-0000-000000000001', 'Org');
insert into pipeline_stages (id, organization_id, name, is_won) values
  ('c1000000-0000-0000-0000-0000000000f1', 'c1000000-0000-0000-0000-000000000001', 'Open', false),
  ('c1000000-0000-0000-0000-0000000000f2', 'c1000000-0000-0000-0000-000000000001', 'Won', true);
insert into leads (id, organization_id, name, stage_id, amocrm_id) values
  ('c1000000-0000-0000-0000-0000000000a1', 'c1000000-0000-0000-0000-000000000001', 'Due', 'c1000000-0000-0000-0000-0000000000f1', null),
  ('c1000000-0000-0000-0000-0000000000a2', 'c1000000-0000-0000-0000-000000000001', 'Replied', 'c1000000-0000-0000-0000-0000000000f1', null),
  ('c1000000-0000-0000-0000-0000000000a3', 'c1000000-0000-0000-0000-000000000001', 'Too soon', 'c1000000-0000-0000-0000-0000000000f1', null),
  ('c1000000-0000-0000-0000-0000000000a4', 'c1000000-0000-0000-0000-000000000001', 'Won', 'c1000000-0000-0000-0000-0000000000f2', null),
  ('c1000000-0000-0000-0000-0000000000a5', 'c1000000-0000-0000-0000-000000000001', 'amoCRM', 'c1000000-0000-0000-0000-0000000000f1', 77);
insert into lead_telegram_links (organization_id, lead_id, chat_id)
select 'c1000000-0000-0000-0000-000000000001', id, 1000 + row_number() over () from leads
 where organization_id = 'c1000000-0000-0000-0000-000000000001';
insert into lead_telegram_messages (organization_id, lead_id, direction, created_at) values
  ('c1000000-0000-0000-0000-000000000001', 'c1000000-0000-0000-0000-0000000000a1', 'in',  now() - interval '30 hours'),
  ('c1000000-0000-0000-0000-000000000001', 'c1000000-0000-0000-0000-0000000000a1', 'out', now() - interval '26 hours'),
  ('c1000000-0000-0000-0000-000000000001', 'c1000000-0000-0000-0000-0000000000a2', 'out', now() - interval '30 hours'),
  ('c1000000-0000-0000-0000-000000000001', 'c1000000-0000-0000-0000-0000000000a2', 'in',  now() - interval '29 hours'),
  ('c1000000-0000-0000-0000-000000000001', 'c1000000-0000-0000-0000-0000000000a3', 'out', now() - interval '2 hours'),
  ('c1000000-0000-0000-0000-000000000001', 'c1000000-0000-0000-0000-0000000000a4', 'out', now() - interval '30 hours'),
  ('c1000000-0000-0000-0000-000000000001', 'c1000000-0000-0000-0000-0000000000a5', 'out', now() - interval '30 hours');

do $$
begin
  assert (select count(*) from public.followup_candidates(50)) = 0, 'nothing while follow-ups are off';
end $$;

insert into public.org_followup_settings (organization_id, enabled, after_hours, max_attempts)
values ('c1000000-0000-0000-0000-000000000001', true, 24, 1);

do $$
begin
  assert (select array_agg(lead_name) from public.followup_candidates(50)) = array['Due'],
    'only the silent, open, own lead is due';
end $$;

-- After one follow-up (the limit) it is no longer due.
insert into public.lead_followups (organization_id, lead_id, attempt, message)
values ('c1000000-0000-0000-0000-000000000001', 'c1000000-0000-0000-0000-0000000000a1', 1, 'x');
do $$
begin
  assert (select count(*) from public.followup_candidates(50)) = 0, 'max attempts respected';
  assert not has_function_privilege('authenticated', 'public.followup_candidates(integer)', 'execute'),
    'server-only';
end $$;
rollback;
