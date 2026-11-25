-- Hisob va to'lov: one payment can buy 1, 3, 6, 9 or 12 months (9 and 12
-- with free months on top). The months paid for are kept on the payment so
-- the webhook extends the subscription by exactly that. Only adds a column;
-- every existing payment stays a one-month payment.
alter table public.platform_subscription_payments
  add column if not exists months integer not null default 1;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'platform_subscription_payments_months_check'
  ) then
    alter table public.platform_subscription_payments
      add constraint platform_subscription_payments_months_check
      check (months in (1, 3, 6, 9, 12));
  end if;
end $$;
