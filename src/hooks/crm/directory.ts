// Contacts and companies directories, one page at a time.
//
// These pages used to download every contact and company of the org and
// draw all of them: with 50,000 contacts the load test spent 7 s on the
// download and the tab then crashed drawing the cards. Now the database
// filters, searches and counts, and the browser gets one page of rows plus
// the headline numbers.
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { formatDate, initialsOf } from "@/lib/utils";
import { fetchAllPages, RESOURCE_PAGE_SIZE } from "./core";
import { useVisibleOwnerIds, type CompanyView, type ContactView } from "./crm-views";

export const DIRECTORY_PAGE_SIZE = 60;

export type DirectoryFilters = {
  page: number;
  search: string;
  from: Date | null;
  to: Date | null;
};

// PostgREST's or() filter separates conditions with commas and groups with
// parentheses, so a typed comma/paren would break it; % and _ are ILIKE
// wildcards.
function searchPattern(q: string): string | null {
  const term = q
    .trim()
    .replace(/[,()\\%_*]/g, " ")
    .trim();
  return term ? `*${term}*` : null;
}

function inRange<Q extends { gte: (c: string, v: string) => Q; lte: (c: string, v: string) => Q }>(
  query: Q,
  f: DirectoryFilters,
): Q {
  let q = query;
  if (f.from) q = q.gte("created_at", f.from.toISOString());
  if (f.to) q = q.lte("created_at", f.to.toISOString());
  return q;
}

/* ------------------------------ Contacts ------------------------------ */

const CONTACT_COLUMNS =
  "id, full_name, position, company_id, phone, email, telegram, birthday, created_at, company:companies(name)";

type ContactListRow = {
  id: string;
  full_name: string;
  position: string | null;
  company_id: string | null;
  phone: string | null;
  email: string | null;
  telegram: string | null;
  birthday: string | null;
  created_at: string;
  company: { name: string } | null;
};

function contactsQuery(f: DirectoryFilters, columns: string, opts?: { head?: boolean }) {
  // The CRM's own contacts; amoCRM/Bitrix24's are for analytics only.
  let q = supabase
    .from("contacts")
    .select(columns, { count: "exact", head: opts?.head ?? false })
    .is("amocrm_id", null)
    .is("bitrix24_contact_id", null);
  q = inRange(q, f);
  const p = searchPattern(f.search);
  if (p) {
    q = q.or(
      `full_name.ilike.${p},phone.ilike.${p},email.ilike.${p},position.ilike.${p},telegram.ilike.${p}`,
    );
  }
  return q;
}

function toContactView(ct: ContactListRow, leadCount: number): ContactView {
  return {
    id: ct.id,
    name: ct.full_name,
    initials: initialsOf(ct.full_name),
    position: ct.position ?? "",
    company: ct.company?.name ?? "",
    companyId: ct.company_id ?? "",
    phone: ct.phone ?? "",
    email: ct.email ?? "",
    telegram: ct.telegram ?? "",
    birthday: ct.birthday ? formatDate(ct.birthday) : "—",
    tasks: leadCount,
    createdAtRaw: ct.created_at,
  };
}

/** How many of each contact's leads this user may see (reps: their own). */
async function leadCountsFor(
  contactIds: string[],
  visibleOwnerIds: Set<string> | null,
): Promise<Map<string, number>> {
  const counts = new Map<string, number>();
  if (contactIds.length === 0) return counts;
  const { data, error } = await supabase
    .from("leads")
    .select("contact_id, owner_id")
    .in("contact_id", contactIds)
    .is("amocrm_id", null)
    .is("bitrix24_deal_id", null)
    .limit(5000);
  if (error) throw error;
  for (const l of data ?? []) {
    if (!l.contact_id) continue;
    if (visibleOwnerIds && !(l.owner_id && visibleOwnerIds.has(l.owner_id))) continue;
    counts.set(l.contact_id, (counts.get(l.contact_id) ?? 0) + 1);
  }
  return counts;
}

