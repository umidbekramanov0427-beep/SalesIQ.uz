import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Loader2, Mail, MessageCircle, Phone, Plus, Search, Send } from "lucide-react";
import { PageHeader, SectionCard, StatCard, ExportButton } from "@/components/layout/Primitives";
import { useContactsView } from "@/hooks/use-crm-data";
import { NewContactDialog } from "@/components/crm/quick-create";
import { useI18n } from "@/lib/i18n";
import { FilterSearchInput } from "@/components/filters/FilterSelect";
import { DateRangeFilter, type DateFilterValue } from "@/components/leaderboard/DateRangeFilter";

export const Route = createFileRoute("/crm/contacts")({
  head: () => ({
    meta: [
      { title: "Contacts — SalesIQ CRM" },
      {
        name: "description",
        content:
          "Every decision maker with position, birthday, phone, email, Telegram, WhatsApp, deals and tasks.",
      },
      { property: "og:title", content: "Contacts — SalesIQ CRM" },
      {
        property: "og:description",
        content: "People directory linked to companies, deals and tasks.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ContactsPage,
});

function ContactsPage() {
  const { t } = useI18n();
  const [query, setQuery] = useState("");
  const [dateFilter, setDateFilter] = useState<DateFilterValue>({
    from: null,
    to: null,
    label: t("lb.presetAll"),
  });
  const { rows: contacts, isLoading } = useContactsView();

  const rows = useMemo(() => {
    const q = query.toLowerCase();
    return contacts.filter((c) => {
      if (q && ![c.name, c.position, c.company, c.email].some((v) => v.toLowerCase().includes(q)))
        return false;
      if (dateFilter.from && new Date(c.createdAtRaw) < dateFilter.from) return false;
      if (dateFilter.to && new Date(c.createdAtRaw) > dateFilter.to) return false;
      return true;
    });
  }, [contacts, query, dateFilter]);

  const companiesCount = new Set(contacts.map((c) => c.companyId).filter(Boolean)).size;

  return (
    <>
      <PageHeader
        title={t("contacts.title")}
        description={t("contacts.desc")}
        actions={
          <>
            <DateRangeFilter value={dateFilter} onChange={setDateFilter} />
            <ExportButton
              filename="contacts"
              rows={rows.map((c) => ({
                Name: c.name,
                Position: c.position,
                Company: c.company,
                Phone: c.phone,
                Email: c.email,
                Telegram: c.telegram,
                WhatsApp: c.whatsapp,
                Birthday: c.birthday,
              }))}
            />
            <NewContactDialog
              trigger={
                <button className="inline-flex h-10 items-center gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground hover:opacity-90">
                  <Plus className="h-4 w-4" /> {t("contacts.new")}
                </button>
              }
            />
          </>
        }
      />

      <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
        <StatCard
          label={t("contacts.totalContacts")}
          value={String(contacts.length)}
          hint={t("contacts.acrossCompanies", { count: companiesCount })}
          info={t("contacts.totalContactsInfo")}
          tone="hero"
        />
        <StatCard
          label={t("contacts.withEmail")}
          value={String(contacts.filter((c) => c.email).length)}
          info={t("contacts.withEmailInfo")}
        />
        <StatCard
          label={t("contacts.withPhone")}
          value={String(contacts.filter((c) => c.phone).length)}
          info={t("contacts.withPhoneInfo")}
        />
      </div>

      <div className="mt-6">
        <SectionCard
          title={t("contacts.directory")}
          actions={
            <FilterSearchInput
              icon={Search}
              label={t("leadFilter.searchLabel")}
              value={query}
              onChange={setQuery}
              placeholder={t("contacts.searchPlaceholder")}
            />
          }
        >
          {isLoading && (
            <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> {t("contacts.loading")}
            </div>
          )}
          {!isLoading && rows.length === 0 && (
            <p className="py-10 text-center text-sm text-muted-foreground">{t("contacts.empty")}</p>
          )}
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {rows.map((c) => (
              <article key={c.id} className="rounded-2xl border border-border bg-surface p-5">
                <div className="flex items-center gap-3">
                  <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-mint text-sm font-semibold text-mint-foreground">
                    {c.initials}
                  </span>
                  <div className="min-w-0">
                    <p className="truncate font-medium text-foreground">{c.name}</p>
                    <p className="truncate text-xs text-subtle">
                      {c.position || "—"} · {c.company || "—"}
                    </p>
                  </div>
                </div>
                <dl className="mt-4 space-y-1.5 text-xs">
                  <div className="flex justify-between">
                    <dt className="text-subtle">{t("contacts.phone")}</dt>
                    <dd className="font-medium">{c.phone || "—"}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-subtle">{t("contacts.email")}</dt>
                    <dd className="max-w-[150px] truncate font-medium">{c.email || "—"}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-subtle">{t("contacts.telegram")}</dt>
                    <dd className="font-medium">{c.telegram || "—"}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-subtle">{t("contacts.birthday")}</dt>
                    <dd className="font-medium">{c.birthday}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-subtle">{t("contacts.tasksCount")}</dt>
                    <dd className="font-medium">{c.tasks}</dd>
                  </div>
                </dl>
                <div className="mt-4 flex items-center gap-2">
                  {[Phone, MessageCircle, Send, Mail].map((Icon, i) => (
                    <button
                      key={i}
                      className="rounded-xl border border-border bg-background p-2 text-muted-foreground hover:bg-accent"
                      aria-label={t("contacts.action")}
                    >
                      <Icon className="h-4 w-4" />
                    </button>
                  ))}
                </div>
              </article>
            ))}
          </div>
        </SectionCard>
      </div>
    </>
  );
}
