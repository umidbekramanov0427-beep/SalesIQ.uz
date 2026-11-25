-- The analytics-only mode is gone: every company has the full CRM.
-- The column stays (old functions still read it) but is always true.
alter table public.organizations alter column crm_enabled set default true;
update public.organizations set crm_enabled = true where crm_enabled is distinct from true;
