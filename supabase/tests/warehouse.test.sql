-- Warehouse module: stock journal, order numbers/totals, shipping takes stock,
-- cancelling returns it, lead stage <-> order status, module gate in RLS.
begin;
do $$
declare
  org uuid := '00000000-0000-0000-0000-00000000a701';
  other uuid := gen_random_uuid();
  me uuid := '10000000-0000-0000-0000-00000000a701';
  wh uuid; p1 uuid; p2 uuid; o1 uuid; o2 uuid; pl uuid; s_new uuid; s_ship uuid; ld uuid;
  n int; q numeric; tot numeric; st text;
begin
  insert into organizations (id, name) values (org, 'A'), (other, 'B');
  insert into profiles (id, organization_id, role) values (me, org, 'super_admin');
  insert into warehouses (organization_id, name, is_default) values (org, 'Asosiy', true) returning id into wh;
  insert into products (organization_id, name, price) values (org, 'Qog''oz', 100) returning id into p1;
  insert into products (organization_id, name, price) values (org, 'Ruchka', 10) returning id into p2;

  insert into stock_moves (organization_id, product_id, warehouse_id, kind, qty) values (org, p1, wh, 'in', 50), (org, p2, wh, 'in', 20);
  insert into stock_moves (organization_id, product_id, warehouse_id, kind, qty) values (org, p1, wh, 'writeoff', -5);
  select qty into q from stock_levels where product_id = p1 and warehouse_id = wh;
  assert q = 45, 'journal sums into the level';

  insert into pipelines (id, organization_id, name, kind) values (gen_random_uuid(), org, 'Buyurtmalar', 'warehouse') returning id into pl;
  insert into pipeline_stages (organization_id, pipeline_id, name, position, order_status) values (org, pl, 'Buyurtma', 1, 'new') returning id into s_new;
  insert into pipeline_stages (organization_id, pipeline_id, name, position, order_status) values (org, pl, 'Yo''lda', 2, 'shipped') returning id into s_ship;
  insert into leads (organization_id, name, stage_id) values (org, 'Mijoz', s_new) returning id into ld;

  insert into orders (organization_id, lead_id, warehouse_id) values (org, ld, wh) returning id, number into o1, n;
  assert n = 1, 'first order is number 1';
  insert into orders (organization_id) values (org) returning id, number into o2, n;
  assert n = 2, 'numbers grow per company';
  insert into orders (organization_id) values (other) returning number into n;
  assert n = 1, 'other company starts from 1';

  insert into order_items (organization_id, order_id, product_id, qty, price) values (org, o1, p1, 10, 100), (org, o1, p2, 5, 10);
  select total into tot from orders where id = o1;
  assert tot = 1050, 'total from lines';
  update orders set discount_pct = 10 where id = o1;
  select total into tot from orders where id = o1;
  assert tot = 945, 'discount applied';

  select reserved into q from product_stock where product_id = p1;
  assert q = 10, 'open order reserves';

  -- Moving the lead to the «Yo'lda» stage ships the order and takes the stock.
  update leads set stage_id = s_ship where id = ld;
  select status into st from orders where id = o1;
  assert st = 'shipped', 'lead stage moves the order status';
  select qty into q from stock_levels where product_id = p1 and warehouse_id = wh;
  assert q = 35, 'shipping takes stock';
  select reserved into q from product_stock where product_id = p1;
  assert q = 0, 'shipped order no longer reserves';

  update orders set status = 'shipped' where id = o1;
  select qty into q from stock_levels where product_id = p1 and warehouse_id = wh;
  assert q = 35, 'stock leaves only once';

  -- Cancelling brings it back.
  update orders set status = 'cancelled' where id = o1;
  select qty into q from stock_levels where product_id = p1 and warehouse_id = wh;
  assert q = 45, 'cancel returns stock';

  -- An order moved on the board puts its lead on the matching stage.
  insert into orders (organization_id, lead_id, warehouse_id) values (org, ld, wh) returning id into o2;
  update leads set stage_id = s_new where id = ld;
  update orders set status = 'shipped' where id = o2;
  assert (select stage_id from leads where id = ld) = s_ship, 'order status moves the lead';

end $$;
grant usage on schema auth to authenticated;
grant select on profiles to authenticated;
set local role authenticated;
select set_config('test.uid', '10000000-0000-0000-0000-00000000a701', true);
do $$ begin
  assert (select count(*) from products) = 0, 'no module, no rows';
  assert not (select org_has_module('warehouse')), 'module off';
end $$;
reset role;
insert into org_modules (organization_id, module) values ('00000000-0000-0000-0000-00000000a701', 'warehouse');
set local role authenticated;
do $$ begin
  assert (select org_has_module('warehouse')), 'module on';
  assert (select count(*) from products) = 2, 'module on, own rows visible';
  assert (select count(*) from orders) = 3, 'own orders only';
  begin
    update stock_levels set qty = 1;
    assert false, 'levels are written only by the journal';
  exception when insufficient_privilege then null;
  end;
end $$;
rollback;
