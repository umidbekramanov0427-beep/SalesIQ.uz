-- Kunlik zaxira Telegram'ga (Platforma -> Sozlamalar -> Zaxira): every day at
-- the owner's chosen time each company's data goes, as one compressed JSON
-- file per company, to a Telegram channel or group the owner bound with
-- "/zaxira <code>". This is on top of the server's nightly full database
-- backup, not instead of it.
--
--   platform_settings        + where (chat), when (HH:MM Tashkent), on/off,
--                              the bind code and the last run.
--   backup_org_tables()      the public tables that hold a company's rows
--                              (those with an organization_id column).
--   backup_org_table(t, org) one such table's rows of one company, as JSON.
-- Both functions are server-only (service_role). Nothing is deleted.
-- Idempotent: safe to run again.

alter table public.platform_settings
  add column if not exists backup_enabled boolean not null default false,
  add column if not exists backup_time text not null default '03:00'
    check (backup_time ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
  add column if not exists backup_chat_id bigint,
  add column if not exists backup_chat_title text,
  add column if not exists backup_bind_code text,
  add column if not exists backup_bind_expires_at timestamptz,
  add column if not exists backup_last_at timestamptz,
  add column if not exists backup_last_status text;

create or replace function public.backup_org_tables()
returns table (table_name text)
language sql
stable
security definer
set search_path = public
as $$
  select c.table_name::text
  from information_schema.columns c
  join information_schema.tables t
    on t.table_schema = c.table_schema
   and t.table_name = c.table_name
   and t.table_type = 'BASE TABLE'
  where c.table_schema = 'public'
    and c.column_name = 'organization_id'
  order by 1
$$;

create or replace function public.backup_org_table(p_table text, p_org uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  result jsonb;
begin
  if not exists (select 1 from public.backup_org_tables() b where b.table_name = p_table) then
    raise exception 'not a company table: %', p_table;
  end if;
  execute format(
    'select coalesce(jsonb_agg(to_jsonb(t)), ''[]''::jsonb) from public.%I t where t.organization_id = $1',
    p_table
  ) into result using p_org;
  return result;
end;
$$;

revoke all on function public.backup_org_tables() from public, anon, authenticated;
revoke all on function public.backup_org_table(text, uuid) from public, anon, authenticated;
grant execute on function public.backup_org_tables() to service_role;
grant execute on function public.backup_org_table(text, uuid) to service_role;

notify pgrst, 'reload schema';
