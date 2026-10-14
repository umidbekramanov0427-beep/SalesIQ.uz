-- A short number for every lead, shown on the funnel card (like amoCRM's
-- deal id) instead of a piece of the uuid. Existing leads are numbered in
-- the order they were created, from 100001; new ones take the next number.
-- The backfill runs with the leads triggers off so it doesn't touch
-- updated_at or fire any automation.
create sequence if not exists public.leads_lead_number_seq start 100001;

alter table public.leads add column if not exists lead_number bigint;

alter table public.leads disable trigger user;
update public.leads l
  set lead_number = s.n
  from (
    select id,
      (select coalesce(max(lead_number), 100000) from public.leads)
        + row_number() over (order by created_at, id) as n
    from public.leads
    where lead_number is null
  ) s
  where l.id = s.id;
alter table public.leads enable trigger user;

select setval(
  'public.leads_lead_number_seq',
  greatest((select coalesce(max(lead_number), 100000) from public.leads), 100000)
);

alter table public.leads
  alter column lead_number set default nextval('public.leads_lead_number_seq');
alter sequence public.leads_lead_number_seq owned by public.leads.lead_number;

create unique index if not exists leads_lead_number_key on public.leads (lead_number);
