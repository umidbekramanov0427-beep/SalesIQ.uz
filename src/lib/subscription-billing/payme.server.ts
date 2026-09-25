// Server-only. Payme (paycom.uz) integration for the PLATFORM's own
// subscription billing -- a tenant organization pays the platform owner to
// renew its SalesIQ subscription, via one shared platform-level merchant
// account (platform_payment_credentials), not a per-org one.
//
// IMPORTANT: implemented from Payme's publicly documented merchant
// protocol from training knowledge -- this sandbox has no network access
// to Payme's own systems, so nothing here has been exercised against their
// certification test suite. Before relying on this for real subscription
// revenue, run Payme's own test-payment flow end to end and compare every
// response against their checklist.
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { reactivateOrgAfterPayment } from "./billing-data.server";

export type PaymeJsonRpcRequest = {
  method: string;
  params?: Record<string, unknown>;
  id: number | string;
};

const STATE_CREATED = 1;
const STATE_PERFORMED = 2;
const STATE_CANCELLED_BEFORE_PERFORM = -1;
const STATE_CANCELLED_AFTER_PERFORM = -2;
const TRANSACTION_TIMEOUT_MS = 12 * 60 * 60 * 1000;

export function buildPaymeCheckoutUrl(
  merchantId: string,
  orderId: string,
  amountSom: number,
): string {
  const amountTiyin = Math.round(amountSom * 100);
  const raw = `m=${merchantId};ac.order_id=${orderId};a=${amountTiyin}`;
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

type PaymentRow = {
  id: string;
  organization_id: string;
  amount: number;
  status: string;
  provider_transaction_id: string | null;
  provider_data: Record<string, unknown>;
};

async function findByOrderId(orderId: string): Promise<PaymentRow | null> {
  const { data } = await supabaseAdmin
    .from("platform_subscription_payments")
    .select("*")
    .eq("id", orderId)
    .eq("provider", "payme")
    .maybeSingle();
  return (data as PaymentRow | null) ?? null;
}

async function findByTransactionId(transactionId: string): Promise<PaymentRow | null> {
  const { data } = await supabaseAdmin
    .from("platform_subscription_payments")
    .select("*")
    .eq("provider_transaction_id", transactionId)
    .eq("provider", "payme")
    .maybeSingle();
  return (data as PaymentRow | null) ?? null;
}

export async function handlePaymeRequest(req: PaymeJsonRpcRequest): Promise<RpcResult> {
  const params = req.params ?? {};

  switch (req.method) {
    case "CheckPerformTransaction": {
      const account = params["account"] as Record<string, unknown> | undefined;
      const orderId =
        typeof account?.["order_id"] === "string" ? (account["order_id"] as string) : "";
      const amount = typeof params["amount"] === "number" ? (params["amount"] as number) : NaN;
      const row = orderId ? await findByOrderId(orderId) : null;
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

      const existing = await findByTransactionId(transactionId);
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

      const row = orderId ? await findByOrderId(orderId) : null;
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
        .from("platform_subscription_payments")
        .update({
          provider_transaction_id: transactionId,
          provider_data: { state: STATE_CREATED, create_time: time },
        })
        .eq("id", row.id);

      return { result: { create_time: time, transaction: row.id, state: STATE_CREATED } };
    }

    case "PerformTransaction": {
      const transactionId = String(params["id"] ?? "");
      const row = await findByTransactionId(transactionId);
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
          .from("platform_subscription_payments")
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
        .from("platform_subscription_payments")
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
      await reactivateOrgAfterPayment(row.organization_id);

      return { result: { transaction: row.id, perform_time: performTime, state: STATE_PERFORMED } };
    }

    case "CancelTransaction": {
      const transactionId = String(params["id"] ?? "");
      const reason = typeof params["reason"] === "number" ? params["reason"] : null;
      const row = await findByTransactionId(transactionId);
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
        .from("platform_subscription_payments")
        .update({
          status: "cancelled",
          provider_data: { ...row.provider_data, state: newState, cancel_time: cancelTime, reason },
        })
        .eq("id", row.id);

      return { result: { transaction: row.id, cancel_time: cancelTime, state: newState } };
    }

    case "CheckTransaction": {
      const transactionId = String(params["id"] ?? "");
      const row = await findByTransactionId(transactionId);
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

    default:
      return rpcError(-32601, "Method not found");
  }
}
