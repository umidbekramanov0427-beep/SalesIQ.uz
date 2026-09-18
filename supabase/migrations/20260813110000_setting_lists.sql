-- Backs the seven Settings sidebar sections that were static "Tez orada"
-- placeholders (Kategoriyalar, Sotuv bosqichlari, Ball tuzatuvchilar,
-- Ko'nikmalar, Malaka guruhlari, Lid kategoriyalari, Konversiya). They're
-- all the same shape — an admin-managed named list, some with an optional
-- numeric value (score modifiers' point value, conversion targets' %) — so
-- one shared table with a list_type discriminator covers all seven instead
-- of seven near-identical tables.
create table if not exists public.setting_lists (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  list_type text not null check (list_type in (
    'categories',
    'sales_stages',
    'score_modifiers',
    'skills',
    'qualification_groups',
    'lead_categories',
    'conversion_targets'
  )),
  name text not null,
  value numeric,
  position integer not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists setting_lists_org_type_idx on public.setting_lists(organization_id, list_type, position);

alter table public.setting_lists enable row level security;

drop trigger if exists set_org_id on public.setting_lists;
create trigger set_org_id before insert on public.setting_lists
  for each row execute function public.set_organization_id();

drop policy if exists "setting_lists_select" on public.setting_lists;
create policy "setting_lists_select" on public.setting_lists for select to authenticated
  using (organization_id = public.current_user_org_id());

drop policy if exists "setting_lists_write" on public.setting_lists;
create policy "setting_lists_write" on public.setting_lists for all to authenticated
  using (organization_id = public.current_user_org_id() and public.is_admin_or_manager())
  with check (organization_id = public.current_user_org_id() and public.is_admin_or_manager());