export function useContactsPage(f: DirectoryFilters) {
  const { user } = useAuth();
  const visibleOwnerIds = useVisibleOwnerIds();
  const ownerKey = visibleOwnerIds ? [...visibleOwnerIds].sort().join(",") : null;
  const fromIso = f.from?.toISOString() ?? null;
  const toIso = f.to?.toISOString() ?? null;
  const list = useQuery({
    queryKey: [
      "contacts",
      "page",
      user?.organizationId,
      f.page,
      f.search,
      fromIso,
      toIso,
      ownerKey,
    ],
    enabled: !!user?.organizationId,
    placeholderData: keepPreviousData,
    queryFn: async () => {
      const start = f.page * DIRECTORY_PAGE_SIZE;
      const { data, count, error } = await contactsQuery(f, CONTACT_COLUMNS)
        .order("created_at", { ascending: false })
        .order("id", { ascending: true })
        .range(start, start + DIRECTORY_PAGE_SIZE - 1);
      if (error) throw error;
      const rows = (data ?? []) as unknown as ContactListRow[];
      const counts = await leadCountsFor(
        rows.map((r) => r.id),
        visibleOwnerIds,
      );
      return { rows: rows.map((r) => toContactView(r, counts.get(r.id) ?? 0)), total: count ?? 0 };
    },
  });
  // Headline numbers for the same filters (search aside): counted by the
  // database, nothing downloaded.
  const stats = useQuery({
    queryKey: ["contacts", "stats", user?.organizationId, fromIso, toIso],
    enabled: !!user?.organizationId,
    queryFn: async () => {
      const base = { ...f, search: "" };
      const [all, withEmail, withPhone, companies] = await Promise.all([
        contactsQuery(base, "id", { head: true }),
        contactsQuery(base, "id", { head: true }).not("email", "is", null).neq("email", ""),
        contactsQuery(base, "id", { head: true }).not("phone", "is", null).neq("phone", ""),
        supabase
          .from("companies")
          .select("id", { count: "exact", head: true })
          .is("amocrm_id", null),
      ]);
      for (const r of [all, withEmail, withPhone, companies]) if (r.error) throw r.error;
      return {
        total: all.count ?? 0,
        withEmail: withEmail.count ?? 0,
        withPhone: withPhone.count ?? 0,
        companies: companies.count ?? 0,
      };
    },
  });
  return {
    rows: list.data?.rows ?? [],
    total: list.data?.total ?? 0,
    isLoading: list.isLoading,
    isFetching: list.isFetching,
    stats: stats.data,
  };
}

/** Every contact matching the filters -- only when the user exports. */
export async function fetchAllContactsForExport(f: DirectoryFilters): Promise<ContactView[]> {
  const rows = await fetchAllPages(async (offset) => {
    const { data, error } = await contactsQuery(f, CONTACT_COLUMNS)
      .order("created_at", { ascending: false })
      .order("id", { ascending: true })
      .range(offset, offset + RESOURCE_PAGE_SIZE - 1);
    if (error) throw error;
    return (data ?? []) as unknown as ContactListRow[];
  });
  return rows.map((r) => toContactView(r, 0));
}

/* ------------------------------ Companies ----------------------------- */

const COMPANY_COLUMNS =
  "id, name, industry, employees_range, annual_revenue, website, city, owner_id, created_at, owner:profiles!companies_owner_id_fkey(full_name, email)";

type CompanyListRow = {
  id: string;
  name: string;
  industry: string | null;
  employees_range: string | null;
  annual_revenue: number | null;
  website: string | null;
  city: string | null;
  owner_id: string | null;
  created_at: string;
  owner: { full_name: string | null; email: string } | null;
};

// "Yirik mijozlar": an annual revenue of 50M or more.
export const ENTERPRISE_REVENUE = 50_000_000;

