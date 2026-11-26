// Ombor (warehouse) module: the company's switch, products, stock and
// orders. Every query degrades to "empty" while the 20270207 migration has
// not run or the module is off (RLS then returns nothing).
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import { useAuth } from "@/lib/auth";
import type { ImportedProduct } from "@/lib/warehouse";

type T = Database["public"]["Tables"];
export type ProductRow = T["products"]["Row"];
export type WarehouseRow = T["warehouses"]["Row"];
export type OrderRow = T["orders"]["Row"];
export type OrderItemRow = T["order_items"]["Row"];
export type StockMoveRow = T["stock_moves"]["Row"];
export type ProductStockRow = Database["public"]["Views"]["product_stock"]["Row"];
export type OrderWithItems = OrderRow & { items: OrderItemRow[] };

export const ORDER_STATUSES = ["new", "preparing", "picking", "shipped", "delivered"] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number] | "cancelled";

const isMissing = (msg: string) => /does not exist|schema cache|relation/i.test(msg);

/** Add-on modules the company has on (org_modules), e.g. ["warehouse"]. */
export function useOrgModules() {
  const { user } = useAuth();
  const q = useQuery({
    queryKey: ["org_modules", user?.organizationId],
    enabled: !!user?.organizationId,
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<string[]> => {
      const { data, error } = await supabase
        .from("org_modules")
        .select("module, enabled, until")
        .eq("organization_id", user!.organizationId!);
      if (error) return [];
      const now = Date.now();
      return (data ?? [])
        .filter((m) => m.enabled && (!m.until || Date.parse(m.until) > now))
        .map((m) => m.module);
    },
  });
  return q.data ?? [];
}

export function useHasModule(module: string): boolean {
  return useOrgModules().includes(module);
}

function useOrgList<R>(key: string, table: keyof T, order: string, ascending = true) {
  const { user } = useAuth();
  return useQuery({
    queryKey: [key, user?.organizationId],
    enabled: !!user?.organizationId,
    queryFn: async (): Promise<R[]> => {
      const { data, error } = await supabase
        .from(table as "products")
        .select("*")
        .eq("organization_id", user!.organizationId!)
        .order(order as "name", { ascending })
        .limit(5000);
      if (error) {
        if (isMissing(error.message)) return [];
        throw error;
      }
      return (data ?? []) as unknown as R[];
    },
  });
}

export const useProducts = () => useOrgList<ProductRow>("wh_products", "products", "name");
export const useWarehouses = () =>
  useOrgList<WarehouseRow>("wh_warehouses", "warehouses", "created_at");
export const useStockMoves = () =>
  useOrgList<StockMoveRow>("wh_moves", "stock_moves", "created_at", false);

/** Stock per warehouse: warehouse id → product id → quantity on hand. */
export function useStockLevels() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["wh_levels", user?.organizationId],
    enabled: !!user?.organizationId,
    queryFn: async (): Promise<Map<string, Map<string, number>>> => {
      const { data, error } = await supabase
        .from("stock_levels")
        .select("warehouse_id, product_id, qty")
        .eq("organization_id", user!.organizationId!)
        .limit(20000);
      const out = new Map<string, Map<string, number>>();
      if (error) return out;
      for (const r of data ?? []) {
        let m = out.get(r.warehouse_id);
        if (!m) out.set(r.warehouse_id, (m = new Map()));
        m.set(r.product_id, Number(r.qty));
      }
      return out;
    },
  });
}

/** «Omborlar»: add or change a warehouse; making one the default unmarks the rest. */
export function useSaveWarehouse() {
  const { user } = useAuth();
  const done = useInvalidateWarehouse();
  return useMutation({
    mutationFn: async (input: {
      id?: string;
      name?: string;
      address?: string | null;
      is_default?: boolean;
      archived?: boolean;
    }) => {
      const org = user!.organizationId!;
      if (input.is_default) {
        await supabase
          .from("warehouses")
          .update({ is_default: false })
          .eq("organization_id", org)
          .neq("id", input.id ?? "00000000-0000-0000-0000-000000000000");
      }
      const row = {
        ...(input.name !== undefined ? { name: input.name.trim() } : {}),
        ...(input.address !== undefined ? { address: input.address?.trim() || null } : {}),
        ...(input.is_default !== undefined ? { is_default: input.is_default } : {}),
        ...(input.archived !== undefined
          ? { archived_at: input.archived ? new Date().toISOString() : null }
          : {}),
      };
      if (input.id) {
        const { error } = await supabase.from("warehouses").update(row).eq("id", input.id);
        if (error) throw error;
        return;
      }
      const { error } = await supabase
        .from("warehouses")
        .insert({ organization_id: org, name: input.name?.trim() || "Ombor", ...row });
      if (error) throw error;
    },
    onSuccess: done,
  });
}

