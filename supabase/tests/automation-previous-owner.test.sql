-- «Lid egaligi»: a returning client's new lead goes to whoever owns their
-- latest other lead; a client with no earlier lead (or no contact) keeps
-- the owner it has.
begin;
insert into organizations (id, name) values ('00000000-0000-0000-0000-0000000000b1', 'Owner');
insert into profiles (id, organization_id, full_name) values
  ('10000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-0000000000b1', 'Old'),
  ('10000000-0000-0000-0000-0000000000b2', '00000000-0000-0000-0000-0000000000b1', 'Latest'),
  ('10000000-0000-0000-0000-0000000000b3', '00000000-0000-0000-0000-0000000000b1', 'Now');
insert into contacts (id, organization_id, full_name, phone) values
  ('30000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-0000000000b1', 'Mijoz', '+998901112233'),
  ('30000000-0000-0000-0000-0000000000b2', '00000000-0000-0000-0000-0000000000b1', 'Yangi', '+998901112244');
insert into leads (id, organization_id, name, contact_id, owner_id, created_at) values
  ('40000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-0000000000b1', 'First',
   '30000000-0000-0000-0000-0000000000b1', '10000000-0000-0000-0000-0000000000b1', now() - interval '30 days'),
  ('40000000-0000-0000-0000-0000000000b2', '00000000-0000-0000-0000-0000000000b1', 'Second',
   '30000000-0000-0000-0000-0000000000b1', '10000000-0000-0000-0000-0000000000b2', now() - interval '5 days'),
  ('40000000-0000-0000-0000-0000000000b3', '00000000-0000-0000-0000-0000000000b1', 'Again',
   '30000000-0000-0000-0000-0000000000b1', '10000000-0000-0000-0000-0000000000b3', now()),
  ('40000000-0000-0000-0000-0000000000b4', '00000000-0000-0000-0000-0000000000b1', 'Fresh',
   '30000000-0000-0000-0000-0000000000b2', '10000000-0000-0000-0000-0000000000b3', now()),
  ('40000000-0000-0000-0000-0000000000b5', '00000000-0000-0000-0000-0000000000b1', 'NoContact',
   null, '10000000-0000-0000-0000-0000000000b3', now());

do $$
declare r jsonb;
begin
  r := public.apply_automation_actions('[{"type":"previous_owner"}]'::jsonb,
    '40000000-0000-0000-0000-0000000000b3', '00000000-0000-0000-0000-0000000000b1', null);
  assert (select owner_id from leads where id = '40000000-0000-0000-0000-0000000000b3')
    = '10000000-0000-0000-0000-0000000000b2', 'the latest other lead''s owner gets it';
  assert jsonb_array_length(r) = 1, 'counted as applied';

  r := public.apply_automation_actions('[{"type":"previous_owner"}]'::jsonb,
    '40000000-0000-0000-0000-0000000000b4', '00000000-0000-0000-0000-0000000000b1', null);
  assert (select owner_id from leads where id = '40000000-0000-0000-0000-0000000000b4')
    = '10000000-0000-0000-0000-0000000000b3', 'a new client keeps its owner';
  assert jsonb_array_length(r) = 0, 'nothing applied for a new client';

  r := public.apply_automation_actions('[{"type":"previous_owner"}]'::jsonb,
    '40000000-0000-0000-0000-0000000000b5', '00000000-0000-0000-0000-0000000000b1', null);
  assert (select owner_id from leads where id = '40000000-0000-0000-0000-0000000000b5')
    = '10000000-0000-0000-0000-0000000000b3', 'a lead without a contact keeps its owner';
end $$;
rollback;
