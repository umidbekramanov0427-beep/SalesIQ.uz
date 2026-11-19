-- Pul qaytarish: receipt numbers (#001 per company, in the order receipts are
-- sent) and the steps of a refund's progress (Jarayon) that are not implied
-- by the receipt itself: the lead note and the lead budget set to 0. A chat
-- message the bot could not deliver (the client blocked it) stays in the
-- lead's chat with the reason, shown with a red "!".
alter table public.lead_refunds add column if not exists receipt_no integer;
alter table public.lead_refunds add column if not exists noted_at timestamptz;
alter table public.lead_refunds add column if not exists budgeted_at timestamptz;
create unique index if not exists lead_refunds_receipt_no
  on public.lead_refunds (organization_id, receipt_no) where receipt_no is not null;

alter table public.lead_telegram_messages add column if not exists send_error text;
