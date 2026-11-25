-- Profile and notifications as in 5CRM's profile window (Sozlamalar):
--  * profiles: gender, last name, birth date, address, city, a status line
--    and the person's own status list, personal preferences (time zone,
--    date / time format, currency, text and control size), a hand-drawn
--    signature (small PNG data URL), a QR business card code, and the one
--    device an operator may use when «Operator qurilma qulfi» is on.
--  * security_settings.device_lock: «Operator qurilma qulfi».
--  * org_general_settings: «Qaysi bosqichlarda» and «Avtomatik (robot)
--    o'zgartirganda ham» for the stage-change notice; the AI objection
--    notice switch.
--  * notify_lead_changes: honours those two (as in 20261218 otherwise).
--  * public_vcard(code): the open business card page reads only these
--    public fields.
-- Adds columns and replaces functions; no data is changed. Idempotent.

alter table public.profiles
  add column if not exists gender text,
  add column if not exists last_name text,
  add column if not exists birth_date date,
  add column if not exists address text,
  add column if not exists city text,
  add column if not exists status_text text,
  add column if not exists statuses text[],
  add column if not exists prefs jsonb not null default '{}'::jsonb,
  add column if not exists signature_data text,
  add column if not exists vcard_code text,
  add column if not exists bound_device_id text;

alter table public.profiles drop constraint if exists profiles_gender_check;
alter table public.profiles
  add constraint profiles_gender_check check (gender is null or gender in ('male', 'female'));
alter table public.profiles drop constraint if exists profiles_signature_check;
alter table public.profiles
  add constraint profiles_signature_check check (
    signature_data is null
    or (signature_data like 'data:image/png;base64,%' and length(signature_data) <= 300000)
  );
create unique index if not exists profiles_vcard_code_key
  on public.profiles (vcard_code) where vcard_code is not null;

alter table public.security_settings
  add column if not exists device_lock boolean not null default false;

alter table public.org_general_settings
  add column if not exists notify_stage_ids uuid[],
  add column if not exists notify_stage_robot boolean not null default false,
  add column if not exists notify_ai_objection boolean not null default true;

-- The bound device is set and cleared by the server only.
create or replace function public.profiles_guard_device()
returns trigger
language plpgsql
as $$
begin
  if auth.uid() is not null and new.bound_device_id is distinct from old.bound_device_id then
    new.bound_device_id := old.bound_device_id;
  end if;
  return new;
end;
$$;
drop trigger if exists profiles_guard_device on public.profiles;
create trigger profiles_guard_device
  before update of bound_device_id on public.profiles
  for each row execute function public.profiles_guard_device();

create or replace function public.notify_lead_changes()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  g public.org_general_settings%rowtype;
  st public.pipeline_stages%rowtype;
  celebrate uuid;
  seller text;
  actor uuid := auth.uid();
  times int := 1;
begin
  if new.amocrm_id is not null or new.bitrix24_deal_id is not null then
    return new;
  end if;
  select * into g from public.org_general_settings where organization_id = new.organization_id;

  if new.owner_id is not null and new.owner_id is distinct from old.owner_id
     and new.owner_id is distinct from actor and coalesce(g.notify_lead_assigned, true) then
    insert into public.notifications (organization_id, user_id, type, title, body, link)
    values (new.organization_id, new.owner_id, 'LeadOwner', 'Sizga lid biriktirildi',
            new.name, '/crm/leads/' || new.id);
  end if;

  if new.stage_id is not distinct from old.stage_id then
    return new;
  end if;
  select * into st from public.pipeline_stages where id = new.stage_id;

  if new.owner_id is not null then
    if coalesce(st.is_won, false) then
      if coalesce(g.notify_sale_congrats, true) then
        insert into public.notifications (organization_id, user_id, type, title, body, link)
        values (new.organization_id, new.owner_id, 'LeadWon', 'Tabriklaymiz, sotuv!',
                new.name, '/crm/leads/' || new.id);
      end if;
    -- «Lidim bosqichini boshqa odam o'zgartirsa»: only the chosen stages
    -- when some are picked, and moves made by a trigger («Avtomatik
    -- (robot) o'zgartirganda ham») only when that is switched on.
    elsif (actor is not null or coalesce(g.notify_stage_robot, false))
          and actor is distinct from new.owner_id
          and coalesce(g.notify_stage_changed, true)
          and (coalesce(cardinality(g.notify_stage_ids), 0) = 0
               or new.stage_id = any (g.notify_stage_ids)) then
      insert into public.notifications (organization_id, user_id, type, title, body, link)
      values (new.organization_id, new.owner_id, 'LeadStage', 'Lid bosqichi o''zgartirildi',
              new.name || ' → ' || coalesce(st.name, ''), '/crm/leads/' || new.id);
    end if;
  end if;

  select p.celebrate_stage_id into celebrate from public.pipelines p where p.id = st.pipeline_id;
  if celebrate is not null and celebrate = new.stage_id then
    -- lead_stage_events already holds this move (its trigger runs first).
    if to_regclass('public.lead_stage_events') is not null then
      execute 'select count(*) from public.lead_stage_events where lead_id = $1 and stage_id = $2'
        into times using new.id, new.stage_id;
    end if;
    if times <= 1 then
      select coalesce(nullif(full_name, ''), 'Jamoa') into seller
        from public.profiles where id = coalesce(new.owner_id, actor);
      insert into public.notifications (organization_id, user_id, type, title, body, link, read)
      select new.organization_id, p.id, 'SaleCelebrate', coalesce(seller, 'Jamoa'),
             new.name, '/crm/leads/' || new.id, false
        from public.profiles p
       where p.organization_id = new.organization_id;
    end if;
  end if;
  return new;
end;
$$;

revoke execute on function public.notify_lead_changes() from anon, authenticated, public;

drop trigger if exists notify_lead_changes on public.leads;
create trigger notify_lead_changes
  after update of owner_id, stage_id on public.leads
  for each row execute function public.notify_lead_changes();

-- «QR vizitka»: the open card page (/card/<code>) — only what a business
-- card shows, and only for a code long enough not to be guessed.
create or replace function public.public_vcard(p_code text)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'name', p.full_name,
    'last_name', p.last_name,
    'position', p.position,
    'phone', p.phone,
    'email', p.email,
    'avatar', p.avatar_url,
    'company', o.name,
    'logo', g.company_logo_url
  )
  from public.profiles p
  join public.organizations o on o.id = p.organization_id
  left join public.org_general_settings g on g.organization_id = p.organization_id
  where length(coalesce(p_code, '')) >= 10 and p.vcard_code = p_code
  limit 1
$$;

revoke execute on function public.public_vcard(text) from public;
grant execute on function public.public_vcard(text) to anon, authenticated, service_role;
