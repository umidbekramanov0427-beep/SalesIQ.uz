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

insert into public.companies (name, industry, employees_range, annual_revenue, website, city, country) values
  ('Kazpost Digital', 'Government / Logistics', '5,000+', 240000000, 'kazpost.kz', 'Almaty', 'Kazakhstan'),
  ('Halyk Fintech', 'Financial services', '1,200', 98000000, 'halykfin.kz', 'Almaty', 'Kazakhstan'),
  ('Astana Logistics', 'Transport', '800', 46000000, 'astanalog.kz', 'Astana', 'Kazakhstan'),
  ('Tengri Retail', 'Retail', '2,400', 72000000, 'tengri.kz', 'Almaty', 'Kazakhstan'),
  ('Silk Road Cargo', 'Freight', '600', 31000000, 'silkroad.kz', 'Almaty', 'Kazakhstan'),
  ('Almaty Medtech', 'Healthcare', '310', 18000000, 'medtech.kz', 'Almaty', 'Kazakhstan');

insert into public.contacts (company_id, full_name, position, phone, email, telegram, whatsapp) values
  ((select id from public.companies where name = 'Kazpost Digital'), 'Sanzhar Abenov', 'Head of Operations', '+7 701 442 18 90', 's.abenov@kazpost.kz', '@sanzhar_ab', '+7 701 442 18 90'),
  ((select id from public.companies where name = 'Halyk Fintech'), 'Zarina Mukhtarova', 'CTO', '+7 705 118 42 03', 'z.mukhtarova@halykfin.kz', '@zarina_m', '+7 705 118 42 03'),
  ((select id from public.companies where name = 'Astana Logistics'), 'Yerlan Tulegenov', 'COO', '+7 702 900 71 15', 'y.tulegenov@astanalog.kz', '@yerlan_t', '+7 702 900 71 15'),
  ((select id from public.companies where name = 'Tengri Retail'), 'Aigerim Sadvakasova', 'Retail Director', '+7 708 331 25 76', 'a.sadvakasova@tengri.kz', '@aigerim_s', '+7 708 331 25 76'),
  ((select id from public.companies where name = 'Silk Road Cargo'), 'Nurlan Kassymov', 'CEO', '+7 700 512 88 41', 'n.kassymov@silkroad.kz', '@nurlan_k', '+7 700 512 88 41'),
  ((select id from public.companies where name = 'Almaty Medtech'), 'Dana Bekturova', 'Procurement Lead', '+7 707 664 09 33', 'd.bekturova@medtech.kz', '@dana_b', '+7 707 664 09 33');

insert into public.leads (
  contact_id, company_id, name, company_name, source, campaign, owner_id, priority, score, temperature,
  budget, expected_revenue, city, stage_id, funnel, next_follow_up, last_contact_at, tags
) values
  ((select id from public.contacts where full_name = 'Sanzhar Abenov'), (select id from public.companies where name = 'Kazpost Digital'),
   'Sanzhar Abenov', 'Kazpost Digital', 'Inbound — Website', 'Q3 Enterprise Push', null, 'Urgent', 92, 'Hot',
   120000, 84000, 'Almaty', (select id from public.pipeline_stages where key = 'negotiation'), 'Enterprise Sales', now() + interval '2 hours', now() - interval '2 hours', array['Enterprise','Renewal']),
  ((select id from public.contacts where full_name = 'Zarina Mukhtarova'), (select id from public.companies where name = 'Halyk Fintech'),
   'Zarina Mukhtarova', 'Halyk Fintech', 'Outbound — LinkedIn', 'Fintech ABM', null, 'High', 78, 'Warm',
   90000, 62500, 'Almaty', (select id from public.pipeline_stages where key = 'proposal'), 'Enterprise Sales', now() + interval '1 day', now() - interval '5 hours', array['Fintech']),
  ((select id from public.contacts where full_name = 'Yerlan Tulegenov'), (select id from public.companies where name = 'Astana Logistics'),
   'Yerlan Tulegenov', 'Astana Logistics', 'Partner referral', 'Logistics vertical', null, 'Normal', 64, 'Warm',
   60000, 41000, 'Astana', (select id from public.pipeline_stages where key = 'demo'), 'Mid-Market', now() + interval '3 days', now() - interval '1 day', array['Logistics']),
  ((select id from public.contacts where full_name = 'Aigerim Sadvakasova'), (select id from public.companies where name = 'Tengri Retail'),
   'Aigerim Sadvakasova', 'Tengri Retail', 'Event — SalesConf', 'SalesConf 2026', null, 'Normal', 51, 'Cold',
   40000, 28700, 'Almaty', (select id from public.pipeline_stages where key = 'qualified'), 'SMB', now() + interval '4 days', now() - interval '1 day', array['Retail']),
  ((select id from public.contacts where full_name = 'Nurlan Kassymov'), (select id from public.companies where name = 'Silk Road Cargo'),
   'Nurlan Kassymov', 'Silk Road Cargo', 'Inbound — Referral', 'Referral program', null, 'High', 96, 'Hot',
   140000, 96400, 'Almaty', (select id from public.pipeline_stages where key = 'won'), 'Enterprise Sales', null, now() - interval '2 days', array['Closed won']),
  ((select id from public.contacts where full_name = 'Dana Bekturova'), (select id from public.companies where name = 'Almaty Medtech'),
   'Dana Bekturova', 'Almaty Medtech', 'Cold call', 'Medtech outbound', null, 'Low', 34, 'Cold',
   35000, 33200, 'Almaty', (select id from public.pipeline_stages where key = 'new'), 'SMB', now() + interval '5 days', now() - interval '3 days', array['Medtech']);

