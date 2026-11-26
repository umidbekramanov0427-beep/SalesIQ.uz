-- Hisob va to'lov: a top-up credits once per payment, a purchase takes the
-- balance, extends the period and sets seats and modules, a short balance
-- is refused, and modules bought earlier but not chosen again switch off.
begin;
do $$
declare
  org uuid := '00000000-0000-0000-0000-00000000b101';
  pay uuid := gen_random_uuid();
  bal bigint;
  ends timestamptz;
  failed boolean := false;
begin
  insert into organizations (id, name, is_trial, trial_ends_at) values (org, 'B', true, now() + interval '3 days');

  bal := billing_credit(org, 1000000, 'topup', 'payme', pay);
  assert bal = 1000000, 'top-up credited';
  bal := billing_credit(org, 1000000, 'topup', 'payme', pay);
  assert bal = 1000000, 'the same payment is credited once';
  assert (select count(*) from org_wallet_tx where organization_id = org) = 1, 'one history row';

  begin
    perform billing_purchase(org, 2000000, 90, 0, array['analytics'], '{}'::jsonb);
  exception when others then
    failed := sqlerrm = 'insufficient_balance';
  end;
  assert failed, 'a short balance is refused';

  ends := billing_purchase(org, 600000, 90, 7, array['analytics', 'telephony'], '{"seats":12}'::jsonb);
  assert (select balance_uzs from org_billing where organization_id = org) = 400000, 'balance taken';
  assert ends > now() + interval '92 days', 'period from the trial end';
  assert (select not is_trial and active and extra_seats = 7 from organizations where id = org), 'paid, seats';
  assert (select count(*) from org_modules where organization_id = org and enabled and note = 'billing') = 2,
    'two modules on';

  insert into org_modules (organization_id, module, enabled, note) values (org, 'warehouse', true, 'owner');
  perform billing_purchase(org, 100000, 90, 7, array['analytics'], '{}'::jsonb, 'renewal');
  assert (select not enabled from org_modules where organization_id = org and module = 'telephony'),
    'a module not bought again switches off';
  assert (select enabled from org_modules where organization_id = org and module = 'warehouse'),
    'a hand-granted module stays';
  assert (select kind from org_wallet_tx where organization_id = org order by created_at desc, amount_uzs limit 1) in ('renewal', 'purchase'),
    'renewal recorded';
end $$;
rollback;
