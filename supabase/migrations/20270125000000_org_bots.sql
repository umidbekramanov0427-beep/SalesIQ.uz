-- Botlar: a company's own Telegram bot, and the shared bot only for trying.
--
-- 1. org_telegram_bots: the company's own bot (Integratsiyalar -> Telegram
--    bot): its token sealed by the server, the secret Telegram sends with
--    each update to /telegram/org/<company id>, and which salesbot its plain
--    link (t.me/<bot>) opens. Server-only.
-- 2. lead_telegram_links.via_org_bot: the client writes to the company's own
--    bot, so the replies go through it.
-- 3. salesbots.short_code: a short start link (t.me/<bot>?start=s_<code>)
--    instead of the 32-letter id. Old sb_ links keep working.
-- 4. organizations.shared_bot_until: new clients may come in through the
--    shared bot until then -- 14 days from sign-up. Companies that exist
--    today get 14 days from now. After it, the shared bot takes no new
--    clients for the company; the ones already talking go on.
-- Adds only; nothing is deleted. Idempotent.

-- 1
create table if not exists public.org_telegram_bots (
  organization_id uuid primary key references public.organizations(id) on delete cascade,
  bot_user_id bigint,
  username text not null,
  token_sealed text not null,
  webhook_secret text not null,
  default_salesbot_id uuid references public.salesbots(id) on delete set null,
  connected_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.org_telegram_bots enable row level security;
revoke all on public.org_telegram_bots from anon, authenticated;
grant all on public.org_telegram_bots to service_role;

-- 2
alter table public.lead_telegram_links
  add column if not exists via_org_bot boolean not null default false;

-- 3
alter table public.salesbots
  add column if not exists short_code text;

do $$
declare
  r record;
  c text;
begin
  for r in select id from public.salesbots where short_code is null loop
    loop
      c := lower(substr(md5(random()::text || r.id::text), 1, 6));
      exit when not exists (select 1 from public.salesbots where short_code = c);
    end loop;
    update public.salesbots set short_code = c where id = r.id;
  end loop;
end $$;

create unique index if not exists salesbots_short_code_key on public.salesbots (short_code);

create or replace function public.salesbot_short_code()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  c text;
begin
  if new.short_code is null then
    loop
      c := lower(substr(md5(random()::text || clock_timestamp()::text), 1, 6));
      exit when not exists (select 1 from public.salesbots where short_code = c);
    end loop;
    new.short_code := c;
  end if;
  return new;
end;
$$;

drop trigger if exists salesbot_short_code on public.salesbots;
create trigger salesbot_short_code
  before insert on public.salesbots
  for each row execute function public.salesbot_short_code();

-- 4
alter table public.organizations
  add column if not exists shared_bot_until timestamptz;

update public.organizations
   set shared_bot_until = greatest(created_at + interval '14 days', now() + interval '14 days')
 where shared_bot_until is null;

create or replace function public.org_shared_bot_until()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.shared_bot_until is null then
    new.shared_bot_until := coalesce(new.created_at, now()) + interval '14 days';
  end if;
  return new;
end;
$$;

drop trigger if exists org_shared_bot_until on public.organizations;
create trigger org_shared_bot_until
  before insert on public.organizations
  for each row execute function public.org_shared_bot_until();

notify pgrst, 'reload schema';
