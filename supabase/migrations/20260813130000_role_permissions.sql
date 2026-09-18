-- Replaces the static, illustrative LEAD_PERMISSIONS array (src/lib/crm-data.ts)
-- with a real per-organization, super-admin-editable table, so "Huquqlar
-- jadvali" in the admin panel actually does something when you click into
-- it instead of showing a read-only mock.
create table if not exists public.role_permissions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  role text not null check (role in ('super_admin', 'rop', 'sotuv_menejeri')),
  action text not null,
  allowed boolean not null default true,
  unique (organization_id, role, action)
);

alter table public.role_permissions enable row level security;

drop trigger if exists set_org_id on public.role_permissions;
create trigger set_org_id before insert on public.role_permissions
  for each row execute function public.set_organization_id();

drop policy if exists "role_permissions_select" on public.role_permissions;
create policy "role_permissions_select" on public.role_permissions for select to authenticated
  using (organization_id = public.current_user_org_id());

drop policy if exists "role_permissions_write" on public.role_permissions;
create policy "role_permissions_write" on public.role_permissions for all to authenticated
  using (
    organization_id = public.current_user_org_id()
    and public.current_user_role() = 'super_admin'
  )
  with check (
    organization_id = public.current_user_org_id()
    and public.current_user_role() = 'super_admin'
  );

-- Backfill every existing organization with the same defaults the old
-- static table showed (super_admin always allowed; rop/sotuv_menejeri per
-- the old admin/manager/rep columns).
insert into public.role_permissions (organization_id, role, action, allowed)
select o.id, v.role, v.action, v.allowed
from public.organizations o
cross join (values
  ('super_admin', 'View leads', true),
  ('super_admin', 'Edit leads', true),
  ('super_admin', 'Delete leads', true),
  ('super_admin', 'Export leads', true),
  ('super_admin', 'Assign leads', true),
  ('super_admin', 'Merge leads', true),
  ('super_admin', 'Restore leads', true),
  ('rop', 'View leads', true),
  ('rop', 'Edit leads', true),
  ('rop', 'Delete leads', false),
  ('rop', 'Export leads', true),
  ('rop', 'Assign leads', true),
  ('rop', 'Merge leads', false),
  ('rop', 'Restore leads', false),
  ('sotuv_menejeri', 'View leads', true),
  ('sotuv_menejeri', 'Edit leads', true),
  ('sotuv_menejeri', 'Delete leads', false),
  ('sotuv_menejeri', 'Export leads', false),
  ('sotuv_menejeri', 'Assign leads', false),
  ('sotuv_menejeri', 'Merge leads', false),
  ('sotuv_menejeri', 'Restore leads', false)
) as v(role, action, allowed)
on conflict (organization_id, role, action) do nothing;

-- Seed the same defaults for every future organization too.
create or replace function public.seed_new_organization()
returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.pipeline_stages (key, name, position, color, probability, is_won, is_lost, organization_id) values
    ('new', 'New Lead', 1, 'bg-primary', 10, false, false, new.id),
    ('qualified', 'Qualified', 2, 'bg-info', 25, false, false, new.id),
    ('demo', 'Demo', 3, 'bg-warning', 45, false, false, new.id),
    ('proposal', 'Proposal', 4, 'bg-mint-border', 65, false, false, new.id),
    ('negotiation', 'Negotiation', 5, 'bg-success', 85, false, false, new.id),
    ('won', 'Won', 6, 'bg-success', 100, true, false, new.id),
    ('lost', 'Lost', 7, 'bg-destructive', 0, false, true, new.id);

  insert into public.integration_settings (organization_id, key, enabled, config) values
    (new.id, 'openai', false, '{}'),
    (new.id, 'telegram', false, '{}'),
    (new.id, 'whatsapp', false, '{}'),
    (new.id, 'amocrm', false, '{}'),
    (new.id, 'telegram_bot', false, '{}');

  insert into public.business_profile (organization_id) values (new.id);

  insert into public.ai_agents (organization_id, kind) values
    (new.id, 'chat'),
    (new.id, 'call');

  insert into public.role_permissions (organization_id, role, action, allowed) values
    (new.id, 'super_admin', 'View leads', true),
    (new.id, 'super_admin', 'Edit leads', true),
    (new.id, 'super_admin', 'Delete leads', true),
    (new.id, 'super_admin', 'Export leads', true),
    (new.id, 'super_admin', 'Assign leads', true),
    (new.id, 'super_admin', 'Merge leads', true),
    (new.id, 'super_admin', 'Restore leads', true),
    (new.id, 'rop', 'View leads', true),
    (new.id, 'rop', 'Edit leads', true),
    (new.id, 'rop', 'Delete leads', false),
    (new.id, 'rop', 'Export leads', true),
    (new.id, 'rop', 'Assign leads', true),
    (new.id, 'rop', 'Merge leads', false),
    (new.id, 'rop', 'Restore leads', false),
    (new.id, 'sotuv_menejeri', 'View leads', true),
    (new.id, 'sotuv_menejeri', 'Edit leads', true),
    (new.id, 'sotuv_menejeri', 'Delete leads', false),
    (new.id, 'sotuv_menejeri', 'Export leads', false),
    (new.id, 'sotuv_menejeri', 'Assign leads', false),
    (new.id, 'sotuv_menejeri', 'Merge leads', false),
    (new.id, 'sotuv_menejeri', 'Restore leads', false);

  return new;
end; $$;
