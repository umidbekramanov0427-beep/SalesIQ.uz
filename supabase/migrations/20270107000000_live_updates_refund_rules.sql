-- 1. Pul qaytarish sozlamalari (org_general_settings.refund_rules): the
--    Telegram group or channel that gets every receipt (with the client's
--    name, phone and a link into the CRM) and whether the client gets it.
-- 2. Live updates without refreshing: the tables the pages show join the
--    supabase_realtime publication, so an open page hears every change
--    (RLS still decides who receives which row) and redraws itself.
-- Adds a column and publication entries; nothing is deleted or rewritten.

alter table public.org_general_settings
  add column if not exists refund_rules jsonb not null default '{}'::jsonb;

do $$
declare
  t text;
begin
  foreach t in array array[
    'leads', 'tasks', 'lead_stage_events', 'lead_refunds', 'lead_payments', 'reminders',
    'work_sessions', 'fines', 'finance_entries', 'call_logs', 'amocrm_calls',
    'announcements', 'marketing_channels', 'marketing_channel_days', 'marketing_webinars',
    'marketing_webinar_samples', 'marketing_webinar_marks'
  ] loop
    if to_regclass('public.' || t) is not null then
      begin
        execute format('alter publication supabase_realtime add table public.%I', t);
      exception
        when duplicate_object then null;
        when undefined_object then raise notice 'supabase_realtime publication not found';
      end;
    end if;
  end loop;
end $$;

notify pgrst, 'reload schema';