insert into public.deals (lead_id, company_id, contact_id, name, value, probability, stage_id, pipeline, status, close_date, products_count, discount, tax) values
  ((select id from public.leads where name = 'Sanzhar Abenov'), (select id from public.companies where name = 'Kazpost Digital'), (select id from public.contacts where full_name = 'Sanzhar Abenov'),
   'Kazpost — Enterprise rollout', 84000, 85, (select id from public.pipeline_stages where key = 'negotiation'), 'Enterprise Sales', 'open', current_date + 4, 4, 8, 12),
  ((select id from public.leads where name = 'Zarina Mukhtarova'), (select id from public.companies where name = 'Halyk Fintech'), (select id from public.contacts where full_name = 'Zarina Mukhtarova'),
   'Halyk Fintech — Platform license', 62500, 65, (select id from public.pipeline_stages where key = 'proposal'), 'Enterprise Sales', 'open', current_date + 14, 3, 5, 12),
  ((select id from public.leads where name = 'Yerlan Tulegenov'), (select id from public.companies where name = 'Astana Logistics'), (select id from public.contacts where full_name = 'Yerlan Tulegenov'),
   'Astana Logistics — Fleet CRM', 41000, 45, (select id from public.pipeline_stages where key = 'demo'), 'Mid-Market', 'open', current_date + 26, 2, 0, 12),
  ((select id from public.leads where name = 'Aigerim Sadvakasova'), (select id from public.companies where name = 'Tengri Retail'), (select id from public.contacts where full_name = 'Aigerim Sadvakasova'),
   'Tengri Retail — Pilot', 28700, 25, (select id from public.pipeline_stages where key = 'qualified'), 'SMB', 'open', current_date + 41, 1, 10, 12),
  ((select id from public.leads where name = 'Nurlan Kassymov'), (select id from public.companies where name = 'Silk Road Cargo'), (select id from public.contacts where full_name = 'Nurlan Kassymov'),
   'Silk Road — Expansion', 96400, 100, (select id from public.pipeline_stages where key = 'won'), 'Enterprise Sales', 'won', current_date - 7, 6, 4, 12),
  ((select id from public.leads where name = 'Dana Bekturova'), (select id from public.companies where name = 'Almaty Medtech'), (select id from public.contacts where full_name = 'Dana Bekturova'),
   'Almaty Medtech — Starter', 33200, 10, (select id from public.pipeline_stages where key = 'new'), 'SMB', 'open', current_date + 53, 1, 0, 12);

insert into public.tasks (title, description, priority, status, due_date, progress, lead_id) values
  ('Prepare Q3 enterprise renewal pack', 'Bundle usage report, renewal terms and upsell options.', 'Urgent', 'In progress', now() + interval '6 hours', 65, (select id from public.leads where name = 'Sanzhar Abenov')),
  ('Send revised proposal', 'Finance wants a 3-year term with annual uplift capped at 5%.', 'Urgent', 'In progress', now() - interval '1 day', 40, (select id from public.leads where name = 'Zarina Mukhtarova')),
  ('Rework pricing objection script', null, 'High', 'Review', now() + interval '1 day', 80, null),
  ('Migrate legacy leads into new funnel', null, 'Normal', 'Todo', now() + interval '4 days', 10, null),
  ('Call quality audit — SMB team', null, 'High', 'In progress', now() + interval '6 days', 45, null);

insert into public.notifications (user_id, type, title, body) values
  (null, 'Automation', 'Welcome to SalesOS Elite', 'Your workspace is live. Invite your team from the Admin Panel.'),
  (null, 'AI', 'AI Copilot is ready', 'Ask it to summarize leads, draft follow-ups or predict close probability.');