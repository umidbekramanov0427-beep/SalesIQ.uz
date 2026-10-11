-- delete_organization_data() wipes a whole company (every table cascades
-- from organizations). Only the server may call it -- the platform owner's
-- "delete company" route (platform.delete-organization.ts) uses the service
-- role. 20260813090000_owner_panel_crud.sql revoked it from signed-in users,
-- but production was found granting EXECUTE to "authenticated" again, so any
-- logged-in user could delete any company through /rest/v1/rpc. Lock it
-- again; re-running this is harmless.

revoke all on function public.delete_organization_data(uuid) from public, anon, authenticated;
grant execute on function public.delete_organization_data(uuid) to service_role;
