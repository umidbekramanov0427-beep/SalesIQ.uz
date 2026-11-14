-- Reja va fakt: when a sale reaches a new part of a plan, the plan's
-- people are greeted once ('TeamCelebrate'); the day's first sale too.
begin;
insert into organizations (id, name) values ('e1000000-0000-0000-0000-000000000001', 'Org');
insert into profiles (id, organization_id, role, full_name) values
  ('e1000000-0000-0000-0000-0000000000a1', 'e1000000-0000-0000-0000-000000000001', 'super_admin', 'Boss'),
  ('e1000000-0000-0000-0000-0000000000a2', 'e1000000-0000-0000-0000-000000000001', 'sotuv_menejeri', 'Aziza Karimova'),
  ('e1000000-0000-0000-0000-0000000000a3', 'e1000000-0000-0000-0000-000000000001', 'sotuv_menejeri', 'Jasur');
insert into pipelines (id, organization_id, name) values
  ('e1000000-0000-0000-0000-0000000000b1', 'e1000000-0000-0000-0000-000000000001', 'Kurslar'),
  ('e1000000-0000-0000-0000-0000000000b2', 'e1000000-0000-0000-0000-000000000001', 'Ulgurji');
insert into pipeline_stages (id, organization_id, name, pipeline_id, is_won) values
  ('e1000000-0000-0000-0000-0000000000c1', 'e1000000-0000-0000-0000-000000000001', 'Open', 'e1000000-0000-0000-0000-0000000000b1', false),
  ('e1000000-0000-0000-0000-0000000000c2', 'e1000000-0000-0000-0000-000000000001', 'Won', 'e1000000-0000-0000-0000-0000000000b1', true),
  ('e1000000-0000-0000-0000-0000000000c3', 'e1000000-0000-0000-0000-000000000001', 'Open 2', 'e1000000-0000-0000-0000-0000000000b2', false);
insert into org_general_settings (organization_id, control_settings) values
  ('e1000000-0000-0000-0000-000000000001',
   '{"celebrations": {"firstSale": {"on": true}, "personal": {"audience": "self"}}}');
insert into sales_plans (organization_id, profile_id, pipeline_id, month, target_amount, parts) values
  ('e1000000-0000-0000-0000-000000000001', null, null,
   date_trunc('month', now() at time zone 'Asia/Tashkent')::date, 1000, 4),
  ('e1000000-0000-0000-0000-000000000001', null, 'e1000000-0000-0000-0000-0000000000b1',
   date_trunc('month', now() at time zone 'Asia/Tashkent')::date, 400, 2),
  ('e1000000-0000-0000-0000-000000000001', 'e1000000-0000-0000-0000-0000000000a2', null,
   date_trunc('month', now() at time zone 'Asia/Tashkent')::date, 100, 1);
insert into leads (id, organization_id, name, stage_id, owner_id, expected_revenue) values
  ('e1000000-0000-0000-0000-0000000000d1', 'e1000000-0000-0000-0000-000000000001', 'Big sale', 'e1000000-0000-0000-0000-0000000000c1', 'e1000000-0000-0000-0000-0000000000a2', 300),
  ('e1000000-0000-0000-0000-0000000000d2', 'e1000000-0000-0000-0000-000000000001', 'Other funnel', 'e1000000-0000-0000-0000-0000000000c3', 'e1000000-0000-0000-0000-0000000000a3', 0);

update leads set stage_id = 'e1000000-0000-0000-0000-0000000000c2'
 where id = 'e1000000-0000-0000-0000-0000000000d1';

do $$
begin
  assert (select count(*) from notifications where link like '%c=first%') = 3,
    'the first sale greets all three people';
  assert (select count(*) from notifications where link like '/attendance?tab=reja&c=part&s=confetti&pct=25%') = 3,
    'the company plan: 300 of 1000 is the first quarter, for everyone';
  assert (select count(*) from notifications where link like '%c=part%pct=50%') = 2,
    'the funnel plan: 300 of 400 is half of it, for the head and the funnel''s rep only';
  assert not exists (select 1 from notifications where link like '%pct=50%'
                       and user_id = 'e1000000-0000-0000-0000-0000000000a3'),
    'a rep without leads in that funnel is not greeted for it';
  assert (select count(*) from notifications where link like '%c=personal%') = 1,
    'the personal plan is done, greeted to its owner only (audience self)';
  assert (select title from notifications where link like '%c=personal%') like 'Aziza Karimova shaxsiy%100%',
    'the personal text has the name and the percent';
  assert (select title from notifications where link like '%c=part&s=confetti&pct=25%' limit 1)
         = 'Tabriklayman! Biz rejamizning 25% ini bosib o''tdik — 300 / 1 ming',
    'the default team text, filled';
  assert (select count(*) from plan_milestones) = 3, 'one milestone per plan part';
end $$;

-- Out of the won stage and back: nothing is greeted twice.
update leads set stage_id = 'e1000000-0000-0000-0000-0000000000c1' where id = 'e1000000-0000-0000-0000-0000000000d1';
update leads set stage_id = 'e1000000-0000-0000-0000-0000000000c2' where id = 'e1000000-0000-0000-0000-0000000000d1';
do $$
begin
  assert (select count(*) from notifications where link like '/attendance%') = 6,
    'the same parts are not greeted again';
  assert public.short_money(1250000000) = '1,25 mlrd', 'short money: billions';
  assert public.short_money(250000000) = '250 mln', 'short money: millions';
  assert public.short_money(999) = '999', 'short money: small';
end $$;

-- Switched off: no greeting.
update org_general_settings set control_settings = '{"celebrations": {"team": {"on": false}, "personal": {"on": false}}}';
update sales_plans set target_amount = 300 where profile_id is null and pipeline_id is null;
update leads set stage_id = 'e1000000-0000-0000-0000-0000000000c1' where id = 'e1000000-0000-0000-0000-0000000000d1';
update leads set stage_id = 'e1000000-0000-0000-0000-0000000000c2' where id = 'e1000000-0000-0000-0000-0000000000d1';
do $$
begin
  assert (select count(*) from notifications where link like '/attendance%') = 6, 'switched off: silent';
end $$;
rollback;
