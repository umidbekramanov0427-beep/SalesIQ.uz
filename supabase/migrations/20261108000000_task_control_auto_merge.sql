-- Two database-side controls for the CRM.
--
-- 1) "Zapret zadacha" -- moving a lead into a stage that requires a task is
--    already refused here (leads_require_stage_task, 20261027/20261030). What
--    the database could not show is a lead that is ALREADY in such a stage
--    with no open task left (its task was closed, or it was moved by an
--    automation). stage_task_violations() lists them for the head of sales.
--
-- 2) Automatic merge of duplicates. One client = one lead per funnel is
--    already enforced when a lead is created; leads created before that rule,
--    or whose phone was edited later, can still end up twice in a funnel.
--    With org_general_settings.dedupe_auto_merge switched on (Admin ->
--    Dublikatlar), auto_merge_funnel_duplicates() folds them into the oldest
--    lead every night -- the same thing the "Birlashtirish" button does by
--    hand: history moves to the surviving lead, nothing is lost. Off by
--    default, because a merge cannot be undone.

-- ---------------------------------------------------------------------------
-- 1) Leads sitting in a task-required stage without an open task
-- ---------------------------------------------------------------------------

create or replace function public.stage_task_violations()
returns table (
  lead_id uuid,
  lead_name text,
  funnel text,
  stage_name text,
  owner_id uuid,
  owner_name text,
  since timestamptz
)
language plpgsql stable security definer set search_path = public as $$
#variable_conflict use_column
begin
  if coalesce(public.current_user_role()::text, '') not in ('super_admin', 'rop', 'platform_owner') then
    raise exception 'forbidden';
  end if;
  return query
  select l.id, l.name, coalesce(l.funnel, 'Direct Sales'), s.name, l.owner_id, p.full_name,
         greatest(
           coalesce(l.stage_changed_at, l.created_at),
           coalesce((select max(t.updated_at) from public.tasks t where t.lead_id = l.id), l.created_at)
         )
  from public.leads l
  join public.pipeline_stage_rules r
    on r.stage_id = l.stage_id and r.organization_id = l.organization_id and r.requires_task
  join public.pipeline_stages s on s.id = l.stage_id
  left join public.profiles p on p.id = l.owner_id
  where l.organization_id = public.current_user_org_id()
    and l.amocrm_id is null
    and l.bitrix24_deal_id is null
    -- A rule limited to chosen managers only binds their leads.
    and (cardinality(r.task_profiles) = 0 or l.owner_id = any (r.task_profiles))
    and not exists (
      select 1 from public.tasks t where t.lead_id = l.id and t.status <> 'Done'
    )
  order by 7 asc
  limit 500;
end;
$$;

grant execute on function public.stage_task_violations() to authenticated;

-- ---------------------------------------------------------------------------
-- 2) Nightly automatic merge of per-funnel duplicates
-- ---------------------------------------------------------------------------

alter table public.org_general_settings
  add column if not exists dedupe_auto_merge boolean not null default false;

