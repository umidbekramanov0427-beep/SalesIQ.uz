-- Company bots: the shared bot's 14 days, short salesbot codes, the
-- server-only bots table.
begin;
insert into organizations (id, name, created_at) values
  ('f1000000-0000-0000-0000-000000000001', 'New', now()),
  ('f1000000-0000-0000-0000-000000000002', 'Old', now() - interval '60 days');
insert into salesbots (id, organization_id, name) values
  ('f1000000-0000-0000-0000-0000000000b1', 'f1000000-0000-0000-0000-000000000001', 'Ro''yxat'),
  ('f1000000-0000-0000-0000-0000000000b2', 'f1000000-0000-0000-0000-000000000001', 'Kurs');
do $$
begin
  assert (select shared_bot_until from organizations where name = 'New')
         between now() + interval '13 days 23 hours' and now() + interval '14 days 1 hour',
    'a new company may use the shared bot for 14 days';
  assert (select shared_bot_until from organizations where name = 'Old') < now(),
    'a company that signed up 60 days ago is past its 14 days';
  assert (select count(distinct short_code) from salesbots) = 2, 'every new salesbot gets its own short code';
  assert (select bool_and(short_code ~ '^[0-9a-f]{6}$') from salesbots), 'six letters and digits';
  assert has_table_privilege('authenticated', 'public.org_telegram_bots', 'select') = false,
    'the bot tokens are server-only';
  assert (select column_default from information_schema.columns
           where table_name = 'lead_telegram_links' and column_name = 'via_org_bot') = 'false',
    'links default to the shared bot';
end $$;
rollback;
