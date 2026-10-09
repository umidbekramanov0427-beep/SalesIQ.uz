-- Note control + AI notes from the platform's own calls.
--
-- 1) "Izoh majburiy": a stage can require a fresh note -- written since the
--    lead arrived in its current stage -- before the lead moves on into it,
--    for everyone or only for chosen managers. The AI's note after an
--    analyzed call counts too: either the manager writes down what they
--    learned, or the call itself is on record.
-- 2) Talked calls from the platform's telephony (pbx_calls with a stored
--    recording) go into the same AI analysis as uploaded/amoCRM calls
--    (amocrm_calls, source 'pbx'), so the AI writes what it learned about
--    the client into the lead's notes after every conversation.

alter table public.pipeline_stage_rules
  add column if not exists note_profiles uuid[] not null default '{}';

alter table public.amocrm_calls drop constraint if exists amocrm_calls_source_check;
alter table public.amocrm_calls
  add constraint amocrm_calls_source_check check (source in ('amocrm', 'manual', 'pbx'));
alter table public.amocrm_calls
  add column if not exists pbx_call_id uuid references public.pbx_calls(id) on delete set null;
create unique index if not exists amocrm_calls_pbx_call_uidx
  on public.amocrm_calls (pbx_call_id) where pbx_call_id is not null;

create index if not exists idx_lead_activities_lead_type_created
  on public.lead_activities (lead_id, type, created_at desc);

-- Whether p_stage needs a note from the current user before p_lead can go
-- there: the stage's name when it does and nothing was noted on the lead
-- since it entered its current stage, else null.
create or replace function public.lead_note_block(p_lead uuid, p_stage uuid)
returns text language sql stable security definer set search_path = public as $$
  select s.name
  from public.pipeline_stage_rules r
  join public.pipeline_stages s on s.id = r.stage_id
  join public.leads l on l.id = p_lead
  where r.stage_id = p_stage
    and r.organization_id = public.current_user_org_id()
    and r.requires_note
    and (cardinality(r.note_profiles) = 0 or auth.uid() = any (r.note_profiles))
    and not exists (
      select 1 from public.lead_activities a
      where a.lead_id = p_lead
        and a.type in ('note', 'ai_note')
        and a.created_at >= coalesce(l.stage_changed_at, l.created_at)
    );
$$;

-- The stage-move guard now checks both rules: an open task first, then a
-- fresh note. CRM leads only -- amoCRM/Bitrix24 leads are for analytics.
create or replace function public.leads_require_stage_task()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_stage text;
begin
  if auth.uid() is null or new.stage_id is null
     or new.amocrm_id is not null or new.bitrix24_deal_id is not null
     or new.stage_id is not distinct from old.stage_id then
    return new;
  end if;
  v_stage := public.lead_task_block(new.id, new.stage_id);
  if v_stage is not null then
    raise exception 'task_required:%', v_stage using errcode = 'P0001';
  end if;
  v_stage := public.lead_note_block(new.id, new.stage_id);
  if v_stage is not null then
    raise exception 'note_required:%', v_stage using errcode = 'P0001';
  end if;
  return new;
end;
$$;

drop trigger if exists leads_require_stage_task on public.leads;
create trigger leads_require_stage_task before update of stage_id on public.leads
  for each row execute function public.leads_require_stage_task();

-- For a bulk move: which of these leads the stage's rules would hold back.
create or replace function public.leads_blocked_for_stage(p_ids uuid[], p_stage uuid)
returns table (lead_id uuid, reason text)
language sql stable security definer set search_path = public as $$
  select l.id,
         case when public.lead_task_block(l.id, p_stage) is not null then 'task' else 'note' end
  from public.leads l
  where l.id = any (p_ids)
    and l.organization_id = public.current_user_org_id()
    and (public.lead_task_block(l.id, p_stage) is not null
         or public.lead_note_block(l.id, p_stage) is not null);
$$;

grant execute on function public.lead_note_block(uuid, uuid) to authenticated;
grant execute on function public.leads_blocked_for_stage(uuid[], uuid) to authenticated;

notify pgrst, 'reload schema';
