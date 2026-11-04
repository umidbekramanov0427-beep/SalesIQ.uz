import { useState } from "react";
import { Link } from "@tanstack/react-router";
import {
  Building2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Download,
  FileText,
  Loader2,
  Search,
  UserRound,
} from "lucide-react";
import {
  DIRECTORY_PAGE_SIZE,
  fetchLeadFileDownloadUrl,
  useCompaniesPage,
  useContactDeals,
  useContactsPage,
  useOrgFilesPage,
} from "@/hooks/use-crm-data";
import { useCurrency } from "@/lib/currency";
import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";

// Voronkalar → Kontaktlar / Kompaniyalar / Fayllar (5CRM "Sotuv"): one row
// per person, company or file. A contact with several deals is normal, not
// a duplicate -- open the row to see them all.

const field =
  "h-9 w-full rounded-lg border border-border bg-background pl-8 pr-3 text-[13px] outline-none placeholder:text-subtle focus:border-primary sm:w-64";

function Pager({
  page,
  total,
  onPage,
}: {
  page: number;
  total: number;
  onPage: (p: number) => void;
}) {
  const { t } = useI18n();
  const pages = Math.max(1, Math.ceil(total / DIRECTORY_PAGE_SIZE));
  if (pages <= 1) return null;
  return (
    <div className="flex items-center justify-end gap-2 border-t border-border px-4 py-2.5 text-[12.5px] text-muted-foreground">
      <span>{t("dir.page", { p: page + 1, n: pages })}</span>
      <button
        type="button"
        disabled={page === 0}
        onClick={() => onPage(page - 1)}
        className="grid h-7 w-7 place-items-center rounded-md border border-border disabled:opacity-40"
        aria-label={t("dir.prev")}
      >
        <ChevronLeft className="h-4 w-4" />
      </button>
      <button
        type="button"
        disabled={page + 1 >= pages}
        onClick={() => onPage(page + 1)}
        className="grid h-7 w-7 place-items-center rounded-md border border-border disabled:opacity-40"
        aria-label={t("dir.next")}
      >
        <ChevronRight className="h-4 w-4" />
      </button>
    </div>
  );
}