-- Moves everything that points at p_loser over to p_survivor, then deletes
-- p_loser. Every foreign key to leads(id) is found from the catalog (so a
-- table added later is never forgotten), plus the few lead columns that have
-- no foreign key. Where the survivor already has its own row in a
-- one-row-per-lead table, the loser's row goes away with the loser.
create or replace function public.merge_lead_into(p_survivor uuid, p_loser uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  r record;
begin
  if p_survivor = p_loser then
    raise exception 'cannot merge a lead into itself';
  end if;
  for r in
    select distinct x.tbl, x.col from (
      select c.conrelid::regclass::text as tbl, a.attname::text as col
      from pg_constraint c
      join pg_attribute a on a.attrelid = c.conrelid and a.attnum = c.conkey[1]
      where c.contype = 'f'
        and c.confrelid = 'public.leads'::regclass
        and c.conrelid <> 'public.leads'::regclass
        and array_length(c.conkey, 1) = 1
      union
      select v.tbl, v.col
      from (values
        ('public.lead_activities', 'lead_id'), ('public.tasks', 'lead_id'),
        ('public.pbx_calls', 'lead_id'), ('public.sms_log', 'lead_id'),
        ('public.amocrm_calls', 'lead_id'), ('public.training_recommendations', 'lead_id'),
        ('public.call_logs', 'lead_id'), ('public.deals', 'lead_id'),
        ('public.lead_duplicate_flags', 'matched_lead_id'),
        ('public.lead_duplicate_flags', 'new_lead_id'),
        ('public.incoming_lead_log', 'created_lead_id'),
        ('public.web_form_submissions', 'created_lead_id')
      ) as v(tbl, col)
      where to_regclass(v.tbl) is not null
        and exists (
          select 1 from pg_attribute pa
          where pa.attrelid = to_regclass(v.tbl) and pa.attname = v.col and not pa.attisdropped
        )
    ) x
  loop
    begin
      execute format('update %s set %I = $1 where %I = $2', r.tbl, r.col, r.col)
        using p_survivor, p_loser;
    exception when unique_violation then
      null;
    end;
  end loop;
  delete from public.leads where id = p_loser;
end;
$$;

revoke all on function public.merge_lead_into(uuid, uuid) from public, anon, authenticated;

-- Merges every per-funnel duplicate group (same funnel, same phone's last 9
-- digits, CRM leads only) of the organizations that switched
-- dedupe_auto_merge on -- or of p_org only, regardless of the switch, when
-- called by hand. One failing group never stops the others.
create or replace function public.auto_merge_funnel_duplicates(p_org uuid default null)
returns table (organization_id uuid, funnel text, survivor_id uuid, merged integer)
language plpgsql security definer set search_path = public as $$
#variable_conflict use_column
declare
  g record;
  v_survivor uuid;
  v_losers uuid[];
  v_names text;
  v_tags text[];
  v_repeat integer;
  v_last timestamptz;
  i integer;
begin
  for g in
    select l.organization_id as org,
           coalesce(l.funnel, 'Direct Sales') as fnl,
           array_agg(l.id order by l.created_at, l.id) as ids
    from public.leads l
    join public.contacts c on c.id = l.contact_id
    left join public.org_general_settings s on s.organization_id = l.organization_id
    where l.amocrm_id is null
      and l.bitrix24_deal_id is null
      and public.phone9(c.phone) is not null
      and (
        (p_org is not null and l.organization_id = p_org)
        or (p_org is null and coalesce(s.dedupe_auto_merge, false))
      )
    group by l.organization_id, coalesce(l.funnel, 'Direct Sales'), public.phone9(c.phone)
    having count(*) > 1
    limit 1000
  loop
    begin
      v_survivor := g.ids[1];
      v_losers := g.ids[2:array_length(g.ids, 1)];

      select string_agg(l.name, ', ' order by l.created_at),
             max(l.created_at),
             coalesce(sum(l.repeat_count), 0)
        into v_names, v_last, v_repeat
        from public.leads l where l.id = any (v_losers);

      select array(
        select distinct t from public.leads l, unnest(coalesce(l.tags, '{}')) t
        where l.id = any (g.ids)
        union select 'Qayta murojaat'
      ) into v_tags;

      for i in 1 .. array_length(v_losers, 1) loop
        perform public.merge_lead_into(v_survivor, v_losers[i]);
      end loop;

      update public.leads l
         set tags = v_tags,
             repeat_count = coalesce(l.repeat_count, 0) + v_repeat + array_length(v_losers, 1),
             last_repeat_at = greatest(coalesce(l.last_repeat_at, v_last), v_last)
       where l.id = v_survivor;

      insert into public.lead_activities (organization_id, lead_id, type, content)
      values (
        g.org, v_survivor, 'note',
        '🔁 Dublikatlar avtomatik birlashtirildi (' || g.fnl || '): ' || coalesce(v_names, '')
      );

      organization_id := g.org;
      funnel := g.fnl;
      survivor_id := v_survivor;
      merged := array_length(v_losers, 1);
      return next;
    exception when others then
      raise warning 'auto merge of % in % failed: %', g.ids, g.org, sqlerrm;
    end;
  end loop;
end;
$$;

revoke all on function public.auto_merge_funnel_duplicates(uuid) from public, anon, authenticated;

-- Every night at 03:15 Tashkent time (22:15 UTC).
do $$
begin
  perform cron.schedule(
    'auto-merge-funnel-duplicates',
    '15 22 * * *',
    'select public.auto_merge_funnel_duplicates()'
  );
exception
  when undefined_table or invalid_schema_name or undefined_function then
    raise notice 'pg_cron not available; schedule auto_merge_funnel_duplicates() manually';
end $$;
