-- Deleting an organization has been failing ever since any newer feature
-- table picked up an organization_id column: delete_organization_data()
-- is a hand-maintained list of per-table deletes, and roughly two dozen
-- tables added across later migrations (lessons, lesson_progress,
-- training_recommendations, scoring_criteria_config, call_score_rubric,
-- call_qualification_groups, daily_report_settings, hr_department and its
-- siblings, fines, setting_lists, role_permissions, ...) were never added
-- to it. Their organization_id foreign key defaults to NO ACTION, so the
-- final `delete from organizations` in that function hits a foreign key
-- violation the moment the target org has so much as one row in any of
-- those tables -- exactly the "failed" the user hit trying to delete a
-- company yesterday.
--
-- Fix this at the root instead of extending the hardcoded list again: walk
-- every foreign key that references organizations(id) and is not already
-- ON DELETE CASCADE, and cascade it. This covers every table above plus
-- whatever gets added next, so this bug class can't recur just because a
-- future migration forgets to update a deletion helper.
do $$
declare
  rec record;
begin
  for rec in
    select
      con.conname as constraint_name,
      con.conrelid::regclass::text as table_name,
      att.attname as column_name
    from pg_constraint con
    join pg_attribute att
      on att.attrelid = con.conrelid
     and att.attnum = con.conkey[1]
    where con.contype = 'f'
      and con.confrelid = 'public.organizations'::regclass
      and con.confdeltype <> 'c'
      and array_length(con.conkey, 1) = 1
  loop
    execute format(
      'alter table %s drop constraint %I',
      rec.table_name, rec.constraint_name
    );
    execute format(
      'alter table %s add constraint %I foreign key (%I) references public.organizations(id) on delete cascade',
      rec.table_name, rec.constraint_name, rec.column_name
    );
    raise notice 'Cascaded FK % on % (%)', rec.constraint_name, rec.table_name, rec.column_name;
  end loop;
end $$;

-- Every organization_id FK now cascades, so the function no longer needs
-- its own per-table list -- deleting the tenant row is enough. Auth
-- accounts still can't cascade from a plain SQL delete (they live in the
-- separate `auth` schema/service), which is why platform.delete-organization.ts
-- deletes each member's auth user first, before calling this.
create or replace function public.delete_organization_data(target_org_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  set local statement_timeout = '8s';
  delete from public.organizations where id = target_org_id;
end;
$$;

-- Same bug class, one level down: deleting a single user (platform.delete-
-- user.ts / useDeleteUserAsOwner) removes their auth.users row, which
-- cascades to profiles -- but several "who did this" audit columns
-- (organizations.created_by, ai_agents.updated_by, amocrm_calls.created_by,
-- hr_department history/messages/deletions, lead_analytics_marketing.
-- created_by, lessons.created_by, ...) reference profiles(id) with no
-- delete action at all, so that cascade gets blocked by a foreign key
-- violation the moment the user being deleted authored anything -- which
-- is exactly what happened trying to remove a manager yesterday.
--
-- These are attribution columns, not ownership: the record itself (the
-- org, the agent config, the call, the HR history entry, the lesson)
-- should survive; only the "by whom" can go. Every other FK already
-- follows this rule (nearly all profiles(id) references in this schema
-- are already ON DELETE SET NULL) -- these are the stragglers that were
-- never given one. Cascade the same walk as above, targeting profiles,
-- but to SET NULL rather than CASCADE, since deleting a user must never
-- delete the business records they merely touched.
do $$
declare
  rec record;
begin
  for rec in
    select
      con.conname as constraint_name,
      con.conrelid::regclass::text as table_name,
      att.attname as column_name
    from pg_constraint con
    join pg_attribute att
      on att.attrelid = con.conrelid
     and att.attnum = con.conkey[1]
    where con.contype = 'f'
      and con.confrelid = 'public.profiles'::regclass
      and con.confdeltype not in ('c', 'n')
      and array_length(con.conkey, 1) = 1
  loop
    execute format(
      'alter table %s drop constraint %I',
      rec.table_name, rec.constraint_name
    );
    execute format(
      'alter table %s add constraint %I foreign key (%I) references public.profiles(id) on delete set null',
      rec.table_name, rec.constraint_name, rec.column_name
    );
    raise notice 'Set-null FK % on % (%)', rec.constraint_name, rec.table_name, rec.column_name;
  end loop;
end $$;
