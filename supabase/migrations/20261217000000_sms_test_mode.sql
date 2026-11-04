-- SMS test mode (5CRM): while set, every SMS of the company goes to this
-- number instead of the client, marked "[TEST → client]". For trying
-- automations and salesbots safely. Null = normal sending.
alter table public.org_sms_credentials add column if not exists test_phone text;
