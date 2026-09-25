// Server-only. Payme (paycom.uz) merchant integration -- checkout link
// generation + the JSON-RPC 2.0 webhook Payme calls to move a payment
// through its lifecycle (CheckPerformTransaction -> CreateTransaction ->
// PerformTransaction, or CancelTransaction at any point).
//
// IMPORTANT: this is implemented from Payme's publicly documented merchant
// protocol (help.paycom.uz / merchant.paycom.uz docs) from training
// knowledge -- this sandbox has no network access to Payme's own systems,
// so nothing here has been exercised against their certification test
// suite. Before accepting real payments, connect a real merchant account
// and run Payme's own test-payment flow (the "Test" button in the Payme
// business cabinet) end to end and compare every response against what
// their checklist expects.
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export type PaymeJsonRpcRequest = {
  method: string;
  params?: Record<string, unknown>;
  id: number | string;
};

// Payme's own transaction lifecycle, mirrored in lead_payments.provider_data
// rather than a separate table -- one lead_payments row is one invoice and
// (in this simple-invoicing shape) at most one Payme transaction.
const STATE_CREATED = 1;
const STATE_PERFORMED = 2;
const STATE_CANCELLED_BEFORE_PERFORM = -1;
const STATE_CANCELLED_AFTER_PERFORM = -2;

// A CreateTransaction that never reaches PerformTransaction within this
// window must be auto-cancelled (Payme's own protocol requirement).
const TRANSACTION_TIMEOUT_MS = 12 * 60 * 60 * 1000;

export function buildPaymeCheckoutUrl(
  merchantId: string,
  leadPaymentId: string,
  amountSom: number,
): string {
  const amountTiyin = Math.round(amountSom * 100);
  const raw = `m=${merchantId};ac.order_id=${leadPaymentId};a=${amountTiyin}`;
  const encoded = Buffer.from(raw, "utf-8").toString("base64");
  return `https://checkout.paycom.uz/${encoded}`;
}

export function verifyPaymeAuth(authHeader: string | null, secretKey: string): boolean {
  if (!authHeader?.startsWith("Basic ")) return false;
  try {
    const decoded = Buffer.from(authHeader.slice(6), "base64").toString("utf-8");
    const [login, password] = decoded.split(":");
    return login === "Paycom" && password === secretKey;
  } catch {
    return false;
  }
}

type RpcResult = { result?: unknown; error?: { code: number; message: string; data?: string } };

function rpcError(code: number, message: string, data?: string): RpcResult {
  return { error: data !== undefined ? { code, message, data } : { code, message } };
}

type LeadPaymentRow = {
  id: string;
  organization_id: string;
  amount: number;
  status: string;
  provider_transaction_id: string | null;
  provider_data: Record<string, unknown>;
};

async function findByOrderId(
  organizationId: string,
  orderId: string,
): Promise<LeadPaymentRow | null> {
  const { data } = await supabaseAdmin
    .from("lead_payments")
    .select("*")
    .eq("id", orderId)
    .eq("organization_id", organizationId)
    .eq("provider", "payme")
    .maybeSingle();
  return (data as LeadPaymentRow | null) ?? null;
}

async function findByTransactionId(
  organizationId: string,
  transactionId: string,
): Promise<LeadPaymentRow | null> {
  const { data } = await supabaseAdmin
    .from("lead_payments")
    .select("*")
    .eq("provider_transaction_id", transactionId)
    .eq("organization_id", organizationId)
    .eq("provider", "payme")
    .maybeSingle();
  return (data as LeadPaymentRow | null) ?? null;
}

