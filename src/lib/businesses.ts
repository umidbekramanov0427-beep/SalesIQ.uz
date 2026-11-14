// Bizneslar (the logo bar → «Biznes»): the shapes shared by /businesses
// and the switcher.

/** How many businesses one person may have. */
export const MAX_BUSINESSES = 10;

export type BusinessItem = {
  id: string;
  name: string;
  subdomain: string | null;
  plan: string | null;
  logo: string | null;
  role: string;
};

export type BusinessesState = {
  /** False until the business_memberships migration has run. */
  ready: boolean;
  currentId: string;
  /** Company admins may add a business. */
  canAdd: boolean;
  max: number;
  items: BusinessItem[];
};

/** Two letters for a business without a logo. */
export function businessInitials(name: string): string {
  const words = name
    .split(/\s+/)
    .filter((w) => /^[\p{L}\p{N}]/u.test(w))
    .slice(0, 2);
  const s = words.map((w) => w[0]!.toUpperCase()).join("");
  return s || "?";
}
