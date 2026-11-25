// Ombor (warehouse) module: the company's switch, products, stock and
// orders. Every query degrades to "empty" while the 20270207 migration has
// not run or the module is off (RLS then returns nothing).
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import { useAuth } from "@/lib/auth";

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
    for (const k of ["wh_products", "wh_warehouses", "wh_moves", "wh_stock", "wh_orders"])
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

export type MoveLine = { productId: string; qty: number; unitCost?: number | null };

/** Kirim / chiqim / hisobdan chiqarish: one journal row per line. */
export function useAddMoves() {
  const { user } = useAuth();
  const done = useInvalidateWarehouse();
  return useMutation({
    mutationFn: async (input: {
      kind: "in" | "out" | "writeoff" | "adjust";
      lines: MoveLine[];
      warehouseId?: string | null;
      note?: string;
    }) => {
      const org = user!.organizationId!;
      const wh = input.warehouseId || (await ensureWarehouse(org));
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
    }): Promise<OrderRow> => {
      const org = user!.organizationId!;
      const wh = await ensureWarehouse(org);
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
