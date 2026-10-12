-- Per-org toggle set for which optional fields show on a funnel's Kanban
-- lead cards (AmoCRM calls this dialog "Внешний вид карточки" / card
-- appearance) -- phone, temperature, owner, tags, amount, source and next
-- follow-up are all optional; core identity (company/name, avatar) always
-- shows regardless of this setting. Same "missing/unset means visible,
-- only an explicit false hides it" convention as org_general_settings.
-- lead_workspace_sections, so an org that never opens the dialog keeps
-- today's default card.
alter table public.org_general_settings
  add column if not exists kanban_card_fields jsonb;
