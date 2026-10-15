// Invoices (hisob-faktura): totals, VAT, the amount in words, requisite
// checks and the Didox e-invoice payload (document type 002). Pure, so the
// numbers that go on a legal document are tested.

export type InvoiceItem = {
  name: string;
  /** MXIK (IKPU) code of the product/service, 17 digits -- required by Didox. */
  catalogCode?: string | null;
  catalogName?: string | null;
  /** Unit of measure code and name (e.g. "1" / "dona", or the service's package code). */
  packageCode?: string | null;
  packageName?: string | null;
  quantity: number;
  price: number;
  vatRate?: number | null;
};

export type Requisites = {
  name: string;
  tin?: string | null | undefined;
  vatRegCode?: string | null | undefined;
  account?: string | null | undefined;
  bankMfo?: string | null | undefined;
  address?: string | null | undefined;
};

export type InvoiceDraft = {
  number: string;
  date: string; // YYYY-MM-DD
  contractNo?: string | null;
  contractDate?: string | null;
  hasVat: boolean;
  vatRate: number;
  items: InvoiceItem[];
};

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

export type LineTotals = { sum: number; vatRate: number; vat: number; total: number };

/** One line: amount without VAT, the VAT and the amount with it. */
export function lineTotals(item: InvoiceItem, hasVat: boolean, defaultRate: number): LineTotals {
  const sum = round2((Number(item.quantity) || 0) * (Number(item.price) || 0));
  const vatRate = hasVat ? (item.vatRate ?? defaultRate) : 0;
  const vat = round2((sum * vatRate) / 100);
  return { sum, vatRate, vat, total: round2(sum + vat) };
}

export function invoiceTotals(draft: Pick<InvoiceDraft, "items" | "hasVat" | "vatRate">) {
  let sum = 0;
  let vat = 0;
  for (const item of draft.items) {
    const l = lineTotals(item, draft.hasVat, draft.vatRate);
    sum += l.sum;
    vat += l.vat;
  }
  return { sum: round2(sum), vat: round2(vat), total: round2(sum + vat) };
}

/** "HF-0042" from the prefix and the number. */
export function formatInvoiceNumber(prefix: string, n: number): string {
  const p = prefix.trim();
  const num = String(n).padStart(4, "0");
  return p ? `${p}-${num}` : num;
}

/** 1250000.5 → "1 250 000,50" (spaces between thousands, as on Uzbek documents). */
export function formatMoney(n: number): string {
  const [int, frac] = round2(n).toFixed(2).split(".");
  return `${int!.replace(/\B(?=(\d{3})+(?!\d))/g, " ")},${frac}`;
}

const ONES = ["", "bir", "ikki", "uch", "to'rt", "besh", "olti", "yetti", "sakkiz", "to'qqiz"];
const TENS = [
  "",
  "o'n",
  "yigirma",
  "o'ttiz",
  "qirq",
  "ellik",
  "oltmish",
  "yetmish",
  "sakson",
  "to'qson",
];
const SCALES = ["", "ming", "million", "milliard", "trillion"];

function triplet(n: number): string {
  const h = Math.floor(n / 100);
  const t = Math.floor((n % 100) / 10);
  const o = n % 10;
  return [h ? `${ONES[h]} yuz` : "", TENS[t]!, ONES[o]!].filter(Boolean).join(" ");
}

/** Whole number in Uzbek words: 1250000 → "bir million ikki yuz ellik ming". */
export function numberToUzWords(value: number): string {
  let n = Math.floor(Math.abs(value));
  if (n === 0) return "nol";
  const parts: string[] = [];
  let scale = 0;
  while (n > 0 && scale < SCALES.length) {
    const chunk = n % 1000;
    if (chunk) parts.unshift([triplet(chunk), SCALES[scale]].filter(Boolean).join(" "));
    n = Math.floor(n / 1000);
    scale++;
  }
  return parts.join(" ");
}

