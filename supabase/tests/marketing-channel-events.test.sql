-- Kanal analitikasi: marketing people of the company read their channels'
-- join / leave events; only the server writes them; one event is kept once.
begin;
insert into organizations (id, name) values
  ('00000000-0000-0000-0000-0000000000e1', 'P'),
  ('00000000-0000-0000-0000-0000000000e2', 'Q');
insert into profiles (id, organization_id, role) values
  ('10000000-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-0000000000e1', 'marketolog'),
  ('10000000-0000-0000-0000-0000000000e2', '00000000-0000-0000-0000-0000000000e1', 'sotuv_menejeri'),
  ('10000000-0000-0000-0000-0000000000e3', '00000000-0000-0000-0000-0000000000e2', 'marketolog');
insert into marketing_channels (id, organization_id, chat_id, title) values
  ('60000000-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-0000000000e1', -1001, 'Kanal'),
  ('60000000-0000-0000-0000-0000000000e2', '00000000-0000-0000-0000-0000000000e2', -1002, 'Boshqa');
insert into marketing_channel_events (organization_id, channel_id, at, kind, tg_user_id) values
  ('00000000-0000-0000-0000-0000000000e1', '60000000-0000-0000-0000-0000000000e1', '2026-11-12 10:00+05', 'join', 42),
  ('00000000-0000-0000-0000-0000000000e1', '60000000-0000-0000-0000-0000000000e1', '2026-11-12 10:30+05', 'leave', 42),
  ('00000000-0000-0000-0000-0000000000e2', '60000000-0000-0000-0000-0000000000e2', '2026-11-12 11:00+05', 'join', 7);
insert into marketing_channel_events (organization_id, channel_id, at, kind, tg_user_id)
values ('00000000-0000-0000-0000-0000000000e1', '60000000-0000-0000-0000-0000000000e1', '2026-11-12 10:00+05', 'join', 42)
on conflict (channel_id, tg_user_id, kind, at) do nothing;
insert into marketing_channel_days (channel_id, organization_id, day, members, min_members, max_members, joined, left_count, counts_source)
values ('60000000-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-0000000000e1', '2026-11-12', 100, 100, 100, 1, 1, 'events');
do $$ begin
  assert (select count(*) from marketing_channel_events) = 3, 'the same event is kept once';
  begin
    insert into marketing_channel_events (organization_id, channel_id, at, kind, tg_user_id)
    values ('00000000-0000-0000-0000-0000000000e1', '60000000-0000-0000-0000-0000000000e1', now(), 'stay', 1);
    assert false, 'kind is join or leave';
  exception when check_violation then null;
  end;
  begin
    update marketing_channel_days set counts_source = 'guess';
    assert false, 'counts come from stats or events';
  exception when check_violation then null;
  end;
end $$;
grant usage on schema auth to authenticated;
grant select on profiles to authenticated;
set local role authenticated;

select set_config('test.uid', '10000000-0000-0000-0000-0000000000e1', true);
do $$ begin
  assert (select count(*) from marketing_channel_events) = 2, 'a marketolog reads their company''s events only';
  begin
    insert into marketing_channel_events (organization_id, channel_id, at, kind, tg_user_id)
    values ('00000000-0000-0000-0000-0000000000e1', '60000000-0000-0000-0000-0000000000e1', now(), 'join', 9);
    assert false, 'only the server writes events';
  exception when insufficient_privilege then null;
  end;
end $$;

select set_config('test.uid', '10000000-0000-0000-0000-0000000000e2', true);
do $$ begin
  assert (select count(*) from marketing_channel_events) = 0, 'a manager without marketing access sees none';
end $$;
rollback;
