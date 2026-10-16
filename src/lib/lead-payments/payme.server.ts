// Server-only. Payme's merchant protocol (JSON-RPC) for a company's own
// Payme cashbox, the same state machine as the platform's subscription
// billing (subscription-billing/payme.server.ts) but over
// lead_payment_links. The cashbox's account field must be "order_id".
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import type { PaymeJsonRpcRequest } from "@/lib/subscription-billing/payme.server";
import { findLink, settleLinkPaid, type LinkRow } from "./settle.server";

const STATE_CREATED = 1;
const STATE_PERFORMED = 2;
const STATE_CANCELLED_BEFORE_PERFORM = -1;
const STATE_CANCELLED_AFTER_PERFORM = -2;
const TRANSACTION_TIMEOUT_MS = 12 * 60 * 60 * 1000;

type RpcResult = { result?: unknown; error?: { code: number; message: string; data?: string } };

const rpcError = (code: number, message: string, data?: string): RpcResult => ({
  error: data !== undefined ? { code, message, data } : { code, message },
});

async function byTransaction(orgId: string, transactionId: string): Promise<LinkRow | null> {
  if (!transactionId) return null;
  const { data } = await supabaseAdmin
    .from("lead_payment_links")
    .select("*")
    .eq("organization_id", orgId)
    .eq("provider", "payme")
    .eq("provider_transaction_id", transactionId)
    .maybeSingle();
  return (data as LinkRow | null) ?? null;
}

const orderIdOf = (params: Record<string, unknown>) => {
  const account = params["account"] as Record<string, unknown> | undefined;
  return typeof account?.["order_id"] === "string" ? (account["order_id"] as string) : "";
};

async function patch(id: string, values: Record<string, unknown>): Promise<void> {
  await supabaseAdmin
    .from("lead_payment_links")
    .update(values as never)
    .eq("id", id);
}

export async function handleLeadPaymeRequest(
  orgId: string,
  req: PaymeJsonRpcRequest,
): Promise<RpcResult> {
  const params = req.params ?? {};
  switch (req.method) {
    case "CheckPerformTransaction": {
      const amount = typeof params["amount"] === "number" ? params["amount"] : NaN;
      const row = await findLink(orgId, orderIdOf(params));
      if (!row || row.status === "cancelled")
        return rpcError(-31050, "Order not found", "order_id");
      if (row.status === "paid") return rpcError(-31051, "Order already paid", "order_id");
      if (Math.round(Number(row.amount) * 100) !== amount)
        return rpcError(-31001, "Invalid amount", "amount");
      return { result: { allow: true } };
    }

    case "CreateTransaction": {
      const amount = typeof params["amount"] === "number" ? params["amount"] : NaN;
      const transactionId = String(params["id"] ?? "");
      const time = typeof params["time"] === "number" ? params["time"] : Date.now();

      const existing = await byTransaction(orgId, transactionId);
      if (existing) {
        const state = (existing.provider_data["state"] as number) ?? STATE_CREATED;
        if (state !== STATE_CREATED) return rpcError(-31008, "Unable to perform operation");
        return {
          result: {
            create_time: existing.provider_data["create_time"],
            transaction: existing.id,
            state,
          },
        };
      }
      const row = await findLink(orgId, orderIdOf(params));
      if (!row || row.status === "cancelled")
        return rpcError(-31050, "Order not found", "order_id");
      if (row.status === "paid") return rpcError(-31051, "Order already paid", "order_id");
      if (Math.round(Number(row.amount) * 100) !== amount)
        return rpcError(-31001, "Invalid amount", "amount");
      const activeOther =
        row.provider === "payme" &&
        row.provider_transaction_id &&
        row.provider_transaction_id !== transactionId &&
        (row.provider_data["state"] as number) === STATE_CREATED;
      if (activeOther) return rpcError(-31050, "Order has another active transaction", "order_id");

      await patch(row.id, {
        provider: "payme",
        provider_transaction_id: transactionId,
        provider_data: { state: STATE_CREATED, create_time: time },
      });
      return { result: { create_time: time, transaction: row.id, state: STATE_CREATED } };
    }

    case "PerformTransaction": {
      const row = await byTransaction(orgId, String(params["id"] ?? ""));
      if (!row) return rpcError(-31003, "Transaction not found");
      const state = (row.provider_data["state"] as number) ?? STATE_CREATED;
      if (state === STATE_PERFORMED) {
        return {
          result: { transaction: row.id, perform_time: row.provider_data["perform_time"], state },
        };
      }
      if (state !== STATE_CREATED) return rpcError(-31008, "Unable to perform operation");
      // Paid meanwhile through Click.
      if (row.status === "paid") return rpcError(-31008, "Order already paid");

      const createTime = (row.provider_data["create_time"] as number) ?? 0;
      if (Date.now() - createTime > TRANSACTION_TIMEOUT_MS) {
        await patch(row.id, {
          provider_data: {
            ...row.provider_data,
            state: STATE_CANCELLED_BEFORE_PERFORM,
            cancel_time: Date.now(),
            reason: 4,
          },
        });
        return rpcError(-31008, "Transaction expired");
      }
      const performTime = Date.now();
      await patch(row.id, {
        provider_data: { ...row.provider_data, state: STATE_PERFORMED, perform_time: performTime },
      });
      await settleLinkPaid(row, "payme");
      return { result: { transaction: row.id, perform_time: performTime, state: STATE_PERFORMED } };
    }

    case "CancelTransaction": {
      const reason = typeof params["reason"] === "number" ? params["reason"] : null;
      const row = await byTransaction(orgId, String(params["id"] ?? ""));
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
      await patch(row.id, {
        // A refund after payment cancels the bill; before it, the link
        // stays open for another try.
        ...(newState === STATE_CANCELLED_AFTER_PERFORM ? { status: "cancelled" } : {}),
        provider_data: { ...row.provider_data, state: newState, cancel_time: cancelTime, reason },
      });
      return { result: { transaction: row.id, cancel_time: cancelTime, state: newState } };
    }

    case "CheckTransaction": {
      const row = await byTransaction(orgId, String(params["id"] ?? ""));
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
      const from = typeof params["from"] === "number" ? params["from"] : 0;
      const to = typeof params["to"] === "number" ? params["to"] : Date.now();
      const { data } = await supabaseAdmin
        .from("lead_payment_links")
        .select("*")
        .eq("organization_id", orgId)
        .eq("provider", "payme")
        .not("provider_transaction_id", "is", null);
      const transactions = ((data ?? []) as LinkRow[])
        .filter((r) => {
          const t = Number(r.provider_data["create_time"] ?? 0);
          return t >= from && t <= to;
        })
        .map((r) => ({
          id: r.provider_transaction_id,
          time: r.provider_data["create_time"] ?? 0,
          amount: Math.round(Number(r.amount) * 100),
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
