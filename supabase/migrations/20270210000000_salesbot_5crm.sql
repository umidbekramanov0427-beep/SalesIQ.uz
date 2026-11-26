-- Salesbots like 5CRM: what starts a bot, its test mode, and the Telegram
-- salesbot's options. Adds columns only; no data is changed. Idempotent.
--  * salesbots.test_mode («Sinov»): the flow runs, nothing changes in the CRM.
--  * salesbots.trigger: manual (as before) / message (the client writes) /
--    stage_enter (with trigger_stage_id) / button (an automatic message's
--    button) / tg_start, tg_button, tg_message, tg_daily (the company's own
--    Telegram bot; tg_daily at trigger_time, Tashkent HH:MM).
--  * org_telegram_bots.new_subscriber_lead: a new person writing to the
--    company's bot opens a lead on /start (as before) or only once they write.

alter table public.salesbots
  add column if not exists test_mode boolean not null default false,
  add column if not exists trigger text not null default 'manual',
  add column if not exists trigger_stage_id uuid references public.pipeline_stages(id) on delete set null,
  add column if not exists trigger_time text;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'salesbots_trigger_check') then
    alter table public.salesbots
      add constraint salesbots_trigger_check
      check (trigger in ('manual', 'message', 'stage_enter', 'button',
                         'tg_start', 'tg_button', 'tg_message', 'tg_daily'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'salesbots_trigger_time_check') then
    alter table public.salesbots
      add constraint salesbots_trigger_time_check
      check (trigger_time is null or trigger_time ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$');
  end if;
end $$;

create index if not exists salesbots_trigger_idx
  on public.salesbots (organization_id, trigger) where enabled;

alter table public.org_telegram_bots
  add column if not exists new_subscriber_lead boolean not null default true;

notify pgrst, 'reload schema';
