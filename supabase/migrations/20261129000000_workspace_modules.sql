-- A company's own sidebar (Admin panel -> Yon menyu): which standard
-- sections it shows, which extra modules it pins, their order and the
-- company type that suggested them. See src/lib/sidebar-config.ts.
alter table public.org_general_settings
  add column if not exists sidebar_config jsonb;
