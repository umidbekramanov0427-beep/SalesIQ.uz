-- Password reset through Telegram (login page -> "Parolni unutdingizmi?").
-- The platform bot sends a 6-digit code to the person's linked Telegram;
-- the code is kept only as a hash, lives 10 minutes and allows 5 tries.
-- Server-only: nobody reads this table from the browser.
-- Rows older than 2 days are removed by pg_cron.
-- Idempotent: safe to run again.

create table if not exists public.password_reset_codes (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  code_hash text not null,
  ip text,
  attempts int not null default 0,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  used_at timestamptz
);

create index if not exists password_reset_codes_profile_idx
  on public.password_reset_codes (profile_id, created_at desc);
create index if not exists password_reset_codes_ip_idx
  on public.password_reset_codes (ip, created_at desc);

alter table public.password_reset_codes enable row level security;
revoke all on public.password_reset_codes from anon, authenticated;
grant all on public.password_reset_codes to service_role;

do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.unschedule(jobid) from cron.job where jobname = 'password-reset-codes-purge';
    perform cron.schedule(
      'password-reset-codes-purge',
      '23 3 * * *',
      $job$delete from public.password_reset_codes where created_at < now() - interval '2 days'$job$
    );
  end if;
end $$;
