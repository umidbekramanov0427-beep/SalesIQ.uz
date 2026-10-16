-- Web push: each person chooses which events reach their phone/computer
-- (the task_assigned switch already exists). Missing row = all on.
alter table public.notification_preferences
  add column if not exists push_new_lead boolean not null default true,
  add column if not exists push_messages boolean not null default true,
  add column if not exists push_calls boolean not null default true;
