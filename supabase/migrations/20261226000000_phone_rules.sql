-- Telefon raqamlari formati: which countries a company's clients call from,
-- in order (src/lib/phone-rules.ts). A number typed without a country code
-- is read as the first listed country it fits; every number is still stored
-- as "+<country code><number>". {} (the default) means Uzbekistan alone, as
-- before. Adds one column; nothing is deleted or rewritten.

alter table public.org_general_settings
  add column if not exists phone_rules jsonb not null default '{}'::jsonb;

notify pgrst, 'reload schema';