/** "Bir million ikki yuz ellik ming so'm 50 tiyin" -- the total in words on the invoice. */
export function amountInWords(amount: number): string {
  const whole = Math.floor(round2(amount));
  const tiyin = Math.round((round2(amount) - whole) * 100);
  const words = numberToUzWords(whole);
  const text = `${words} so'm ${String(tiyin).padStart(2, "0")} tiyin`;
  return text.charAt(0).toUpperCase() + text.slice(1);
}

const digits = (s: string | null | undefined) => (s ?? "").replace(/\s+/g, "");

export type RequisiteProblem =
  | "seller_name"
  | "seller_tin"
  | "buyer_name"
  | "buyer_tin"
  | "seller_account"
  | "seller_mfo"
  | "items"
  | "catalog_code";

/** STIR (INN) of a company: 9 digits; a person's JShShIR (PINFL): 14 digits. */
export const isTin = (s: string | null | undefined) => /^(\d{9}|\d{14})$/.test(digits(s));
export const isAccount = (s: string | null | undefined) => /^\d{20}$/.test(digits(s));
export const isMfo = (s: string | null | undefined) => /^\d{5}$/.test(digits(s));
export const isCatalogCode = (s: string | null | undefined) => /^\d{17}$/.test(digits(s));

/**
 * What is missing or malformed for sending to Didox (a printed invoice
 * only needs names and lines).
 */
export function didoxProblems(
  draft: InvoiceDraft,
  seller: Requisites,
  buyer: Requisites,
): RequisiteProblem[] {
  const problems: RequisiteProblem[] = [];
  if (!seller.name.trim()) problems.push("seller_name");
  if (!isTin(seller.tin)) problems.push("seller_tin");
  if (!isAccount(seller.account)) problems.push("seller_account");
  if (!isMfo(seller.bankMfo)) problems.push("seller_mfo");
  if (!buyer.name.trim()) problems.push("buyer_name");
  if (!isTin(buyer.tin)) problems.push("buyer_tin");
  if (!draft.items.length || draft.items.some((i) => !i.name.trim() || !(i.quantity > 0)))
    problems.push("items");
  if (draft.items.some((i) => !isCatalogCode(i.catalogCode))) problems.push("catalog_code");
  return problems;
}

const party = (r: Requisites) => ({
  Name: r.name.trim(),
  VatRegCode: digits(r.vatRegCode) || undefined,
  Account: digits(r.account) || undefined,
  BankId: digits(r.bankMfo) || undefined,
  Address: r.address?.trim() || undefined,
});

/** The Didox e-invoice (doctype 002) body for one invoice. */
export function buildDidoxFactura(draft: InvoiceDraft, seller: Requisites, buyer: Requisites) {
  const body: Record<string, unknown> = {
    Version: 1,
    FacturaType: 0,
    FacturaDoc: { FacturaNo: draft.number, FacturaDate: draft.date },
    SellerTin: digits(seller.tin),
    Seller: party(seller),
    BuyerTin: digits(buyer.tin),
    Buyer: party(buyer),
    ProductList: {
      Tin: digits(seller.tin),
      HasVat: draft.hasVat,
      HasExcise: false,
      HasLgota: false,
      HasCommittent: false,
      Products: draft.items.map((item, i) => {
        const l = lineTotals(item, draft.hasVat, draft.vatRate);
        return {
          OrdNo: i + 1,
          Name: item.name.trim(),
          CatalogCode: digits(item.catalogCode),
          CatalogName: item.catalogName?.trim() || undefined,
          PackageCode: item.packageCode?.trim() || undefined,
          PackageName: item.packageName?.trim() || undefined,
          Count: Number(item.quantity),
          Summa: l.total,
          DeliverySum: l.sum,
          VatRate: l.vatRate,
          VatSum: l.vat,
          DeliverySumWithVat: l.total,
          WithoutVat: !draft.hasVat,
          Origin: 2,
        };
      }),
    },
  };
  if (draft.contractNo) {
    body["ContractDoc"] = {
      ContractNo: draft.contractNo,
      ContractDate: draft.contractDate ?? draft.date,
    };
  }
  return body;
}
