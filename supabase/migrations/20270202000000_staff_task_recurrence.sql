-- Nazorat → «Xodim vazifalari»: a task can repeat (daily / weekly /
-- monthly); when it is done the app makes its next copy. Only adds one
-- nullable column; existing tasks are untouched (null = once).
alter table public.tasks
  add column if not exists recurrence text;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'tasks_recurrence_check'
  ) then
    alter table public.tasks
      add constraint tasks_recurrence_check
      check (recurrence is null or recurrence in ('once', 'daily', 'weekly', 'monthly'));
  end if;
end $$;
