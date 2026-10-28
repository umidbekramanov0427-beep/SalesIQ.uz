-- Sales growth pack: Patok (stream), the speed-to-lead alarm, the lead
-- payments ledger, coaching tasks and the score/objection analytics.
-- Every statement is idempotent (if not exists / create or replace), so the
-- file can be run again safely. Nothing here deletes or rewrites data.

-- ---------------------------------------------------------------------
-- 1. Patok: which intake/cohort a lead belongs to (14.1, 14.2, ...),
--    next to the existing Kampaniya (leads.campaign). Funnels stay as the
--    company wants; these two fields filter and report inside any funnel.
-- ---------------------------------------------------------------------
alter table public.leads add column if not exists stream text;
create index if not exists leads_org_stream_idx
  on public.leads (organization_id, stream) where stream is not null;
create index if not exists leads_org_campaign_idx
  on public.leads (organization_id, campaign) where campaign is not null;


-- ---------------------------------------------------------------------
-- 2. Speed to lead: a fresh lead nobody has called or written to. The
--    every-minute check (/crm/speed-to-lead) stamps the first contact and
--    remembers which alert it has sent (1 = manager at 5 min, 2 = head of
--    sales at 15 min), so each is sent once.
-- ---------------------------------------------------------------------
alter table public.leads add column if not exists first_contact_at timestamptz;
alter table public.leads add column if not exists speed_alert_level smallint not null default 0;
create index if not exists leads_speed_watch_idx
  on public.leads (created_at)
  where first_contact_at is null and speed_alert_level < 2
    and amocrm_id is null and bitrix24_deal_id is null;

do $$
begin
  perform cron.schedule(
    'speed-to-lead-every-minute',
    '* * * * *',
    $cron$select public.call_app_endpoint('/crm/speed-to-lead', 20000)$cron$
  );
exception
  when undefined_table or invalid_schema_name or undefined_function then
    raise notice 'pg_cron not available; schedule /crm/speed-to-lead every minute by hand';
end $$;

-- ---------------------------------------------------------------------
-- 3. Payments ledger: every payment a lead's client made (cash, card,
--    transfer, Payme, Click), so the card shows paid / still owed and the
--    next payment date. leads.paid_amount is the running sum the funnel
--    card and filters read; the server keeps it in step with the rows.
--    Paid Payme/Click links already on file are copied in once (link_id
--    is unique, so a re-run adds nothing).
-- ---------------------------------------------------------------------
create table if not exists public.lead_payments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  lead_id uuid not null references public.leads(id) on delete cascade,
  amount bigint not null check (amount > 0),
  method text not null default 'cash'
    check (method in ('cash', 'card', 'transfer', 'payme', 'click', 'other')),
  paid_at timestamptz not null default now(),
  note text,
  link_id uuid unique references public.lead_payment_links(id) on delete set null,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists lead_payments_lead_idx on public.lead_payments (lead_id, paid_at desc);
create index if not exists lead_payments_org_paid_idx on public.lead_payments (organization_id, paid_at desc);

alter table public.lead_payments enable row level security;
-- The company sees its payments; adding and removing go through the server
-- (/lead-payments/ledger), which also moves the lead's stage.
drop policy if exists "lead_payments_select" on public.lead_payments;
create policy "lead_payments_select" on public.lead_payments
  for select to authenticated
  using (organization_id = public.current_user_org_id());

alter table public.leads add column if not exists paid_amount bigint not null default 0;
alter table public.leads add column if not exists next_payment_date date;
create index if not exists leads_org_next_payment_idx
  on public.leads (organization_id, next_payment_date) where next_payment_date is not null;

insert into public.lead_payments
  (organization_id, lead_id, amount, method, paid_at, note, link_id, created_by)
select l.organization_id, l.lead_id, l.amount,
       case when l.provider in ('payme', 'click') then l.provider else 'other' end,
       coalesce(l.paid_at, l.created_at), l.description, l.id, l.created_by
from public.lead_payment_links l
where l.status = 'paid'
on conflict (link_id) do nothing;

update public.leads le
set paid_amount = s.total
from (
  select lead_id, sum(amount)::bigint as total from public.lead_payments group by lead_id
) s
where le.id = s.lead_id and le.paid_amount is distinct from s.total;

notify pgrst, 'reload schema';
