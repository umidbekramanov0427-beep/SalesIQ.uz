-- Platform bots: the sealed tokens and the backup bind code live in a
-- server-only row; signed-in people (who may read platform_settings) can't.
begin;
insert into platform_settings (id) values (true) on conflict (id) do nothing;
update platform_private set staff_bot_token_sealed = 'sealed', backup_bind_code = 'ABCD2345' where id;
insert into telegram_chat_bots (chat_id, bot) values (42, 'staff');
do $$ begin
  assert (select count(*) from platform_private) = 1, 'one row';
  begin
    insert into telegram_chat_bots (chat_id, bot) values (43, 'other');
    assert false, 'only the staff bot is remembered';
  exception when check_violation then null;
  end;
end $$;
set local role authenticated;
do $$ begin
  begin
    perform 1 from platform_private;
    assert false, 'tokens and codes are server-only';
  exception when insufficient_privilege then null;
  end;
  begin
    perform 1 from telegram_chat_bots;
    assert false, 'and so is who talks to which bot';
  exception when insufficient_privilege then null;
  end;
end $$;
rollback;
