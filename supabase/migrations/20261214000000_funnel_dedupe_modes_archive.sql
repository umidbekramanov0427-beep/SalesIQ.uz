-- Funnel duplicate rules (5CRM style) and archived funnels.
--
-- pipelines.dedupe_mode  what happens when a client already in this funnel
--                        comes in again:
--   repeat  (default) the existing lead takes it: a note, the "Qayta
--           murojaat" tag, repeat_count + 1, the owner is told; a lost lead
--           is reopened (dedupe_reopen_lost)
--   merge   added to the existing lead (note + task), nothing reopened
--   new     every request is a new lead (both marked as a repeat)
--   off     no checking at all
-- pipelines.dedupe_new_after_won  a client whose lead here is already won
--                        comes in as a new lead (a new purchase), not
--                        merged into the sale
-- pipelines.dedupe_task_minutes  a task for the owner this many minutes
--                        after a merge (0 = none)
-- pipelines.archived_at  an old funnel (a past launch) hidden from the list
--
-- Columns with defaults only: every funnel keeps today's behaviour (repeat).

alter table public.pipelines
  add column if not exists dedupe_mode text not null default 'repeat',
  add column if not exists dedupe_reopen_lost boolean not null default true,
  add column if not exists dedupe_new_after_won boolean not null default true,
  add column if not exists dedupe_task_minutes integer not null default 15,
  add column if not exists archived_at timestamptz;

alter table public.pipelines drop constraint if exists pipelines_dedupe_mode_check;
alter table public.pipelines add constraint pipelines_dedupe_mode_check
  check (dedupe_mode in ('repeat', 'merge', 'new', 'off'));
alter table public.pipelines drop constraint if exists pipelines_dedupe_task_minutes_check;
alter table public.pipelines add constraint pipelines_dedupe_task_minutes_check
  check (dedupe_task_minutes between 0 and 1440);

-- A person creating a lead in the app still can't add a second lead for the
-- same client in one funnel -- unless the funnel takes every request as new
-- (or checks nothing), or the client's lead there is already won and the
-- funnel counts a new purchase as a new lead.
create or replace function public.leads_block_funnel_duplicate()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_on boolean;
  v_mode text;
  v_new_after_won boolean;
  v_phone text;
  v_email text;
  v_existing uuid;
  v_won boolean;
begin
  if auth.uid() is null or new.contact_id is null
     or new.amocrm_id is not null or new.bitrix24_deal_id is not null then
    return new;
  end if;
  select coalesce(s.dedupe_funnel_merge, true) into v_on
  from public.org_general_settings s where s.organization_id = new.organization_id;
  if not coalesce(v_on, true) then
    return new;
  end if;
  select p.dedupe_mode, p.dedupe_new_after_won into v_mode, v_new_after_won
  from public.pipelines p
  where p.organization_id = new.organization_id
    and p.name = coalesce(new.funnel, 'Direct Sales')
  limit 1;
  if coalesce(v_mode, 'repeat') in ('new', 'off') then
    return new;
  end if;
  select c.phone, c.email into v_phone, v_email from public.contacts c where c.id = new.contact_id;
  v_existing := public.funnel_lead_for_client(
    new.organization_id, new.funnel, v_phone, v_email, new.id
  );
  if v_existing is null then
    -- The same contact may already have a phone-less lead in this funnel.
    select l.id into v_existing from public.leads l
    where l.organization_id = new.organization_id
      and l.contact_id = new.contact_id
      and l.id <> new.id
      and l.amocrm_id is null
      and l.bitrix24_deal_id is null
      and coalesce(l.funnel, 'Direct Sales') = coalesce(new.funnel, 'Direct Sales')
    order by l.created_at limit 1;
  end if;
  if v_existing is not null then
    if coalesce(v_new_after_won, true) then
      select coalesce(s.is_won, false) into v_won
      from public.leads l left join public.pipeline_stages s on s.id = l.stage_id
      where l.id = v_existing;
      if coalesce(v_won, false) then
        return new;
      end if;
    end if;
    raise exception 'duplicate_in_funnel:%', v_existing using errcode = 'P0001';
  end if;
  return new;
end;
$$;

drop trigger if exists leads_block_funnel_duplicate on public.leads;
create trigger leads_block_funnel_duplicate before insert on public.leads
  for each row execute function public.leads_block_funnel_duplicate();
