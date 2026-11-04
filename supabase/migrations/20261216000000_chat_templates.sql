-- Chat reply templates shared by the whole company, in groups (5CRM style).
-- In the chat composer "/" lists templates, "//" lists their groups.
-- Before this they lived in each browser's localStorage only.

create table if not exists public.chat_templates (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  group_name text not null default '',
  title text not null check (length(title) between 1 and 120),
  body text not null check (length(body) between 1 and 4000),
  position integer not null default 0,
  created_by uuid references public.profiles(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now()
);

create index if not exists chat_templates_org_idx
  on public.chat_templates (organization_id, group_name, position);

alter table public.chat_templates enable row level security;

-- Everyone in the company uses them; anyone may add one; the author or a
-- head (super admin / ROP) changes or removes it.
drop policy if exists chat_templates_select on public.chat_templates;
create policy chat_templates_select on public.chat_templates
  for select to authenticated
  using (organization_id = public.current_user_org_id());

drop policy if exists chat_templates_insert on public.chat_templates;
create policy chat_templates_insert on public.chat_templates
  for insert to authenticated
  with check (organization_id = public.current_user_org_id() and created_by = auth.uid());

drop policy if exists chat_templates_change on public.chat_templates;
create policy chat_templates_change on public.chat_templates
  for update to authenticated
  using (
    organization_id = public.current_user_org_id()
    and (created_by = auth.uid() or public.is_admin_or_manager())
  )
  with check (organization_id = public.current_user_org_id());

drop policy if exists chat_templates_delete on public.chat_templates;
create policy chat_templates_delete on public.chat_templates
  for delete to authenticated
  using (
    organization_id = public.current_user_org_id()
    and (created_by = auth.uid() or public.is_admin_or_manager())
  );

grant select, insert, update, delete on public.chat_templates to authenticated;
grant all on public.chat_templates to service_role;
