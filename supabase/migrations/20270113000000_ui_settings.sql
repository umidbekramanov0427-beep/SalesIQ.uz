-- Sozlamalar (gear) and explainers (!) on every card, page and menu item:
-- the company's own choices for how its pages look and behave -- a card's
-- warning limits or hidden cards, a page's auto refresh, saved filters and
-- hidden table columns (src/lib/ui-settings.ts). Company-wide: an admin or
-- head of sales sets them once and everyone in the company sees the same.
--
--   org_general_settings.ui_settings  a company's choices (written by its
--                                     super admin / ROP under the existing
--                                     org_general_settings_write policy).
--   platform_settings.ui_settings     the owner panel's own (/platform pages;
--                                     written by the platform owner under the
--                                     existing platform_settings_write policy).
-- Both are capped at 256 KB. Idempotent: safe to run again.

alter table public.org_general_settings
  add column if not exists ui_settings jsonb not null default '{}'::jsonb;

alter table public.platform_settings
  add column if not exists ui_settings jsonb not null default '{}'::jsonb;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'org_general_settings_ui_settings_size'
  ) then
    alter table public.org_general_settings
      add constraint org_general_settings_ui_settings_size
      check (jsonb_typeof(ui_settings) = 'object' and pg_column_size(ui_settings) < 262144);
  end if;
  if not exists (
    select 1 from pg_constraint where conname = 'platform_settings_ui_settings_size'
  ) then
    alter table public.platform_settings
      add constraint platform_settings_ui_settings_size
      check (jsonb_typeof(ui_settings) = 'object' and pg_column_size(ui_settings) < 262144);
  end if;
end $$;

notify pgrst, 'reload schema';
