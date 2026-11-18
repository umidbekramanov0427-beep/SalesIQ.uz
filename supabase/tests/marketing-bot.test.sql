-- Marketing bot: the bot tables are closed to the browser; invite links and
-- post reactions are read by the company's marketing people only; join
-- requests are a kind of channel event.
begin;
insert into organizations (id, name) values
  ('00000000-0000-0000-0000-0000000000e1', 'W'),
  ('00000000-0000-0000-0000-0000000000e2', 'X');
insert into profiles (id, organization_id, role) values
  ('10000000-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-0000000000e1', 'marketolog'),
  ('10000000-0000-0000-0000-0000000000e2', '00000000-0000-0000-0000-0000000000e1', 'sotuv_menejeri'),
  ('10000000-0000-0000-0000-0000000000e3', '00000000-0000-0000-0000-0000000000e2', 'marketolog');
insert into marketing_channels (id, organization_id, title, username) values
  ('60000000-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-0000000000e1', 'Kanal', 'kanal_test');
insert into marketing_channel_invites (organization_id, channel_id, name, link) values
  ('00000000-0000-0000-0000-0000000000e1', '60000000-0000-0000-0000-0000000000e1', 'meta_kuz', 'https://t.me/+abc');
insert into marketing_channel_posts (channel_id, message_id, organization_id, reactions_total) values
  ('60000000-0000-0000-0000-0000000000e1', 10, '00000000-0000-0000-0000-0000000000e1', 42);
insert into marketing_channel_events (organization_id, channel_id, at, kind, tg_user_id) values
  ('00000000-0000-0000-0000-0000000000e1', '60000000-0000-0000-0000-0000000000e1', now(), 'request', 777);
insert into marketing_bots (organization_id, username, token_sealed, webhook_secret) values
  ('00000000-0000-0000-0000-0000000000e1', 'demo_mkt_bot', 'v1.x', 'secret');

grant usage on schema auth to authenticated;
grant select on profiles to authenticated;
set local role authenticated;

select set_config('test.uid', '10000000-0000-0000-0000-0000000000e1', true);
do $$ begin
  assert (select count(*) from marketing_channel_invites) = 1, 'a marketolog sees the invite links';
  assert (select count(*) from marketing_channel_posts) = 1, 'and the post reactions';
  begin
    perform 1 from marketing_bots;
    assert false, 'the bot (sealed token) is server-only';
  exception when insufficient_privilege then null;
  end;
end $$;

select set_config('test.uid', '10000000-0000-0000-0000-0000000000e2', true);
do $$ begin
  assert (select count(*) from marketing_channel_invites) = 0, 'a manager without marketing access sees none';
end $$;

select set_config('test.uid', '10000000-0000-0000-0000-0000000000e3', true);
do $$ begin
  assert (select count(*) from marketing_channel_posts) = 0, 'another company sees none';
end $$;
rollback;
