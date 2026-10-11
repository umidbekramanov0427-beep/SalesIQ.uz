-- check_seat_login: 5 / 25 / 60 seats, trial cap of 3, unlimited_seats.
begin;
insert into organizations (id, name, plan) values ('00000000-0000-0000-0000-0000000000c1', 'Seats', 'start_iq');
insert into profiles (organization_id, full_name, created_at)
select '00000000-0000-0000-0000-0000000000c1', 'u' || g, now() + (g || ' sec')::interval
from generate_series(1, 7) g;

create temp view seat as
select p.full_name, s.allowed, s.seat_limit
from profiles p, check_seat_login(p.id) s
where p.organization_id = '00000000-0000-0000-0000-0000000000c1';

do $$ begin
  assert (select allowed from seat where full_name = 'u5'), 'Start IQ: 5th user may log in';
  assert not (select allowed from seat where full_name = 'u6'), 'Start IQ: 6th user is blocked';
  assert (select seat_limit from seat where full_name = 'u1') = 5, 'Start IQ limit is 5';
end $$;

update organizations set is_trial = true, trial_ends_at = now() + interval '5 days'
where id = '00000000-0000-0000-0000-0000000000c1';
do $$ begin
  assert (select allowed from seat where full_name = 'u3'), 'trial: 3rd user allowed';
  assert not (select allowed from seat where full_name = 'u4'), 'trial: capped at 3';
end $$;

update organizations set is_trial = false, plan = 'master_iq' where id = '00000000-0000-0000-0000-0000000000c1';
do $$ begin
  assert (select seat_limit from seat where full_name = 'u1') = 60, 'Master IQ limit is 60';
end $$;

update organizations set unlimited_seats = true where id = '00000000-0000-0000-0000-0000000000c1';
do $$ begin
  assert (select seat_limit from seat where full_name = 'u7') is null, 'unlimited seats: no limit';
  assert (select allowed from seat where full_name = 'u7'), 'unlimited seats: everyone allowed';
end $$;
rollback;
