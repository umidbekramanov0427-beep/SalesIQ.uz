-- Live notifications: a client's message and a task's reminders reach the
-- open app the moment they happen, not on the next page refresh.
--
-- * notifications and lead_telegram_messages join the supabase_realtime
--   publication, so the browser hears new rows over its websocket (RLS
--   still decides who receives which row).
-- * Task reminders in three steps, like amoCRM: 15 minutes before the
--   deadline ("yaqinlashyapti"), at the deadline ("vaqti keldi") and 15
--   minutes after it while still open ("muddati o'tdi"). The minute cron
--   (/automations/tick) hands them out for everyone and sends the push;
--   an open tab also claims its own as a fallback. Each step is claimed
--   once (soon/due/overdue_notified_at), whoever asks first.
-- Every statement is idempotent.

alter table public.tasks
  add column if not exists soon_notified_at timestamptz,
  add column if not exists due_notified_at timestamptz;

create index if not exists idx_tasks_reminder_watch
  on public.tasks (due_date)
  where overdue_notified_at is null and status <> 'Done';

-- Moving a deadline later re-arms all three reminders.
create or replace function public.tasks_rearm_overdue()
returns trigger language plpgsql as $$
begin
  if new.due_date is distinct from old.due_date and new.due_date > now() then
    new.overdue_notified_at := null;
    new.due_notified_at := null;
    new.soon_notified_at := null;
  end if;
  return new;
end;
$$;

-- Claims the reminders that are due now -- for one person (p_uid) or for
-- everyone (null) -- and writes one notification per reminder. Only the
-- furthest step a task has reached is sent (a task created already late
-- gets "muddati o'tdi", not three messages). Reminders missed by more than
-- a day are marked quietly instead of arriving as a flood.
create or replace function public.claim_task_reminders_for(p_uid uuid)
returns table (
  notification_id uuid,
  user_id uuid,
  organization_id uuid,
  type text,
  title text,
  body text,
  link text
)
language plpgsql volatile security definer set search_path = public as $$
#variable_conflict use_column
begin
  update public.tasks t
     set soon_notified_at = coalesce(t.soon_notified_at, now()),
         due_notified_at = coalesce(t.due_notified_at, now()),
         overdue_notified_at = now()
   where (p_uid is null or t.assignee_id = p_uid)
     and t.overdue_notified_at is null
     and t.status <> 'Done'
     and t.due_date < now() - interval '1 day';

  return query
  with claimed as (
    update public.tasks t
       set soon_notified_at = coalesce(t.soon_notified_at, now()),
           due_notified_at = case
             when t.due_date <= now() then coalesce(t.due_notified_at, now())
             else t.due_notified_at end,
           overdue_notified_at = case
             when t.due_date <= now() - interval '15 minutes' then now()
             else null end
     where (p_uid is null or t.assignee_id = p_uid)
       and t.assignee_id is not null
       and t.overdue_notified_at is null
       and t.status <> 'Done'
       and t.amocrm_task_id is null
       and t.due_date <= now() + interval '15 minutes'
       and (t.due_date <= now() - interval '15 minutes'
            or (t.due_date <= now() and t.due_notified_at is null)
            or t.soon_notified_at is null)
    returning t.id, t.title, t.lead_id, t.organization_id, t.assignee_id,
      case
        when t.due_date <= now() - interval '15 minutes' then 'TaskOverdue'
        when t.due_date <= now() then 'TaskDue'
        else 'TaskSoon'
      end as kind
  ),
  notified as (
    insert into public.notifications (organization_id, user_id, type, title, body, link)
    select c.organization_id, c.assignee_id, c.kind,
           case c.kind
             when 'TaskSoon' then 'Vazifa vaqti yaqinlashyapti'
             when 'TaskDue' then 'Vazifa vaqti keldi'
             else 'Muddati o''tgan vazifa'
           end,
           coalesce(l.name || ': ', '') || c.title,
           case when c.lead_id is not null then '/crm/leads/' || c.lead_id
                else '/funnels?view=tasks' end
    from claimed c
    left join public.leads l on l.id = c.lead_id
    returning id, user_id, organization_id, type, title, body, link
  )
  select n.id, n.user_id, n.organization_id, n.type, n.title, n.body, n.link
  from notified n;
end;
$$;

revoke all on function public.claim_task_reminders_for(uuid) from public, anon, authenticated;
grant execute on function public.claim_task_reminders_for(uuid) to service_role;

-- The signed-in person's own reminders (the open tab's fallback check).
create or replace function public.claim_task_reminders()
returns table (
  notification_id uuid,
  user_id uuid,
  organization_id uuid,
  type text,
  title text,
  body text,
  link text
)
language plpgsql volatile security definer set search_path = public as $$
begin
  if auth.uid() is null then
    return;
  end if;
  return query select * from public.claim_task_reminders_for(auth.uid());
end;
$$;

revoke all on function public.claim_task_reminders() from public, anon;
grant execute on function public.claim_task_reminders() to authenticated;

do $$
begin
  begin
    alter publication supabase_realtime add table public.notifications;
  exception when duplicate_object then null;
  end;
  begin
    alter publication supabase_realtime add table public.lead_telegram_messages;
  exception when duplicate_object then null;
  end;
exception
  when undefined_object then raise notice 'supabase_realtime publication not found';
end $$;
