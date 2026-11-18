-- Company leads (owner -> Arizalar): the new stages, one call per slot,
-- problems with their solution, server-only tasks and inbox state.
begin;
insert into platform_applications (id, name, phone, status) values
  ('c1000000-0000-0000-0000-000000000001', 'Ali', '+998901112233', 'new');
do $$
begin
  begin
    insert into platform_applications (name, phone, status) values ('Old', '+998900000000', 'won');
    assert false, 'the old "won" status is gone';
  exception when check_violation then null;
  end;
  insert into platform_applications (name, phone, status, meeting_at)
  values ('A', '+998900000001', 'meeting', '2027-01-10 10:00+05');
  begin
    insert into platform_applications (name, phone, status, meeting_at)
    values ('B', '+998900000002', 'meeting', '2027-01-10 10:00+05');
    assert false, 'two calls cannot take one slot';
  exception when unique_violation then null;
  end;
  insert into platform_applications (name, phone, status, meeting_at)
  values ('C', '+998900000003', 'lost', '2027-01-10 10:00+05');
  insert into platform_application_notes (application_id, kind, body)
  values ('c1000000-0000-0000-0000-000000000001', 'issue', 'Telefoniya ulanmadi');
  update platform_application_notes set resolved_at = now(), resolution = 'Kalit almashtirildi'
   where kind = 'issue';
  insert into platform_lead_tasks (application_id, title, audience, due_at)
  values ('c1000000-0000-0000-0000-000000000001', 'Qo''ng''iroq qilish', 'both', now());
  assert has_table_privilege('authenticated', 'public.platform_lead_tasks', 'select') = false,
    'tasks are server-only';
  assert has_table_privilege('authenticated', 'public.support_threads', 'select') = false,
    'inbox state is server-only';
end $$;
rollback;
