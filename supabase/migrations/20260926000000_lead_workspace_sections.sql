-- Lets a super admin hide any of the optional/extra cards on the lead
-- workspace page (crm.leads.$leadId.tsx) org-wide -- everything left off
-- this jsonb map (or set to true) stays visible; only an explicit `false`
-- hides a section. Core CRM primitives (lead info, the Voqealar/
-- Eslatmalar/Vazifalar tabs) aren't included here and always show, since
-- removing those would break the page's basic purpose -- this only covers
-- the extra widgets (AI summary, customer remark, next steps, action
-- history, lead score, audio/telephony call sections, tags, AI assistant).
alter table public.org_general_settings
  add column if not exists lead_workspace_sections jsonb not null default '{}'::jsonb;
