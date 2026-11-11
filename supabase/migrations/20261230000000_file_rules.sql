-- More file rules (src/lib/file-rules.ts, Admin -> Fayllar va xotira): files
-- of leads won N days ago and files bigger than X MB once N days old go to
-- the trash (restorable for 30 days, like the other rules); the "older than
-- N days" rule can be limited to some kinds (video, audio...); uploads can be
-- capped below 20 MB and some extensions (exe, apk...) refused. {} (the
-- default) changes nothing. Adds one column; nothing is deleted or rewritten
-- by the migration itself.

alter table public.org_general_settings
  add column if not exists file_rules jsonb not null default '{}'::jsonb;

notify pgrst, 'reload schema';
