-- Automatic follow-up (Admin panel -> Avtomatik eslatma): when the
-- company wrote last in a lead's Telegram chat and the client stays silent
-- for N hours, the bot sends a reminder -- up to max_attempts times, only
-- in working hours, never for won/lost or amoCRM/Bitrix24 leads.

create table if not exists public.org_followup_settings (
  organization_id uuid primary key references public.organizations(id) on delete cascade,
  enabled boolean not null default false,
  after_hours integer not null default 24 check (after_hours between 1 and 720),
  max_attempts integer not null default 2 check (max_attempts between 1 and 5),
  message text not null default 'Assalomu alaykum, {ism}! Savolingiz qoldimi? Yordam berishga tayyormiz.',
  second_message text,
  work_start smallint not null default 9 check (work_start between 0 and 23),
  work_end smallint not null default 20 check (work_end between 1 and 24),
  updated_by uuid references public.profiles(id) on delete set null,
  updated_at timestamptz not null default now()
);

alter table public.org_followup_settings enable row level security;

drop policy if exists org_followup_settings_select on public.org_followup_settings;
create policy org_followup_settings_select on public.org_followup_settings
  for select to authenticated
  using (organization_id = public.current_user_org_id());

drop policy if exists org_followup_settings_write on public.org_followup_settings;
create policy org_followup_settings_write on public.org_followup_settings
  for all to authenticated
  using (organization_id = public.current_user_org_id() and public.is_admin_or_manager())
  with check (organization_id = public.current_user_org_id() and public.is_admin_or_manager());

grant select, insert, update on public.org_followup_settings to authenticated;
grant all on public.org_followup_settings to service_role;

-- Every follow-up sent, and when the client answered after it.
create table if not exists public.lead_followups (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  lead_id uuid not null references public.leads(id) on delete cascade,
  attempt integer not null,
  message text not null,
  sent_at timestamptz not null default now(),
  replied_at timestamptz
);

create index if not exists lead_followups_lead_idx on public.lead_followups (lead_id, sent_at desc);
create index if not exists lead_followups_org_idx on public.lead_followups (organization_id, sent_at desc);

alter table public.lead_followups enable row level security;

drop policy if exists lead_followups_select on public.lead_followups;
create policy lead_followups_select on public.lead_followups
  for select to authenticated
  using (organization_id = public.current_user_org_id());

revoke insert, update, delete on public.lead_followups from authenticated;
grant select on public.lead_followups to authenticated;
grant all on public.lead_followups to service_role;

-- Leads due a follow-up now (the 5-minute cron reads this). Server-only.
create or replace function public.followup_candidates(p_limit integer default 50)
returns table (
  organization_id uuid,
  lead_id uuid,
  chat_id bigint,
  lead_name text,
  last_out timestamptz,
  attempts integer
)
language sql
stable
security definer
set search_path = public
as $$
  with s as (
    select * from public.org_followup_settings where enabled
  ),
  last_msgs as (
    select m.organization_id, m.lead_id,
           max(m.created_at) filter (where m.direction = 'in') as last_in,
           max(m.created_at) filter (where m.direction = 'out') as last_out
      from public.lead_telegram_messages m
      join s on s.organization_id = m.organization_id
     where m.created_at > now() - interval '30 days'
     group by m.organization_id, m.lead_id
  )
  select l.organization_id, l.id, k.chat_id, l.name, lm.last_out, f.attempts
    from last_msgs lm
    join s on s.organization_id = lm.organization_id
    join public.leads l on l.id = lm.lead_id
    join public.lead_telegram_links k on k.lead_id = l.id
    left join public.pipeline_stages ps on ps.id = l.stage_id
    cross join lateral (
      select count(*)::integer as attempts
        from public.lead_followups fu
       where fu.lead_id = l.id
         and fu.sent_at > coalesce(lm.last_in, '-infinity'::timestamptz)
    ) f
   where lm.last_out is not null
     and (lm.last_in is null or lm.last_out > lm.last_in)
     and lm.last_out < now() - make_interval(hours => s.after_hours)
     and f.attempts < s.max_attempts
     and not coalesce(ps.is_won, false)
     and not coalesce(ps.is_lost, false)
     and l.amocrm_id is null
     and l.bitrix24_deal_id is null
   order by lm.last_out
   limit greatest(1, least(p_limit, 500));
$$;

revoke execute on function public.followup_candidates(integer) from public, anon, authenticated;
grant execute on function public.followup_candidates(integer) to service_role;
