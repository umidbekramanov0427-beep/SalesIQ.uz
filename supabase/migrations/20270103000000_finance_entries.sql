-- Moliya (src/lib/finance.ts, Analitika -> Reklama / Moliya): the company's
-- own income and expense lines. Ad spend is an expense in category
-- 'marketing' tagged with the lead source it paid for, so Analitika can show
-- the cost per lead, per sale and ROI by source; the rest feed the P&L.
-- Only the company's admin sees and writes them (heads of sales get the
-- ad-spend figures through the server). Adds one table; nothing existing is
-- changed.

create table if not exists public.finance_entries (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  entry_date date not null default current_date,
  kind text not null check (kind in ('income', 'expense')),
  category text not null check (length(btrim(category)) between 1 and 60),
  -- The lead source an ad expense paid for (leads.source).
  source text check (source is null or length(source) <= 120),
  amount numeric(16, 2) not null check (amount > 0),
  note text check (note is null or length(note) <= 500),
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists finance_entries_org_date_idx
  on public.finance_entries (organization_id, entry_date desc);

alter table public.finance_entries enable row level security;

drop policy if exists finance_entries_admin on public.finance_entries;
create policy finance_entries_admin on public.finance_entries for all to authenticated
  using (
    organization_id = public.current_user_org_id()
    and public.current_user_role()::text = 'super_admin'
  )
  with check (
    organization_id = public.current_user_org_id()
    and public.current_user_role()::text = 'super_admin'
  );

grant select, insert, update, delete on public.finance_entries to authenticated;
grant all on public.finance_entries to service_role;

notify pgrst, 'reload schema';
