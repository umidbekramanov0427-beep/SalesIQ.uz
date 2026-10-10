-- Missed incoming calls become a task, and a later call with the same
-- number closes it ("callback"). Runs inside the database as a trigger on
-- pbx_calls, so it works the same for every provider's webhook, the history
-- sync and anything written by hand -- no app code path can skip it.
--
--   missed            incoming call that ended without anyone talking
--   missed_task_id    the "call back" task created for it (+15 min, High)
--   callback_call_id  the first answered call with the same number afterwards
--   callback_seconds  how long the client waited for that callback
--
-- Also turns on Realtime for pbx_calls: the app shows a pop-up with the
-- client's lead card the moment an incoming call starts ringing.

alter table public.pbx_calls
  add column if not exists missed boolean not null default false,
  add column if not exists missed_task_id uuid references public.tasks(id) on delete set null,
  add column if not exists callback_call_id uuid references public.pbx_calls(id) on delete set null,
  add column if not exists callback_seconds integer;

-- Last 9 digits of a phone number: +998 90 123-45-67, 901234567 and
-- 8 (90) 123 45 67 all compare equal.
create or replace function public.phone_key(p text)
returns text language sql immutable as $$
  select right(regexp_replace(coalesce(p, ''), '\D', '', 'g'), 9)
$$;

create index if not exists idx_pbx_calls_missed_open
  on public.pbx_calls(organization_id, created_at desc)
  where missed and callback_call_id is null;

-- Old unanswered incoming calls count as missed for the statistics, but no
-- tasks are created for them (this update does not touch status, so the
-- trigger below does not fire).
update public.pbx_calls
   set missed = true
 where direction = 'incoming'
   and status in ('no_answer', 'failed')
   and coalesce(duration_seconds, 0) = 0
   and not missed;

create or replace function public.pbx_calls_missed_and_callback()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_client text;
  v_key text;
  v_task uuid;
  v_owner uuid;
  v_lead_name text;
begin
  v_client := case when new.direction = 'incoming' then new.from_number else new.to_number end;
  v_key := public.phone_key(v_client);

  -- 1) Missed incoming call -> one open "call back" task per number.
  if new.direction = 'incoming'
     and new.status in ('no_answer', 'failed')
     and coalesce(new.duration_seconds, 0) = 0
     and not coalesce(new.missed, false) then
    new.missed := true;

    -- Only live calls get a task; a history import of last month's calls
    -- must not flood the task list.
    if length(v_key) >= 7 and coalesce(new.created_at, now()) > now() - interval '3 hours' then
      select m.missed_task_id into v_task
        from public.pbx_calls m
        join public.tasks t on t.id = m.missed_task_id and t.status <> 'Done'
       where m.organization_id = new.organization_id
         and m.missed
         and m.callback_call_id is null
         and m.id <> new.id
         and public.phone_key(m.from_number) = v_key
         and m.created_at > now() - interval '24 hours'
       order by m.created_at desc
       limit 1;

      if v_task is null then
        if new.lead_id is not null then
          select l.name, l.owner_id into v_lead_name, v_owner
            from public.leads l where l.id = new.lead_id;
        end if;
        v_owner := coalesce(new.initiated_by, v_owner);

        insert into public.tasks
          (organization_id, title, description, due_date, priority, status, lead_id, assignee_id)
        values (
          new.organization_id,
          'Qayta qo''ng''iroq: ' || coalesce(nullif(v_lead_name, ''), v_client),
          'O''tkazib yuborilgan kiruvchi qo''ng''iroq. Raqam: ' || v_client
            || '. Mijozga 15 daqiqa ichida qayta qo''ng''iroq qiling.',
          now() + interval '15 minutes',
          'High',
          'Todo',
          new.lead_id,
          v_owner
        )
        returning id into v_task;
      end if;
      new.missed_task_id := v_task;
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_pbx_calls_missed_and_callback on public.pbx_calls;
create trigger trg_pbx_calls_missed_and_callback
  before insert or update of status, duration_seconds on public.pbx_calls
  for each row execute function public.pbx_calls_missed_and_callback();

-- The callback half runs AFTER the row is written: it points earlier missed
-- calls at this one (callback_call_id is a foreign key), which a BEFORE
-- INSERT trigger can't do yet -- the row doesn't exist at that point.
create or replace function public.pbx_calls_close_callbacks()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_key text;
begin
  v_key := public.phone_key(
    case when new.direction = 'incoming' then new.from_number else new.to_number end
  );
  -- A talked call with the same number closes earlier missed calls and
  -- their tasks.
  if new.status in ('answered', 'completed')
     and (new.status = 'answered' or coalesce(new.duration_seconds, 0) > 0)
     and (tg_op = 'INSERT' or old.status is distinct from new.status)
     and length(v_key) >= 7 then
    with closed as (
      update public.pbx_calls m
         set callback_call_id = new.id,
             callback_seconds = greatest(0, extract(epoch from (coalesce(new.created_at, now()) - m.created_at))::int)
       where m.organization_id = new.organization_id
         and m.missed
         and m.callback_call_id is null
         and m.id <> new.id
         and m.created_at < coalesce(new.created_at, now())
         and m.created_at > coalesce(new.created_at, now()) - interval '7 days'
         and public.phone_key(m.from_number) = v_key
      returning m.missed_task_id
    )
    update public.tasks t
       set status = 'Done', progress = 100, updated_at = now()
     where t.id in (select missed_task_id from closed where missed_task_id is not null)
       and t.status <> 'Done';
  end if;

  return null;
end;
$$;

drop trigger if exists trg_pbx_calls_close_callbacks on public.pbx_calls;
create trigger trg_pbx_calls_close_callbacks
  after insert or update of status, duration_seconds on public.pbx_calls
  for each row execute function public.pbx_calls_close_callbacks();

-- Daily missed-call numbers per organization (RLS of pbx_calls applies).
create or replace view public.missed_call_stats
with (security_invoker = true) as
select
  organization_id,
  (created_at at time zone 'Asia/Tashkent')::date as day,
  count(*) filter (where missed) as missed,
  count(*) filter (where missed and callback_call_id is not null) as called_back,
  count(*) filter (where missed and callback_seconds <= 900) as called_back_15m,
  round(avg(callback_seconds) filter (where missed and callback_call_id is not null))::int
    as avg_callback_seconds
from public.pbx_calls
where direction = 'incoming'
group by organization_id, (created_at at time zone 'Asia/Tashkent')::date;

grant select on public.missed_call_stats to authenticated;

-- Realtime for the incoming-call pop-up.
do $$
begin
  alter publication supabase_realtime add table public.pbx_calls;
exception
  when duplicate_object then null;
  when undefined_object then raise notice 'supabase_realtime publication not found';
end $$;
