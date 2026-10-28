-- Sales growth pack: Patok (stream), the speed-to-lead alarm, the lead
-- payments ledger, coaching tasks and the inbox's read marks and favourites.
-- Every statement is idempotent (if not exists / create or replace), so the
-- file can be run again safely. Nothing here deletes data; section 3 only
-- fills the new payments ledger from the already paid payment links.

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

-- ---------------------------------------------------------------------
-- 4. Coaching cycle: the head of sales gives a manager a practice task on
--    their weakest script step (from the AI call analysis). The step's
--    success rate before the task is kept (baseline_rate, baseline_calls);
--    the rate after is counted live from the calls made since, so the
--    page shows "before -> after". A manager sees their own tasks; heads
--    of sales and admins see their company's. Writes go through the
--    server (/coaching).
-- ---------------------------------------------------------------------
create table if not exists public.coaching_tasks (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  criterion text not null,
  task text not null,
  lesson_id uuid references public.lessons(id) on delete set null,
  baseline_rate smallint,
  baseline_calls integer not null default 0,
  status text not null default 'assigned' check (status in ('assigned', 'done')),
  due_date date,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  done_at timestamptz
);
create index if not exists coaching_tasks_org_profile_idx
  on public.coaching_tasks (organization_id, profile_id, created_at desc);

alter table public.coaching_tasks enable row level security;
drop policy if exists "coaching_tasks_select" on public.coaching_tasks;
create policy "coaching_tasks_select" on public.coaching_tasks
  for select to authenticated
  using (
    organization_id = public.current_user_org_id()
    and (
      profile_id = auth.uid()
      or public.current_user_role() in ('super_admin', 'rop', 'platform_owner')
    )
  );

-- ---------------------------------------------------------------------
-- 5. Inbox, like amoCRM's imBox: each person's own "read up to" mark per
--    conversation (unread / read but not answered) and their favourite
--    conversations. A person reads and writes only their own rows.
-- ---------------------------------------------------------------------
create table if not exists public.inbox_reads (
  profile_id uuid not null references public.profiles(id) on delete cascade,
  lead_id uuid not null references public.leads(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  read_at timestamptz not null default now(),
  primary key (profile_id, lead_id)
);
alter table public.inbox_reads enable row level security;
drop policy if exists "inbox_reads_own" on public.inbox_reads;
create policy "inbox_reads_own" on public.inbox_reads
  for all to authenticated
  using (profile_id = auth.uid() and organization_id = public.current_user_org_id())
  with check (profile_id = auth.uid() and organization_id = public.current_user_org_id());

create table if not exists public.inbox_favorites (
  profile_id uuid not null references public.profiles(id) on delete cascade,
  lead_id uuid not null references public.leads(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (profile_id, lead_id)
);
alter table public.inbox_favorites enable row level security;
drop policy if exists "inbox_favorites_own" on public.inbox_favorites;
create policy "inbox_favorites_own" on public.inbox_favorites
  for all to authenticated
  using (profile_id = auth.uid() and organization_id = public.current_user_org_id())
  with check (profile_id = auth.uid() and organization_id = public.current_user_org_id());

notify pgrst, 'reload schema';
