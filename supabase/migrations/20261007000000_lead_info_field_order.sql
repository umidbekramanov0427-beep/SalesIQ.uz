-- Lets a super admin reorder (not just show/hide) the built-in rows on the
-- lead info card (phone, budget, source, ...), same idea as
-- 20260926000000_lead_workspace_sections but for order instead of
-- visibility. Stored as its own jsonb array (ordered list of
-- LeadInfoFieldKey strings) rather than folded into
-- lead_workspace_sections, since that column's shape is a flat
-- key->boolean map and an ordered array doesn't fit it. Null/missing means
-- "use the built-in default order" -- only an org that has actually
-- reordered something gets a non-null value here.
alter table public.org_general_settings
  add column if not exists lead_info_field_order jsonb;
