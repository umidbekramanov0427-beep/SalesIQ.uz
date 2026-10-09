-- Lead field settings, amoCRM-style: more field types (number, long text,
-- multi-select list, radio, date, date & time, birthday, link, address)
-- and named groups -- a group is a tab in the settings and a card of its
-- own on the lead, holding the fields put into it.

create table if not exists public.lead_field_groups (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  position integer not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists lead_field_groups_org_idx
  on public.lead_field_groups(organization_id, position);

alter table public.lead_field_groups enable row level security;

drop trigger if exists set_org_id on public.lead_field_groups;
create trigger set_org_id before insert on public.lead_field_groups
  for each row execute function public.set_organization_id();

drop policy if exists "lead_field_groups_select" on public.lead_field_groups;
create policy "lead_field_groups_select" on public.lead_field_groups for select to authenticated
  using (organization_id = public.current_user_org_id());

drop policy if exists "lead_field_groups_write" on public.lead_field_groups;
create policy "lead_field_groups_write" on public.lead_field_groups for all to authenticated
  using (organization_id = public.current_user_org_id() and public.is_admin_or_manager())
  with check (organization_id = public.current_user_org_id() and public.is_admin_or_manager());

alter table public.lead_custom_field_defs
  add column if not exists group_id uuid references public.lead_field_groups(id) on delete set null;

alter table public.lead_custom_field_defs
  drop constraint if exists lead_custom_field_defs_field_type_check;
alter table public.lead_custom_field_defs
  add constraint lead_custom_field_defs_field_type_check check (
    field_type in (
      'text', 'number', 'textarea', 'select', 'multiselect', 'radio',
      'toggle', 'date', 'datetime', 'birthday', 'url', 'address'
    )
  );
