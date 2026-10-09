-- Deleting leads is the super admin's call only. Owners (salespeople) and
-- ROPs could delete leads before; every table pointing at a lead cascades
-- or nulls on delete, so nothing else changes.

drop policy if exists "leads_delete" on public.leads;
create policy "leads_delete" on public.leads for delete to authenticated
  using (
    organization_id = public.current_user_org_id()
    and public.current_user_role() in ('super_admin', 'platform_owner')
  );
