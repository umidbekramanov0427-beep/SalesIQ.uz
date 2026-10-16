-- Monthly payment links: on the chosen day of each month the 5-minute
-- Telegram cron (/telegram/send-daily-report → runRecurringPayments) makes
-- a new lead_payment_links row and sends it to the client's Telegram /
-- Instagram chat; a link still unpaid after 3 days gets one reminder
-- (reminded_at). Written only by the server (service role); company
-- members can read their own company's rows.

create table if not exists public.lead_payment_schedules (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  lead_id uuid not null references public.leads(id) on delete cascade,
  amount bigint not null check (amount > 0),
  description text,
  day_of_month smallint not null check (day_of_month between 1 and 28),
  next_run_on date not null,
  active boolean not null default true,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  last_run_at timestamptz,
  last_link_id uuid references public.lead_payment_links(id) on delete set null
);

create index if not exists lead_payment_schedules_due_idx
  on public.lead_payment_schedules (next_run_on) where active;
create index if not exists lead_payment_schedules_lead_idx
  on public.lead_payment_schedules (lead_id);

alter table public.lead_payment_schedules enable row level security;

drop policy if exists "lead_payment_schedules_select" on public.lead_payment_schedules;
create policy "lead_payment_schedules_select" on public.lead_payment_schedules
  for select to authenticated
  using (organization_id = public.current_user_org_id());

alter table public.lead_payment_links
  add column if not exists schedule_id uuid
    references public.lead_payment_schedules(id) on delete set null;
alter table public.lead_payment_links
  add column if not exists reminded_at timestamptz;

create index if not exists lead_payment_links_unpaid_scheduled_idx
  on public.lead_payment_links (created_at)
  where status = 'pending' and schedule_id is not null and reminded_at is null;
