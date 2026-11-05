-- Lidlar savati (amoCRM's deleted-leads trash): a lead a person deletes
-- is kept for 30 days with its tasks, notes, chat, files and payments, and
-- can be restored exactly as it was. Leads are still really deleted from
-- `leads` (so no query anywhere has to learn to skip "deleted" rows); a
-- trigger first copies the lead and the rows that go with it into
-- `leads_trash`. The server (service role) lists, restores and empties
-- the trash; the 5-minute cron removes entries older than 30 days.

create table if not exists public.leads_trash (
  -- The deleted lead's own id: restoring gives it back the same id.
  id uuid primary key,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text,
  lead jsonb not null,
  -- {table: [row, ...]} for the rows deleted together with the lead.
  children jsonb not null default '{}'::jsonb,
  -- {table: {col, ids}}: calls, deals, invoices... whose link to the lead
  -- was cleared; restoring links them back.
  links jsonb not null default '{}'::jsonb,
  deleted_by uuid references public.profiles(id) on delete set null,
  deleted_at timestamptz not null default now()
);

create index if not exists leads_trash_org_idx
  on public.leads_trash (organization_id, deleted_at desc);

-- No policies: only the server and the functions below touch it.
alter table public.leads_trash enable row level security;

create or replace function public.leads_to_trash()
returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_children jsonb := '{}'::jsonb;
  v_links jsonb := '{}'::jsonb;
  v_tbl text;
  v_col text;
  v_rows jsonb;
begin
  -- Only a person's own delete goes to the trash. Server-side clean-ups
  -- (amoCRM / Bitrix24 sync, merges) run without auth.uid(), and a lead
  -- removed together with its company (a cascade) has nothing to return to.
  if auth.uid() is null or pg_trigger_depth() > 1 then
    return old;
  end if;

  foreach v_tbl in array array[
    'lead_activities', 'tasks', 'lead_stage_events', 'lead_telegram_messages',
    'whatsapp_messages', 'lead_emails', 'lead_files', 'lead_contracts',
    'lead_payments', 'lead_payment_links', 'lead_telegram_links',
    'lead_instagram_links', 'lead_followups', 'inbox_favorites', 'inbox_chat_states'
  ] loop
    if to_regclass('public.' || v_tbl) is null then
      continue;
    end if;
    execute format('select jsonb_agg(to_jsonb(t)) from public.%I t where t.lead_id = $1', v_tbl)
      into v_rows using old.id;
    if v_rows is not null then
      v_children := v_children || jsonb_build_object(v_tbl, v_rows);
    end if;
  end loop;

  for v_tbl, v_col in
    select x.tbl, x.col from (values
      ('deals', 'lead_id'), ('call_logs', 'lead_id'), ('amocrm_calls', 'lead_id'),
      ('pbx_calls', 'lead_id'), ('invoices', 'lead_id'), ('sms_log', 'lead_id'),
      ('training_recommendations', 'lead_id'), ('tma_lead_requests', 'lead_id'),
      ('incoming_lead_log', 'created_lead_id'), ('web_form_submissions', 'created_lead_id')
    ) as x(tbl, col)
    where exists (
      select 1 from information_schema.columns c
      where c.table_schema = 'public' and c.table_name = x.tbl and c.column_name = x.col
    ) and exists (
      select 1 from information_schema.columns c
      where c.table_schema = 'public' and c.table_name = x.tbl and c.column_name = 'id'
    )
  loop
    execute format('select jsonb_agg(t.id) from public.%I t where t.%I = $1', v_tbl, v_col)
      into v_rows using old.id;
    if v_rows is not null then
      v_links := v_links || jsonb_build_object(v_tbl, jsonb_build_object('col', v_col, 'ids', v_rows));
    end if;
  end loop;

  insert into public.leads_trash (id, organization_id, name, lead, children, links, deleted_by, deleted_at)
  values (
    old.id, old.organization_id, old.name, to_jsonb(old), v_children, v_links,
    (select p.id from public.profiles p where p.id = auth.uid()), now()
  )
  on conflict (id) do update set
    organization_id = excluded.organization_id,
    name = excluded.name,
    lead = excluded.lead,
    children = excluded.children,
    links = excluded.links,
    deleted_by = excluded.deleted_by,
    deleted_at = excluded.deleted_at;
  return old;
end;
$$;

drop trigger if exists leads_to_trash on public.leads;
create trigger leads_to_trash before delete on public.leads
  for each row execute function public.leads_to_trash();

-- A saved row with every single-column reference that no longer exists
-- cleared (a manager who left, a stage that was removed). Null when a
-- required reference is gone: that row can't come back.
create or replace function public.trash_fix_refs(p_tbl regclass, p_row jsonb)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  c record;
  v text;
  v_ok boolean;
begin
  for c in
    select a.attname::text as col, con.confrelid::regclass as ref, fa.attname as refcol,
           format_type(fa.atttypid, fa.atttypmod) as reftype, a.attnotnull as required
    from pg_constraint con
    join pg_attribute a on a.attrelid = con.conrelid and a.attnum = con.conkey[1]
    join pg_attribute fa on fa.attrelid = con.confrelid and fa.attnum = con.confkey[1]
    where con.conrelid = p_tbl and con.contype = 'f' and array_length(con.conkey, 1) = 1
  loop
    v := p_row ->> c.col;
    if v is null then
      continue;
    end if;
    execute format('select exists (select 1 from %s where %I = $1::%s)', c.ref, c.refcol, c.reftype)
      into v_ok using v;
    if not v_ok then
      if c.required then
        return null;
      end if;
      p_row := jsonb_set(p_row, array[c.col], 'null'::jsonb);
    end if;
  end loop;
  return p_row;
end;
$$;

-- Inserts a saved row back, with only the columns it was saved with (a
-- column added since keeps its default) and never a generated column.
create or replace function public.trash_insert_row(p_tbl regclass, p_row jsonb)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_cols text;
begin
  select string_agg(quote_ident(attname), ', ' order by attnum) into v_cols
  from pg_attribute
  where attrelid = p_tbl and attnum > 0 and not attisdropped and attgenerated = ''
    and p_row ? attname::text;
  if v_cols is null then
    return;
  end if;
  execute format(
    'insert into %s (%s) overriding system value select %s from jsonb_populate_record(null::%s, $1) on conflict do nothing',
    p_tbl, v_cols, v_cols, p_tbl
  ) using p_row;
end;
$$;

-- Puts a trashed lead back with its rows and links. Triggers stay quiet
-- while it does (replica mode): a restored lead must not greet the client,
-- create tasks or log a second stage entry. 'ok' | 'missing' | 'conflict'.
create or replace function public.restore_trashed_lead(p_org uuid, p_id uuid)
returns text
language plpgsql security definer set search_path = public as $$
declare
  t public.leads_trash%rowtype;
  v_lead jsonb;
  v_row jsonb;
  v_tbl text;
  v_stage uuid;
  v_quiet boolean := true;
begin
  select * into t from public.leads_trash
  where id = p_id and organization_id = p_org
  for update;
  if not found then
    return 'missing';
  end if;
  if exists (select 1 from public.leads where id = p_id) then
    return 'conflict';
  end if;

  v_lead := public.trash_fix_refs('public.leads'::regclass, t.lead);
  -- Its stage was removed meanwhile: the funnel's first open stage.
  if t.lead ->> 'stage_id' is not null and v_lead ->> 'stage_id' is null then
    select s.id into v_stage
    from public.pipeline_stages s
    where s.organization_id = p_org
      and coalesce(s.pipeline_name, '') = coalesce(v_lead ->> 'funnel', '')
      and not s.is_won and not s.is_lost
    order by s.position
    limit 1;
    v_lead := jsonb_set(v_lead, '{stage_id}', coalesce(to_jsonb(v_stage), 'null'::jsonb));
  end if;

  begin
    perform set_config('session_replication_role', 'replica', true);
  exception when insufficient_privilege then
    v_quiet := false;
  end;

  perform public.trash_insert_row('public.leads'::regclass, v_lead);
  if not exists (select 1 from public.leads where id = p_id) then
    if v_quiet then
      perform set_config('session_replication_role', 'origin', true);
    end if;
    return 'conflict';
  end if;

  for v_tbl in select jsonb_object_keys(t.children) loop
    if to_regclass('public.' || v_tbl) is null then
      continue;
    end if;
    for v_row in select value from jsonb_array_elements(t.children -> v_tbl) loop
      v_row := public.trash_fix_refs(('public.' || v_tbl)::regclass, v_row);
      continue when v_row is null;
      begin
        perform public.trash_insert_row(('public.' || v_tbl)::regclass, v_row);
      exception when unique_violation or foreign_key_violation or check_violation
        or not_null_violation then
        null;
      end;
    end loop;
  end loop;

  for v_tbl in select jsonb_object_keys(t.links) loop
    begin
      execute format(
        'update public.%I set %I = $1 where id::text in (select jsonb_array_elements_text($2)) and %I is null',
        v_tbl, t.links -> v_tbl ->> 'col', t.links -> v_tbl ->> 'col'
      ) using p_id, t.links -> v_tbl -> 'ids';
    exception when undefined_table or undefined_column then
      null;
    end;
  end loop;

  if v_quiet then
    perform set_config('session_replication_role', 'origin', true);
  end if;
  delete from public.leads_trash where id = p_id;
  return 'ok';
end;
$$;

revoke execute on function public.leads_to_trash() from public, anon, authenticated;
revoke execute on function public.trash_fix_refs(regclass, jsonb) from public, anon, authenticated;
revoke execute on function public.trash_insert_row(regclass, jsonb) from public, anon, authenticated;
revoke execute on function public.restore_trashed_lead(uuid, uuid) from public, anon, authenticated;
grant execute on function public.trash_fix_refs(regclass, jsonb) to service_role;
grant execute on function public.trash_insert_row(regclass, jsonb) to service_role;
grant execute on function public.restore_trashed_lead(uuid, uuid) to service_role;

notify pgrst, 'reload schema';
