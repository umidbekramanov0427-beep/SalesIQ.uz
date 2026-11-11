// The integrations store's shelves (IntegrationsMarket): which category a
// service sits in, what counts as installed, and the search/shelf filter.

/** The few fields of an admin catalog card the store reads. */
type MarketItem = { key: string; status?: { ok: boolean } | undefined };

export type MarketCategory = "crm" | "messengers" | "telephony" | "payments" | "notify" | "dev";

export const CATEGORY_ORDER: MarketCategory[] = [
  "crm",
  "messengers",
  "telephony",
  "payments",
  "notify",
  "dev",
];

/** Which shelf a catalog card goes on; null keeps it off the store. */
export function marketCategory(key: string): MarketCategory | null {
  if (key.startsWith("tel_")) return "telephony";
  switch (key) {
    case "amocrm":
    case "amocrmImport":
    case "bitrix24":
      return "crm";
    case "telegramLink":
    case "telegramApp":
    case "instagram":
      return "messengers";
    case "payments":
    case "didox":
      return "payments";
    case "sms":
    case "email":
      return "notify";
    case "webhook":
    case "apiKeys":
    case "outgoingWebhooks":
      return "dev";
    default:
      return null;
  }
}

/** Installed = the service is connected (a page without a state never is). */
export const isInstalled = (item: MarketItem) => !!item.status?.ok;

export type Shelf = "all" | "installed" | MarketCategory;

/** Search and shelf filter, kept pure for the unit test. */
export function filterMarket<T extends MarketItem>(
  items: T[],
  shelf: Shelf,
  query: string,
  text: (item: T) => string,
): T[] {
  const q = query.trim().toLowerCase();
  return items.filter(
    (it) =>
      (shelf === "all" ||
        (shelf === "installed" ? isInstalled(it) : marketCategory(it.key) === shelf)) &&
      (!q || text(it).toLowerCase().includes(q)),
  );
}
