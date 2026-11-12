import { useMemo, useState } from "react";
import { ArrowRight, Download, FileSpreadsheet, Loader2, RotateCcw, Upload } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Segmented } from "@/components/ui/segmented";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useCurrency } from "@/lib/currency";
import { useI18n } from "@/lib/i18n";
import { cn, describeError } from "@/lib/utils";
import { downloadXlsx } from "@/lib/xlsx-write";
import { readXlsxFirstSheet } from "@/lib/xlsx-read";
import { detectCsvDelimiter, parseCsv } from "@/lib/csv-parse";
import {
  REFUND_IMPORT_FIELDS,
  buildRefundRows,
  formatCard,
  guessHeaderRow,
  guessRefundMapping,
  type RefundImportField,
  type RefundMapping,
  type RefundStage,
} from "@/lib/refunds";
import { useRefundMutations } from "@/hooks/use-crm-data";

// Import, the way CRMs do it: pick an Excel or CSV file, say which row is
// the header (guessed -- sheets often start with a title), and match each
// field to one of the file's columns (guessed by name, remembered for the
// next file with the same columns). The preview and the counts follow every
// change; rows without an amount (or a name and a phone) are left out.

const FIELD_LABEL: Record<RefundImportField, string> = {
  client_name: "refund.name",
  phone: "refund.phone",
  amount: "refund.amount",
  card_number: "refund.card",
  card_holder: "refund.holder",
  reason: "refund.reason",
  stage: "refund.stage",
  paid_amount: "refund.paid",
  note: "refund.note",
};

const colLetter = (i: number): string =>
  (i >= 26 ? colLetter(Math.floor(i / 26) - 1) : "") + String.fromCharCode(65 + (i % 26));

const memoryKey = (headers: string[]) => `refund-import-map:${headers.join("|").slice(0, 400)}`;

function remembered(headers: string[]): RefundMapping | null {
  try {
    const raw = localStorage.getItem(memoryKey(headers));
    return raw ? (JSON.parse(raw) as RefundMapping) : null;
  } catch {
    return null;
  }
}

