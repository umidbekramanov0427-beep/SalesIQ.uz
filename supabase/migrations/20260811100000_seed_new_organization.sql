-- Every new company needs the same starting scaffolding the very first
-- workspace got by hand (pipeline stages, integration rows, an empty
-- business profile, the two AI agent presets) — otherwise a freshly
-- created organization has no funnel stages at all and the CRM is
-- unusable until someone notices and creates them manually.
create or replace function public.seed_new_organization()
returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.pipeline_stages (key, name, position, color, probability, is_won, is_lost, organization_id) values
    ('new', 'New Lead', 1, 'bg-primary', 10, false, false, new.id),
    ('qualified', 'Qualified', 2, 'bg-info', 25, false, false, new.id),
    ('demo', 'Demo', 3, 'bg-warning', 45, false, false, new.id),
    ('proposal', 'Proposal', 4, 'bg-mint-border', 65, false, false, new.id),
    ('negotiation', 'Negotiation', 5, 'bg-success', 85, false, false, new.id),
    ('won', 'Won', 6, 'bg-success', 100, true, false, new.id),
    ('lost', 'Lost', 7, 'bg-destructive', 0, false, true, new.id);

  insert into public.integration_settings (organization_id, key, enabled, config) values
    (new.id, 'openai', false, '{}'),
    (new.id, 'telegram', false, '{}'),
    (new.id, 'whatsapp', false, '{}'),
    (new.id, 'amocrm', false, '{}'),
    (new.id, 'telegram_bot', false, '{}');

  insert into public.business_profile (organization_id) values (new.id);

  insert into public.ai_agents (organization_id, kind) values
    (new.id, 'chat'),
    (new.id, 'call');

  return new;
end; $$;

drop trigger if exists seed_new_organization on public.organizations;
create trigger seed_new_organization after insert on public.organizations
  for each row execute function public.seed_new_organization();
