import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Globe, Loader2, Plus, Search, Building2 } from "lucide-react";
import {
  PageHeader,
  SectionCard,
  StatCard,
  Pill,
  ExportButton,
} from "@/components/layout/Primitives";
import { useCurrency } from "@/lib/currency";
import {
  DIRECTORY_PAGE_SIZE,
  fetchAllCompaniesForExport,
  useCompaniesPage,
  type CompanyView,
} from "@/hooks/use-crm-data";
import { DirectoryPager } from "@/components/crm/DirectoryPager";
import { NewCompanyDialog } from "@/components/crm/quick-create";
import { useI18n } from "@/lib/i18n";
import { FilterSearchInput } from "@/components/filters/FilterSelect";
import { DateRangeFilter, type DateFilterValue } from "@/components/leaderboard/DateRangeFilter";

export const Route = createFileRoute("/crm/companies")({
  head: () => ({
    meta: [
      { title: "Companies — SalesIQ CRM" },
      {
        name: "description",
        content:
          "Company profiles with industry, headcount, revenue, owner, contacts, deals, activities and files.",
      },
      { property: "og:title", content: "Companies — SalesIQ CRM" },
      {
        property: "og:description",
        content: "Account profiles linked to contacts, deals and invoices.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: CompaniesPage,
});

function CompaniesPage() {
  const { t } = useI18n();
  const { format: currency } = useCurrency();
  const [query, setQuery] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);
  const [dateFilter, setDateFilter] = useState<DateFilterValue>({
    from: null,
    to: null,
    label: t("lb.presetAll"),
  });
  // The database searches; a short pause after typing, then back to page 1.
  useEffect(() => {
    const id = setTimeout(() => {
      setSearch(query);
      setPage(0);
    }, 350);
    return () => clearTimeout(id);
  }, [query]);
  const filters = { page, search, from: dateFilter.from, to: dateFilter.to };
  const { rows, total, isLoading, isFetching, stats } = useCompaniesPage(filters);
  const toExportRow = (c: CompanyView) => ({
    Name: c.name,
    Industry: c.industry,
    Employees: c.employees,
    Revenue: c.revenue,
    City: c.city,
    Owner: c.owner,
    Contacts: c.contacts,
  });

  return (
    <>
      <PageHeader
        icon={Building2}
        tone="sky"
        title={t("companies.title")}
        description={t("companies.desc")}
        actions={
          <>
            <DateRangeFilter
              value={dateFilter}
              onChange={(v) => {
                setDateFilter(v);
                setPage(0);
              }}
            />
            <ExportButton
              filename="companies"
              rows={rows.map(toExportRow)}
              getRows={async () => (await fetchAllCompaniesForExport(filters)).map(toExportRow)}
            />
            <NewCompanyDialog
              trigger={
                <button className="inline-flex h-10 items-center gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground hover:opacity-90">
                  <Plus className="h-4 w-4" /> {t("companies.new")}
                </button>
              }
            />
          </>
        }
      />

      <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
        <StatCard
          label={t("companies.count")}
          value={stats ? stats.total.toLocaleString() : "…"}
          hint={t("companies.activeAccounts")}
          info={t("companies.countInfo")}
          tone="hero"
        />
        <StatCard
          label={t("companies.enterpriseAccounts")}
          value={stats ? stats.enterprise.toLocaleString() : "…"}
          info={t("companies.enterpriseAccountsInfo")}
        />
        <StatCard
          label={t("companies.avgContacts")}
          value={stats ? stats.avgContacts : "…"}
          info={t("companies.avgContactsInfo")}
        />
      </div>

      <div className="mt-6">
        <SectionCard
          title={t("companies.list")}
          actions={
            <FilterSearchInput
              icon={Search}
              label={t("leadFilter.searchLabel")}
              value={query}
              onChange={setQuery}
              placeholder={t("companies.searchPlaceholder")}
            />
          }
        >
          {isLoading && (
            <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> {t("companies.loading")}
            </div>
          )}
          {!isLoading && rows.length === 0 && (
            <p className="py-10 text-center text-sm text-muted-foreground">
              {t("companies.empty")}
            </p>
          )}
          {rows.length > 0 && (
            <div className="-m-4 overflow-x-auto">
              <table className="w-full min-w-[760px] text-xs sm:min-w-[1000px] sm:text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-[10px] uppercase tracking-wide text-subtle sm:text-xs">
                    {[
                      t("companies.colCompany"),
                      t("companies.colIndustry"),
                      t("companies.colEmployees"),
                      t("companies.colRevenue"),
                      t("companies.colOwner"),
                      t("companies.colContacts"),
                    ].map((h) => (
                      <th key={h} className="px-3 py-2 font-medium sm:px-6 sm:py-3">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((c) => (
                    <tr
                      key={c.id}
                      className="border-b border-border last:border-0 transition-colors hover:bg-surface"
                    >
                      <td className="px-3 py-2.5 sm:px-6 sm:py-4">
                        <div className="flex items-center gap-2 sm:gap-3">
                          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-mint text-[10px] font-semibold text-mint-foreground sm:h-9 sm:w-9 sm:rounded-xl sm:text-xs">
                            {c.initials}
                          </span>
                          <div className="min-w-0">
                            <p className="truncate font-medium text-foreground">{c.name}</p>
                            <p className="flex items-center gap-1 text-[10px] text-subtle sm:text-xs">
                              <Globe className="h-2.5 w-2.5 shrink-0 sm:h-3 sm:w-3" />{" "}
                              {c.website || "—"} · {c.city || "—"}
                            </p>
                          </div>
                        </div>
                      </td>
                      <td className="px-3 py-2.5 text-muted-foreground sm:px-6 sm:py-4">
                        {c.industry || "—"}
                      </td>
                      <td className="px-3 py-2.5 text-muted-foreground sm:px-6 sm:py-4">
                        {c.employees || "—"}
                      </td>
                      <td className="px-3 py-2.5 text-muted-foreground sm:px-6 sm:py-4">
                        {currency(c.revenue)}
                      </td>
                      <td className="px-3 py-2.5 text-muted-foreground sm:px-6 sm:py-4">
                        {c.owner}
                      </td>
                      <td className="px-3 py-2.5 sm:px-6 sm:py-4">
                        <Pill>{c.contacts}</Pill>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <DirectoryPager
            page={page}
            pageSize={DIRECTORY_PAGE_SIZE}
            total={total}
            busy={isFetching}
            onPage={setPage}
          />
        </SectionCard>
      </div>
    </>
  );
}