function SearchBox({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const { t } = useI18n();
  return (
    <label className="relative">
      <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-subtle" />
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={t("dir.search")}
        className={field}
      />
    </label>
  );
}

const th = "px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-[0.06em] text-subtle";

/* ------------------------------- Contacts ------------------------------- */

export function ContactsTab() {
  const { t } = useI18n();
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);
  const [deals, setDeals] = useState<"" | "multi" | "none">("");
  const [openId, setOpenId] = useState<string | null>(null);
  const { rows, total, isLoading } = useContactsPage({
    page,
    search,
    from: null,
    to: null,
    deals,
  });
  const presets: { key: "" | "multi" | "none"; label: string }[] = [
    { key: "", label: t("dir.c.all") },
    { key: "multi", label: t("dir.c.multi") },
    { key: "none", label: t("dir.c.none") },
  ];
  return (
    <section className="rounded-xl border border-border bg-card">
      <div className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-3">
        <div className="flex rounded-lg border border-border bg-background p-0.5">
          {presets.map((p) => (
            <button
              key={p.key || "all"}
              type="button"
              onClick={() => {
                setDeals(p.key);
                setPage(0);
              }}
              className={cn(
                "h-7 rounded-md px-3 text-[12px] font-semibold transition-colors",
                deals === p.key
                  ? "bg-primary/12 text-primary"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {p.label}
            </button>
          ))}
        </div>
        <span className="text-[12.5px] text-muted-foreground">{t("dir.count", { n: total })}</span>
        <span className="flex-1" />
        <SearchBox
          value={search}
          onChange={(v) => {
            setSearch(v);
            setPage(0);
          }}
        />
      </div>
      {isLoading ? (
        <div className="grid place-items-center p-10">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : rows.length === 0 ? (
        <p className="px-4 py-10 text-center text-[13px] text-muted-foreground">{t("dir.empty")}</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-[13px]">
            <thead className="border-b border-border">
              <tr>
                <th className={th}>{t("dir.c.name")}</th>
                <th className={th}>{t("dir.c.phone")}</th>
                <th className={th}>{t("dir.c.company")}</th>
                <th className={cn(th, "text-right")}>{t("dir.c.deals")}</th>
                <th className={cn(th, "text-right")}>{t("dir.created")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/70">
              {rows.map((c) => (
                <ContactRow
                  key={c.id}
                  c={c}
                  open={openId === c.id}
                  onToggle={() => setOpenId(openId === c.id ? null : c.id)}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}
      <Pager page={page} total={total} onPage={setPage} />
    </section>
  );
}

function ContactRow({
  c,
  open,
  onToggle,
}: {
  c: ReturnType<typeof useContactsPage>["rows"][number];
  open: boolean;
  onToggle: () => void;
}) {
  const { t } = useI18n();
  const { format } = useCurrency();
  const { data: deals = [], isLoading } = useContactDeals(open ? c.id : null);
  return (
    <>
      <tr onClick={onToggle} className="cursor-pointer transition-colors hover:bg-muted/40">
        <td className="px-3 py-2.5">
          <span className="flex items-center gap-2.5">
            <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-primary/12 text-[11px] font-bold text-primary">
              {c.initials}
            </span>
            <span className="min-w-0">
              <span className="block truncate font-semibold text-foreground">{c.name}</span>
              {c.position && (
                <span className="block truncate text-[12px] text-muted-foreground">
                  {c.position}
                </span>
              )}
            </span>
          </span>
        </td>
        <td className="px-3 py-2.5 font-mono text-[12.5px] tabular-nums text-foreground">
          {c.phone || "—"}
        </td>
        <td className="px-3 py-2.5 text-muted-foreground">{c.company || "—"}</td>
        <td className="px-3 py-2.5 text-right">
          <span
            className={cn(
              "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[12px] font-semibold tabular-nums",
              c.tasks >= 2
                ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"
                : c.tasks === 0
                  ? "bg-muted text-muted-foreground"
                  : "bg-primary/10 text-primary",
            )}
          >
            {c.tasks}
            <ChevronDown className={cn("h-3 w-3 transition-transform", open && "rotate-180")} />
          </span>
        </td>
        <td className="px-3 py-2.5 text-right text-[12px] tabular-nums text-subtle">
          {new Date(c.createdAtRaw).toLocaleDateString("ru-RU")}
        </td>
      </tr>
      {open && (
        <tr>
          <td colSpan={5} className="bg-muted/30 px-6 py-3">
            {isLoading ? (
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            ) : deals.length === 0 ? (
              <p className="text-[12.5px] text-muted-foreground">{t("dir.c.noDeals")}</p>
            ) : (
              <ul className="space-y-1.5">
                {deals.map((d) => (
                  <li key={d.id} className="flex items-center gap-3 text-[13px]">
                    <Link
                      to="/funnels"
                      search={{ funnel: d.funnel || "Direct Sales" }}
                      className="min-w-0 flex-1 truncate font-semibold text-primary hover:underline"
                    >
                      {d.name}
                    </Link>
                    <span className="truncate text-muted-foreground">
                      {d.funnel || "—"} · {d.stage?.name ?? "—"}
                    </span>
                    <span
                      className={cn(
                        "shrink-0 tabular-nums",
                        d.stage?.is_won
                          ? "text-emerald-600 dark:text-emerald-400"
                          : "text-foreground",
                      )}
                    >
                      {format(d.expected_revenue || 0)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </td>
        </tr>
      )}
    </>
  );
}

/* ------------------------------ Companies ------------------------------ */

export function CompaniesTab() {
  const { t } = useI18n();
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);
  const { rows, total, isLoading } = useCompaniesPage({ page, search, from: null, to: null });
  return (
    <section className="rounded-xl border border-border bg-card">
      <div className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-3">
        <span className="text-[12.5px] text-muted-foreground">{t("dir.count", { n: total })}</span>
        <span className="flex-1" />
        <SearchBox
          value={search}
          onChange={(v) => {
            setSearch(v);
            setPage(0);
          }}
        />
      </div>
      {isLoading ? (
        <div className="grid place-items-center p-10">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : rows.length === 0 ? (
        <p className="px-4 py-10 text-center text-[13px] text-muted-foreground">{t("dir.empty")}</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-[13px]">
            <thead className="border-b border-border">
              <tr>
                <th className={th}>{t("dir.co.name")}</th>
                <th className={th}>{t("dir.co.city")}</th>
                <th className={cn(th, "text-right")}>{t("dir.co.contacts")}</th>
                <th className={th}>{t("dir.co.owner")}</th>
                <th className={cn(th, "text-right")}>{t("dir.created")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/70">
              {rows.map((c) => (
                <tr key={c.id}>
                  <td className="px-3 py-2.5">
                    <span className="flex items-center gap-2.5">
                      <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-amber-500/12 text-amber-600 dark:text-amber-300">
                        <Building2 className="h-3.5 w-3.5" />
                      </span>
                      <span className="truncate font-semibold text-foreground">{c.name}</span>
                    </span>
                  </td>
                  <td className="px-3 py-2.5 text-muted-foreground">{c.city || "—"}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums text-foreground">
                    {c.contacts}
                  </td>
                  <td className="px-3 py-2.5 text-muted-foreground">{c.owner}</td>
                  <td className="px-3 py-2.5 text-right text-[12px] tabular-nums text-subtle">
                    {new Date(c.createdAtRaw).toLocaleDateString("ru-RU")}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <Pager page={page} total={total} onPage={setPage} />
    </section>
  );
}

/* -------------------------------- Files -------------------------------- */

export function FilesTab() {
  const { t } = useI18n();
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);
  const { data, isLoading } = useOrgFilesPage({ page, search });
  const rows = data?.rows ?? [];
  const size = (b: number) =>
    b >= 1_048_576 ? `${(b / 1_048_576).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1024))} KB`;
  return (
    <section className="rounded-xl border border-border bg-card">
      <div className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-3">
        <span className="text-[12.5px] text-muted-foreground">
          {t("dir.count", { n: data?.total ?? 0 })}
        </span>
        <span className="flex-1" />
        <SearchBox
          value={search}
          onChange={(v) => {
            setSearch(v);
            setPage(0);
          }}
        />
      </div>
      {isLoading ? (
        <div className="grid place-items-center p-10">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : rows.length === 0 ? (
        <p className="px-4 py-10 text-center text-[13px] text-muted-foreground">{t("dir.empty")}</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-[13px]">
            <thead className="border-b border-border">
              <tr>
                <th className={th}>{t("dir.f.name")}</th>
                <th className={th}>{t("dir.f.lead")}</th>
                <th className={th}>{t("dir.f.by")}</th>
                <th className={cn(th, "text-right")}>{t("dir.f.size")}</th>
                <th className={cn(th, "text-right")}>{t("dir.created")}</th>
                <th className={th} />
              </tr>
            </thead>
            <tbody className="divide-y divide-border/70">
              {rows.map((f) => (
                <tr key={f.id}>
                  <td className="px-3 py-2.5">
                    <span className="flex items-center gap-2.5">
                      <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-sky-500/12 text-sky-600 dark:text-sky-300">
                        <FileText className="h-3.5 w-3.5" />
                      </span>
                      <span className="truncate font-medium text-foreground">{f.name}</span>
                    </span>
                  </td>
                  <td className="px-3 py-2.5">
                    <span className="flex items-center gap-1.5 text-muted-foreground">
                      <UserRound className="h-3.5 w-3.5" />
                      <span className="truncate">{f.leadName}</span>
                    </span>
                  </td>
                  <td className="px-3 py-2.5 text-muted-foreground">{f.uploader}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums text-muted-foreground">
                    {size(f.size)}
                  </td>
                  <td className="px-3 py-2.5 text-right text-[12px] tabular-nums text-subtle">
                    {new Date(f.createdAt).toLocaleDateString("ru-RU")}
                  </td>
                  <td className="px-3 py-2.5 text-right">
                    <button
                      type="button"
                      aria-label={t("dir.f.download")}
                      onClick={async () => {
                        const url = await fetchLeadFileDownloadUrl(f.id).catch(() => null);
                        if (url) window.open(url, "_blank");
                      }}
                      className="grid h-7 w-7 place-items-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
                    >
                      <Download className="h-3.5 w-3.5" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <Pager page={page} total={data?.total ?? 0} onPage={setPage} />
    </section>
  );
}
