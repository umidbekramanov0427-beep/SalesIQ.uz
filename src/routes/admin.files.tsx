import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Check,
  CloudDownload,
  FileText,
  HardDrive,
  Instagram,
  Loader2,
  RotateCcw,
  Send,
  ShieldAlert,
  Trash2,
  Upload,
} from "lucide-react";
import { toast } from "sonner";
import { PageHeader, SectionCard } from "@/components/layout/Primitives";
import { AdminBackLink } from "@/components/admin/AdminBackLink";
import { Switch } from "@/components/ui/switch";
import { useOrgGeneralSettings, useUpdateOrgGeneralSettings } from "@/hooks/use-crm-data";
import { apiFetch } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import {
  FILE_AUTOLOAD,
  TRASH_DAYS,
  formatBytes,
  trashDaysLeft,
  type FileAutoload,
} from "@/lib/file-rules";
import { useI18n } from "@/lib/i18n";
import { cn, describeError, formatDate } from "@/lib/utils";

// Admin → Fayllar va xotira, amoCRM's file settings: how much the
// company's files take, which chat files are copied automatically, the
// rules that move files to the trash, and the trash itself (restore within
// 30 days; the 5-minute cron removes what's older).

export const Route = createFileRoute("/admin/files")({
  head: () => ({ meta: [{ title: "Fayllar va xotira — SalesIQ" }] }),
  component: FilesPage,
});

type Trashed = {
  id: string;
  name: string;
  size: number;
  source: string;
  leadId: string;
  leadName: string;
  deletedAt: string;
  deletedBy: string | null;
};
type Usage = {
  activeBytes: number;
  activeCount: number;
  trashBytes: number;
  trashCount: number;
  bySource: Record<string, { bytes: number; count: number }>;
};

const SOURCE_ICON = { upload: Upload, telegram: Send, instagram: Instagram } as const;
const SOURCE_COLOR: Record<string, string> = {
  upload: "#5b8cff",
  telegram: "#27a7e7",
  instagram: "#e1306c",
};

function useTrash() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["lead-files-trash", user?.organizationId],
    enabled: !!user?.organizationId,
    queryFn: async (): Promise<{ files: Trashed[]; usage: Usage }> => {
      const res = await apiFetch("/lead-files/trash");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return (await res.json()) as { files: Trashed[]; usage: Usage };
    },
  });
}

function FilesPage() {
  const { t } = useI18n();
  const { user } = useAuth();
  if (user && user.role !== "super_admin" && user.role !== "platform_owner") {
    return (
      <>
        <AdminBackLink />
        <SectionCard
          icon={ShieldAlert}
          tone="rose"
          title={t("admin.restrictedTitle")}
          description={t("admin.restrictedDesc")}
        >
          <p className="text-sm text-muted-foreground">{t("admin.restrictedHint")}</p>
        </SectionCard>
      </>
    );
  }
  return (
    <>
      <PageHeader
        title={t("files.title")}
        description={t("files.desc")}
        icon={HardDrive}
        tone="slate"
      />
      <div className="space-y-5">
        <UsageCard />
        <AutoloadCard />
        <RulesCard />
        <TrashCard />
      </div>
    </>
  );
}

function UsageCard() {
  const { t } = useI18n();
  const { data, isLoading } = useTrash();
  const u = data?.usage;
  const sources = (["upload", "telegram", "instagram"] as const).map((k) => ({
    key: k,
    ...(u?.bySource[k] ?? { bytes: 0, count: 0 }),
  }));
  const total = u?.activeBytes ?? 0;
  return (
    <SectionCard icon={HardDrive} tone="slate" title={t("files.usage")} info={t("files.usageInfo")}>
      {isLoading || !u ? (
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      ) : (
        <div className="grid gap-5 md:grid-cols-[minmax(0,260px)_1fr]">
          <div>
            <p className="font-display text-[34px] font-bold leading-none tabular-nums text-foreground">
              {formatBytes(total)}
            </p>
            <p className="mt-1.5 text-[13px] text-muted-foreground">
              {t("files.countN", { n: u.activeCount })}
            </p>
            <p className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-muted px-3 py-1 text-[12.5px] font-semibold text-muted-foreground">
              <Trash2 className="h-3.5 w-3.5" />
              {t("files.inTrash", { size: formatBytes(u.trashBytes), n: u.trashCount })}
            </p>
          </div>
          <div className="min-w-0">
            <div className="flex h-2.5 overflow-hidden rounded-full bg-muted">
              {sources.map((s) =>
                s.bytes ? (
                  <span
                    key={s.key}
                    style={{
                      width: `${(s.bytes / Math.max(total, 1)) * 100}%`,
                      background: SOURCE_COLOR[s.key],
                    }}
                  />
                ) : null,
              )}
            </div>
            <ul className="mt-3 space-y-2">
              {sources.map((s) => {
                const Icon = SOURCE_ICON[s.key];
                return (
                  <li key={s.key} className="flex items-center gap-2.5 text-[13.5px]">
                    <i
                      className="h-2.5 w-2.5 shrink-0 rounded-[3px]"
                      style={{ background: SOURCE_COLOR[s.key] }}
                    />
                    <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
                    <span className="min-w-0 flex-1 text-foreground">
                      {t(`files.source.${s.key}`)}
                    </span>
                    <span className="tabular-nums text-subtle">
                      {t("files.countN", { n: s.count })}
                    </span>
                    <b className="w-20 text-right tabular-nums text-foreground">
                      {formatBytes(s.bytes)}
                    </b>
                  </li>
                );
              })}
            </ul>
          </div>
        </div>
      )}
    </SectionCard>
  );
}

