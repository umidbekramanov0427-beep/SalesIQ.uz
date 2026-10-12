import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Loader2, Mail, Phone, Plus, Search, Send, Contact } from "lucide-react";
import {
  PageHeader,
  SectionCard,
  StatCard,
  ExportButton,
  ChannelActionButton,
} from "@/components/layout/Primitives";
import { usePhone } from "@/components/phone/PhoneProvider";
import {
  DIRECTORY_PAGE_SIZE,
  fetchAllContactsForExport,
  useContactsPage,
  type ContactView,
} from "@/hooks/use-crm-data";
import { DirectoryPager } from "@/components/crm/DirectoryPager";
import { NewContactDialog } from "@/components/crm/quick-create";
import { useI18n } from "@/lib/i18n";
import { FilterSearchInput } from "@/components/filters/FilterSelect";
import { DateRangeFilter, type DateFilterValue } from "@/components/leaderboard/DateRangeFilter";

// Strips everything but digits (and a leading +) so a raw phone number
// typed with spaces/dashes/parens still works as a wa.me deep link.
function ContactActionRow({ contact }: { contact: ContactView }) {
  const { t } = useI18n();
  const phone = usePhone();
  return (
    <div className="mt-4 flex items-center gap-1.5">
      <ChannelActionButton
        icon={Phone}
        label={t("lead.actionCall")}
        tone="call"
        disabled={!contact.phone}
        loading={phone.calling}
        onClick={() => {
          if (contact.phone)
            phone.call(contact.phone, { contactId: contact.id, name: contact.name });
        }}
      />
      {contact.telegram ? (
        <ChannelActionButton
          icon={Send}
          label={t("lead.actionTelegram")}
          tone="telegram"
          href={`https://t.me/${contact.telegram.replace(/^@/, "")}`}
        />
      ) : (
        <ChannelActionButton
          icon={Send}
          label={t("lead.actionTelegram")}
          tone="telegram"
          disabled
        />
      )}
      {contact.email ? (
        <ChannelActionButton
          icon={Mail}
          label={t("lead.actionEmail")}
          tone="email"
          href={`mailto:${contact.email}`}
        />
      ) : (
        <ChannelActionButton icon={Mail} label={t("lead.actionEmail")} tone="email" disabled />
      )}
    </div>
  );
}

export const Route = createFileRoute("/crm/contacts")({
  head: () => ({
    meta: [
      { title: "Contacts — SalesIQ CRM" },
      {
        name: "description",
        content:
          "Every decision maker with position, birthday, phone, email, Telegram, deals and tasks.",
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
  const { rows, total, isLoading, isFetching, stats } = useContactsPage(filters);
  const toExportRow = (c: ContactView) => ({
    Name: c.name,
    Position: c.position,
    Company: c.company,
    Phone: c.phone,
    Email: c.email,
    Telegram: c.telegram,
    Birthday: c.birthday,
  });

  return (
    <>
      <PageHeader
        icon={Contact}
        tone="emerald"
        title={t("contacts.title")}
        description={t("contacts.desc")}
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
              filename="contacts"
              rows={rows.map(toExportRow)}
              getRows={async () => (await fetchAllContactsForExport(filters)).map(toExportRow)}
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
          value={stats ? stats.total.toLocaleString() : "…"}
          hint={t("contacts.acrossCompanies", { count: stats?.companies ?? 0 })}
          info={t("contacts.totalContactsInfo")}
          tone="hero"
        />
        <StatCard
          label={t("contacts.withEmail")}
          value={stats ? stats.withEmail.toLocaleString() : "…"}
          info={t("contacts.withEmailInfo")}
        />
        <StatCard
          label={t("contacts.withPhone")}
          value={stats ? stats.withPhone.toLocaleString() : "…"}
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
                <ContactActionRow contact={c} />
              </article>
            ))}
          </div>
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
