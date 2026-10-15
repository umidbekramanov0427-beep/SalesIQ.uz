import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import type { Json } from "@/integrations/supabase/types";
import { requireOrgMember } from "@/lib/auth.server";
import {
  buildDidoxFactura,
  didoxProblems,
  formatInvoiceNumber,
  invoiceTotals,
  type InvoiceDraft,
  type InvoiceItem,
  type Requisites,
} from "@/lib/invoices/invoice";
import {
  connectDidox,
  createDidoxInvoice,
  DidoxError,
  didoxDocumentStatus,
  didoxStatus,
  recordDidoxError,
} from "@/lib/invoices/didox.server";

// Every write to invoices (Admin panel → Hisob-faktura va Didox; the
// invoice list; "Hisob-faktura" on a lead):
//   GET                       Didox connection status
//   POST {action: "create"}   a new invoice with the company's next number
//   POST {action: "status"}   mark paid / cancelled / back to draft
//   POST {action: "delete"}   remove a draft (managers)
//   POST {action: "didox-send" | "didox-refresh"}   to Didox / its status (managers)
//   POST {action: "didox-connect" | "didox-disconnect"}   Didox login (admins)

const json = (body: unknown, status = 200) => Response.json(body, { status });
const str = (v: unknown, max = 500) =>
  typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null;

function cleanItems(raw: unknown): InvoiceItem[] {
  if (!Array.isArray(raw)) return [];
  return raw.slice(0, 200).flatMap((r) => {
    if (!r || typeof r !== "object") return [];
    const o = r as Record<string, unknown>;
    const name = str(o["name"], 300);
    const quantity = Number(o["quantity"]);
    const price = Number(o["price"]);
    if (!name || !Number.isFinite(quantity) || !Number.isFinite(price)) return [];
    const vat = o["vatRate"] === null || o["vatRate"] === undefined ? null : Number(o["vatRate"]);
    return [
      {
        name,
        quantity: Math.max(0, quantity),
        price: Math.max(0, price),
        vatRate: vat !== null && Number.isFinite(vat) ? Math.min(Math.max(vat, 0), 100) : null,
        catalogCode: str(o["catalogCode"], 30),
        catalogName: str(o["catalogName"], 300),
        packageCode: str(o["packageCode"], 30),
        packageName: str(o["packageName"], 100),
      },
    ];
  });
}

const isDate = (v: unknown): v is string => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v);

async function roleOf(userId: string): Promise<string | null> {
  const { data } = await supabaseAdmin.from("profiles").select("role").eq("id", userId).single();
  return data?.role ?? null;
}

const missingTable = (msg: string) => /does not exist|schema cache|PGRST205/i.test(msg);