function AutoloadCard() {
  const { t } = useI18n();
  const { data: general } = useOrgGeneralSettings();
  const update = useUpdateOrgGeneralSettings();
  const current = (FILE_AUTOLOAD as string[]).includes(general?.file_autoload ?? "")
    ? (general!.file_autoload as FileAutoload)
    : "smart";
  function pick(v: FileAutoload) {
    update.mutate(
      { file_autoload: v },
      {
        onSuccess: () => toast.success(t("files.saved")),
        onError: (e) => toast.error(describeError(e, t("fs.saveFailedMigration"))),
      },
    );
  }
  return (
    <SectionCard
      icon={CloudDownload}
      tone="sky"
      title={t("files.autoload")}
      description={t("files.autoloadDesc")}
    >
      <p className="mb-2 text-[13px] font-semibold text-foreground">{t("files.autoloadPick")}</p>
      <div role="radiogroup" className="space-y-2">
        {(["none", "all", "smart"] as const).map((v) => {
          const on = v === current;
          return (
            <button
              key={v}
              type="button"
              role="radio"
              aria-checked={on}
              disabled={update.isPending}
              onClick={() => pick(v)}
              className={cn(
                "flex w-full items-start gap-3 rounded-xl border px-4 py-3 text-left transition-colors",
                on
                  ? "border-primary/60 bg-primary/[0.07]"
                  : "border-border hover:border-primary/35 hover:bg-accent/40",
              )}
            >
              <span
                className={cn(
                  "mt-0.5 grid h-4 w-4 shrink-0 place-items-center rounded-full border",
                  on ? "border-primary bg-primary text-primary-foreground" : "border-border",
                )}
              >
                {on && <Check className="h-2.5 w-2.5" strokeWidth={3.5} />}
              </span>
              <span className="min-w-0">
                <span className="block text-[13.5px] font-semibold text-foreground">
                  {t(`files.autoload.${v}`)}
                  {v === "smart" && (
                    <span className="ml-2 rounded-full bg-success/12 px-2 py-0.5 text-[11px] font-semibold text-success">
                      {t("files.recommended")}
                    </span>
                  )}
                </span>
                <span className="mt-0.5 block text-[12.5px] leading-snug text-muted-foreground">
                  {t(`files.autoload.${v}.desc`)}
                </span>
              </span>
            </button>
          );
        })}
      </div>
    </SectionCard>
  );
}

function DaysRule({
  label,
  hint,
  value,
  onSave,
  pending,
}: {
  label: string;
  hint: string;
  value: number | null;
  onSave: (v: number | null) => void;
  pending: boolean;
}) {
  const { t } = useI18n();
  const [on, setOn] = useState(value != null);
  const [days, setDays] = useState(String(value ?? 180));
  useEffect(() => {
    setOn(value != null);
    setDays(String(value ?? 180));
  }, [value]);
  const n = Math.round(Number(days));
  const valid = Number.isFinite(n) && n >= 1 && n <= 3650;
  const dirty = on !== (value != null) || (on && n !== value);
  return (
    <div className="rounded-xl border border-border px-4 py-3.5">
      <div className="flex items-start justify-between gap-3">
        <span className="min-w-0">
          <span className="block text-[13.5px] font-semibold text-foreground">{label}</span>
          <span className="mt-0.5 block text-[12.5px] leading-snug text-muted-foreground">
            {hint}
          </span>
        </span>
        <Switch checked={on} onCheckedChange={setOn} aria-label={label} />
      </div>
      {on && (
        <div className="mt-3 flex flex-wrap items-center gap-2.5">
          <div className="flex h-9 items-center rounded-lg border border-border bg-background focus-within:border-primary">
            <input
              inputMode="numeric"
              value={days}
              onChange={(e) => setDays(e.target.value.replace(/\D/g, "").slice(0, 4))}
              className="h-full w-20 bg-transparent px-3 text-[13px] font-semibold tabular-nums text-foreground outline-none"
            />
            <span className="pr-3 text-[12px] text-subtle">{t("cardset.unit.days")}</span>
          </div>
          {!valid && <span className="text-[12px] text-destructive">{t("files.daysRange")}</span>}
        </div>
      )}
      {dirty && (
        <button
          type="button"
          disabled={pending || (on && !valid)}
          onClick={() => onSave(on ? n : null)}
          className="mt-3 inline-flex h-9 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-40"
        >
          {pending && <Loader2 className="h-4 w-4 animate-spin" />}
          {t("rbac.save")}
        </button>
      )}
    </div>
  );
}

