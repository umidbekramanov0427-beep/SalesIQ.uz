import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Globe, Loader2, Plus, Search, Building2 } from "lucide-react";
import {
  PageHeader,
  SectionCard,
  StatCard,
  Pill,
  ExportButton,
} from "@/components/layout/Primitives";
import { currency } from "@/lib/mock-data";
import { useCompaniesView } from "@/hooks/use-crm-data";
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
  const [query, setQuery] = useState("");
  const [dateFilter, setDateFilter] = useState<DateFilterValue>({
    from: null,
    to: null,
    label: t("lb.presetAll"),
  });
  const { rows: companies, isLoading } = useCompaniesView();

  const rows = useMemo(() => {
    const q = query.toLowerCase();
    return companies.filter((c) => {
      if (q && ![c.name, c.industry, c.city, c.owner].some((v) => v.toLowerCase().includes(q)))
        return false;
      if (dateFilter.from && new Date(c.createdAtRaw) < dateFilter.from) return false;
      if (dateFilter.to && new Date(c.createdAtRaw) > dateFilter.to) return false;
      return true;
    });
  }, [companies, query, dateFilter]);

  const enterpriseCount = companies.filter((c) => c.revenue >= 50_000_000).length;
  const avgContacts = companies.length
    ? (companies.reduce((s, c) => s + c.contacts, 0) / companies.length).toFixed(1)
    : "0";

  return (
    <>
      <PageHeader
        icon={Building2}
        tone="sky"
        title={t("companies.title")}
        description={t("companies.desc")}
        actions={
          <>
            <DateRangeFilter value={dateFilter} onChange={setDateFilter} />
            <ExportButton
              filename="companies"
              rows={rows.map((c) => ({
                Name: c.name,
                Industry: c.industry,
                Employees: c.employees,
                Revenue: c.revenue,
                City: c.city,
                Owner: c.owner,
                Contacts: c.contacts,
              }))}
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
          value={String(companies.length)}
          hint={t("companies.activeAccounts")}
          info={t("companies.countInfo")}
          tone="hero"
        />
        <StatCard
          label={t("companies.enterpriseAccounts")}
          value={String(enterpriseCount)}
          info={t("companies.enterpriseAccountsInfo")}
        />
        <StatCard
          label={t("companies.avgContacts")}
          value={avgContacts}
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
        </SectionCard>
      </div>
    </>
  );
}
