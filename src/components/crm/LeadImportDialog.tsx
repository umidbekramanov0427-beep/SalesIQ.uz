import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  FileSpreadsheet,
  Link2,
  Loader2,
  Upload,
  X,
} from "lucide-react";
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
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { useI18n } from "@/lib/i18n";
import { cn, stageColorProps } from "@/lib/utils";
import { detectCsvDelimiter, parseCsv } from "@/lib/csv-parse";
import {
  useLeadCustomFieldDefs,
  useCrmStages,
  useProfilesRaw,
  type LeadCustomFieldDefRow,
  type ProfileRow,
  type StageRow,
} from "@/hooks/use-crm-data";

// Funnel settings -> "Lidlarni import qilish", the way amoCRM does it: the
// file is shown as a table and under every column you pick which card field
// it goes to (most are guessed from the header, amoCRM's own export
// headers included). If a column holds stages or owners, each distinct
// value is then matched to a funnel stage / a teammate. Parsing happens
// here in the browser; the server (leads.import.ts) gets mapped rows.

const SKIP = "skip";
const DEFAULT = "__default__";
const CHUNK = 500;

type Target =
  | typeof SKIP
  | "name"
  | "budget"
  | "owner"
  | "stage"
  | "tags"
  | "note"
  | "source"
  | "campaign"
  | "stream"
  | "contactName"
  | "phone"
  | "altPhone"
  | "email"
  | "telegram"
  | "position"
  | "company"
  | "city"
  | "region"
  | "address"
  | `custom:${string}`;

const GROUPS: { labelKey: string; items: { key: Target; labelKey: string }[] }[] = [
  {
    labelKey: "import.group.lead",
    items: [
      { key: "name", labelKey: "import.field.leadName" },
      { key: "budget", labelKey: "import.field.budget" },
      { key: "owner", labelKey: "import.field.owner" },
      { key: "stage", labelKey: "import.field.stage" },
      { key: "tags", labelKey: "import.field.tag" },
      { key: "note", labelKey: "import.field.note" },
      { key: "source", labelKey: "import.field.source" },
      { key: "campaign", labelKey: "funnelFilter.campaign" },
      { key: "stream", labelKey: "funnelFilter.stream" },
    ],
  },
  {
    labelKey: "import.group.contact",
    items: [
      { key: "contactName", labelKey: "import.field.contactName" },
      { key: "phone", labelKey: "import.field.phone" },
      { key: "altPhone", labelKey: "import.field.altPhone" },
      { key: "email", labelKey: "import.field.email" },
      { key: "telegram", labelKey: "import.field.telegram" },
      { key: "position", labelKey: "import.field.position" },
    ],
  },
  {
    labelKey: "import.group.company",
    items: [
      { key: "company", labelKey: "import.field.company" },
      { key: "city", labelKey: "import.field.city" },
      { key: "region", labelKey: "import.field.region" },
      { key: "address", labelKey: "import.field.address" },
    ],
  },
];

// Fields several columns may feed at once: notes and tags are joined, the
// phones and emails fill in order (2nd phone -> extra phone), and a first +
// last name pair makes one contact name.
const MULTI = new Set<Target>(["note", "tags", "phone", "email", "contactName"]);

const COMPANY_COL = /\((компания|company|kompaniya)\)/;

