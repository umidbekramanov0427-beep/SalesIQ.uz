alter table public.org_general_settings
  add column if not exists lead_workspace_section_order jsonb;
