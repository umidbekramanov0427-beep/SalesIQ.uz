// Shared (client + server safe) contract template merge logic. Deliberately
// plain {{token}} string substitution over a small fixed set of tokens --
// no template engine, no arbitrary expression evaluation -- since the
// input is a short admin-authored document, not user code.
import type { CrmLeadView } from "@/hooks/use-crm-data";

export const CONTRACT_TOKENS = [
  "lead.name",
  "lead.company",
  "lead.phone",
  "lead.email",
  "lead.budget",
  "owner.name",
  "today",
] as const;

export function renderContractTemplate(
  body: string,
  lead: CrmLeadView,
  ownerName: string,
  formatCurrency: (n: number) => string,
): string {
  const values: Record<string, string> = {
    "lead.name": lead.name || "",
    "lead.company": lead.company || "",
    "lead.phone": lead.phone || "",
    "lead.email": lead.email || "",
    "lead.budget": lead.budget ? formatCurrency(lead.budget) : "",
    "owner.name": ownerName || "",
    today: new Date().toLocaleDateString(),
  };
  return CONTRACT_TOKENS.reduce(
    (text, token) => text.split(`{{${token}}}`).join(values[token]),
    body,
  );
}