export function useProductStock() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["wh_stock", user?.organizationId],
    enabled: !!user?.organizationId,
    queryFn: async (): Promise<Map<string, ProductStockRow>> => {
      const { data, error } = await supabase
        .from("product_stock")
        .select("*")
        .eq("organization_id", user!.organizationId!);
      if (error) return new Map();
      return new Map((data ?? []).map((r) => [r.product_id, r]));
    },
  });
}

/**
 * «Ombor mijozi» in the Inbox: lead id → delivered orders, for a company with
 * the module (an empty map otherwise, without a query).
 */
export function useWarehouseClients(): Map<string, number> {
  const { user } = useAuth();
  const on = useHasModule("warehouse");
  const { data } = useQuery({
    queryKey: ["wh_clients", user?.organizationId],
    enabled: on && !!user?.organizationId,
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<Map<string, number>> => {
      const { data: rows, error } = await supabase
        .from("orders")
        .select("lead_id")
        .eq("organization_id", user!.organizationId!)
        .eq("status", "delivered")
        .not("lead_id", "is", null)
        .limit(10000);
      const m = new Map<string, number>();
      if (error) return m;
      for (const r of rows ?? []) if (r.lead_id) m.set(r.lead_id, (m.get(r.lead_id) ?? 0) + 1);
      return m;
    },
  });
  return on && data ? data : EMPTY_CLIENTS;
}
const EMPTY_CLIENTS = new Map<string, number>();

export function useOrders(leadId?: string) {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["wh_orders", user?.organizationId, leadId ?? null],
    enabled: !!user?.organizationId,
    queryFn: async (): Promise<OrderWithItems[]> => {
      let q = supabase
        .from("orders")
        .select("*")
        .eq("organization_id", user!.organizationId!)
        .order("created_at", { ascending: false })
        .limit(2000);
      if (leadId) q = q.eq("lead_id", leadId);
      const { data, error } = await q;
      if (error) {
        if (isMissing(error.message)) return [];
        throw error;
      }
      const orders = data ?? [];
      if (!orders.length) return [];
      const ids = orders.map((o) => o.id);
      const items: OrderItemRow[] = [];
      for (let i = 0; i < ids.length; i += 200) {
        const { data: part } = await supabase
          .from("order_items")
          .select("*")
          .in("order_id", ids.slice(i, i + 200));
        items.push(...(part ?? []));
      }
      const byOrder = new Map<string, OrderItemRow[]>();
      for (const it of items) byOrder.set(it.order_id, [...(byOrder.get(it.order_id) ?? []), it]);
      return orders.map((o) => ({ ...o, items: byOrder.get(o.id) ?? [] }));
    },
  });
}

function useInvalidateWarehouse() {
  const qc = useQueryClient();
  return () => {
    for (const k of [
      "wh_products",
      "wh_warehouses",
      "wh_moves",
      "wh_stock",
      "wh_orders",
      "wh_levels",
    ])
      void qc.invalidateQueries({ queryKey: [k] });
    void qc.invalidateQueries({ queryKey: ["leads"] });
  };
}

export function useSaveProduct() {
  const { user } = useAuth();
  const done = useInvalidateWarehouse();
  return useMutation({
    mutationFn: async (p: Partial<ProductRow> & { name: string }) => {
      const row = {
        ...p,
        organization_id: user!.organizationId!,
        updated_at: new Date().toISOString(),
      };
      const { error } = p.id
        ? await supabase.from("products").update(row).eq("id", p.id)
        : await supabase.from("products").insert(row);
      if (error) throw error;
    },
    onSuccess: done,
  });
}

/** The default warehouse, created on first use so a company never has to set one up. */
async function ensureWarehouse(orgId: string): Promise<string> {
  const { data } = await supabase
    .from("warehouses")
    .select("id")
    .eq("organization_id", orgId)
    .is("archived_at", null)
    .order("is_default", { ascending: false })
    .order("created_at")
    .limit(1);
  if (data?.[0]) return data[0].id;
  const { data: made, error } = await supabase
    .from("warehouses")
    .insert({ organization_id: orgId, name: "Asosiy ombor", is_default: true })
    .select("id")
    .single();
  if (error) throw error;
  return made.id;
}

/**
 * Mahsulotlarni yuklash: each row updates the product with the same SKU (or
 * name) or adds a new one; a quantity on hand comes in as one kirim.
 */