function RulesCard() {
  const { t } = useI18n();
  const { data: general } = useOrgGeneralSettings();
  const update = useUpdateOrgGeneralSettings();
  const save = (patch: {
    file_retention_days?: number | null;
    file_lost_lead_days?: number | null;
  }) =>
    update.mutate(patch, {
      onSuccess: () => toast.success(t("files.saved")),
      onError: (e) => toast.error(describeError(e, t("fs.saveFailedMigration"))),
    });
  return (
    <SectionCard
      icon={Trash2}
      tone="rose"
      title={t("files.rules")}
      description={t("files.rulesDesc", { n: TRASH_DAYS })}
    >
      <div className="space-y-3">
        <DaysRule
          label={t("files.ruleOld")}
          hint={t("files.ruleOldHint")}
          value={general?.file_retention_days ?? null}
          pending={update.isPending}
          onSave={(v) => save({ file_retention_days: v })}
        />
        <DaysRule
          label={t("files.ruleLost")}
          hint={t("files.ruleLostHint")}
          value={general?.file_lost_lead_days ?? null}
          pending={update.isPending}
          onSave={(v) => save({ file_lost_lead_days: v })}
        />
      </div>
    </SectionCard>
  );
}

function TrashCard() {
  const { t } = useI18n();
  const qc = useQueryClient();
  const { data, isLoading } = useTrash();
  const restore = useMutation({
    mutationFn: async (fileId: string) => {
      const res = await apiFetch("/lead-files/restore", {
        method: "POST",
        body: JSON.stringify({ fileId }),
      });
      const json = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(json.error ?? t("files.restoreFailed"));
    },
    onSuccess: () => {
      toast.success(t("files.restored"));
      void qc.invalidateQueries({ queryKey: ["lead-files-trash"] });
      void qc.invalidateQueries({ queryKey: ["lead_files"] });
    },
    onError: (e) => toast.error(describeError(e, t("files.restoreFailed"))),
  });
  const files = data?.files ?? [];
  return (
    <SectionCard
      icon={RotateCcw}
      tone="amber"
      title={t("files.trash")}
      description={t("files.trashDesc", { n: TRASH_DAYS })}
    >
      {isLoading ? (
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      ) : files.length === 0 ? (
        <p className="rounded-xl bg-surface py-8 text-center text-sm text-muted-foreground">
          {t("files.trashEmpty")}
        </p>
      ) : (
        <div className="overflow-hidden rounded-xl border border-border">
          {files.map((f) => {
            const left = trashDaysLeft(f.deletedAt);
            const Icon = SOURCE_ICON[f.source as keyof typeof SOURCE_ICON] ?? FileText;
            return (
              <div
                key={f.id}
                className="flex flex-wrap items-center gap-x-4 gap-y-1.5 border-b border-border px-4 py-3 last:border-b-0"
              >
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-muted text-muted-foreground">
                  <Icon className="h-4 w-4" />
                </span>
                <span className="min-w-[200px] flex-1">
                  <span className="block truncate text-[13.5px] font-semibold text-foreground">
                    {f.name}
                  </span>
                  <span className="block truncate text-[12px] text-muted-foreground">
                    {f.leadName} · {formatBytes(f.size)}
                  </span>
                </span>
                <span className="w-[180px] text-[12.5px] text-muted-foreground">
                  {formatDate(f.deletedAt)}
                  {f.deletedBy ? ` · ${f.deletedBy}` : ""}
                </span>
                <span
                  className={cn(
                    "w-[110px] text-[12.5px] font-semibold tabular-nums",
                    left <= 3 ? "text-destructive" : "text-amber-600 dark:text-amber-400",
                  )}
                >
                  {t("files.daysLeft", { n: left })}
                </span>
                <button
                  type="button"
                  disabled={restore.isPending}
                  onClick={() => restore.mutate(f.id)}
                  className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-border px-3 text-[13px] font-semibold text-foreground transition-colors hover:border-primary/50 hover:bg-primary/10 disabled:opacity-50"
                >
                  <RotateCcw className="h-3.5 w-3.5" /> {t("files.restore")}
                </button>
              </div>
            );
          })}
        </div>
      )}
    </SectionCard>
  );
}