function companiesQuery(f: DirectoryFilters, columns: string, opts?: { head?: boolean }) {
  // The CRM's own companies; amoCRM's are for analytics only.
  let q = supabase
    .from("companies")
    .select(columns, { count: "exact", head: opts?.head ?? false })
    .is("amocrm_id", null);
  q = inRange(q, f);
  const p = searchPattern(f.search);
  if (p) q = q.or(`name.ilike.${p},industry.ilike.${p},city.ilike.${p},website.ilike.${p}`);
  return q;
}

function toCompanyView(c: CompanyListRow, contacts: number): CompanyView {
  return {
    id: c.id,
    name: c.name,
    initials: initialsOf(c.name),
    industry: c.industry ?? "",
    employees: c.employees_range ?? "",
    revenue: Number(c.annual_revenue ?? 0),
    website: c.website ?? "",
    city: c.city ?? "",
    owner: c.owner ? c.owner.full_name || c.owner.email : "Unassigned",
    contacts,
    createdAtRaw: c.created_at,
  };
}

async function contactCountsFor(companyIds: string[]): Promise<Map<string, number>> {
  const counts = new Map<string, number>();
  if (companyIds.length === 0) return counts;
  const { data, error } = await supabase
    .from("contacts")
    .select("company_id")
    .in("company_id", companyIds)
    .limit(10000);
  if (error) throw error;
  for (const r of data ?? []) {
    if (r.company_id) counts.set(r.company_id, (counts.get(r.company_id) ?? 0) + 1);
  }
  return counts;
}

export function useCompaniesPage(f: DirectoryFilters) {
  const { user } = useAuth();
  const fromIso = f.from?.toISOString() ?? null;
  const toIso = f.to?.toISOString() ?? null;
  const list = useQuery({
    queryKey: ["companies", "page", user?.organizationId, f.page, f.search, fromIso, toIso],
    enabled: !!user?.organizationId,
    placeholderData: keepPreviousData,
    queryFn: async () => {
      const start = f.page * DIRECTORY_PAGE_SIZE;
      const { data, count, error } = await companiesQuery(f, COMPANY_COLUMNS)
        .order("created_at", { ascending: false })
        .order("id", { ascending: true })
        .range(start, start + DIRECTORY_PAGE_SIZE - 1);
      if (error) throw error;
      const rows = (data ?? []) as unknown as CompanyListRow[];
      const counts = await contactCountsFor(rows.map((r) => r.id));
      return { rows: rows.map((r) => toCompanyView(r, counts.get(r.id) ?? 0)), total: count ?? 0 };
    },
  });
  const stats = useQuery({
    queryKey: ["companies", "stats", user?.organizationId, fromIso, toIso],
    enabled: !!user?.organizationId,
    queryFn: async () => {
      const base = { ...f, search: "" };
      const [all, enterprise, linkedContacts] = await Promise.all([
        companiesQuery(base, "id", { head: true }),
        companiesQuery(base, "id", { head: true }).gte("annual_revenue", ENTERPRISE_REVENUE),
        supabase
          .from("contacts")
          .select("id", { count: "exact", head: true })
          .not("company_id", "is", null),
      ]);
      for (const r of [all, enterprise, linkedContacts]) if (r.error) throw r.error;
      const total = all.count ?? 0;
      return {
        total,
        enterprise: enterprise.count ?? 0,
        avgContacts: total ? ((linkedContacts.count ?? 0) / total).toFixed(1) : "0",
      };
    },
  });
  return {
    rows: list.data?.rows ?? [],
    total: list.data?.total ?? 0,
    isLoading: list.isLoading,
    isFetching: list.isFetching,
    stats: stats.data,
  };
}

export async function fetchAllCompaniesForExport(f: DirectoryFilters): Promise<CompanyView[]> {
  const rows = await fetchAllPages(async (offset) => {
    const { data, error } = await companiesQuery(f, COMPANY_COLUMNS)
      .order("created_at", { ascending: false })
      .order("id", { ascending: true })
      .range(offset, offset + RESOURCE_PAGE_SIZE - 1);
    if (error) throw error;
    return (data ?? []) as unknown as CompanyListRow[];
  });
  return rows.map((r) => toCompanyView(r, 0));
}
