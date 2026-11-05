-- Sozlamalar like amoCRM, part 2:
--  * the after-hours auto reply (Voronka sozlamalari → Avto-javoblar):
--    outside the company's working hours (org_work_schedule) a client's
--    Telegram / Instagram message gets this text once per 12 hours;
--  * the company logo shown at the top of the sidebar (a small image,
--    resized in the browser, kept inline as a data URL);
--  * the date format dates are shown in.
-- Only adds nullable / defaulted columns; nothing is rewritten.

alter table public.org_general_settings
  add column if not exists after_hours_enabled boolean not null default false,
  add column if not exists after_hours_text text,
  add column if not exists company_logo_url text,
  add column if not exists date_format text;

-- A logo is a small inline image; refuse anything that isn't one or is too big.
alter table public.org_general_settings
  drop constraint if exists org_general_settings_logo_check;
alter table public.org_general_settings
  add constraint org_general_settings_logo_check
  check (
    company_logo_url is null
    or (company_logo_url like 'data:image/%' and length(company_logo_url) <= 200000)
  );

alter table public.org_general_settings
  drop constraint if exists org_general_settings_date_format_check;
alter table public.org_general_settings
  add constraint org_general_settings_date_format_check
  check (
    date_format is null
    or date_format in ('d mmm yyyy', 'dd.mm.yyyy', 'dd/mm/yyyy', 'yyyy-mm-dd', 'mm/dd/yyyy')
  );

notify pgrst, 'reload schema';
