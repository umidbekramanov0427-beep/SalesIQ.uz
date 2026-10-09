-- Mass actions: a salesperson may hand their own leads to a teammate
-- ("change owner"). The old policy had no WITH CHECK, so it reused USING
-- for the new row too -- owner_id had to stay the caller, and the change
-- was refused. Which leads can be edited is unchanged (USING): your own,
-- or any for admins / ROPs; the new row only has to stay in your company.

drop policy if exists "leads_update" on public.leads;
create policy "leads_update" on public.leads for update to authenticated
  using (
    organization_id = public.current_user_org_id()
    and (owner_id = auth.uid() or public.is_admin_or_manager())
  )
  with check (organization_id = public.current_user_org_id());
