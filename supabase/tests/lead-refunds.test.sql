-- Pul qaytarish: a manager adds and sees only their own refunds and can't
-- mark one refunded; the head of sales sees the company's; one open refund
-- per lead; card numbers are digits only.
begin;
insert into organizations (id, name) values ('00000000-0000-0000-0000-0000000000b1', 'R');
insert into profiles (id, organization_id, role) values
  ('10000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-0000000000b1', 'rop'),
  ('10000000-0000-0000-0000-0000000000b2', '00000000-0000-0000-0000-0000000000b1', 'sotuv_menejeri'),
  ('10000000-0000-0000-0000-0000000000b3', '00000000-0000-0000-0000-0000000000b1', 'sotuv_menejeri');
insert into leads (id, organization_id, name) values
  ('30000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-0000000000b1', 'Aziza');
insert into lead_refunds (organization_id, client_name, amount, created_by) values
  ('00000000-0000-0000-0000-0000000000b1', 'Boshqasi', 100, '10000000-0000-0000-0000-0000000000b3');
do $$ begin
  begin
    insert into lead_refunds (organization_id, client_name, card_number)
    values ('00000000-0000-0000-0000-0000000000b1', 'x', '8600-1234');
    assert false, 'a card number is digits only';
  exception when check_violation then null;
  end;
end $$;
grant usage on schema auth to authenticated;
grant select on profiles to authenticated;
set local role authenticated;

select set_config('test.uid', '10000000-0000-0000-0000-0000000000b2', true);
insert into lead_refunds (organization_id, lead_id, client_name, amount, card_number, created_by)
values ('00000000-0000-0000-0000-0000000000b1', '30000000-0000-0000-0000-0000000000b1', 'Aziza', 2000000,
        '8600495473316023', '10000000-0000-0000-0000-0000000000b2');
do $$ begin
  assert (select count(*) from lead_refunds) = 1, 'a manager sees only their own';
  begin
    insert into lead_refunds (organization_id, lead_id, client_name, created_by)
    values ('00000000-0000-0000-0000-0000000000b1', '30000000-0000-0000-0000-0000000000b1', 'Aziza', '10000000-0000-0000-0000-0000000000b2');
    assert false, 'one open refund per lead';
  exception when unique_violation then null;
  end;
  begin
    update lead_refunds set status = 'refunded';
    assert false, 'a manager can''t mark it refunded';
  exception when insufficient_privilege then null;
  end;
  update lead_refunds set amount = 2500000;
  assert (select amount from lead_refunds) = 2500000, 'a manager edits a waiting refund';
end $$;

select set_config('test.uid', '10000000-0000-0000-0000-0000000000b1', true);
do $$ begin
  assert (select count(*) from lead_refunds) = 2, 'the head of sales sees the company''s';
  update lead_refunds set status = 'cancelled' where client_name = 'Boshqasi';
  assert (select count(*) from lead_refunds where status = 'cancelled') = 1, 'and can cancel one';
end $$;
rollback;
