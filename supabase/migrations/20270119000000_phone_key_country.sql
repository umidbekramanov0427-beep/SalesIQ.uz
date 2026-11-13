-- The same client by phone, country code included. Every duplicate check
-- (funnel repeats, the duplicates report, auto-merge, missed calls ->
-- call-back tasks) compared only the last 9 digits, so +7 990 123 45 67 and
-- +998 90 123 45 67 counted as one client. Now:
--   Uzbek numbers in any format ("90 123 45 67", "+998 90 …", "8 90 …")
--   -> "998901234567"; any other country keeps its whole number.
-- Same rule as src/lib/phone-key.ts -- change both together.
-- phone9 / phone_key keep their names (the functions that call them stay
-- as they are); funnel_lead_for_client compares through phone9 now, with a
-- new index for it. Nothing is deleted or rewritten; idempotent.

create or replace function public.phone9(p text)
returns text
language sql
immutable
set search_path = public
as $$
  select case
    when length(d) < 7 then null
    when length(d) = 12 and left(d, 3) = '998' then d
    when length(d) = 9 then '998' || d
    when length(d) = 10 and left(d, 1) = '8' then '998' || substr(d, 2)
    when length(d) = 11 and left(d, 1) = '8' then '7' || substr(d, 2)
    else d
  end
  from (select regexp_replace(coalesce(p, ''), '\D', '', 'g') as d) x;
$$;

create or replace function public.phone_key(p text)
returns text
language sql
immutable
set search_path = public
as $$
  select public.phone9(p);
$$;

create index if not exists idx_contacts_org_phone_key
  on public.contacts (organization_id, public.phone9(phone))
  where phone is not null;

create or replace function public.funnel_lead_for_client(
  p_org uuid,
  p_funnel text,
  p_phone text,
  p_email text,
  p_exclude uuid default null
)
returns uuid language plpgsql stable security definer set search_path = public as $$
declare
  v_phone text := public.phone9(p_phone);
  v_email text := nullif(lower(trim(coalesce(p_email, ''))), '');
  v_match_email boolean;
  v_id uuid;
begin
  select coalesce(s.dedupe_match_email, false) into v_match_email
  from public.org_general_settings s where s.organization_id = p_org;
  if not coalesce(v_match_email, false) then
    v_email := null;
  end if;
  if v_phone is null and v_email is null then
    return null;
  end if;

  select l.id into v_id
  from public.leads l
  join public.contacts c on c.id = l.contact_id
  where l.organization_id = p_org
    and l.amocrm_id is null
    and l.bitrix24_deal_id is null
    and coalesce(l.funnel, 'Direct Sales') = coalesce(p_funnel, 'Direct Sales')
    and (p_exclude is null or l.id <> p_exclude)
    and (
      (v_phone is not null and (
        public.phone9(c.phone) = v_phone
        or public.phone9(c.alt_phone) = v_phone))
      or (v_email is not null and lower(c.email) = v_email)
    )
  order by l.created_at asc
  limit 1;
  return v_id;
end;
$$;

notify pgrst, 'reload schema';
