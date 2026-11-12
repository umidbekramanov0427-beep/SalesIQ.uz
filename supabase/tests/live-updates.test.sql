-- Live updates: the shown tables are in the realtime publication, and the
-- refund settings column defaults to {}.
begin;
do $$ begin
  assert exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'leads'),
    'leads are live';
  assert exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'lead_refunds'),
    'refunds are live';
  insert into organizations (id, name) values ('00000000-0000-0000-0000-0000000000d9', 'L');
  insert into org_general_settings (organization_id) values ('00000000-0000-0000-0000-0000000000d9');
  assert (select refund_rules = '{}'::jsonb from org_general_settings
          where organization_id = '00000000-0000-0000-0000-0000000000d9'), 'refund rules default to {}';
end $$;
rollback;
