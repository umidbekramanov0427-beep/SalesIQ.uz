-- Ombor (warehouse) module: products, stock, orders and the switch that
-- turns the module on for one company. Everything here is new; the only
-- changes to existing tables are two nullable/defaulted columns
-- (pipelines.kind, pipeline_stages.order_status). Idempotent.

-- 1. Which company has which add-on module. Only the server writes it
--    (platform owner today, the billing page later).
create table if not exists public.org_modules (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  module text not null check (module in ('warehouse')),
  enabled boolean not null default true,
  until timestamptz,
  note text,
  updated_at timestamptz not null default now(),
  primary key (organization_id, module)
);

create or replace function public.org_has_module(_module text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.org_modules m
    where m.organization_id = public.current_user_org_id()
      and m.module = _module
      and m.enabled
      and (m.until is null or m.until > now())
  );
$$;
revoke execute on function public.org_has_module(text) from public, anon;
grant execute on function public.org_has_module(text) to authenticated, service_role;

-- 2. Funnels: a funnel is either ordinary sales or a warehouse (orders) funnel;
--    a warehouse funnel's stage can stand for an order status.
alter table public.pipelines add column if not exists kind text not null default 'sales';
alter table public.pipelines drop constraint if exists pipelines_kind_check;
alter table public.pipelines add constraint pipelines_kind_check check (kind in ('sales', 'warehouse'));

alter table public.pipeline_stages add column if not exists order_status text;
alter table public.pipeline_stages drop constraint if exists pipeline_stages_order_status_check;
alter table public.pipeline_stages add constraint pipeline_stages_order_status_check
  check (order_status is null or order_status in ('new', 'preparing', 'picking', 'shipped', 'delivered', 'cancelled'));

