import { createFileRoute, Link } from "@tanstack/react-router";
import { useRef, useState } from "react";
import { ArrowLeft, FileUp, Loader2, UploadCloud, Upload, History } from "lucide-react";
import { toast } from "sonner";
import { PageHeader, SectionCard, Pill } from "@/components/layout/Primitives";
import { PermissionGate } from "@/components/PermissionGate";
import { useI18n } from "@/lib/i18n";
import { describeError } from "@/lib/utils";
import { parseCsv } from "@/lib/csv-parse";
import { useDataImports, useImportData, type DataImportRow } from "@/hooks/use-crm-data";

export const Route = createFileRoute("/onboarding/data-import")({
  head: () => ({
    meta: [
      { title: "Ma'lumot import qilish — SalesIQ" },
      {
        name: "description",
        content: "Import historical leads from a CSV export of a previous CRM or spreadsheet.",
      },
    ],
  }),
  component: DataImportPageGated,
});

function DataImportPageGated() {
  return (
    <PermissionGate action="Manage integrations">
      <DataImportPage />
    </PermissionGate>
  );
}

// Each field's own synonym list -- Bitrix24's and AmoCRM's default CSV
// exports both use Russian column headers ("Телефон", "Компания", ...) that
// never match a plain English substring check against field.key, so a
// Bitrix24/AmoCRM export used to always land unmapped and force manual
// column-picking despite dataImport.uploadDesc explicitly advertising
// support for both. Order matters: the first header that matches ANY
// synonym wins, so more specific synonyms should come first where two
// might otherwise collide (e.g. "company" before a generic "name" match).
const TARGET_FIELDS: {
  key: keyof DataImportRow;
  label: string;
  required?: boolean;
  synonyms: string[];
}[] = [
  {
    key: "name",
    label: "Ism / Lid nomi",
    required: true,
    synonyms: ["name", "title", "название", "имя", "ism", "nomi", "lid"],
  },
  {
    key: "phone",
    label: "Telefon",
    synonyms: ["phone", "телефон", "tel", "raqam"],
  },
  {
    key: "email",
    label: "Email",
    synonyms: ["email", "e-mail", "почта", "mail"],
  },
  {
    key: "companyName",
    label: "Kompaniya",
    synonyms: ["company", "компания", "kompaniya", "firma", "organization"],
  },
  {
    key: "source",
    label: "Manba",
    synonyms: ["source", "источник", "manba"],
  },
  {
    key: "budget",
    label: "Byudjet",
    synonyms: ["budget", "opportunity", "сумма", "бюджет", "byudjet", "summa", "amount"],
  },
];