/** Which card field a file header most likely is (en / ru / uz, amoCRM's export too). */
function guessTarget(header: string, defs: LeadCustomFieldDefRow[]): Target {
  const h = header.trim().toLowerCase();
  if (!h || /^#\d+$/.test(h)) return SKIP;
  const def = defs.find((d) => d.label.trim().toLowerCase() === h);
  if (def) return `custom:${def.key}`;
  if (/(дата|date|sana|кем созд|created by|изменен|modified|^id$|^№$)/.test(h)) return SKIP;
  if (/(факс|fax)/.test(h)) return SKIP;
  if (/(телефон|phone|tel\b|raqam|nomer|номер|mobile|мобильн)/.test(h)) {
    return /(доп|qo'shimcha|second|\b2\b)/.test(h) ? "altPhone" : "phone";
  }
  if (/(e-?mail|почта|pochta)/.test(h)) return "email";
  if (/(telegram|телеграм|^tg\b)/.test(h)) return "telegram";
  if (COMPANY_COL.test(h)) {
    if (/(адрес|address|manzil)/.test(h)) return "address";
    if (/(название|name|nomi)/.test(h)) return "company";
    return SKIP;
  }
  if (
    /(название сделки|deal name|lead name|lid nomi|^сделка$|^deal$|^lead$|^lid$|^название$)/.test(h)
  )
    return "name";
  if (/(бюджет|budget|сумма|summa|amount|narx|price|цена|byudjet)/.test(h)) return "budget";
  if (/(ответствен|responsible|owner|mas'?ul|менеджер|manager|xodim)/.test(h)) return "owner";
  if (/(статус|этап|stage|status|bosqich|etap)/.test(h)) return "stage";
  if (/(тег|tag|teg|метк)/.test(h)) return "tags";
  if (/(примечан|note|comment|коммент|izoh|eslatma|описание|description)/.test(h)) return "note";
  if (/(кампани|campaign|kampaniya|reklama|реклам)/.test(h)) return "campaign";
  if (/(поток|stream|patok|potok|cohort|guruh raqami)/.test(h)) return "stream";
  if (/(источник|source|manba|kanal)/.test(h)) return "source";
  if (/(должност|position|lavozim)/.test(h)) return "position";
  if (/(компани|company|kompaniya|организац|firma|tashkilot)/.test(h)) return "company";
  if (/(город|city|shahar)/.test(h)) return "city";
  if (/(регион|област|region|viloyat)/.test(h)) return "region";
  if (/(адрес|address|manzil)/.test(h)) return "address";
  if (
    /(имя|фио|ф\.и\.о|фамилия|full ?name|first ?name|last ?name|^name$|ism|familiya|mijoz|клиент|контакт|contact)/.test(
      h,
    )
  )
    return "contactName";
  return SKIP;
}

function guessTargets(headers: string[], defs: LeadCustomFieldDefRow[]): Target[] {
  const used = new Set<Target>();
  return headers.map((h) => {
    const target = guessTarget(h, defs);
    if (target === SKIP) return SKIP;
    if (!MULTI.has(target) && used.has(target)) return SKIP;
    used.add(target);
    return target;
  });
}

const norm = (v: string) => v.trim().toLowerCase().replace(/\s+/g, " ");

/** A file's stage name -> the funnel stage it most likely is ("" = the default one). */
function guessStage(value: string, stages: StageRow[]): string {
  const v = norm(value);
  if (!v) return "";
  const exact = stages.find((s) => norm(s.name) === v);
  if (exact) return exact.id;
  const near = stages.find((s) => {
    const n = norm(s.name);
    return n.length >= 3 && v.length >= 3 && (n.includes(v) || v.includes(n));
  });
  if (near) return near.id;
  if (/(успешно|won|muvaffaqiyat|sotildi|yutildi)/.test(v))
    return stages.find((s) => s.is_won)?.id ?? "";
  if (/(не реализ|закрыто|lost|yo'qot|rad etdi|bekor)/.test(v))
    return stages.find((s) => s.is_lost)?.id ?? "";
  return "";
}

/** A file's owner name -> the teammate it most likely is ("" = the default owner). */
function guessOwner(value: string, profiles: ProfileRow[]): string {
  const v = norm(value);
  if (!v) return "";
  const exact = profiles.find((p) => norm(p.full_name ?? "") === v || norm(p.email ?? "") === v);
  if (exact) return exact.id;
  const near = profiles.find((p) => {
    const n = norm(p.full_name ?? "");
    return n.length >= 3 && v.length >= 3 && (n.includes(v) || v.includes(n));
  });
  return near?.id ?? "";
}

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

/** One file row -> card fields, merging the columns that feed the same field. */
function readRow(row: string[], targets: Target[]) {
  const vals = new Map<Target, string[]>();
  targets.forEach((target, i) => {
    const v = (row[i] ?? "").trim();
    if (target === SKIP || !v) return;
    vals.set(target, [...(vals.get(target) ?? []), v]);
  });
  const first = (k: Target) => vals.get(k)?.[0] ?? "";
  const phones = vals.get("phone") ?? [];
  const customFields: Record<string, string> = {};
  for (const [k, v] of vals) if (k.startsWith("custom:")) customFields[k.slice(7)] = v[0]!;
  return {
    name: first("name"),
    contactName: (vals.get("contactName") ?? []).join(" "),
    phone: phones[0] ?? "",
    altPhone: first("altPhone") || phones[1] || "",
    email: first("email"),
    telegram: first("telegram"),
    company: first("company"),
    position: first("position"),
    budget: first("budget"),
    source: first("source"),
    campaign: first("campaign"),
    stream: first("stream"),
    city: first("city"),
    region: first("region"),
    address: first("address"),
    note: (vals.get("note") ?? []).join("\n"),
    stageRaw: first("stage"),
    ownerRaw: first("owner"),
    tags: [
      ...new Set(
        (vals.get("tags") ?? [])
          .flatMap((v) => v.split(/[,;|]/))
          .map((s) => s.trim())
          .filter(Boolean),
      ),
    ],
    customFields,
  };
}

/** Distinct non-empty values of a field across the file, most frequent first. */
function distinctValues(values: string[]): { value: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const v of values) if (v) counts.set(v, (counts.get(v) ?? 0) + 1);
  return [...counts]
    .map(([value, count]) => ({ value, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 150);
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

function SectionTitle({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="mb-2.5">
      <p className="text-[13px] font-semibold text-foreground">{title}</p>
      {hint && <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

/** "In the file -> in the CRM" pairs: stage names or owner names from the file. */
function ValueMap({
  title,
  hint,
  values,
  render,
}: {
  title: string;
  hint: string;
  values: { value: string; count: number }[];
  render: (value: string) => ReactNode;
}) {
  const { t } = useI18n();
  return (
    <section className="rounded-xl border border-border">
      <div className="border-b border-border px-4 pb-1 pt-3">
        <SectionTitle title={title} hint={hint} />
      </div>
      <div className="grid grid-cols-[minmax(0,1fr)_20px_minmax(0,1fr)] items-center gap-x-3 gap-y-2 px-4 py-3">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-subtle">
          {t("import.inFile")}
        </span>
        <span />
        <span className="text-[11px] font-semibold uppercase tracking-wide text-subtle">
          {t("import.inCrm")}
        </span>
        {values.map(({ value, count }) => (
          <div key={value} className="contents">
            <div className="flex min-w-0 items-baseline gap-2 rounded-lg bg-muted/50 px-3 py-2">
              <span className="truncate text-[13px] font-medium text-foreground" title={value}>
                {value}
              </span>
              <span className="shrink-0 text-[11.5px] tabular-nums text-subtle">
                {t("import.leadsCount", { count })}
              </span>
            </div>
            <ArrowRight className="h-4 w-4 text-subtle" />
            {render(value)}
          </div>
        ))}
      </div>
    </section>
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
  const { data: stages } = useCrmStages();
  const { data: profiles = [] } = useProfilesRaw();
  const { data: customDefsData } = useLeadCustomFieldDefs();
  const customDefs = useMemo(() => customDefsData ?? [], [customDefsData]);

  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [rawRows, setRawRows] = useState<string[][] | null>(null);
  const [label, setLabel] = useState("");
  const [firstRowIsHeader, setFirstRowIsHeader] = useState(true);
  const [loading, setLoading] = useState(false);
  const [sheetUrl, setSheetUrl] = useState("");
  const [targets, setTargets] = useState<Target[]>([]);
  const [funnel, setFunnel] = useState(defaultFunnel ?? "Direct Sales");
  const [stageId, setStageId] = useState<string>("");
  const [stageChoice, setStageChoice] = useState<Record<string, string>>({});
  const [ownerChoice, setOwnerChoice] = useState<Record<string, string>>({});
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
    setTargets(guessTargets(sheet.headers, customDefs));
    setStageChoice({});
    setOwnerChoice({});
  }, [sheet, customDefs]);

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
    if (!funnelStages.some((s) => s.id === stageId)) {
      setStageId(
        funnelStages.find((s) => !s.is_won && !s.is_lost)?.id ?? funnelStages[0]?.id ?? "",
      );
    }
  }, [funnelStages, stageId]);

  // New funnel, new stages: earlier stage picks no longer apply.
  useEffect(() => setStageChoice({}), [funnel]);

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

  const readRows = useMemo(
    () => (sheet ? sheet.rows.map((row) => readRow(row, targets)) : []),
    [sheet, targets],
  );
  const stageValues = useMemo(() => distinctValues(readRows.map((r) => r.stageRaw)), [readRows]);
  const ownerValues = useMemo(() => distinctValues(readRows.map((r) => r.ownerRaw)), [readRows]);
  const stageFor = (v: string) => stageChoice[v] ?? guessStage(v, funnelStages);
  const ownerFor = (v: string) => ownerChoice[v] ?? guessOwner(v, profiles);

  const mappedRows = readRows.map(({ stageRaw, ownerRaw, ...r }) => ({
    ...r,
    stageId: (stageRaw && stageFor(stageRaw)) || "",
    ownerId: (ownerRaw && ownerFor(ownerRaw)) || "",
  }));

  const validCount = mappedRows.filter(
    (r) => r.name || r.contactName || r.phone || r.email || r.company,
  ).length;
  const hasIdentity = targets.some((x) => x === "name" || x === "contactName" || x === "phone");
  const mappedColumns = targets.filter((x) => x !== SKIP).length;
  const canContinue = !!sheet && hasIdentity && !!stageId;

  function setTarget(col: number, target: Target) {
    setTargets((prev) =>
      prev.map((x, i) => {
        if (i === col) return target;
        // A single-value field moves to the column it was just picked for.
        if (target !== SKIP && !MULTI.has(target) && x === target) return SKIP;
        return x;
      }),
    );
  }

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
          stageId,
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

  const stageById = new Map(funnelStages.map((s) => [s.id, s]));
  const defaultStage = stageById.get(stageId);
  const profileName = (id: string) => {
    const p = profiles.find((x) => x.id === id);
    return p?.full_name || p?.email || "";
  };
  const previewRows = sheet?.rows.slice(0, 3) ?? [];

  const stageDot = (id: string | undefined) => {
    const c = stageColorProps(stageById.get(id ?? "")?.color);
    return (
      <span className={cn("h-2.5 w-2.5 shrink-0 rounded-full", c.className)} style={c.style} />
    );
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !progress && onOpenChange(v)}>
      <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-5xl">
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
          <div className="min-w-0 space-y-5">
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

            {/* amoCRM's table: file columns, a few rows, and a field picker under each. */}
            <section>
              <div className="flex flex-wrap items-end justify-between gap-2">
                <SectionTitle title={t("import.mapColumns")} hint={t("import.mapColumnsHint")} />
                <span className="mb-2.5 text-xs tabular-nums text-muted-foreground">
                  {t("import.mappedCount", {
                    mapped: mappedColumns,
                    skipped: targets.length - mappedColumns,
                  })}
                </span>
              </div>
              <div className="overflow-x-auto rounded-xl border border-border">
                <table className="border-collapse text-[13px]">
                  <thead>
                    <tr>
                      {sheet.headers.map((h, i) => (
                        <th
                          key={i}
                          className={cn(
                            "w-[200px] min-w-[200px] max-w-[200px] border-b border-r border-border bg-muted/60 px-3 py-2.5 text-left font-semibold last:border-r-0",
                            targets[i] === SKIP ? "text-subtle" : "text-foreground",
                          )}
                        >
                          <span className="block truncate" title={h}>
                            {h}
                          </span>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {previewRows.map((row, r) => (
                      <tr key={r}>
                        {sheet.headers.map((_, i) => (
                          <td
                            key={i}
                            className={cn(
                              "max-w-[200px] border-b border-r border-border px-3 py-2 last:border-r-0",
                              targets[i] === SKIP ? "text-subtle/70" : "text-muted-foreground",
                            )}
                          >
                            <span className="block truncate" title={row[i]}>
                              {row[i] || "—"}
                            </span>
                          </td>
                        ))}
                      </tr>
                    ))}
                    <tr>
                      {sheet.headers.map((_, i) => (
                        <td
                          key={i}
                          className="border-r border-border bg-surface/60 p-2 last:border-r-0"
                        >
                          <Select
                            value={targets[i] ?? SKIP}
                            onValueChange={(v) => setTarget(i, v as Target)}
                          >
                            <SelectTrigger
                              className={cn(
                                "h-9 text-[13px]",
                                targets[i] && targets[i] !== SKIP
                                  ? "border-primary/50 bg-primary/5 font-medium text-foreground"
                                  : "text-muted-foreground",
                              )}
                            >
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent className="max-h-80">
                              <SelectItem value={SKIP}>{t("import.skipColumn")}</SelectItem>
                              {GROUPS.map((g) => (
                                <SelectGroup key={g.labelKey}>
                                  <SelectSeparator />
                                  <SelectLabel className="text-[11px] uppercase tracking-wide text-subtle">
                                    {t(g.labelKey)}
                                  </SelectLabel>
                                  {g.items.map((f) => (
                                    <SelectItem key={f.key} value={f.key}>
                                      {t(f.labelKey)}
                                    </SelectItem>
                                  ))}
                                </SelectGroup>
                              ))}
                              {customDefs.length > 0 && (
                                <SelectGroup>
                                  <SelectSeparator />
                                  <SelectLabel className="text-[11px] uppercase tracking-wide text-subtle">
                                    {t("import.group.custom")}
                                  </SelectLabel>
                                  {customDefs.map((d) => (
                                    <SelectItem key={d.id} value={`custom:${d.key}`}>
                                      {d.label}
                                    </SelectItem>
                                  ))}
                                </SelectGroup>
                              )}
                            </SelectContent>
                          </Select>
                        </td>
                      ))}
                    </tr>
                  </tbody>
                </table>
              </div>
              {!hasIdentity && (
                <p className="mt-2 text-xs text-destructive">{t("import.needIdentity")}</p>
              )}
            </section>

            <section>
              <SectionTitle title={t("import.whereTo")} />
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
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
                  <Label>{t("import.defaultStage")}</Label>
                  <Select value={stageId} onValueChange={setStageId}>
                    <SelectTrigger className="h-9">
                      <SelectValue placeholder={t("import.noStages")} />
                    </SelectTrigger>
                    <SelectContent>
                      {funnelStages.map((s) => (
                        <SelectItem key={s.id} value={s.id}>
                          <span className="flex items-center gap-2">
                            {stageDot(s.id)}
                            {s.name}
                          </span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>{t("import.defaultOwner")}</Label>
                  <Select value={ownerId} onValueChange={setOwnerId}>
                    <SelectTrigger className="h-9">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {profiles.map((p) => (
                        <SelectItem key={p.id} value={p.id}>
                          {p.full_name || p.email}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>{t("import.tags")}</Label>
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
                            aria-label={t("common.delete")}
                            onClick={() => setTags((p) => p.filter((x) => x !== tag))}
                          >
                            <X className="h-3 w-3" />
                          </button>
                        </span>
                      ))}
                    </div>
                  )}
                </div>
                <label className="flex items-center justify-between gap-3 rounded-xl border border-border px-3 py-2 sm:col-span-2 lg:col-span-4">
                  <span className="text-sm text-foreground">{t("import.skipDuplicates")}</span>
                  <Switch checked={skipDuplicates} onCheckedChange={setSkipDuplicates} />
                </label>
              </div>
            </section>

            {stageValues.length > 0 && (
              <ValueMap
                title={t("import.stageMap")}
                hint={t("import.stageMapHint")}
                values={stageValues}
                render={(value) => {
                  const picked = stageFor(value);
                  return (
                    <Select
                      value={picked || DEFAULT}
                      onValueChange={(v) =>
                        setStageChoice((m) => ({ ...m, [value]: v === DEFAULT ? "" : v }))
                      }
                    >
                      <SelectTrigger
                        className={cn(
                          "h-9 text-[13px]",
                          picked ? "font-medium text-foreground" : "text-muted-foreground",
                        )}
                      >
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={DEFAULT}>
                          {t("import.toDefault", { name: defaultStage?.name ?? "" })}
                        </SelectItem>
                        <SelectSeparator />
                        {funnelStages.map((s) => (
                          <SelectItem key={s.id} value={s.id}>
                            <span className="flex items-center gap-2">
                              {stageDot(s.id)}
                              {s.name}
                            </span>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  );
                }}
              />
            )}

            {ownerValues.length > 0 && (
              <ValueMap
                title={t("import.ownerMap")}
                hint={t("import.ownerMapHint")}
                values={ownerValues}
                render={(value) => {
                  const picked = ownerFor(value);
                  return (
                    <Select
                      value={picked || DEFAULT}
                      onValueChange={(v) =>
                        setOwnerChoice((m) => ({ ...m, [value]: v === DEFAULT ? "" : v }))
                      }
                    >
                      <SelectTrigger
                        className={cn(
                          "h-9 text-[13px]",
                          picked ? "font-medium text-foreground" : "text-muted-foreground",
                        )}
                      >
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={DEFAULT}>
                          {t("import.toDefault", { name: profileName(ownerId) })}
                        </SelectItem>
                        <SelectSeparator />
                        {profiles.map((p) => (
                          <SelectItem key={p.id} value={p.id}>
                            {p.full_name || p.email}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  );
                }}
              />
            )}

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
                className="inline-flex h-10 items-center gap-2 rounded-xl bg-primary px-5 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-50"
              >
                {t("import.next")} <ArrowRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}

        {step === 3 && sheet && (
          <div className="min-w-0 space-y-4">
            {!result && (
              <>
                <p className="text-sm text-muted-foreground">
                  {t("import.summaryShort", { count: validCount, funnel })}
                </p>
                <div className="overflow-x-auto rounded-xl border border-border">
                  <table className="w-full min-w-[720px] text-sm">
                    <thead>
                      <tr className="border-b border-border bg-muted/40 text-left text-xs uppercase tracking-wide text-subtle">
                        <th className="px-3 py-2">{t("import.field.leadName")}</th>
                        <th className="px-3 py-2">{t("import.group.contact")}</th>
                        <th className="px-3 py-2">{t("import.field.phone")}</th>
                        <th className="px-3 py-2">{t("import.field.stage")}</th>
                        <th className="px-3 py-2">{t("import.field.owner")}</th>
                        <th className="px-3 py-2">{t("import.field.budget")}</th>
                        <th className="px-3 py-2">{t("import.tags")}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {mappedRows.slice(0, 5).map((r, i) => {
                        const stage = stageById.get(r.stageId) ?? defaultStage;
                        return (
                          <tr key={i} className="border-b border-border last:border-0">
                            <td className="max-w-[180px] truncate px-3 py-2 font-medium text-foreground">
                              {r.name || r.contactName || r.company || r.phone || "—"}
                            </td>
                            <td className="max-w-[160px] truncate px-3 py-2 text-muted-foreground">
                              {r.contactName || "—"}
                            </td>
                            <td className="whitespace-nowrap px-3 py-2 tabular-nums text-muted-foreground">
                              {r.phone || "—"}
                            </td>
                            <td className="px-3 py-2 text-muted-foreground">
                              <span className="flex items-center gap-2">
                                {stageDot(stage?.id)}
                                <span className="truncate">{stage?.name ?? "—"}</span>
                              </span>
                            </td>
                            <td className="max-w-[150px] truncate px-3 py-2 text-muted-foreground">
                              {profileName(r.ownerId || ownerId) || "—"}
                            </td>
                            <td className="px-3 py-2 tabular-nums text-muted-foreground">
                              {r.budget || "—"}
                            </td>
                            <td className="max-w-[160px] truncate px-3 py-2 text-muted-foreground">
                              {[...new Set([...tags, ...r.tags])].join(", ") || "—"}
                            </td>
                          </tr>
                        );
                      })}
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
