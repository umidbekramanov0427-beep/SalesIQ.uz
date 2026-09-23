-- Module 4's duplicate detection was hardcoded to phone-only matching.
-- Lets an org also opt into matching by contact name and/or email --
-- read by lead-intake.server.ts's ingestLead() (webhook + web-form
-- intake) alongside the existing phone check. Phone defaults on since
-- that's the behavior every org already has today; name/email default
-- off since a name match especially can have false positives (two real
-- customers sharing a common name) that a phone/email match doesn't.
alter table public.org_general_settings
  add column if not exists dedupe_match_phone boolean not null default true,
  add column if not exists dedupe_match_name boolean not null default false,
  add column if not exists dedupe_match_email boolean not null default false;
