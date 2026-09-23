-- Module: configurable custom fields on the lead workspace. Admins define
-- fields (free text / select-from-list / toggle) in
-- lead_custom_field_defs; values live in leads.custom_fields as a flat
-- {key: value} jsonb map, keyed by the def's own `key` -- no separate
-- per-value table since a lead's custom fields are always read/written as
-- a whole alongside the rest of the lead record.

create table if not exists public.lead_custom_field_defs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  key text not null,
  label text not null,
  field_type text not null default 'text' check (field_type in ('text', 'select', 'toggle')),
  options jsonb not null default '[]'::jsonb,
  position integer not null default 0,
  created_at timestamptz not null default now(),
  unique (organization_id, key)
);

create index if not exists lead_custom_field_defs_org_idx
  on public.lead_custom_field_defs(organization_id, position);

alter table public.lead_custom_field_defs enable row level security;

drop trigger if exists set_org_id on public.lead_custom_field_defs;
create trigger set_org_id before insert on public.lead_custom_field_defs
  for each row execute function public.set_organization_id();

drop policy if exists "lead_custom_field_defs_select" on public.lead_custom_field_defs;
create policy "lead_custom_field_defs_select" on public.lead_custom_field_defs for select to authenticated
  using (organization_id = public.current_user_org_id());

drop policy if exists "lead_custom_field_defs_write" on public.lead_custom_field_defs;
create policy "lead_custom_field_defs_write" on public.lead_custom_field_defs for all to authenticated
  using (organization_id = public.current_user_org_id() and public.is_admin_or_manager())
  with check (organization_id = public.current_user_org_id() and public.is_admin_or_manager());

alter table public.leads add column if not exists custom_fields jsonb not null default '{}'::jsonb;