export function RefundImportDialog({ onClose }: { onClose: () => void }) {
  const { t } = useI18n();
  const { format } = useCurrency();
  const { add } = useRefundMutations();
  const [table, setTable] = useState<string[][] | null>(null);
  const [fileName, setFileName] = useState("");
  const [headerRow, setHeaderRow] = useState(0);
  const [mapping, setMapping] = useState<RefundMapping>({});
  const [stage, setStage] = useState<RefundStage>("before");
  const [reading, setReading] = useState(false);

  const headers = useMemo(
    () => (table?.[headerRow] ?? []).map((h) => String(h ?? "").trim()),
    [table, headerRow],
  );
  const width = useMemo(
    () => Math.max(0, ...(table ?? []).slice(0, 50).map((r) => r.length)),
    [table],
  );
  const firstData = useMemo(
    () => (table ?? []).slice(headerRow + 1).find((r) => r.some((c) => String(c ?? "").trim())),
    [table, headerRow],
  );
  const result = useMemo(
    () => (table ? buildRefundRows(table, headerRow, mapping, { stage }) : null),
    [table, headerRow, mapping, stage],
  );

  function applyHeaderRow(table: string[][], row: number) {
    const hs = (table[row] ?? []).map((h) => String(h ?? "").trim());
    setHeaderRow(row);
    setMapping(remembered(hs) ?? guessRefundMapping(hs));
  }

  async function read(file: File) {
    setReading(true);
    try {
      let rows: string[][];
      if (/\.xlsx$/i.test(file.name)) rows = await readXlsxFirstSheet(file);
      else {
        const text = await file.text();
        const csv = parseCsv(text, detectCsvDelimiter(text));
        rows = [csv.headers, ...csv.rows];
      }
      rows = rows.map((r) => r.map((c) => String(c ?? "")));
      if (!rows.length) throw new Error(t("refund.importEmpty"));
      setTable(rows);
      setFileName(file.name);
      applyHeaderRow(rows, guessHeaderRow(rows));
    } catch (err) {
      toast.error(describeError(err, t("refund.importFailed")));
    } finally {
      setReading(false);
    }
  }

  async function save() {
    if (!result?.rows.length) return;
    try {
      await add.mutateAsync(result.rows.map((r) => ({ ...r, lead_id: null })));
      try {
        localStorage.setItem(memoryKey(headers), JSON.stringify(mapping));
      } catch {
        /* private mode: nothing to remember */
      }
      toast.success(t("refund.imported", { n: result.rows.length }));
      onClose();
    } catch (err) {
      toast.error(describeError(err, t("refund.importFailed")));
    }
  }

  function template() {
    downloadXlsx("pul-qaytarish-shablon.xlsx", [
      {
        name: "Shablon",
        rows: [
          [
            "Ism",
            "Telefon",
            "Summa",
            "Karta raqami",
            "Karta egasi",
            "Sabab",
            "Bosqich",
            "To'langan summa",
            "Izoh",
          ],
          [
            "Aziza Karimova",
            "+998901234567",
            2500000,
            "8600 1234 5678 9012",
            "AZIZA KARIMOVA",
            "Vaqti yo'q",
            "qabuldan oldin",
            3000000,
            "",
          ],
        ],
      },
    ]);
  }

  const missing = REFUND_IMPORT_FIELDS.filter(
    (f) => f.required && (mapping[f.key] === undefined || mapping[f.key]! < 0),
  );
  const total = result?.rows.reduce((s, r) => s + r.amount, 0) ?? 0;
  const picker = (
    <label className="inline-flex h-10 cursor-pointer items-center gap-2 rounded-xl bg-primary px-4 text-[13.5px] font-semibold text-primary-foreground hover:opacity-90">
      {reading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
      {table ? t("refund.otherFile") : t("refund.pickFile")}
      <input
        type="file"
        accept=".xlsx,.csv,text/csv"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = "";
          if (f) void read(f);
        }}
      />
    </label>
  );

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-[860px]">
        <DialogHeader>
          <DialogTitle>{t("refund.importTitle")}</DialogTitle>
          <p className="text-[13px] text-muted-foreground">{t("refund.importMapDesc")}</p>
        </DialogHeader>

        {!table ? (
          <div className="flex flex-col items-center gap-3 rounded-2xl border-2 border-dashed border-border px-6 py-10 text-center">
            <span className="grid h-12 w-12 place-items-center rounded-2xl bg-emerald-500/12 text-emerald-600 dark:text-emerald-400">
              <FileSpreadsheet className="h-6 w-6" />
            </span>
            <p className="max-w-[420px] text-[13.5px] text-muted-foreground">
              {t("refund.importDropHint")}
            </p>
            <div className="flex flex-wrap justify-center gap-2">
              {picker}
              <Button variant="outline" onClick={template}>
                <Download className="h-4 w-4" />
                {t("refund.template")}
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            {/* The file and which row holds the column names. */}
            <div className="flex flex-wrap items-center gap-2.5 rounded-xl bg-surface px-3 py-2.5">
              <FileSpreadsheet className="h-4 w-4 text-emerald-600" />
              <span className="min-w-0 flex-1 truncate text-[13.5px] font-semibold text-foreground">
                {fileName}
              </span>
              <label className="flex items-center gap-1.5 text-[13px] text-muted-foreground">
                {t("refund.headerRow")}
                <select
                  value={headerRow}
                  onChange={(e) => applyHeaderRow(table, Number(e.target.value))}
                  className="h-8 rounded-lg border border-border bg-card px-2 text-[13px] font-semibold text-foreground"
                >
                  {table.slice(0, 10).map((r, i) => (
                    <option key={i} value={i}>
                      {i + 1} —{" "}
                      {r
                        .filter((c) => c.trim())
                        .slice(0, 3)
                        .join(", ")
                        .slice(0, 40) || "…"}
                    </option>
                  ))}
                </select>
              </label>
              {picker}
            </div>

            {/* Field -> column. */}
            <div>
              <div className="mb-2 flex items-center justify-between">
                <p className="console-caption">{t("refund.mapTitle")}</p>
                <button
                  type="button"
                  onClick={() => setMapping(guessRefundMapping(headers))}
                  className="inline-flex items-center gap-1 text-[12.5px] font-semibold text-primary hover:underline"
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                  {t("refund.mapAuto")}
                </button>
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                {REFUND_IMPORT_FIELDS.map((f) => {
                  const col = mapping[f.key];
                  const on = col !== undefined && col >= 0;
                  const sample = on ? String(firstData?.[col] ?? "").trim() : "";
                  return (
                    <div
                      key={f.key}
                      className={cn(
                        "flex items-center gap-2 rounded-xl border px-3 py-2",
                        on
                          ? "border-primary/30 bg-primary/[0.04]"
                          : f.required
                            ? "border-amber-400/70 bg-amber-500/5"
                            : "border-border",
                      )}
                    >
                      <div className="w-[118px] shrink-0">
                        <p className="text-[13px] font-semibold text-foreground">
                          {t(FIELD_LABEL[f.key])}
                          {f.required && <span className="text-destructive"> *</span>}
                        </p>
                        <p className="truncate text-[11.5px] text-muted-foreground" title={sample}>
                          {on ? sample || "—" : t("refund.mapSkip")}
                        </p>
                      </div>
                      <ArrowRight className="h-3.5 w-3.5 shrink-0 text-subtle" />
                      <select
                        value={on ? col : -1}
                        onChange={(e) => {
                          const v = Number(e.target.value);
                          setMapping((m) => {
                            const next: RefundMapping = { ...m };
                            // A column feeds one field: take it from any other.
                            for (const k of Object.keys(next) as RefundImportField[])
                              if (next[k] === v && v >= 0) delete next[k];
                            if (v < 0) delete next[f.key];
                            else next[f.key] = v;
                            return next;
                          });
                        }}
                        className="h-9 min-w-0 flex-1 rounded-lg border border-border bg-card px-2 text-[13px]"
                      >
                        <option value={-1}>— {t("refund.mapSkip")} —</option>
                        {Array.from({ length: Math.max(width, headers.length) }, (_, i) => (
                          <option key={i} value={i}>
                            {colLetter(i)} · {headers[i] || t("refund.mapNoName")}
                          </option>
                        ))}
                      </select>
                    </div>
                  );
                })}
              </div>
              {(mapping.stage === undefined || mapping.stage < 0) && (
                <div className="mt-2 flex flex-wrap items-center gap-2 text-[13px] text-muted-foreground">
                  {t("refund.stageDefault")}
                  <Segmented
                    value={stage}
                    onChange={setStage}
                    options={(["before", "after"] as const).map((s) => ({
                      value: s,
                      label: t(`refund.stage.${s}`),
                    }))}
                  />
                </div>
              )}
            </div>

            {/* What will be added. */}
            <div className="overflow-hidden rounded-xl border border-border">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1 border-b border-border bg-surface/60 px-3 py-2 text-[13px]">
                <b className="text-foreground">
                  {t("refund.importPreview", { n: result?.rows.length ?? 0, sum: format(total) })}
                </b>
                {!!result?.noAmount && (
                  <span className="text-amber-700 dark:text-amber-300">
                    · {t("refund.skipNoAmount", { n: result.noAmount })}
                  </span>
                )}
                {!!result?.noName && (
                  <span className="text-amber-700 dark:text-amber-300">
                    · {t("refund.skipNoName", { n: result.noName })}
                  </span>
                )}
              </div>
              {missing.length > 0 ? (
                <p className="px-3 py-4 text-[13px] text-amber-700 dark:text-amber-300">
                  {t("refund.mapNeed", {
                    fields: missing.map((f) => t(FIELD_LABEL[f.key])).join(", "),
                  })}
                </p>
              ) : (
                <div className="max-h-[220px] overflow-auto">
                  <table className="w-full text-[13px]">
                    <tbody>
                      {(result?.rows ?? []).slice(0, 6).map((r, i) => (
                        <tr key={i} className="border-b border-border/60 last:border-0">
                          <td className="px-3 py-2 font-medium text-foreground">{r.client_name}</td>
                          <td className="px-3 py-2 tabular-nums text-muted-foreground">
                            {r.phone ?? "—"}
                          </td>
                          <td className="px-3 py-2 font-mono text-[12.5px] text-muted-foreground">
                            {r.card_number ? formatCard(r.card_number) : t("refund.noCard")}
                          </td>
                          <td className="px-3 py-2 text-muted-foreground">
                            {t(`refund.stage.${r.stage}`)}
                          </td>
                          <td className="whitespace-nowrap px-3 py-2 text-right font-semibold tabular-nums">
                            {format(r.amount)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {(result?.rows.length ?? 0) > 6 && (
                    <p className="px-3 py-2 text-[12px] text-muted-foreground">
                      {t("online.more", { n: (result?.rows.length ?? 0) - 6 })}
                    </p>
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            {t("common.cancel")}
          </Button>
          <Button
            onClick={() => void save()}
            disabled={!result?.rows.length || missing.length > 0 || add.isPending}
          >
            {add.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
            {t("refund.importDo", { n: result?.rows.length ?? 0 })}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
