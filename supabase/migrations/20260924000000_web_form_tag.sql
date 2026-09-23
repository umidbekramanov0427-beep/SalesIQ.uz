-- Lets a web form (module 7) stamp every lead it creates with a tag, so
-- leads captured through a given form can be filtered/found by that tag
-- afterward instead of only being distinguishable by lead.source (which is
-- always just the form's own name and not filterable as a tag chip).
alter table public.web_forms add column if not exists tag text;
