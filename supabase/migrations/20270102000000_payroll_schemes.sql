-- Oylik (src/lib/payroll.ts): each employee's pay scheme -- fixed salary,
-- percent of sales, amount per sale, KPI bonus steps, fines taken off.
-- scope = 'base' is the company's default scheme, otherwise it is the
-- employee's profile id. Admins and heads of sales see every scheme, an
-- employee only their own and the default; only the company's admin
-- changes them. Adds one table; nothing existing is changed.

create table if not exists public.payroll_schemes (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  scope text not null check (scope = 'base' or scope ~ '^[0-9a-f-]{36}$'),
  scheme jsonb not null default '{}'::jsonb,
  updated_by uuid references public.profiles(id) on delete set null,
  updated_at timestamptz not null default now(),
  primary key (organization_id, scope)
);

alter table public.payroll_schemes enable row level security;

drop policy if exists payroll_schemes_select on public.payroll_schemes;
create policy payroll_schemes_select on public.payroll_schemes for select to authenticated
  using (
    organization_id = public.current_user_org_id()
    and (scope = 'base' or scope = auth.uid()::text or public.is_admin_or_manager())
  );

drop policy if exists payroll_schemes_write on public.payroll_schemes;
create policy payroll_schemes_write on public.payroll_schemes for all to authenticated
  using (
    organization_id = public.current_user_org_id()
    and public.current_user_role()::text = 'super_admin'
  )
  with check (
    organization_id = public.current_user_org_id()
    and public.current_user_role()::text = 'super_admin'
  );

grant select, insert, update, delete on public.payroll_schemes to authenticated;
grant all on public.payroll_schemes to service_role;

notify pgrst, 'reload schema';