export const Route = createFileRoute("/invoice-api")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const member = await requireOrgMember(request);
        if (!member) return json({ error: "Unauthorized" }, 401);
        return json(await didoxStatus(member.organizationId));
      },
      POST: async ({ request }) => {
        const member = await requireOrgMember(request);
        if (!member) return json({ error: "Unauthorized" }, 401);
        const org = member.organizationId;
        const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
        const action = body["action"];
        const role = await roleOf(member.id);
        const manager = role === "super_admin" || role === "rop" || role === "platform_owner";
        const admin = role === "super_admin" || role === "platform_owner";

        try {
          if (action === "create") {
            const items = cleanItems(body["items"]);
            const buyerName = str(body["buyerName"], 300);
            if (!buyerName) return json({ error: "BUYER_REQUIRED" }, 400);
            if (!items.length) return json({ error: "ITEMS_REQUIRED" }, 400);
            const leadId = str(body["leadId"], 64);
            if (leadId) {
              const { data: lead } = await supabaseAdmin
                .from("leads")
                .select("id")
                .eq("id", leadId)
                .eq("organization_id", org)
                .maybeSingle();
              if (!lead) return json({ error: "Lead not found" }, 404);
            }
            const { data: settings, error: sErr } = await supabaseAdmin
              .from("org_invoice_settings")
              .select("prefix, has_vat, vat_rate")
              .eq("organization_id", org)
              .maybeSingle();
            if (sErr && missingTable(sErr.message))
              return json({ error: "MIGRATION_PENDING" }, 503);
            const hasVat =
              typeof body["hasVat"] === "boolean" ? body["hasVat"] : (settings?.has_vat ?? true);
            const vatRate = Number(settings?.vat_rate ?? 12);
            const { data: n, error: nErr } = await supabaseAdmin.rpc("claim_invoice_number", {
              p_org: org,
            });
            if (nErr || typeof n !== "number") {
              return json({ error: nErr?.message ?? "Could not number the invoice" }, 500);
            }
            const totals = invoiceTotals({ items, hasVat, vatRate });
            const { data: row, error } = await supabaseAdmin
              .from("invoices")
              .insert({
                organization_id: org,
                lead_id: leadId,
                number: formatInvoiceNumber(settings?.prefix ?? "HF", n),
                invoice_date: isDate(body["date"])
                  ? body["date"]
                  : new Date().toISOString().slice(0, 10),
                contract_no: str(body["contractNo"], 100),
                contract_date: isDate(body["contractDate"]) ? body["contractDate"] : null,
                buyer_name: buyerName,
                buyer_tin: str(body["buyerTin"], 20),
                buyer_address: str(body["buyerAddress"], 500),
                buyer_account: str(body["buyerAccount"], 30),
                buyer_bank_mfo: str(body["buyerBankMfo"], 10),
                buyer_vat_reg_code: str(body["buyerVatRegCode"], 30),
                items: items as unknown as Json,
                has_vat: hasVat,
                total: totals.total,
                vat_total: totals.vat,
                note: str(body["note"], 1000),
                created_by: member.id,
              })
              .select("*")
              .single();
            if (error) return json({ error: error.message }, 500);
            if (leadId) {
              await supabaseAdmin.from("lead_activities").insert({
                organization_id: org,
                lead_id: leadId,
                type: "note",
                content: `Hisob-faktura ${row.number} yaratildi: ${totals.total.toLocaleString("ru-RU")} so'm`,
              });
            }
            return json({ invoice: row });
          }

          const id = str(body["id"], 64);
          if (
            action === "status" ||
            action === "delete" ||
            action === "didox-send" ||
            action === "didox-refresh"
          ) {
            if (!id) return json({ error: "id required" }, 400);
            const { data: inv, error } = await supabaseAdmin
              .from("invoices")
              .select("*")
              .eq("id", id)
              .eq("organization_id", org)
              .maybeSingle();
            if (error) return json({ error: error.message }, 500);
            if (!inv) return json({ error: "Not found" }, 404);

            if (action === "status") {
              const status = body["status"];
              if (
                status !== "paid" &&
                status !== "cancelled" &&
                status !== "draft" &&
                status !== "sent"
              ) {
                return json({ error: "Bad status" }, 400);
              }
              const { data: row, error: uErr } = await supabaseAdmin
                .from("invoices")
                .update({
                  status,
                  paid_at: status === "paid" ? new Date().toISOString() : null,
                  updated_at: new Date().toISOString(),
                })
                .eq("id", id)
                .select("*")
                .single();
              if (uErr) return json({ error: uErr.message }, 500);
              return json({ invoice: row });
            }

            if (action === "delete") {
              if (!manager) return json({ error: "FORBIDDEN" }, 403);
              if (inv.status !== "draft" || inv.didox_id)
                return json({ error: "ONLY_DRAFTS" }, 400);
              const { error: dErr } = await supabaseAdmin.from("invoices").delete().eq("id", id);
              if (dErr) return json({ error: dErr.message }, 500);
              return json({ ok: true });
            }

            if (!manager) return json({ error: "FORBIDDEN" }, 403);
            if (action === "didox-refresh") {
              if (!inv.didox_id) return json({ error: "NOT_SENT" }, 400);
              const status = await didoxDocumentStatus(org, inv.didox_id);
              const { data: row } = await supabaseAdmin
                .from("invoices")
                .update({
                  didox_status: status,
                  didox_error: null,
                  updated_at: new Date().toISOString(),
                })
                .eq("id", id)
                .select("*")
                .single();
              return json({ invoice: row });
            }

            // didox-send: only with a Didox login (not an error on the invoice).
            if (!(await didoxStatus(org)).connected) {
              return json({ error: "DIDOX_NOT_CONNECTED" }, 400);
            }
            const { data: s } = await supabaseAdmin
              .from("org_invoice_settings")
              .select("*")
              .eq("organization_id", org)
              .maybeSingle();
            const seller: Requisites = {
              name: s?.company_name ?? "",
              tin: s?.tin,
              vatRegCode: s?.vat_reg_code,
              account: s?.account,
              bankMfo: s?.bank_mfo,
              address: s?.address,
            };
            const buyer: Requisites = {
              name: inv.buyer_name,
              tin: inv.buyer_tin,
              vatRegCode: inv.buyer_vat_reg_code,
              account: inv.buyer_account,
              bankMfo: inv.buyer_bank_mfo,
              address: inv.buyer_address,
            };
            const draft: InvoiceDraft = {
              number: inv.number,
              date: inv.invoice_date,
              contractNo: inv.contract_no,
              contractDate: inv.contract_date,
              hasVat: inv.has_vat,
              vatRate: Number(s?.vat_rate ?? 12),
              items: (inv.items as unknown as InvoiceItem[]) ?? [],
            };
            const problems = didoxProblems(draft, seller, buyer);
            if (problems.length) return json({ error: "REQUISITES", problems }, 400);
            try {
              const didoxId = await createDidoxInvoice(
                org,
                buildDidoxFactura(draft, seller, buyer),
              );
              const { data: row } = await supabaseAdmin
                .from("invoices")
                .update({
                  didox_id: didoxId,
                  didox_status: "draft",
                  didox_error: null,
                  status: inv.status === "draft" ? "sent" : inv.status,
                  sent_at: new Date().toISOString(),
                  updated_at: new Date().toISOString(),
                })
                .eq("id", id)
                .select("*")
                .single();
              return json({ invoice: row });
            } catch (err) {
              const message = err instanceof Error ? err.message : "Didox error";
              await supabaseAdmin
                .from("invoices")
                .update({ didox_error: message.slice(0, 500) })
                .eq("id", id);
              await recordDidoxError(org, message);
              return json({ error: message }, err instanceof DidoxError && err.status ? 502 : 500);
            }
          }

          if (action === "didox-connect") {
            if (!admin) return json({ error: "FORBIDDEN" }, 403);
            const tin = (str(body["tin"], 20) ?? "").replace(/\s+/g, "");
            const password = typeof body["password"] === "string" ? body["password"] : "";
            if (!/^(\d{9}|\d{14})$/.test(tin) || !password) {
              return json({ error: "TIN_PASSWORD_REQUIRED" }, 400);
            }
            await connectDidox(org, member.id, tin, password);
            return json(await didoxStatus(org));
          }
          if (action === "didox-disconnect") {
            if (!admin) return json({ error: "FORBIDDEN" }, 403);
            await supabaseAdmin.from("org_didox_credentials").delete().eq("organization_id", org);
            return json(await didoxStatus(org));
          }
          return json({ error: "Unknown action" }, 400);
        } catch (err) {
          const message = err instanceof Error ? err.message : "Failed";
          if (missingTable(message)) return json({ error: "MIGRATION_PENDING" }, 503);
          if (err instanceof DidoxError)
            return json({ error: message }, err.status === 422 ? 400 : 502);
          return json({ error: message }, 500);
        }
      },
    },
  },
});
