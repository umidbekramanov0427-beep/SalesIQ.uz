-- Chat templates: company members see and add them; only the author or a
-- head changes them; another company sees nothing.
begin;
insert into organizations (id, name) values
  ('00000000-0000-0000-0000-0000000000c1', 'A'), ('00000000-0000-0000-0000-0000000000c2', 'B');
insert into profiles (id, organization_id, role) values
  ('10000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-0000000000c1', 'sotuv_menejeri'),
  ('10000000-0000-0000-0000-0000000000c2', '00000000-0000-0000-0000-0000000000c1', 'sotuv_menejeri'),
  ('10000000-0000-0000-0000-0000000000c3', '00000000-0000-0000-0000-0000000000c2', 'super_admin');
insert into chat_templates (id, organization_id, group_name, title, body, created_by) values
  ('20000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-0000000000c1', 'Narx', 'Narx', 'Kurs 600 000', '10000000-0000-0000-0000-0000000000c1');
grant usage on schema auth to authenticated;
grant select on profiles to authenticated;
set local role authenticated;

select set_config('test.uid', '10000000-0000-0000-0000-0000000000c2', true);
do $$ begin
  assert (select count(*) from chat_templates) = 1, 'a colleague sees it';
  update chat_templates set body = 'x';
  assert (select body from chat_templates) = 'Kurs 600 000', 'but cannot change someone else''s';
end $$;

select set_config('test.uid', '10000000-0000-0000-0000-0000000000c3', true);
do $$ begin
  assert (select count(*) from chat_templates) = 0, 'another company sees nothing';
end $$;
rollback;
