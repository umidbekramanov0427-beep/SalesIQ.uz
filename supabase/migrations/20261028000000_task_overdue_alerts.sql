-- Overdue task alerts, like amoCRM's "Просроченная задача": the moment a
-- task's deadline passes, its assignee gets a pop-up and a notification.
--
-- The assignee's open app claims their newly overdue tasks every few
-- seconds through claim_overdue_tasks(); overdue_notified_at makes each
-- task alert exactly once, however many tabs or devices are open. Moving a
-- deadline later re-arms the alert. Tasks synced from amoCRM are there for
-- analytics only and never alert.

alter table public.tasks
  add column if not exists overdue_notified_at timestamptz;

create index if not exists idx_tasks_overdue_watch
  on public.tasks (assignee_id, due_date)
  where overdue_notified_at is null and status <> 'Done';

create or replace function public.tasks_rearm_overdue()
returns trigger language plpgsql as $$
begin
  if new.due_date is distinct from old.due_date and new.due_date > now() then
    new.overdue_notified_at := null;
  end if;
  return new;
end;
$$;

drop trigger if exists tasks_rearm_overdue on public.tasks;
create trigger tasks_rearm_overdue before update of due_date on public.tasks
  for each row execute function public.tasks_rearm_overdue();

-- The current user's tasks that just went overdue: marks them alerted,
-- writes one notification each and returns them for the pop-up. Tasks that
-- have been overdue for more than a day (from before this existed, or while
-- nobody was signed in) are marked quietly instead of arriving as a flood.
create or replace function public.claim_overdue_tasks()
returns table (task_id uuid, title text, lead_id uuid, lead_name text, due_date timestamptz)
language plpgsql volatile security definer set search_path = public as $$
#variable_conflict use_column
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    return;
  end if;

  update public.tasks t
     set overdue_notified_at = now()
   where t.assignee_id = v_uid
     and t.overdue_notified_at is null
     and t.status <> 'Done'
     and t.amocrm_task_id is null
     and t.due_date < now() - interval '1 day';

  return query
  with claimed as (
    update public.tasks t
       set overdue_notified_at = now()
     where t.assignee_id = v_uid
       and t.overdue_notified_at is null
       and t.status <> 'Done'
       and t.amocrm_task_id is null
       and t.due_date <= now()
    returning t.id, t.title, t.lead_id, t.due_date, t.organization_id
  ),
  named as (
    select c.id, c.title, c.lead_id, c.due_date, c.organization_id, l.name as lead_name
    from claimed c
    left join public.leads l on l.id = c.lead_id
  ),
  notified as (
    insert into public.notifications (organization_id, user_id, type, title, body, link)
    select n.organization_id, v_uid, 'TaskOverdue', 'Muddati o''tgan vazifa',
           coalesce(n.lead_name || ': ', '') || n.title,
           case when n.lead_id is not null then '/crm/leads/' || n.lead_id else '/lead-tasks' end
    from named n
    returning 1
  )
  select n.id, n.title, n.lead_id, n.lead_name, n.due_date
  from named n
  order by n.due_date;
end;
$$;

revoke all on function public.claim_overdue_tasks() from public, anon;
grant execute on function public.claim_overdue_tasks() to authenticated;
