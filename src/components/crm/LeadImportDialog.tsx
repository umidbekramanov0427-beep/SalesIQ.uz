import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, CheckCircle2, FileSpreadsheet, Link2, Loader2, Upload, X } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { detectCsvDelimiter, parseCsv } from "@/lib/csv-parse";
import { useLeadCustomFieldDefs, usePipelineStagesRaw, useProfilesRaw } from "@/hooks/use-crm-data";

// Funnel settings -> "Lidlarni import qilish": Excel / CSV / Google Sheets
// -> pick which column is the name, phone, ... -> choose the funnel stage,
// tags and owner -> import. Parsing happens here in the browser; the server
// (leads.import.ts) only receives already-mapped rows.

const NONE = "__none__";
const STAGE_FROM_COLUMN = "__column__";
const CHUNK = 500;

type FieldKey =
  | "name"
  | "phone"
  | "altPhone"
  | "email"
  | "telegram"
  | "company"
  | "position"
  | "budget"
  | "source"
  | "city"
  | "region"
  | "address"
  | "note"
  | "tags";

// Header words (en/ru/uz) each field is auto-matched by.
const FIELDS: { key: FieldKey; labelKey: string; guess: RegExp }[] = [
  {
    key: "name",
    labelKey: "import.field.name",
    guess: /^(name|full ?name|fio|ф\.?и\.?о|имя|клиент|контакт|ism|mijoz|lid|lead)/i,
  },
  {
    key: "phone",
    labelKey: "import.field.phone",
    guess: /(phone|tel|телефон|номер|raqam|nomer|mobile)/i,
  },
  {
    key: "altPhone",
    labelKey: "import.field.altPhone",
    guess: /(2|second|доп|qo'shimcha).*(phone|tel|телефон|raqam)/i,
  },
  { key: "email", labelKey: "import.field.email", guess: /(e-?mail|почта|pochta)/i },
  { key: "telegram", labelKey: "import.field.telegram", guess: /(telegram|tg)/i },
  {
    key: "company",
    labelKey: "import.field.company",
    guess: /(company|компания|организация|kompaniya|firma)/i,
  },
  { key: "position", labelKey: "import.field.position", guess: /(position|должность|lavozim)/i },
  {
    key: "budget",
    labelKey: "import.field.budget",
    guess: /(budget|бюджет|сумма|amount|summa|narx|price)/i,
  },
  {
    key: "source",
    labelKey: "import.field.source",
    guess: /(source|источник|manba|kanal|utm_source)/i,
  },
  { key: "city", labelKey: "import.field.city", guess: /(city|город|shahar)/i },
  { key: "region", labelKey: "import.field.region", guess: /(region|регион|область|viloyat)/i },
  { key: "address", labelKey: "import.field.address", guess: /(address|адрес|manzil)/i },
  {
    key: "note",
    labelKey: "import.field.note",
    guess: /(note|comment|коммент|примеч|izoh|eslatma)/i,
  },
  { key: "tags", labelKey: "import.field.tags", guess: /(tag|тег|метк|teg)/i },
];

type Sheet = { headers: string[]; rows: string[][]; label: string };

async function postJson<T>(path: string, body: unknown): Promise<T> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  const res = await fetch(path, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });
  const json = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
  return json;
}

function toSheet(rows: string[][], label: string, firstRowIsHeader: boolean): Sheet {
  const width = rows.reduce((m, r) => Math.max(m, r.length), 0);
  const pad = (r: string[]) => Array.from({ length: width }, (_, i) => (r[i] ?? "").trim());
  if (firstRowIsHeader && rows.length > 0) {
    const headers = pad(rows[0]!).map((h, i) => h || `#${i + 1}`);
    return { headers, rows: rows.slice(1).map(pad), label };
  }
  return {
    headers: Array.from({ length: width }, (_, i) => `#${i + 1}`),
    rows: rows.map(pad),
    label,
  };
}

