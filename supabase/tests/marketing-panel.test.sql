-- Marketing paneli: a marketolog reads none of the CRM's leads or tasks but
-- keeps the company's ad-spend lines (and only those); an admin is not
-- affected; someone given marketing access keeps ad spend too.
begin;
insert into organizations (id, name) values ('00000000-0000-0000-0000-0000000000a7', 'M');
insert into profiles (id, organization_id, role) values
  ('10000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000a7', 'super_admin'),
  ('10000000-0000-0000-0000-0000000000a2', '00000000-0000-0000-0000-0000000000a7', 'marketolog'),
  ('10000000-0000-0000-0000-0000000000a3', '00000000-0000-0000-0000-0000000000a7', 'sotuv_menejeri');
update profiles set marketing_access = true where id = '10000000-0000-0000-0000-0000000000a3';
insert into leads (organization_id, name) values ('00000000-0000-0000-0000-0000000000a7', 'Mijoz');
insert into finance_entries (organization_id, kind, category, source, amount) values
  ('00000000-0000-0000-0000-0000000000a7', 'expense', 'marketing', 'Instagram', 100),
  ('00000000-0000-0000-0000-0000000000a7', 'expense', 'rent', null, 900);
grant usage on schema auth to authenticated;
grant select on profiles to authenticated;
grant select, insert, update, delete on leads to authenticated;
drop policy if exists leads_test_all on leads;
alter table leads enable row level security;
create policy leads_test_all on leads for all to authenticated using (organization_id = current_user_org_id());
set local role authenticated;

select set_config('test.uid', '10000000-0000-0000-0000-0000000000a1', true);
do $$ begin
  assert (select count(*) from leads) = 1, 'the admin still sees leads';
  assert (select count(*) from finance_entries) = 2, 'the admin sees every line';
end $$;

select set_config('test.uid', '10000000-0000-0000-0000-0000000000a2', true);
do $$ begin
  assert (select count(*) from leads) = 0, 'a marketolog sees no leads';
  assert (select count(*) from finance_entries) = 1, 'a marketolog sees ad spend only';
  insert into finance_entries (organization_id, kind, category, source, amount)
  values ('00000000-0000-0000-0000-0000000000a7', 'expense', 'marketing', 'Telegram', 50);
  begin
    insert into finance_entries (organization_id, kind, category, amount)
    values ('00000000-0000-0000-0000-0000000000a7', 'expense', 'rent', 50);
    assert false, 'a marketolog can''t add other expenses';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into leads (organization_id, name) values ('00000000-0000-0000-0000-0000000000a7', 'x');
    assert false, 'a marketolog can''t add leads';
  exception when insufficient_privilege then null;
  end;
end $$;

select set_config('test.uid', '10000000-0000-0000-0000-0000000000a3', true);
do $$ begin
  assert (select count(*) from leads) = 1, 'a manager with marketing access still works in the CRM';
  assert (select count(*) from finance_entries) = 2, 'and keeps ad spend';
end $$;
rollback;
