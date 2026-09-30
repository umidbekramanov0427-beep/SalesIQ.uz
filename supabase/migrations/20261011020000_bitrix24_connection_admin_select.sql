-- bitrix24_connection was created with RLS on and zero policies (same
-- starting point amocrm_connection had before
-- 20260813160000_amocrm_connection_admin_select.sql) -- without this, the
-- Integrations page's status readout (last_synced_at, last_sync_error,
-- sync_in_progress) would be invisible to an org's own super_admin even
-- though the connection itself was fine. Client code must keep selecting
-- only safe columns (never webhook_url, the bearer credential) -- RLS is
-- row-level, not column-level.

drop policy if exists "bitrix24_connection_select_admin" on public.bitrix24_connection;
create policy "bitrix24_connection_select_admin" on public.bitrix24_connection
  for select to authenticated
  using (
    organization_id = public.current_user_org_id()
    and public.current_user_role() = 'super_admin'
  );
