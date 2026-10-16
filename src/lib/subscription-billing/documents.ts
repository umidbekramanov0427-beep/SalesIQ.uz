// Subscription payment documents (hisob-faktura, dalolatnoma, to'lov uchun
// hisob): SalesIQ's legal details as the seller, the company's as the
// buyer, and the money split into price + VAT. Pure, unit-tested.
import { PLAN_LABELS, normalizePlan } from "@/lib/plan-gating";

export type Requisites = {
  company_name: string;
  tin: string;
  vat_reg_code: string;
  account: string;
  bank_mfo: string;
  bank_name: string;
  address: string;
  director: string;
  accountant: string;
  phone: string;
  has_vat: boolean;
  vat_rate: number;
  /** MXIK (IKPU) code of the service, for the invoice line. */
  catalog_code: string;
};

export const EMPTY_REQUISITES: Requisites = {
  company_name: "",
  tin: "",
  vat_reg_code: "",
  account: "",
  bank_mfo: "",
  bank_name: "",
  address: "",
  director: "",
  accountant: "",
  phone: "",
  has_vat: false,
  vat_rate: 12,
  catalog_code: "",
};

const str = (v: unknown, max = 300) => (typeof v === "string" ? v.trim().slice(0, max) : "");

/** Whatever is stored (or typed) → a complete, trimmed set. */
export function parseRequisites(raw: unknown): Requisites {
  const o = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const rate = Number(o["vat_rate"]);
  return {
    company_name: str(o["company_name"]),
    tin: str(o["tin"], 20).replace(/\D/g, ""),
    vat_reg_code: str(o["vat_reg_code"], 30),
    account: str(o["account"], 30).replace(/\D/g, ""),
    bank_mfo: str(o["bank_mfo"], 10).replace(/\D/g, ""),
    bank_name: str(o["bank_name"]),
    address: str(o["address"]),
    director: str(o["director"], 120),
    accountant: str(o["accountant"], 120),
    phone: str(o["phone"], 40),
    has_vat: o["has_vat"] === true,
    vat_rate: Number.isFinite(rate) && rate >= 0 && rate <= 100 ? rate : 12,
    catalog_code: str(o["catalog_code"], 20).replace(/\D/g, ""),
  };
}

/** What a document can't be printed without. */
export function requisitesReady(r: Requisites): boolean {
  return !!(r.company_name && /^\d{9}$/.test(r.tin) && r.account && r.bank_mfo);
}

/** A paid amount (VAT included when the seller pays VAT) split for the document. */
export function splitAmount(
  total: number,
  hasVat: boolean,
  vatRate: number,
): { sum: number; vat: number; total: number } {
  const t = Math.round(total * 100) / 100;
  if (!hasVat || vatRate <= 0) return { sum: t, vat: 0, total: t };
  const vat = Math.round(((t * vatRate) / (100 + vatRate)) * 100) / 100;
  return { sum: Math.round((t - vat) * 100) / 100, vat, total: t };
}

/** "SIQ-000123" for a payment's documents. */
export function docNumber(n: number | null | undefined, fallbackId: string): string {
  return n && n > 0
    ? `SIQ-${String(n).padStart(6, "0")}`
    : `SIQ-${fallbackId.slice(0, 8).toUpperCase()}`;
}

/** A pre-payment bill for bank transfer: "H-<company>-<yymmdd>". */
export function proformaNumber(orgId: string, at: Date): string {
  const d = new Date(at.getTime() + 5 * 3600_000);
  const ymd = `${String(d.getUTCFullYear()).slice(2)}${String(d.getUTCMonth() + 1).padStart(2, "0")}${String(d.getUTCDate()).padStart(2, "0")}`;
  return `H-${orgId.slice(0, 4).toUpperCase()}-${ymd}`;
}

const DAY = 86_400_000;

/** The service line: "SalesIQ CRM obunasi — Start IQ tarifi, 30 kun (16.10.2026 – 14.11.2026)". */
export function serviceLine(plan: string | null | undefined, from: Date, days = 30): string {
  const dmy = (d: Date) => {
    const t = new Date(d.getTime() + 5 * 3600_000);
    return `${String(t.getUTCDate()).padStart(2, "0")}.${String(t.getUTCMonth() + 1).padStart(2, "0")}.${t.getUTCFullYear()}`;
  };
  const to = new Date(from.getTime() + (days - 1) * DAY);
  return `SalesIQ CRM obunasi — ${PLAN_LABELS[normalizePlan(plan)]} tarifi, ${days} kun (${dmy(from)} – ${dmy(to)})`;
}
