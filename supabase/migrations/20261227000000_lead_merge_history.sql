-- Dublikatlar tarixi: every time two leads of one client became one -- a
-- manager merging a duplicate, the funnel merge, a client registering again
-- into a funnel they are already a lead in -- and every pair a person chose
-- to keep apart. The merged-away lead is deleted by the merge, so its main
-- fields are kept here as a snapshot. Written only by the server; admins
-- and heads of sales of the company read it. Rows older than a year are
-- purged nightly. Adds one table and one cron job and makes the nightly
-- automatic merge write its history too; no existing data is changed.

create table if not exists public.lead_merge_history (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  kind text not null check (kind in ('manual', 'funnel', 'repeat', 'kept')),
  -- The lead that stayed (null once it is deleted later on).
  survivor_lead_id uuid references public.leads(id) on delete set null,
  survivor_name text,
  -- The lead that was merged away (already deleted) or the incoming
  -- registration that was added to the survivor.
  merged_lead_id uuid,
  merged_name text,
  phone text,
  funnel text,
  -- Where a repeat registration came from (web form, webhook, bot...).
  source text,
  actor_id uuid references public.profiles(id) on delete set null,
  snapshot jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists lead_merge_history_org_idx
  on public.lead_merge_history (organization_id, created_at desc);

alter table public.lead_merge_history enable row level security;

drop policy if exists lead_merge_history_select on public.lead_merge_history;
create policy lead_merge_history_select on public.lead_merge_history
  for select to authenticated
  using (organization_id = public.current_user_org_id() and public.is_admin_or_manager());

-- The nightly automatic merge (auto_merge_funnel_duplicates, from
-- 20261108000000_task_control_auto_merge.sql) runs in the database; its
-- merge_lead_into is redefined unchanged except for the history row it now
-- writes before deleting the merged lead.
create or replace function public.merge_lead_into(p_survivor uuid, p_loser uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  r record;
begin
  if p_survivor = p_loser then
    raise exception 'cannot merge a lead into itself';
  end if;
  -- Dublikatlar tarixi: what the merged-away lead was, before it goes.
  -- A failed history write never stops the merge.
  begin
  insert into public.lead_merge_history (
    organization_id, kind, survivor_lead_id, survivor_name, merged_lead_id,
    merged_name, phone, funnel, snapshot
  )
  select l.organization_id, 'funnel', p_survivor, s.name, l.id, l.name, c.phone, l.funnel,
         jsonb_build_object(
           'name', l.name, 'funnel', l.funnel, 'stage', st.name, 'owner', p.full_name,
           'budget', coalesce(l.budget, 0), 'tags', coalesce(to_jsonb(l.tags), '[]'::jsonb),
           'source', l.source, 'contact', c.full_name, 'phone', c.phone, 'email', c.email,
           'createdAt', l.created_at
         )
  from public.leads l
  left join public.leads s on s.id = p_survivor
  left join public.contacts c on c.id = l.contact_id
  left join public.pipeline_stages st on st.id = l.stage_id
  left join public.profiles p on p.id = l.owner_id
  where l.id = p_loser;
  exception when others then
    raise warning 'merge history of % failed: %', p_loser, sqlerrm;
  end;
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

-- Rows older than a year are dropped every night at 03:10 Tashkent (a job
-- of the same name is replaced, so re-running is harmless).
select cron.schedule(
  'lead-merge-history-purge',
  '10 22 * * *',
  $cron$delete from public.lead_merge_history where created_at < now() - interval '365 days'$cron$
);

notify pgrst, 'reload schema';
