-- Invoices: numbers are handed out one by one per company, people read
-- only their company's invoices and cannot write them directly; Didox
-- logins are never readable from the browser.
begin;
insert into organizations (id, name) values
  ('b1000000-0000-0000-0000-000000000001', 'Org A'),
  ('b1000000-0000-0000-0000-000000000002', 'Org B');
insert into profiles (id, organization_id, role) values
  ('b1000000-0000-0000-0000-0000000000a1', 'b1000000-0000-0000-0000-000000000001', 'super_admin');

do $$
begin
  assert public.claim_invoice_number('b1000000-0000-0000-0000-000000000001') = 1, 'first number is 1';
  assert public.claim_invoice_number('b1000000-0000-0000-0000-000000000001') = 2, 'then 2';
  assert public.claim_invoice_number('b1000000-0000-0000-0000-000000000002') = 1, 'each company counts on its own';
  assert not has_function_privilege('authenticated', 'public.claim_invoice_number(uuid)', 'execute'),
    'only the server takes numbers';
end $$;

insert into public.invoices (organization_id, number, buyer_name) values
  ('b1000000-0000-0000-0000-000000000001', 'HF-1', 'Buyer A'),
  ('b1000000-0000-0000-0000-000000000002', 'HF-1', 'Buyer B');

grant usage on schema auth to authenticated;
grant select on profiles to authenticated;
set local role authenticated;
set local test.uid = 'b1000000-0000-0000-0000-0000000000a1';
do $$
begin
  assert (select count(*) from public.invoices) = 1, 'only own company''s invoices';
  begin
    insert into public.invoices (organization_id, number, buyer_name)
    values ('b1000000-0000-0000-0000-000000000001', 'X', 'x');
    assert false, 'no direct insert';
  exception when insufficient_privilege then null;
  end;
  begin
    update public.invoices set status = 'paid';
    assert false, 'no direct update';
  exception when insufficient_privilege then null;
  end;
  begin
    perform 1 from public.org_didox_credentials;
    assert false, 'Didox logins are server-only';
  exception when insufficient_privilege then null;
  end;
end $$;
rollback;
