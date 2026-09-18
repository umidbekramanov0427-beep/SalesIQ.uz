revoke execute on function public.current_user_role() from anon, authenticated, public;
revoke execute on function public.is_admin_or_manager() from anon, authenticated, public;
revoke execute on function public.handle_new_user() from anon, authenticated, public;
revoke execute on function public.prevent_role_self_escalation() from anon, authenticated, public;
revoke execute on function public.set_updated_at() from anon, authenticated, public;

insert into public.pipeline_stages (key, name, position, color, probability, is_won, is_lost) values
  ('new', 'New Lead', 1, 'bg-primary', 10, false, false),
  ('qualified', 'Qualified', 2, 'bg-info', 25, false, false),
  ('demo', 'Demo', 3, 'bg-warning', 45, false, false),
  ('proposal', 'Proposal', 4, 'bg-mint-border', 65, false, false),
  ('negotiation', 'Negotiation', 5, 'bg-success', 85, false, false),
  ('won', 'Won', 6, 'bg-success', 100, true, false),
  ('lost', 'Lost', 7, 'bg-destructive', 0, false, true)
on conflict (key) do nothing;

insert into public.integration_settings (key, enabled, config) values
  ('openai', false, '{}'),
  ('telegram', false, '{}'),
  ('whatsapp', false, '{}')
on conflict (key) do nothing;

-- The fake demo companies/contacts/leads/deals/tasks/notifications that used
-- to follow here were removed: matched by name with no unique constraint,
-- so re-running this (or seed_demo_data.sql, which inserted the identical
-- rows first) against a database that already has data throws "more than
-- one row returned by a subquery used as an expression" instead of being a
-- harmless no-op. Not worth keeping for optional sample data.