function guessMapping(headers: string[]): Partial<Record<FieldKey, number>> {
  const mapping: Partial<Record<FieldKey, number>> = {};
  const used = new Set<number>();
  // altPhone before phone so "Телефон 2" doesn't get taken as the main phone.
  const order: FieldKey[] = [
    "altPhone",
    ...FIELDS.map((f) => f.key).filter((k) => k !== "altPhone"),
  ];
  for (const key of order) {
    const field = FIELDS.find((f) => f.key === key)!;
    const idx = headers.findIndex((h, i) => !used.has(i) && field.guess.test(h));
    if (idx >= 0) {
      mapping[key] = idx;
      used.add(idx);
    }
  }
  return mapping;
}

function ColumnSelect({
  headers,
  value,
  onChange,
  noneLabel,
}: {
  headers: string[];
  value: number | undefined;
  onChange: (v: number | undefined) => void;
  noneLabel: string;
}) {
  return (
    <Select
      value={value === undefined ? NONE : String(value)}
      onValueChange={(v) => onChange(v === NONE ? undefined : Number(v))}
    >
      <SelectTrigger className="h-9">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={NONE}>{noneLabel}</SelectItem>
        {headers.map((h, i) => (
          <SelectItem key={i} value={String(i)}>
            {h}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function Step({
  n,
  active,
  done,
  children,
}: {
  n: number;
  active: boolean;
  done: boolean;
  children: ReactNode;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 text-xs font-semibold",
        active ? "text-primary" : done ? "text-foreground" : "text-subtle",
      )}
    >
      <span
        className={cn(
          "grid h-5 w-5 place-items-center rounded-full text-[10px]",
          active
            ? "bg-primary text-primary-foreground"
            : done
              ? "bg-success/20 text-success"
              : "bg-muted",
        )}
      >
        {done ? <CheckCircle2 className="h-3 w-3" /> : n}
      </span>
      {children}
    </span>
  );
}

export function LeadImportDialog({
  open,
  onOpenChange,
  defaultFunnel,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultFunnel?: string;
}) {
  const { t } = useI18n();
  const { user } = useAuth();
  const qc = useQueryClient();
  const { data: stages } = usePipelineStagesRaw();
  const { data: profiles } = useProfilesRaw();
  const { data: customDefs } = useLeadCustomFieldDefs();

  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [rawRows, setRawRows] = useState<string[][] | null>(null);
  const [label, setLabel] = useState("");
  const [firstRowIsHeader, setFirstRowIsHeader] = useState(true);
  const [loading, setLoading] = useState(false);
  const [sheetUrl, setSheetUrl] = useState("");
  const [mapping, setMapping] = useState<Partial<Record<FieldKey, number>>>({});
  const [customMapping, setCustomMapping] = useState<Record<string, number | undefined>>({});
  const [funnel, setFunnel] = useState(defaultFunnel ?? "Direct Sales");
  const [stageId, setStageId] = useState<string>("");
  const [stageColumn, setStageColumn] = useState<number | undefined>(undefined);
  const [tagInput, setTagInput] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [ownerId, setOwnerId] = useState<string>("");
  const [skipDuplicates, setSkipDuplicates] = useState(true);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [result, setResult] = useState<{
    imported: number;
    skippedDuplicates: number;
    skippedEmpty: number;
    errors: string[];
  } | null>(null);

  const sheet = useMemo(
    () => (rawRows ? toSheet(rawRows, label, firstRowIsHeader) : null),
    [rawRows, label, firstRowIsHeader],
  );

  useEffect(() => {
    if (!sheet) return;
    setMapping(guessMapping(sheet.headers));
    setCustomMapping({});
  }, [sheet]);

  useEffect(() => {
    if (!open) return;
    setStep(1);
    setRawRows(null);
    setSheetUrl("");
    setResult(null);
    setProgress(null);
    setTags([]);
    setFunnel(defaultFunnel ?? "Direct Sales");
    setOwnerId(user?.id ?? "");
  }, [open, defaultFunnel, user?.id]);

  const funnelOptions = useMemo(() => {
    const set = new Set<string>(["Direct Sales"]);
    if (defaultFunnel) set.add(defaultFunnel);
    for (const s of stages ?? []) set.add(s.pipeline_name || "Direct Sales");
    return [...set];
  }, [stages, defaultFunnel]);

  const funnelStages = useMemo(
    () =>
      (stages ?? [])
        .filter((s) => (s.pipeline_name || "Direct Sales") === funnel)
        .sort((a, b) => a.position - b.position),
    [stages, funnel],
  );

  useEffect(() => {
    if (stageId === STAGE_FROM_COLUMN) return;
    if (!funnelStages.some((s) => s.id === stageId)) setStageId(funnelStages[0]?.id ?? "");
  }, [funnelStages, stageId]);

  async function onFile(file: File) {
    setLoading(true);
    try {
      let rows: string[][];
      if (/\.xlsx$/i.test(file.name)) {
        const { readXlsxFirstSheet } = await import("@/lib/xlsx-read");
        rows = await readXlsxFirstSheet(file);
      } else if (/\.(csv|txt|tsv)$/i.test(file.name)) {
        const text = await file.text();
        const parsed = parseCsv(text, detectCsvDelimiter(text));
        rows = [parsed.headers, ...parsed.rows];
      } else {
        throw new Error(t("import.unsupportedFile"));
      }
      if (rows.length === 0) throw new Error(t("import.emptyFile"));
      setLabel(file.name);
      setRawRows(rows);
      setStep(2);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  async function onSheet() {
    setLoading(true);
    try {
      const { text } = await postJson<{ text: string }>("/leads/import-sheet", { url: sheetUrl });
      const parsed = parseCsv(text, ",");
      if (parsed.headers.length === 0) throw new Error(t("import.emptyFile"));
      setLabel("Google Sheets");
      setRawRows([parsed.headers, ...parsed.rows]);
      setStep(2);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      toast.error(message === "sheet_not_public" ? t("import.sheetNotPublic") : message);
    } finally {
      setLoading(false);
    }
  }

  const mappedRows = useMemo(() => {
    if (!sheet) return [];
    const cell = (row: string[], idx: number | undefined) =>
      idx === undefined ? "" : (row[idx] ?? "");
    return sheet.rows.map((row) => {
      const customFields: Record<string, string> = {};
      for (const [key, idx] of Object.entries(customMapping)) {
        const v = cell(row, idx);
        if (v) customFields[key] = v;
      }
      return {
        name: cell(row, mapping.name),
        phone: cell(row, mapping.phone),
        altPhone: cell(row, mapping.altPhone),
        email: cell(row, mapping.email),
        telegram: cell(row, mapping.telegram),
        company: cell(row, mapping.company),
        position: cell(row, mapping.position),
        budget: cell(row, mapping.budget),
        source: cell(row, mapping.source),
        city: cell(row, mapping.city),
        region: cell(row, mapping.region),
        address: cell(row, mapping.address),
        note: cell(row, mapping.note),
        stage: stageId === STAGE_FROM_COLUMN ? cell(row, stageColumn) : "",
        tags: cell(row, mapping.tags)
          .split(/[,;|]/)
          .map((s) => s.trim())
          .filter(Boolean),
        customFields,
      };
    });
  }, [sheet, mapping, customMapping, stageId, stageColumn]);

  const validCount = mappedRows.filter((r) => r.name || r.phone || r.email).length;
  const canContinue =
    !!sheet &&
    (mapping.name !== undefined || mapping.phone !== undefined) &&
    (stageId !== STAGE_FROM_COLUMN || stageColumn !== undefined) &&
    !!stageId;

  function addTag() {
    const next = tagInput
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    if (next.length) setTags((prev) => [...new Set([...prev, ...next])]);
    setTagInput("");
  }

  async function runImport() {
    const total = mappedRows.length;
    setProgress({ done: 0, total });
    const sum = { imported: 0, skippedDuplicates: 0, skippedEmpty: 0, errors: [] as string[] };
    try {
      for (let i = 0; i < total; i += CHUNK) {
        const chunk = mappedRows.slice(i, i + CHUNK);
        const r = await postJson<typeof sum>("/leads/import", {
          funnel,
          stageId: stageId === STAGE_FROM_COLUMN ? (funnelStages[0]?.id ?? null) : stageId,
          ownerId: ownerId || null,
          tags,
          skipDuplicates,
          sourceLabel: `Import · ${label}`.slice(0, 120),
          rows: chunk,
        });
        sum.imported += r.imported;
        sum.skippedDuplicates += r.skippedDuplicates;
        sum.skippedEmpty += r.skippedEmpty;
        sum.errors.push(...r.errors);
        setProgress({ done: Math.min(total, i + CHUNK), total });
      }
      toast.success(t("import.done", { count: sum.imported }));
    } catch (err) {
      sum.errors.push(err instanceof Error ? err.message : String(err));
    } finally {
      setResult(sum);
      setProgress(null);
      void qc.invalidateQueries({ queryKey: ["leads"] });
      void qc.invalidateQueries({ queryKey: ["contacts"] });
      void qc.invalidateQueries({ queryKey: ["pipeline_board_leads"] });
    }
  }

  const noneLabel = t("import.notMapped");

  return (
    <Dialog open={open} onOpenChange={(v) => !progress && onOpenChange(v)}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>{t("import.title")}</DialogTitle>
          <DialogDescription>{t("import.desc")}</DialogDescription>
        </DialogHeader>

        <div className="flex flex-wrap gap-4 border-b border-border pb-3">
          <Step n={1} active={step === 1} done={step > 1}>
            {t("import.stepSource")}
          </Step>
          <Step n={2} active={step === 2} done={step > 2}>
            {t("import.stepMapping")}
          </Step>
          <Step n={3} active={step === 3} done={!!result}>
            {t("import.stepImport")}
          </Step>
        </div>

        {step === 1 && (
          <div className="grid gap-4 sm:grid-cols-2">
            <label
              className={cn(
                "flex cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-border bg-surface/60 p-6 text-center transition-colors hover:border-primary/50",
                loading && "pointer-events-none opacity-60",
              )}
            >
              <FileSpreadsheet className="h-8 w-8 text-primary" />
              <span className="text-sm font-semibold text-foreground">{t("import.fromFile")}</span>
              <span className="text-xs text-subtle">.xlsx · .csv</span>
              <input
                type="file"
                accept=".xlsx,.csv,.txt,.tsv,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) void onFile(file);
                  e.target.value = "";
                }}
              />
            </label>
            <div className="flex flex-col gap-2 rounded-2xl border border-border bg-surface/60 p-4">
              <span className="flex items-center gap-2 text-sm font-semibold text-foreground">
                <Link2 className="h-4 w-4 text-primary" /> Google Sheets
              </span>
              <Input
                value={sheetUrl}
                onChange={(e) => setSheetUrl(e.target.value)}
                placeholder="https://docs.google.com/spreadsheets/d/…"
              />
              <p className="text-xs text-subtle">{t("import.sheetHint")}</p>
              <button
                type="button"
                disabled={!sheetUrl.trim() || loading}
                onClick={() => void onSheet()}
                className="mt-auto inline-flex h-9 items-center justify-center gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-50"
              >
                {loading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Upload className="h-4 w-4" />
                )}
                {t("import.load")}
              </button>
            </div>
          </div>
        )}

        {step === 2 && sheet && (
          <div className="space-y-5">
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-surface px-3 py-2 text-sm">
              <span className="min-w-0 truncate">
                <b className="text-foreground">{sheet.label}</b>{" "}
                <span className="text-muted-foreground">
                  · {t("import.rowsFound", { count: sheet.rows.length })}
                </span>
              </span>
              <label className="flex items-center gap-2 text-xs text-muted-foreground">
                <Switch checked={firstRowIsHeader} onCheckedChange={setFirstRowIsHeader} />
                {t("import.firstRowHeader")}
              </label>
            </div>

            <section>
              <p className="mb-2 text-xs font-bold uppercase tracking-wide text-subtle">
                {t("import.whereTo")}
              </p>
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <Label>{t("import.funnel")}</Label>
                  <Select value={funnel} onValueChange={setFunnel}>
                    <SelectTrigger className="h-9">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {funnelOptions.map((f) => (
                        <SelectItem key={f} value={f}>
                          {f}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>{t("import.stage")}</Label>
                  <Select value={stageId} onValueChange={setStageId}>
                    <SelectTrigger className="h-9">
                      <SelectValue placeholder={t("import.noStages")} />
                    </SelectTrigger>
                    <SelectContent>
                      {funnelStages.map((s) => (
                        <SelectItem key={s.id} value={s.id}>
                          {s.name}
                        </SelectItem>
                      ))}
                      {funnelStages.length > 0 && (
                        <SelectItem value={STAGE_FROM_COLUMN}>
                          {t("import.stageFromColumn")}
                        </SelectItem>
                      )}
                    </SelectContent>
                  </Select>
                </div>
                {stageId === STAGE_FROM_COLUMN && (
                  <div className="sm:col-span-2">
                    <Label>{t("import.stageColumn")}</Label>
                    <ColumnSelect
                      headers={sheet.headers}
                      value={stageColumn}
                      onChange={setStageColumn}
                      noneLabel={noneLabel}
                    />
                    <p className="mt-1 text-xs text-subtle">{t("import.stageColumnHint")}</p>
                  </div>
                )}
                <div>
                  <Label>{t("import.tags")}</Label>
                  <div className="flex gap-2">
                    <Input
                      value={tagInput}
                      onChange={(e) => setTagInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          addTag();
                        }
                      }}
                      onBlur={addTag}
                      placeholder={t("import.tagsPlaceholder")}
                      className="h-9"
                    />
                  </div>
                  {tags.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {tags.map((tag) => (
                        <span
                          key={tag}
                          className="inline-flex items-center gap-1 rounded-lg bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary"
                        >
                          {tag}
                          <button
                            type="button"
                            aria-label="remove"
                            onClick={() => setTags((p) => p.filter((x) => x !== tag))}
                          >
                            <X className="h-3 w-3" />
                          </button>
                        </span>
                      ))}
                    </div>
                  )}
                </div>
                <div>
                  <Label>{t("import.owner")}</Label>
                  <Select value={ownerId} onValueChange={setOwnerId}>
                    <SelectTrigger className="h-9">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {(profiles ?? []).map((p) => (
                        <SelectItem key={p.id} value={p.id}>
                          {p.full_name || p.email}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <label className="flex items-center justify-between gap-3 rounded-xl border border-border px-3 py-2 sm:col-span-2">
                  <span className="text-sm text-foreground">{t("import.skipDuplicates")}</span>
                  <Switch checked={skipDuplicates} onCheckedChange={setSkipDuplicates} />
                </label>
              </div>
            </section>

            <section>
              <p className="mb-2 text-xs font-bold uppercase tracking-wide text-subtle">
                {t("import.columns")}
              </p>
              <div className="grid gap-x-4 gap-y-2.5 sm:grid-cols-2">
                {FIELDS.map((f) => (
                  <div
                    key={f.key}
                    className="grid grid-cols-[minmax(0,140px)_minmax(0,1fr)] items-center gap-2"
                  >
                    <span className="truncate text-sm text-foreground">
                      {t(f.labelKey)}
                      {f.key === "name" && <span className="text-destructive"> *</span>}
                    </span>
                    <ColumnSelect
                      headers={sheet.headers}
                      value={mapping[f.key]}
                      onChange={(v) => setMapping((m) => ({ ...m, [f.key]: v }))}
                      noneLabel={noneLabel}
                    />
                  </div>
                ))}
                {(customDefs ?? []).map((d) => (
                  <div
                    key={d.id}
                    className="grid grid-cols-[minmax(0,140px)_minmax(0,1fr)] items-center gap-2"
                  >
                    <span className="truncate text-sm text-foreground">{d.label}</span>
                    <ColumnSelect
                      headers={sheet.headers}
                      value={customMapping[d.key]}
                      onChange={(v) => setCustomMapping((m) => ({ ...m, [d.key]: v }))}
                      noneLabel={noneLabel}
                    />
                  </div>
                ))}
              </div>
              {mapping.name === undefined && mapping.phone === undefined && (
                <p className="mt-2 text-xs text-destructive">{t("import.needNameOrPhone")}</p>
              )}
            </section>

            <div className="flex justify-between gap-2">
              <button
                type="button"
                onClick={() => setStep(1)}
                className="inline-flex h-10 items-center gap-2 rounded-xl border border-border px-4 text-sm font-medium text-muted-foreground hover:bg-accent"
              >
                <ArrowLeft className="h-4 w-4" /> {t("import.back")}
              </button>
              <button
                type="button"
                disabled={!canContinue}
                onClick={() => setStep(3)}
                className="inline-flex h-10 items-center rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-50"
              >
                {t("import.next")}
              </button>
            </div>
          </div>
        )}

        {step === 3 && sheet && (
          <div className="space-y-4">
            {!result && (
              <>
                <p className="text-sm text-muted-foreground">
                  {t("import.summary", {
                    count: validCount,
                    funnel,
                    stage:
                      stageId === STAGE_FROM_COLUMN
                        ? t("import.stageFromColumn")
                        : (funnelStages.find((s) => s.id === stageId)?.name ?? ""),
                  })}
                </p>
                <div className="overflow-x-auto rounded-xl border border-border">
                  <table className="w-full min-w-[520px] text-sm">
                    <thead>
                      <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-subtle">
                        <th className="px-3 py-2">{t("import.field.name")}</th>
                        <th className="px-3 py-2">{t("import.field.phone")}</th>
                        <th className="px-3 py-2">{t("import.field.company")}</th>
                        <th className="px-3 py-2">{t("import.tags")}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {mappedRows.slice(0, 5).map((r, i) => (
                        <tr key={i} className="border-b border-border last:border-0">
                          <td className="max-w-[180px] truncate px-3 py-2 text-foreground">
                            {r.name || "—"}
                          </td>
                          <td className="px-3 py-2 tabular-nums text-muted-foreground">
                            {r.phone || "—"}
                          </td>
                          <td className="max-w-[160px] truncate px-3 py-2 text-muted-foreground">
                            {r.company || "—"}
                          </td>
                          <td className="max-w-[160px] truncate px-3 py-2 text-muted-foreground">
                            {[...tags, ...r.tags].join(", ") || "—"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {progress && (
                  <div>
                    <div className="h-2 overflow-hidden rounded-full bg-muted">
                      <div
                        className="h-full rounded-full bg-primary transition-all"
                        style={{ width: `${(progress.done / Math.max(1, progress.total)) * 100}%` }}
                      />
                    </div>
                    <p className="mt-1 text-xs text-subtle tabular-nums">
                      {progress.done} / {progress.total}
                    </p>
                  </div>
                )}
                <div className="flex justify-between gap-2">
                  <button
                    type="button"
                    disabled={!!progress}
                    onClick={() => setStep(2)}
                    className="inline-flex h-10 items-center gap-2 rounded-xl border border-border px-4 text-sm font-medium text-muted-foreground hover:bg-accent disabled:opacity-50"
                  >
                    <ArrowLeft className="h-4 w-4" /> {t("import.back")}
                  </button>
                  <button
                    type="button"
                    disabled={!!progress || validCount === 0}
                    onClick={() => void runImport()}
                    className="inline-flex h-10 items-center gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-50"
                  >
                    {progress && <Loader2 className="h-4 w-4 animate-spin" />}
                    {t("import.start", { count: validCount })}
                  </button>
                </div>
              </>
            )}
            {result && (
              <div className="space-y-3">
                <div className="grid gap-3 sm:grid-cols-3">
                  <div className="rounded-xl border border-success/30 bg-success/10 p-3">
                    <p className="text-2xl font-semibold tabular-nums text-success">
                      {result.imported}
                    </p>
                    <p className="text-xs text-muted-foreground">{t("import.resultImported")}</p>
                  </div>
                  <div className="rounded-xl border border-border bg-surface p-3">
                    <p className="text-2xl font-semibold tabular-nums text-foreground">
                      {result.skippedDuplicates}
                    </p>
                    <p className="text-xs text-muted-foreground">{t("import.resultDuplicates")}</p>
                  </div>
                  <div className="rounded-xl border border-border bg-surface p-3">
                    <p className="text-2xl font-semibold tabular-nums text-foreground">
                      {result.skippedEmpty}
                    </p>
                    <p className="text-xs text-muted-foreground">{t("import.resultEmpty")}</p>
                  </div>
                </div>
                {result.errors.length > 0 && (
                  <div className="rounded-xl border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive">
                    {result.errors.slice(0, 5).map((e, i) => (
                      <p key={i}>{e}</p>
                    ))}
                  </div>
                )}
                <div className="flex justify-end">
                  <button
                    type="button"
                    onClick={() => onOpenChange(false)}
                    className="inline-flex h-10 items-center rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground hover:opacity-90"
                  >
                    {t("import.close")}
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
