-- «Raqamni chatdan aniqlash»: the Uzbek number a client writes, in the
-- forms people type it; nothing for text without one.
begin;
do $$ begin
  assert public.extract_uz_phone('Raqamim +998 90 123-45-67, qo''ng''iroq qiling') = '+998901234567', 'full number';
  assert public.extract_uz_phone('998901234567') = '+998901234567', 'no plus';
  assert public.extract_uz_phone('90 123 45 67') = '+998901234567', 'nine digits with spaces';
  assert public.extract_uz_phone('(93) 555-11-22') = '+998935551122', 'brackets';
  assert public.extract_uz_phone('Narxi qancha?') is null, 'no number';
  assert public.extract_uz_phone('Buyurtma 12345') is null, 'short number';
  assert public.extract_uz_phone('012345678') is null, 'nine digits starting with 0';
  assert public.extract_uz_phone(null) is null, 'null';
end $$;
rollback;