export async function handlePaymeRequest(
  organizationId: string,
  req: PaymeJsonRpcRequest,
): Promise<RpcResult> {
  const params = req.params ?? {};

  switch (req.method) {
    case "CheckPerformTransaction": {
      const account = params["account"] as Record<string, unknown> | undefined;
      const orderId =
        typeof account?.["order_id"] === "string" ? (account["order_id"] as string) : "";
      const amount = typeof params["amount"] === "number" ? (params["amount"] as number) : NaN;
      const row = orderId ? await findByOrderId(organizationId, orderId) : null;
      if (!row || row.status === "cancelled") {
        return rpcError(-31050, "Order not found", "order_id");
      }
      if (Math.round(row.amount * 100) !== amount) {
        return rpcError(-31001, "Invalid amount", "amount");
      }
      return { result: { allow: true } };
    }

    case "CreateTransaction": {
      const account = params["account"] as Record<string, unknown> | undefined;
      const orderId =
        typeof account?.["order_id"] === "string" ? (account["order_id"] as string) : "";
      const amount = typeof params["amount"] === "number" ? (params["amount"] as number) : NaN;
      const transactionId = String(params["id"] ?? "");
      const time = typeof params["time"] === "number" ? (params["time"] as number) : Date.now();

      const existing = await findByTransactionId(organizationId, transactionId);
      if (existing) {
        const state = (existing.provider_data["state"] as number) ?? STATE_CREATED;
        if (state !== STATE_CREATED) {
          return rpcError(-31008, "Unable to perform operation");
        }
        return {
          result: {
            create_time: existing.provider_data["create_time"],
            transaction: existing.id,
            state,
          },
        };
      }

      const row = orderId ? await findByOrderId(organizationId, orderId) : null;
      if (!row || row.status === "cancelled") {
        return rpcError(-31050, "Order not found", "order_id");
      }
      if (Math.round(row.amount * 100) !== amount) {
        return rpcError(-31001, "Invalid amount", "amount");
      }
      if (row.provider_transaction_id && row.provider_transaction_id !== transactionId) {
        return rpcError(-31050, "Order already has another active transaction");
      }
      if (row.status === "paid") {
        return rpcError(-31051, "Order already paid");
      }

      await supabaseAdmin
        .from("lead_payments")
        .update({
          provider_transaction_id: transactionId,
          provider_data: { state: STATE_CREATED, create_time: time },
        })
        .eq("id", row.id);

      return { result: { create_time: time, transaction: row.id, state: STATE_CREATED } };
    }

    case "PerformTransaction": {
      const transactionId = String(params["id"] ?? "");
      const row = await findByTransactionId(organizationId, transactionId);
      if (!row) return rpcError(-31003, "Transaction not found");

      const state = (row.provider_data["state"] as number) ?? STATE_CREATED;
      if (state === STATE_PERFORMED) {
        return {
          result: { transaction: row.id, perform_time: row.provider_data["perform_time"], state },
        };
      }
      if (state !== STATE_CREATED) {
        return rpcError(-31008, "Unable to perform operation");
      }

      const createTime = (row.provider_data["create_time"] as number) ?? 0;
      if (Date.now() - createTime > TRANSACTION_TIMEOUT_MS) {
        await supabaseAdmin
          .from("lead_payments")
          .update({
            status: "cancelled",
            provider_data: {
              ...row.provider_data,
              state: STATE_CANCELLED_BEFORE_PERFORM,
              cancel_time: Date.now(),
              reason: 4,
            },
          })
          .eq("id", row.id);
        return rpcError(-31008, "Transaction expired");
      }

      const performTime = Date.now();
      await supabaseAdmin
        .from("lead_payments")
        .update({
          status: "paid",
          paid_at: new Date(performTime).toISOString(),
          provider_data: {
            ...row.provider_data,
            state: STATE_PERFORMED,
            perform_time: performTime,
          },
        })
        .eq("id", row.id);

      return { result: { transaction: row.id, perform_time: performTime, state: STATE_PERFORMED } };
    }

    case "CancelTransaction": {
      const transactionId = String(params["id"] ?? "");
      const reason = typeof params["reason"] === "number" ? params["reason"] : null;
      const row = await findByTransactionId(organizationId, transactionId);
      if (!row) return rpcError(-31003, "Transaction not found");

      const state = (row.provider_data["state"] as number) ?? STATE_CREATED;
      if (state === STATE_CANCELLED_BEFORE_PERFORM || state === STATE_CANCELLED_AFTER_PERFORM) {
        return {
          result: { transaction: row.id, cancel_time: row.provider_data["cancel_time"], state },
        };
      }

      const newState =
        state === STATE_PERFORMED ? STATE_CANCELLED_AFTER_PERFORM : STATE_CANCELLED_BEFORE_PERFORM;
      const cancelTime = Date.now();
      await supabaseAdmin
        .from("lead_payments")
        .update({
          status: "cancelled",
          provider_data: { ...row.provider_data, state: newState, cancel_time: cancelTime, reason },
        })
        .eq("id", row.id);

      return { result: { transaction: row.id, cancel_time: cancelTime, state: newState } };
    }

    case "CheckTransaction": {
      const transactionId = String(params["id"] ?? "");
      const row = await findByTransactionId(organizationId, transactionId);
      if (!row) return rpcError(-31003, "Transaction not found");
      const d = row.provider_data;
      return {
        result: {
          create_time: d["create_time"] ?? 0,
          perform_time: d["perform_time"] ?? 0,
          cancel_time: d["cancel_time"] ?? 0,
          transaction: row.id,
          state: d["state"] ?? STATE_CREATED,
          reason: d["reason"] ?? null,
        },
      };
    }

    case "GetStatement": {
      const from = typeof params["from"] === "number" ? (params["from"] as number) : 0;
      const to = typeof params["to"] === "number" ? (params["to"] as number) : Date.now();
      const { data } = await supabaseAdmin
        .from("lead_payments")
        .select("*")
        .eq("organization_id", organizationId)
        .eq("provider", "payme")
        .not("provider_transaction_id", "is", null);
      const transactions = ((data as LeadPaymentRow[] | null) ?? [])
        .filter((r) => {
          const t = (r.provider_data["create_time"] as number) ?? 0;
          return t >= from && t <= to;
        })
        .map((r) => ({
          id: r.provider_transaction_id,
          time: r.provider_data["create_time"] ?? 0,
          amount: Math.round(r.amount * 100),
          account: { order_id: r.id },
          create_time: r.provider_data["create_time"] ?? 0,
          perform_time: r.provider_data["perform_time"] ?? 0,
          cancel_time: r.provider_data["cancel_time"] ?? 0,
          transaction: r.id,
          state: r.provider_data["state"] ?? STATE_CREATED,
          reason: r.provider_data["reason"] ?? null,
        }));
      return { result: { transactions } };
    }

    default:
      return rpcError(-32601, "Method not found");
  }
}
