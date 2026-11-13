-- One client by phone, country code included: every Uzbek format is one
-- client; a Russian number with the same last 9 digits is another.
begin;
do $$ begin
  assert public.phone9('+998 90 123-45-67') = '998901234567', 'full Uzbek';
  assert public.phone9('90 123 45 67') = '998901234567', 'without the code';
  assert public.phone9('8 (90) 123 45 67') = '998901234567', 'old 8 prefix';
  assert public.phone9('+7 990 123 45 67') = '79901234567', 'Russian stays Russian';
  assert public.phone9('8 990 123 45 67') = '79901234567', 'Russian 8 prefix';
  assert public.phone9('12-34') is null, 'too short';
  assert public.phone_key('+998901234567') = public.phone9('901234567'), 'phone_key agrees';
end $$;
insert into organizations (id, name) values ('00000000-0000-0000-0000-0000000000e1', 'E1');
insert into contacts (id, organization_id, phone) values
  ('40000000-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-0000000000e1', '+7 990 123 45 67'),
  ('40000000-0000-0000-0000-0000000000e2', '00000000-0000-0000-0000-0000000000e1', '90 123 45 67');
insert into leads (id, organization_id, name, funnel, contact_id, created_at) values
  ('50000000-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-0000000000e1', 'Ivan', 'Sotuv', '40000000-0000-0000-0000-0000000000e1', now() - interval '2 days'),
  ('50000000-0000-0000-0000-0000000000e2', '00000000-0000-0000-0000-0000000000e1', 'Ali', 'Sotuv', '40000000-0000-0000-0000-0000000000e2', now() - interval '1 day');
do $$ begin
  assert public.funnel_lead_for_client('00000000-0000-0000-0000-0000000000e1', 'Sotuv', '+998 90 123 45 67', null)
    = '50000000-0000-0000-0000-0000000000e2', 'the Uzbek client, not the Russian one with the same last digits';
  assert public.funnel_lead_for_client('00000000-0000-0000-0000-0000000000e1', 'Sotuv', '+7 (990) 123-45-67', null)
    = '50000000-0000-0000-0000-0000000000e1', 'the Russian client';
end $$;
rollback;
