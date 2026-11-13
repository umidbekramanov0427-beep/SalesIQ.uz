-- Sotuvchi Telegram akkaunti: one work account per person and per Telegram
-- id; sessions never reach the browser; links are readable only inside
-- the company; the chat history takes the new channel.
begin;
insert into organizations (id, name) values
  ('00000000-0000-0000-0000-0000000000c1', 'C1'),
  ('00000000-0000-0000-0000-0000000000c2', 'C2');
insert into profiles (id, organization_id, role) values
  ('10000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-0000000000c1', 'sotuv_menejeri'),
  ('10000000-0000-0000-0000-0000000000c2', '00000000-0000-0000-0000-0000000000c1', 'sotuv_menejeri'),
  ('10000000-0000-0000-0000-0000000000c3', '00000000-0000-0000-0000-0000000000c2', 'super_admin');
insert into leads (id, organization_id, name) values
  ('20000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-0000000000c1', 'Mijoz');
insert into telegram_user_accounts (organization_id, profile_id, tg_user_id, session_sealed)
values ('00000000-0000-0000-0000-0000000000c1', '10000000-0000-0000-0000-0000000000c1', 111, 'sealed');
do $$ begin
  begin
    insert into telegram_user_accounts (organization_id, profile_id, tg_user_id, session_sealed)
    values ('00000000-0000-0000-0000-0000000000c1', '10000000-0000-0000-0000-0000000000c2', 111, 's');
    assert false, 'one Telegram account cannot belong to two people';
  exception when unique_violation then null;
  end;
  begin
    insert into telegram_user_accounts (organization_id, profile_id, tg_user_id, session_sealed)
    values ('00000000-0000-0000-0000-0000000000c1', '10000000-0000-0000-0000-0000000000c1', 222, 's');
    assert false, 'one person has one work account';
  exception when unique_violation then null;
  end;
end $$;
insert into lead_telegram_user_links (organization_id, lead_id, account_tg_user_id, peer_id, name)
values ('00000000-0000-0000-0000-0000000000c1', '20000000-0000-0000-0000-0000000000c1', 111, 999, 'Mijoz');
insert into lead_telegram_messages (organization_id, lead_id, direction, text, channel, via_profile_id)
values ('00000000-0000-0000-0000-0000000000c1', '20000000-0000-0000-0000-0000000000c1', 'in', 'Salom',
        'telegram_user', '10000000-0000-0000-0000-0000000000c1');
do $$ begin
  begin
    insert into lead_telegram_messages (organization_id, lead_id, direction, text, channel)
    values ('00000000-0000-0000-0000-0000000000c1', '20000000-0000-0000-0000-0000000000c1', 'in', 'x', 'whatsapp');
    assert false, 'an unknown channel is refused';
  exception when check_violation then null;
  end;
  begin
    insert into lead_telegram_user_links (organization_id, lead_id, account_tg_user_id, peer_id)
    values ('00000000-0000-0000-0000-0000000000c1', '20000000-0000-0000-0000-0000000000c1', 111, 999);
    assert false, 'one client chat of an account is one lead';
  exception when unique_violation then null;
  end;
end $$;
grant usage on schema auth to authenticated;
grant select on profiles to authenticated;
set local role authenticated;

select set_config('test.uid', '10000000-0000-0000-0000-0000000000c2', true);
do $$ begin
  begin
    perform 1 from telegram_user_accounts;
    assert false, 'sessions are never readable from the browser';
  exception when insufficient_privilege then null;
  end;
  assert (select count(*) from lead_telegram_user_links) = 1, 'the company sees its chats';
  begin
    insert into lead_telegram_user_links (organization_id, lead_id, account_tg_user_id, peer_id)
    values ('00000000-0000-0000-0000-0000000000c1', '20000000-0000-0000-0000-0000000000c1', 111, 1000);
    assert false, 'links are written only by the server';
  exception when insufficient_privilege then null;
  end;
end $$;

select set_config('test.uid', '10000000-0000-0000-0000-0000000000c3', true);
do $$ begin
  assert (select count(*) from lead_telegram_user_links) = 0, 'another company sees nothing';
end $$;
rollback;
