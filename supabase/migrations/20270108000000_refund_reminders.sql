-- Pul qaytarish deadlines: the 5-minute cron reminds the responsible manager
-- and the admins when a pending refund nears or passes its deadline (days set
-- in org_general_settings.refund_rules). reminded_at is when the last
-- reminder went out -- at most one a day, claimed so two runs never double.
alter table public.lead_refunds add column if not exists reminded_at timestamptz;

create index if not exists lead_refunds_pending_idx
  on public.lead_refunds (created_at)
  where status = 'pending';
