-- Funnel duplicate modes: repeat blocks a second lead for the same client,
-- "new" lets it in, and a won lead counts the next request as a new purchase.
begin;
insert into organizations (id, name) values ('00000000-0000-0000-0000-0000000000e1', 'Dup');
insert into pipelines (organization_id, name) values ('00000000-0000-0000-0000-0000000000e1', 'Kurs');
insert into pipeline_stages (id, organization_id, name) values
  ('20000000-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-0000000000e1', 'Yangi'),
  ('20000000-0000-0000-0000-0000000000e2', '00000000-0000-0000-0000-0000000000e1', 'Sotildi');
update pipeline_stages set is_won = true where id = '20000000-0000-0000-0000-0000000000e2';
insert into contacts (id, organization_id, phone) values
  ('30000000-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-0000000000e1', '+998 90 777 11 22'),
  ('30000000-0000-0000-0000-0000000000e2', '00000000-0000-0000-0000-0000000000e1', '907771122');
insert into leads (id, organization_id, name, funnel, contact_id, stage_id) values
  ('40000000-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-0000000000e1', 'A', 'Kurs',
   '30000000-0000-0000-0000-0000000000e1', '20000000-0000-0000-0000-0000000000e1');
select set_config('test.uid', '10000000-0000-0000-0000-0000000000e9', true);

-- repeat (default): blocked
do $$ begin
  begin
    insert into leads (organization_id, name, funnel, contact_id)
    values ('00000000-0000-0000-0000-0000000000e1', 'B', 'Kurs', '30000000-0000-0000-0000-0000000000e2');
    assert false, 'repeat mode must block a second lead';
  exception when others then
    assert sqlerrm like 'duplicate_in_funnel:%', 'blocked with the existing lead id: ' || sqlerrm;
  end;
end $$;

-- new: allowed
update pipelines set dedupe_mode = 'new' where name = 'Kurs';
insert into leads (organization_id, name, funnel, contact_id)
values ('00000000-0000-0000-0000-0000000000e1', 'C', 'Kurs', '30000000-0000-0000-0000-0000000000e2');
do $$ begin
  assert (select count(*) from leads where organization_id = '00000000-0000-0000-0000-0000000000e1') = 2,
    'new mode lets the second lead in';
end $$;
delete from leads where name = 'C';

-- repeat again, but the existing lead is won: a new purchase is allowed
update pipelines set dedupe_mode = 'repeat' where name = 'Kurs';
update leads set stage_id = '20000000-0000-0000-0000-0000000000e2' where name = 'A';
insert into leads (organization_id, name, funnel, contact_id)
values ('00000000-0000-0000-0000-0000000000e1', 'D', 'Kurs', '30000000-0000-0000-0000-0000000000e2');

-- the mode is checked
do $$ begin
  begin
    update pipelines set dedupe_mode = 'whatever';
    assert false, 'unknown mode must be refused';
  exception when check_violation then null;
  end;
end $$;
rollback;
