-- Lead card notes: pin, edit, delete (amoCRM's "Закрепить / Изменить /
-- Удалить" on a note).
--
-- Notes could only be added before. Now the author -- or an admin / ROP --
-- can edit or delete a note, and anyone in the company can pin one to the
-- top of the lead's feed (through set_lead_activity_pinned, so pinning
-- someone else's note doesn't also let you rewrite it).

alter table public.lead_activities
  add column if not exists pinned boolean not null default false;
alter table public.lead_activities
  add column if not exists updated_at timestamptz;

drop policy if exists "lead_activities_update" on public.lead_activities;
create policy "lead_activities_update" on public.lead_activities for update to authenticated
  using (
    organization_id = public.current_user_org_id()
    and (created_by = auth.uid() or public.is_admin_or_manager())
  )
  with check (organization_id = public.current_user_org_id());

drop policy if exists "lead_activities_delete" on public.lead_activities;
create policy "lead_activities_delete" on public.lead_activities for delete to authenticated
  using (
    organization_id = public.current_user_org_id()
    and (created_by = auth.uid() or public.is_admin_or_manager())
  );

create or replace function public.set_lead_activity_pinned(p_id uuid, p_pinned boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.lead_activities
  set pinned = p_pinned
  where id = p_id
    and organization_id = public.current_user_org_id();
  if not found then
    raise exception 'Note not found';
  end if;
end;
$$;

revoke execute on function public.set_lead_activity_pinned(uuid, boolean) from public, anon;
grant execute on function public.set_lead_activity_pinned(uuid, boolean) to authenticated;