function DataImportPage() {
  const { t } = useI18n();
  const { data: history } = useDataImports();
  const importData = useImportData();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [fileName, setFileName] = useState<string | null>(null);
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<string[][]>([]);
  const [mapping, setMapping] = useState<Partial<Record<keyof DataImportRow, string>>>({});

  async function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    const parsed = parseCsv(text);
    setFileName(file.name);
    setHeaders(parsed.headers);
    setRows(parsed.rows);

    // Best-effort auto-mapping by header name, so an admin using a
    // standard export (including Bitrix24's and AmoCRM's own Russian-
    // language CSV exports) usually doesn't have to map anything by hand.
    const auto: Partial<Record<keyof DataImportRow, string>> = {};
    const usedHeaders = new Set<string>();
    for (const field of TARGET_FIELDS) {
      const match = parsed.headers.find(
        (h) =>
          !usedHeaders.has(h) &&
          field.synonyms.some((syn) => h.toLowerCase().includes(syn.toLowerCase())),
      );
      if (match) {
        auto[field.key] = match;
        usedHeaders.add(match);
      }
    }
    setMapping(auto);
  }

  function buildRows(): DataImportRow[] {
    const nameCol = mapping.name;
    if (!nameCol) return [];
    const colIndex = (col: string | undefined) => (col ? headers.indexOf(col) : -1);
    const idx = {
      name: colIndex(mapping.name),
      phone: colIndex(mapping.phone),
      email: colIndex(mapping.email),
      companyName: colIndex(mapping.companyName),
      source: colIndex(mapping.source),
      budget: colIndex(mapping.budget),
    };
    return rows
      .map((r) => {
        const phone = idx.phone >= 0 ? r[idx.phone]?.trim() : undefined;
        const email = idx.email >= 0 ? r[idx.email]?.trim() : undefined;
        const companyName = idx.companyName >= 0 ? r[idx.companyName]?.trim() : undefined;
        const source = idx.source >= 0 ? r[idx.source]?.trim() : undefined;
        const budget =
          idx.budget >= 0 ? Number(r[idx.budget]?.replace(/[^\d.-]/g, "")) || undefined : undefined;
        return {
          name: idx.name >= 0 ? (r[idx.name]?.trim() ?? "") : "",
          ...(phone ? { phone } : {}),
          ...(email ? { email } : {}),
          ...(companyName ? { companyName } : {}),
          ...(source ? { source } : {}),
          ...(budget ? { budget } : {}),
        };
      })
      .filter((r) => r.name);
  }

  const mappedRows = buildRows();

  async function onImport() {
    if (mappedRows.length === 0) {
      toast.error(t("dataImport.noRows"));
      return;
    }
    try {
      const res = await importData.mutateAsync({
        sourceLabel: fileName ?? "Import.csv",
        rows: mappedRows,
      });
      toast.success(t("dataImport.importedToast", { count: String(res.importedLeads) }));
      setFileName(null);
      setHeaders([]);
      setRows([]);
      setMapping({});
      if (fileInputRef.current) fileInputRef.current.value = "";
    } catch (err) {
      toast.error(describeError(err, t("common.saveFailed")));
    }
  }

  return (
    <>
      <PageHeader
        icon={Upload}
        tone="sky"
        title={t("dataImport.pageTitle")}
        description={t("dataImport.pageDesc")}
        actions={
          <Link
            to="/onboarding/ai-setup"
            className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-border px-3 text-xs font-semibold text-muted-foreground transition-colors hover:bg-accent"
          >
            <ArrowLeft className="h-3.5 w-3.5" /> {t("amocrmChecklist.back")}
          </Link>
        }
      />

      <div className="space-y-5">
        <SectionCard
          icon={Upload}
          tone="sky"
          title={t("dataImport.uploadTitle")}
          description={t("dataImport.uploadDesc")}
        >
          <label className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-border px-6 py-10 text-center transition-colors hover:border-primary/50 hover:bg-accent">
            <UploadCloud className="h-6 w-6 text-muted-foreground" />
            <span className="text-sm font-medium text-foreground">
              {fileName ?? t("dataImport.chooseFile")}
            </span>
            <span className="text-xs text-subtle">{t("dataImport.csvOnly")}</span>
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,text/csv"
              className="hidden"
              onChange={onFileChange}
            />
          </label>

          {headers.length > 0 && (
            <div className="mt-6 space-y-4">
              <div className="grid gap-3 sm:grid-cols-2">
                {TARGET_FIELDS.map((field) => (
                  <div key={field.key}>
                    <label className="mb-1 block text-xs font-semibold text-muted-foreground">
                      {field.label}
                      {field.required && <span className="text-destructive"> *</span>}
                    </label>
                    <select
                      value={mapping[field.key] ?? ""}
                      onChange={(e) =>
                        setMapping((prev) => ({
                          ...prev,
                          [field.key]: e.target.value || undefined,
                        }))
                      }
                      className="h-9 w-full rounded-xl border border-border bg-surface px-3 text-sm"
                    >
                      <option value="">{t("dataImport.notMapped")}</option>
                      {headers.map((h) => (
                        <option key={h} value={h}>
                          {h}
                        </option>
                      ))}
                    </select>
                  </div>
                ))}
              </div>

              <p className="text-xs text-subtle">
                {t("dataImport.previewCount", { count: String(mappedRows.length) })}
              </p>

              <button
                type="button"
                onClick={onImport}
                disabled={importData.isPending || mappedRows.length === 0}
                className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-60"
              >
                {importData.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <FileUp className="h-4 w-4" />
                )}
                {t("dataImport.importButton")}
              </button>
            </div>
          )}
        </SectionCard>

        <SectionCard icon={History} tone="slate" title={t("dataImport.historyTitle")}>
          {!history || history.length === 0 ? (
            <p className="text-xs text-subtle">{t("dataImport.historyEmpty")}</p>
          ) : (
            <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border">
              {history.map((h) => (
                <li
                  key={h.id}
                  className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 text-xs"
                >
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-foreground">{h.source_label}</span>
                    <span className="text-subtle">{new Date(h.created_at).toLocaleString()}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Pill
                      tone={
                        h.status === "done"
                          ? "success"
                          : h.status === "error"
                            ? "danger"
                            : "neutral"
                      }
                    >
                      {h.status}
                    </Pill>
                    <span className="text-muted-foreground">
                      {t("dataImport.resultSummary", {
                        leads: String(h.imported_leads),
                        contacts: String(h.imported_contacts),
                      })}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </SectionCard>
      </div>
    </>
  );
}
