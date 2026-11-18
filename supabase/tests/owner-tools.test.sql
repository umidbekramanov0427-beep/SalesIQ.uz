-- Owner tools: support messages may carry a file; announcement views and
-- owner access are server-only.
begin;
insert into organizations (id, name) values ('e1000000-0000-0000-0000-000000000001', 'Org');
insert into auth.users (id) values ('e1000000-0000-0000-0000-0000000000a1') on conflict do nothing;
insert into profiles (id, organization_id, role) values
  ('e1000000-0000-0000-0000-0000000000a1', 'e1000000-0000-0000-0000-000000000001', 'super_admin')
  on conflict do nothing;
do $$
begin
  insert into support_messages (organization_id, user_id, direction, text, file_path, file_name)
  values ('e1000000-0000-0000-0000-000000000001', 'e1000000-0000-0000-0000-0000000000a1', 'in', '',
          'e1/support/x.png', 'x.png');
  begin
    insert into support_messages (organization_id, user_id, direction, text)
    values ('e1000000-0000-0000-0000-000000000001', 'e1000000-0000-0000-0000-0000000000a1', 'in', '');
    assert false, 'a message with neither text nor file is refused';
  exception when check_violation then null;
  end;
  assert has_table_privilege('authenticated', 'public.platform_owner_access', 'select') = false,
    'owner access is server-only';
  assert has_table_privilege('authenticated', 'public.platform_announcement_views', 'select') = false,
    'announcement views are server-only';
end $$;
rollback;
