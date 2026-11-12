-- Kanallar va vebinarlar: marketing people of the company keep them; a
-- sales manager without marketing access and other companies see nothing.
begin;
insert into organizations (id, name) values
  ('00000000-0000-0000-0000-0000000000c1', 'W'),
  ('00000000-0000-0000-0000-0000000000c2', 'X');
insert into profiles (id, organization_id, role) values
  ('10000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-0000000000c1', 'marketolog'),
  ('10000000-0000-0000-0000-0000000000c2', '00000000-0000-0000-0000-0000000000c1', 'sotuv_menejeri'),
  ('10000000-0000-0000-0000-0000000000c3', '00000000-0000-0000-0000-0000000000c2', 'super_admin');
insert into marketing_webinars (id, organization_id, title) values
  ('40000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-0000000000c1', 'Kuzgi vebinar'),
  ('40000000-0000-0000-0000-0000000000c2', '00000000-0000-0000-0000-0000000000c2', 'Boshqa');
do $$ begin
  begin
    insert into marketing_channels (organization_id, username) values ('00000000-0000-0000-0000-0000000000c1', '+invite');
    assert false, 'a channel username is a public @name';
  exception when check_violation then null;
  end;
end $$;
grant usage on schema auth to authenticated;
grant select on profiles to authenticated;
set local role authenticated;

select set_config('test.uid', '10000000-0000-0000-0000-0000000000c1', true);
insert into marketing_webinar_samples (webinar_id, organization_id, viewers)
values ('40000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-0000000000c1', 340);
do $$ begin
  assert (select count(*) from marketing_webinars) = 1, 'a marketolog sees their company''s webinars';
  assert (select count(*) from marketing_webinar_samples) = 1, 'and adds viewer counts';
end $$;

select set_config('test.uid', '10000000-0000-0000-0000-0000000000c2', true);
do $$ begin
  assert (select count(*) from marketing_webinars) = 0, 'a manager without marketing access sees none';
end $$;
rollback;