-- 3. Warehouses and products.
create table if not exists public.warehouses (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  address text,
  responsible_id uuid references public.profiles(id) on delete set null,
  is_default boolean not null default false,
  archived_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists warehouses_org_idx on public.warehouses (organization_id);

create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  sku text,
  barcode text,
  category text,
  unit text not null default 'dona',
  price numeric(14, 2) not null default 0,
  cost numeric(14, 2) not null default 0,
  min_stock numeric(14, 3) not null default 0,
  image_url text,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists products_org_idx on public.products (organization_id);
create unique index if not exists products_org_sku_uidx
  on public.products (organization_id, lower(sku)) where sku is not null and sku <> '';

-- 4. Stock: a journal of moves (never edited) and the running level per
--    product and warehouse, kept by a trigger on the journal.
create table if not exists public.stock_levels (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,
  warehouse_id uuid not null references public.warehouses(id) on delete cascade,
  qty numeric(14, 3) not null default 0,
  updated_at timestamptz not null default now(),
  primary key (product_id, warehouse_id)
);
create index if not exists stock_levels_org_idx on public.stock_levels (organization_id);

create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  number integer not null default 0,
  lead_id uuid references public.leads(id) on delete set null,
  warehouse_id uuid references public.warehouses(id) on delete set null,
  status text not null default 'new'
    check (status in ('new', 'preparing', 'picking', 'shipped', 'delivered', 'cancelled')),
  delivery_method text check (delivery_method is null or delivery_method in ('courier', 'post', 'pickup')),
  delivery_address text,
  delivery_at timestamptz,
  tracking text,
  discount_pct numeric(5, 2) not null default 0 check (discount_pct >= 0 and discount_pct <= 100),
  total numeric(14, 2) not null default 0,
  paid_status text not null default 'unpaid' check (paid_status in ('unpaid', 'partial', 'paid')),
  note text,
  rating smallint check (rating is null or rating between 1 and 5),
  source text,
  stock_out_at timestamptz,
  delivered_at timestamptz,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists orders_org_status_idx on public.orders (organization_id, status);
create index if not exists orders_lead_idx on public.orders (lead_id);
create unique index if not exists orders_org_number_uidx on public.orders (organization_id, number);

create table if not exists public.order_items (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  order_id uuid not null references public.orders(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete restrict,
  qty numeric(14, 3) not null check (qty > 0),
  price numeric(14, 2) not null default 0,
  picked boolean not null default false
);
create index if not exists order_items_order_idx on public.order_items (order_id);
create index if not exists order_items_product_idx on public.order_items (product_id);

create table if not exists public.stock_moves (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete restrict,
  warehouse_id uuid not null references public.warehouses(id) on delete restrict,
  kind text not null check (kind in ('in', 'out', 'transfer', 'writeoff', 'return', 'adjust')),
  qty numeric(14, 3) not null check (qty <> 0),
  unit_cost numeric(14, 2),
  order_id uuid references public.orders(id) on delete set null,
  note text,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists stock_moves_org_idx on public.stock_moves (organization_id, created_at desc);
create index if not exists stock_moves_product_idx on public.stock_moves (product_id);

-- A move changes the level of its product in its warehouse.
create or replace function public.stock_moves_apply()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.stock_levels (organization_id, product_id, warehouse_id, qty, updated_at)
  values (new.organization_id, new.product_id, new.warehouse_id, new.qty, now())
  on conflict (product_id, warehouse_id)
  do update set qty = public.stock_levels.qty + excluded.qty, updated_at = now();
  return new;
end;
$$;
drop trigger if exists stock_moves_apply on public.stock_moves;
create trigger stock_moves_apply after insert on public.stock_moves
  for each row execute function public.stock_moves_apply();

-- 5. Orders: a number per company, the total from the lines, the stock
--    leaving when the order ships (and coming back if it is cancelled).
create or replace function public.orders_before_write()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' and coalesce(new.number, 0) = 0 then
    perform pg_advisory_xact_lock(hashtext('orders:' || new.organization_id::text));
    select coalesce(max(number), 0) + 1 into new.number
      from public.orders where organization_id = new.organization_id;
  end if;
  if new.status = 'delivered' and new.delivered_at is null then
    new.delivered_at := now();
  end if;
  new.updated_at := now();
  return new;
end;
$$;
drop trigger if exists orders_before_write on public.orders;
create trigger orders_before_write before insert or update on public.orders
  for each row execute function public.orders_before_write();

create or replace function public.order_recalc_total(_order uuid)
returns void
language sql
security definer
set search_path = public
as $$
  update public.orders o
     set total = round(coalesce((select sum(i.qty * i.price) from public.order_items i where i.order_id = o.id), 0)
                 * (1 - o.discount_pct / 100), 2)
   where o.id = _order;
$$;
revoke execute on function public.order_recalc_total(uuid) from public, anon, authenticated;

create or replace function public.order_items_after_write()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.order_recalc_total(coalesce(new.order_id, old.order_id));
  return null;
end;
$$;
drop trigger if exists order_items_after_write on public.order_items;
create trigger order_items_after_write after insert or update or delete on public.order_items
  for each row execute function public.order_items_after_write();

create or replace function public.orders_after_write()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  _wh uuid;
  _stage uuid;
begin
  if tg_op = 'UPDATE' and new.discount_pct is distinct from old.discount_pct then
    perform public.order_recalc_total(new.id);
  end if;

  _wh := coalesce(new.warehouse_id,
    (select id from public.warehouses w
      where w.organization_id = new.organization_id and w.archived_at is null
      order by w.is_default desc, w.created_at limit 1));

  -- Shipped (or delivered straight away): the goods leave the warehouse once.
  if new.status in ('shipped', 'delivered') and new.stock_out_at is null and _wh is not null then
    insert into public.stock_moves (organization_id, product_id, warehouse_id, kind, qty, order_id, note)
    select new.organization_id, i.product_id, _wh, 'out', -i.qty, new.id, 'Buyurtma №' || new.number
      from public.order_items i where i.order_id = new.id;
    update public.orders set stock_out_at = now() where id = new.id;
  end if;

  -- Cancelled after leaving: the goods come back.
  if new.status = 'cancelled' and new.stock_out_at is not null and _wh is not null then
    insert into public.stock_moves (organization_id, product_id, warehouse_id, kind, qty, order_id, note)
    select new.organization_id, i.product_id, _wh, 'return', i.qty, new.id, 'Bekor: №' || new.number
      from public.order_items i where i.order_id = new.id;
    update public.orders set stock_out_at = null where id = new.id;
  end if;

  -- Keep the lead in the warehouse funnel on the stage of the new status.
  if new.lead_id is not null and (tg_op = 'INSERT' or new.status is distinct from old.status)
     and pg_trigger_depth() < 3 then
    select s.id into _stage
      from public.leads l
      join public.pipeline_stages cur on cur.id = l.stage_id
      join public.pipelines p on p.id = cur.pipeline_id and p.kind = 'warehouse'
      join public.pipeline_stages s on s.pipeline_id = p.id and s.order_status = new.status
     where l.id = new.lead_id
     order by s.position
     limit 1;
    if _stage is not null then
      -- A stage rule (task/note required) must not block the order itself.
      begin
        update public.leads set stage_id = _stage where id = new.lead_id and stage_id is distinct from _stage;
      exception when others then
        null;
      end;
    end if;
  end if;
  return null;
end;
$$;
drop trigger if exists orders_after_write on public.orders;
create trigger orders_after_write after insert or update of status, discount_pct on public.orders
  for each row execute function public.orders_after_write();

-- A lead moved to a stage that stands for a status: its open order follows.
create or replace function public.leads_order_status_sync()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  _status text;
begin
  if new.stage_id is not distinct from old.stage_id or pg_trigger_depth() > 2 then
    return null;
  end if;
  select s.order_status into _status
    from public.pipeline_stages s
    join public.pipelines p on p.id = s.pipeline_id and p.kind = 'warehouse'
   where s.id = new.stage_id;
  if _status is null then
    return null;
  end if;
  update public.orders o
     set status = _status
   where o.id = (
       select id from public.orders
        where lead_id = new.id and status not in ('delivered', 'cancelled')
        order by created_at desc limit 1)
     and o.status is distinct from _status;
  return null;
end;
$$;
drop trigger if exists leads_order_status_sync on public.leads;
create trigger leads_order_status_sync after update of stage_id on public.leads
  for each row execute function public.leads_order_status_sync();

-- 6. What can be sold: the level minus what open orders hold.
create or replace view public.product_stock
with (security_invoker = true)
as
select p.id as product_id,
       p.organization_id,
       coalesce((select sum(l.qty) from public.stock_levels l where l.product_id = p.id), 0) as qty,
       coalesce((select sum(i.qty) from public.order_items i
                   join public.orders o on o.id = i.order_id
                  where i.product_id = p.id and o.status in ('new', 'preparing', 'picking')), 0) as reserved
  from public.products p;

-- 7. Access: members of a company that has the module; deleting is for
--    admins and heads of sales. stock_levels is written only by the trigger.
do $$
declare
  t text;
begin
  foreach t in array array['warehouses', 'products', 'orders', 'order_items', 'stock_moves', 'stock_levels'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists %I on public.%I', t || '_read', t);
    execute format(
      'create policy %I on public.%I for select to authenticated
         using (organization_id = public.current_user_org_id() and public.org_has_module(''warehouse''))',
      t || '_read', t);
    execute format('revoke all on public.%I from anon', t);
    execute format('grant all on public.%I to service_role', t);
  end loop;

  foreach t in array array['warehouses', 'products', 'orders', 'order_items'] loop
    execute format('drop policy if exists %I on public.%I', t || '_insert', t);
    execute format(
      'create policy %I on public.%I for insert to authenticated
         with check (organization_id = public.current_user_org_id() and public.org_has_module(''warehouse''))',
      t || '_insert', t);
    execute format('drop policy if exists %I on public.%I', t || '_update', t);
    execute format(
      'create policy %I on public.%I for update to authenticated
         using (organization_id = public.current_user_org_id() and public.org_has_module(''warehouse''))
         with check (organization_id = public.current_user_org_id())',
      t || '_update', t);
    execute format('drop policy if exists %I on public.%I', t || '_delete', t);
    execute format(
      'create policy %I on public.%I for delete to authenticated
         using (organization_id = public.current_user_org_id() and public.org_has_module(''warehouse'')
                and public.current_user_role() in (''super_admin'', ''rop''))',
      t || '_delete', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
  end loop;

  -- The journal: members add moves, nobody edits or removes them.
  drop policy if exists stock_moves_insert on public.stock_moves;
  create policy stock_moves_insert on public.stock_moves for insert to authenticated
    with check (organization_id = public.current_user_org_id() and public.org_has_module('warehouse'));
  grant select, insert on public.stock_moves to authenticated;
  grant select on public.stock_levels to authenticated;
end $$;

alter table public.org_modules enable row level security;
drop policy if exists org_modules_read on public.org_modules;
create policy org_modules_read on public.org_modules for select to authenticated
  using (organization_id = public.current_user_org_id());
revoke all on public.org_modules from anon, authenticated;
grant select on public.org_modules to authenticated;
grant all on public.org_modules to service_role;

grant select on public.product_stock to authenticated;

notify pgrst, 'reload schema';
