-- Dublikatlar tarixi: only known kinds; admins and heads of sales read
-- their own company's history, managers and other companies don't; the
-- yearly purge job is scheduled.
begin;
insert into organizations (id, name) values
  ('00000000-0000-0000-0000-0000000000f1', 'F'),
  ('00000000-0000-0000-0000-0000000000f2', 'G');
insert into profiles (id, organization_id, role) values
  ('10000000-0000-0000-0000-0000000000f1', '00000000-0000-0000-0000-0000000000f1', 'super_admin'),
  ('10000000-0000-0000-0000-0000000000f2', '00000000-0000-0000-0000-0000000000f1', 'sotuv_menejeri'),
  ('10000000-0000-0000-0000-0000000000f3', '00000000-0000-0000-0000-0000000000f2', 'super_admin');
insert into lead_merge_history (organization_id, kind, survivor_name, merged_name)
values ('00000000-0000-0000-0000-0000000000f1', 'manual', 'Ali', 'Ali 2'),
       ('00000000-0000-0000-0000-0000000000f2', 'repeat', 'Vali', 'Vali');
do $$ begin
  begin
    insert into lead_merge_history (organization_id, kind) values ('00000000-0000-0000-0000-0000000000f1', 'deleted');
    assert false, 'an unknown kind is refused';
  exception when check_violation then null;
  end;
  assert exists (select 1 from cron.job where jobname = 'lead-merge-history-purge'), 'purge job scheduled';
end $$;
-- The nightly automatic merge (merge_lead_into) writes its history row.
insert into contacts (id, organization_id, phone) values
  ('c0000000-0000-0000-0000-0000000000f1', '00000000-0000-0000-0000-0000000000f1', '+998904823715');
insert into leads (id, organization_id, name, funnel, contact_id, source, created_at) values
  ('a0000000-0000-0000-0000-0000000000f1', '00000000-0000-0000-0000-0000000000f1', 'Old', 'Asosiy', 'c0000000-0000-0000-0000-0000000000f1', 'Sayt', now() - interval '2 days'),
  ('a0000000-0000-0000-0000-0000000000f2', '00000000-0000-0000-0000-0000000000f1', 'New', 'Asosiy', 'c0000000-0000-0000-0000-0000000000f1', 'Bot', now());
select public.merge_lead_into('a0000000-0000-0000-0000-0000000000f1', 'a0000000-0000-0000-0000-0000000000f2');
do $$ begin
  assert not exists (select 1 from leads where id = 'a0000000-0000-0000-0000-0000000000f2'), 'the loser is gone';
  assert exists (
    select 1 from lead_merge_history
    where kind = 'funnel' and merged_name = 'New' and survivor_name = 'Old'
      and survivor_lead_id = 'a0000000-0000-0000-0000-0000000000f1'
      and snapshot->>'source' = 'Bot' and phone = '+998904823715'
  ), 'the automatic merge is in the history with a snapshot';
end $$;
grant usage on schema auth to authenticated;
grant select on profiles, lead_merge_history to authenticated;
set local role authenticated;
select set_config('test.uid', '10000000-0000-0000-0000-0000000000f1', true);
do $$ begin
  assert (select count(*) from lead_merge_history) = 2, 'the admin reads only their company''s history';
end $$;
select set_config('test.uid', '10000000-0000-0000-0000-0000000000f2', true);
do $$ begin
  assert (select count(*) from lead_merge_history) = 0, 'a manager reads no history';
end $$;
rollback;
