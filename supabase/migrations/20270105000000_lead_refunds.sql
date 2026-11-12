-- Pul qaytarish (src/lib/refunds.ts): clients who refused -- before being
-- accepted or after -- and must get their money back. A manager switches
-- "Pul qaytarish" on in the lead card (or the refund is added by hand or
-- imported); the receipt of the transfer is kept in the private lead-files
-- storage and the bot sends it to the client. A manager sees and edits the
-- refunds they added; admins and heads of sales see the company's. Adds one
-- table; nothing existing is changed.

create table if not exists public.lead_refunds (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  lead_id uuid references public.leads(id) on delete set null,
  client_name text not null check (length(btrim(client_name)) between 1 and 200),
  phone text check (phone is null or length(phone) <= 40),
  amount numeric(16, 2) not null default 0 check (amount >= 0),
  paid_amount numeric(16, 2) check (paid_amount is null or paid_amount >= 0),
  card_number text check (card_number is null or card_number ~ '^[0-9]{12,19}$'),
  card_holder text check (card_holder is null or length(card_holder) <= 120),
  reason text check (reason is null or length(reason) <= 500),
  -- Refused before being accepted, or after.
  stage text not null default 'before' check (stage in ('before', 'after')),
  status text not null default 'pending' check (status in ('pending', 'refunded', 'cancelled')),
  receipt_path text,
  receipt_name text,
  notified_at timestamptz,
  notify_error text,
  refunded_at timestamptz,
  refunded_by uuid references public.profiles(id) on delete set null,
  note text check (note is null or length(note) <= 1000),
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists lead_refunds_org_idx
  on public.lead_refunds (organization_id, status, created_at desc);
-- One open refund per lead.
create unique index if not exists lead_refunds_one_open
  on public.lead_refunds (lead_id) where lead_id is not null and status <> 'cancelled';

alter table public.lead_refunds enable row level security;

drop policy if exists lead_refunds_select on public.lead_refunds;
create policy lead_refunds_select on public.lead_refunds for select to authenticated
  using (
    organization_id = public.current_user_org_id()
    and (created_by = auth.uid() or public.is_admin_or_manager())
  );

drop policy if exists lead_refunds_insert on public.lead_refunds;
create policy lead_refunds_insert on public.lead_refunds for insert to authenticated
  with check (
    organization_id = public.current_user_org_id()
    and created_by = auth.uid()
    and status = 'pending'
  );

-- A manager edits their own while it is waiting; admins and heads of
-- sales any. Marking it refunded happens through the server (receipt).
drop policy if exists lead_refunds_update on public.lead_refunds;
create policy lead_refunds_update on public.lead_refunds for update to authenticated
  using (
    organization_id = public.current_user_org_id()
    and (public.is_admin_or_manager() or (created_by = auth.uid() and status = 'pending'))
  )
  with check (
    organization_id = public.current_user_org_id()
    and (public.is_admin_or_manager() or status in ('pending', 'cancelled'))
  );

drop policy if exists lead_refunds_delete on public.lead_refunds;
create policy lead_refunds_delete on public.lead_refunds for delete to authenticated
  using (
    organization_id = public.current_user_org_id()
    and public.current_user_role()::text in ('super_admin', 'platform_owner')
  );

-- A marketolog never sees clients' cards.
drop policy if exists marketolog_no_crm on public.lead_refunds;
create policy marketolog_no_crm on public.lead_refunds as restrictive for all to authenticated
  using ((select public.current_user_role())::text <> 'marketolog')
  with check ((select public.current_user_role())::text <> 'marketolog');

grant select, insert, update, delete on public.lead_refunds to authenticated;
grant all on public.lead_refunds to service_role;

notify pgrst, 'reload schema';
