-- Subscription payment documents: SalesIQ's own legal details (printed as
-- the seller on every invoice and act), a running document number per
-- payment and the plan it paid for.

alter table public.platform_settings
  add column if not exists company_requisites jsonb not null default '{}'::jsonb;

alter table public.platform_subscription_payments
  add column if not exists plan text;

create sequence if not exists public.platform_doc_number_seq;
alter table public.platform_subscription_payments
  add column if not exists doc_number bigint;
alter table public.platform_subscription_payments
  alter column doc_number set default nextval('public.platform_doc_number_seq');
-- Payments made before this update get their numbers in payment order.
with numbered as (
  select id from public.platform_subscription_payments
   where doc_number is null
   order by coalesce(paid_at, created_at), id
)
update public.platform_subscription_payments p
   set doc_number = nextval('public.platform_doc_number_seq')
  from numbered n
 where p.id = n.id;
grant usage on sequence public.platform_doc_number_seq to service_role;