export function useImportProducts() {
  const { user } = useAuth();
  const done = useInvalidateWarehouse();
  return useMutation({
    mutationFn: async (input: {
      rows: ImportedProduct[];
      existing: ProductRow[];
    }): Promise<{ added: number; updated: number }> => {
      const org = user!.organizationId!;
      const key = (sku: string | null, name: string) =>
        sku ? `s:${sku.toLowerCase()}` : `n:${name.trim().toLowerCase()}`;
      const known = new Map<string, ProductRow>();
      for (const p of input.existing) {
        if (p.sku) known.set(key(p.sku, p.name), p);
        known.set(key(null, p.name), p);
      }
      let added = 0;
      let updated = 0;
      const stockIn: { productId: string; qty: number; unitCost: number | null }[] = [];
      for (const r of input.rows) {
        const hit = known.get(key(r.sku, r.name)) ?? known.get(key(null, r.name));
        const row = {
          organization_id: org,
          name: r.name,
          sku: r.sku,
          category: r.category,
          unit: r.unit,
          price: r.price,
          cost: r.cost,
          min_stock: r.minStock,
          updated_at: new Date().toISOString(),
        };
        let id = hit?.id;
        if (hit) {
          const { error } = await supabase.from("products").update(row).eq("id", hit.id);
          if (error) throw error;
          updated++;
        } else {
          const { data, error } = await supabase.from("products").insert(row).select("id").single();
          if (error) throw error;
          id = data.id;
          added++;
        }
        if (id && r.qty > 0) stockIn.push({ productId: id, qty: r.qty, unitCost: r.cost || null });
      }
      if (stockIn.length) {
        const wh = await ensureWarehouse(org);
        const { error } = await supabase.from("stock_moves").insert(
          stockIn.map((l) => ({
            organization_id: org,
            product_id: l.productId,
            warehouse_id: wh,
            kind: "in",
            qty: Math.abs(l.qty),
            unit_cost: l.unitCost,
            note: "Excel",
            created_by: user!.id,
          })),
        );
        if (error) throw error;
      }
      return { added, updated };
    },
    onSuccess: done,
  });
}

export type MoveLine = { productId: string; qty: number; unitCost?: number | null };

/** Kirim / chiqim / hisobdan chiqarish: one journal row per line. */
export function useAddMoves() {
  const { user } = useAuth();
  const done = useInvalidateWarehouse();
  return useMutation({
    mutationFn: async (input: {
      kind: "in" | "out" | "writeoff" | "adjust" | "transfer";
      lines: MoveLine[];
      warehouseId?: string | null;
      /** «Ko'chirish»: the warehouse the goods go to. */
      toWarehouseId?: string | null;
      note?: string;
    }) => {
      const org = user!.organizationId!;
      const wh = input.warehouseId || (await ensureWarehouse(org));
      if (input.kind === "transfer") {
        const to = input.toWarehouseId;
        if (!to || to === wh) throw new Error("Boshqa omborni tanlang");
        const rows = input.lines
          .filter((l) => l.qty > 0)
          .flatMap((l) =>
            [
              { warehouse_id: wh, qty: -Math.abs(l.qty) },
              { warehouse_id: to, qty: Math.abs(l.qty) },
            ].map((x) => ({
              organization_id: org,
              product_id: l.productId,
              kind: "transfer",
              unit_cost: null,
              note: input.note || null,
              created_by: user!.id,
              ...x,
            })),
          );
        if (!rows.length) return;
        const { error } = await supabase.from("stock_moves").insert(rows);
        if (error) throw error;
        return;
      }
      const sign = input.kind === "in" ? 1 : input.kind === "adjust" ? 1 : -1;
      const rows = input.lines
        .filter((l) => l.qty !== 0)
        .map((l) => ({
          organization_id: org,
          product_id: l.productId,
          warehouse_id: wh,
          kind: input.kind,
          qty: input.kind === "adjust" ? l.qty : sign * Math.abs(l.qty),
          unit_cost: l.unitCost ?? null,
          note: input.note || null,
          created_by: user!.id,
        }));
      if (!rows.length) return;
      const { error } = await supabase.from("stock_moves").insert(rows);
      if (error) throw error;
    },
    onSuccess: done,
  });
}

export type OrderLine = { productId: string; qty: number; price: number };

