-- Javob qoidalari (src/lib/reply-rules.ts): how many minutes a new lead or
-- a client's message may wait for an answer before it turns amber (the
-- manager is reminded) and red (the head of sales hears too), and whether
-- a message carrying a bank card number asks for confirmation before it
-- goes to a client. {} (the default) means 5 / 15 minutes and the card
-- check on, as before. Adds one column; nothing is deleted or rewritten.

alter table public.org_general_settings
  add column if not exists reply_rules jsonb not null default '{}'::jsonb;

notify pgrst, 'reload schema';
