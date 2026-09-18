-- Jarimalar (fines/penalties): admin-defined fine types (e.g. "Kech qoldi",
-- "Sifatsiz xizmat"), each org can add its own, plus the actual fine records
-- attributed to a salesperson on a given day. Fines are normally written by
-- the AI daily-computation cron (source = 'ai', linked back to the call it
-- was inferred from), but admins/managers can also add one manually.
create table if not exists public.fine_types (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  name text not null,
  description text,
  color text not null default 'slate',
  position integer not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.fines (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  fine_type_id uuid not null references public.fine_types(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  amount numeric not null default 0,
  occurred_on date not null default current_date,
  reason text,
  source text not null default 'manual' check (source in ('ai', 'manual')),
  amocrm_call_id uuid references public.amocrm_calls(id) on delete set null,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists fine_types_org_idx on public.fine_types(organization_id, position);
create index if not exists fines_org_idx on public.fines(organization_id, occurred_on);
create index if not exists fines_profile_idx on public.fines(profile_id, occurred_on);
create index if not exists fines_type_idx on public.fines(fine_type_id);

alter table public.fine_types enable row level security;
alter table public.fines enable row level security;

drop trigger if exists set_org_id on public.fine_types;
create trigger set_org_id before insert on public.fine_types
  for each row execute function public.set_organization_id();
drop trigger if exists set_org_id on public.fines;
create trigger set_org_id before insert on public.fines
  for each row execute function public.set_organization_id();

drop policy if exists "fine_types_select" on public.fine_types;
create policy "fine_types_select" on public.fine_types for select to authenticated
  using (organization_id = public.current_user_org_id());
drop policy if exists "fine_types_write" on public.fine_types;
create policy "fine_types_write" on public.fine_types for all to authenticated
  using (organization_id = public.current_user_org_id() and public.is_admin_or_manager())
  with check (organization_id = public.current_user_org_id() and public.is_admin_or_manager());

drop policy if exists "fines_select" on public.fines;
create policy "fines_select" on public.fines for select to authenticated
  using (organization_id = public.current_user_org_id());
drop policy if exists "fines_write" on public.fines;
create policy "fines_write" on public.fines for all to authenticated
  using (organization_id = public.current_user_org_id() and public.is_admin_or_manager())
  with check (organization_id = public.current_user_org_id() and public.is_admin_or_manager());