export function useCreateOrder() {
  const { user } = useAuth();
  const done = useInvalidateWarehouse();
  return useMutation({
    mutationFn: async (input: {
      leadId: string | null;
      lines: OrderLine[];
      discountPct?: number;
      deliveryMethod?: "courier" | "post" | "pickup" | null;
      deliveryAddress?: string | null;
      note?: string | null;
      source?: string | null;
      warehouseId?: string | null;
    }): Promise<OrderRow> => {
      const org = user!.organizationId!;
      const wh = input.warehouseId || (await ensureWarehouse(org));
      const { data: order, error } = await supabase
        .from("orders")
        .insert({
          organization_id: org,
          lead_id: input.leadId,
          warehouse_id: wh,
          discount_pct: input.discountPct ?? 0,
          delivery_method: input.deliveryMethod ?? null,
          delivery_address: input.deliveryAddress ?? null,
          note: input.note ?? null,
          source: input.source ?? null,
          created_by: user!.id,
        })
        .select()
        .single();
      if (error) throw error;
      const items = input.lines
        .filter((l) => l.qty > 0)
        .map((l) => ({
          organization_id: org,
          order_id: order.id,
          product_id: l.productId,
          qty: l.qty,
          price: l.price,
        }));
      if (items.length) {
        const { error: e2 } = await supabase.from("order_items").insert(items);
        if (e2) throw e2;
      }
      return order;
    },
    onSuccess: done,
  });
}

export function useUpdateOrder() {
  const done = useInvalidateWarehouse();
  return useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: T["orders"]["Update"] }) => {
      const { error } = await supabase.from("orders").update(patch).eq("id", id);
      if (error) throw error;
    },
    onSuccess: done,
  });
}

/** Saves an opened order: its fields, and (until it leaves the stock) its lines. */
export function useSaveOrder() {
  const { user } = useAuth();
  const done = useInvalidateWarehouse();
  return useMutation({
    mutationFn: async (input: {
      id: string;
      patch: T["orders"]["Update"];
      lines?: OrderLine[] | undefined;
    }) => {
      const { error } = await supabase.from("orders").update(input.patch).eq("id", input.id);
      if (error) throw error;
      if (!input.lines) return;
      // Replaced as a whole; the order's total is recounted by the database.
      const { error: e1 } = await supabase.from("order_items").delete().eq("order_id", input.id);
      if (e1) throw e1;
      const rows = input.lines
        .filter((l) => l.qty > 0)
        .map((l) => ({
          organization_id: user!.organizationId!,
          order_id: input.id,
          product_id: l.productId,
          qty: l.qty,
          price: l.price,
        }));
      if (rows.length) {
        const { error: e2 } = await supabase.from("order_items").insert(rows);
        if (e2) throw e2;
      }
    },
    onSuccess: done,
  });
}

export type LeadBrief = { id: string; name: string; owner_id: string | null; phone: string | null };

/** Names (and owners) of the orders' clients. */
export function useLeadBriefs(ids: string[]) {
  const key = [...new Set(ids)].sort();
  return useQuery({
    queryKey: ["wh_leads", key.join(",")],
    enabled: key.length > 0,
    queryFn: async (): Promise<Map<string, LeadBrief>> => {
      const out = new Map<string, LeadBrief>();
      for (let i = 0; i < key.length; i += 200) {
        const { data } = await supabase
          .from("leads")
          .select("id, name, owner_id")
          .in("id", key.slice(i, i + 200));
        for (const l of data ?? []) out.set(l.id, { ...l, phone: null });
      }
      return out;
    },
  });
}

/** Leads by name or phone, for the order dialog's client picker. */
export function useOrderLeadSearch(text: string) {
  const { user } = useAuth();
  const q = text.trim();
  return useQuery({
    queryKey: ["wh_lead_search", user?.organizationId, q],
    enabled: !!user?.organizationId && q.length >= 2,
    queryFn: async (): Promise<LeadBrief[]> => {
      const safe = q.replace(/[%,()]/g, " ");
      const { data } = await supabase
        .from("leads")
        .select("id, name, owner_id")
        .eq("organization_id", user!.organizationId!)
        .ilike("name", `%${safe}%`)
        .order("created_at", { ascending: false })
        .limit(12);
      return (data ?? []).map((l) => ({ ...l, phone: null }));
    },
  });
}

/** A call-back task for a client whose goods run out (Qayta sotuv → Eslatish). */
export function useRepeatTask() {
  const { user } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { leadId: string; title: string; assigneeId: string | null }) => {
      const due = new Date();
      due.setHours(18, 0, 0, 0);
      const { error } = await supabase.from("tasks").insert({
        organization_id: user!.organizationId!,
        lead_id: input.leadId,
        title: input.title,
        assignee_id: input.assigneeId ?? user!.id,
        due_date: due.toISOString(),
      });
      if (error) throw error;
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["tasks"] }),
  });
}
