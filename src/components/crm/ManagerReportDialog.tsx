import { useEffect, useMemo, useRef, useState } from "react";
import { Check, Copy, FileText, Loader2, Pencil, RefreshCw, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { useAuth } from "@/lib/auth";
import { useI18n } from "@/lib/i18n";
import { cn, describeError } from "@/lib/utils";
import {
  DEFAULT_MANAGER_REPORT_TEMPLATE,
  MANAGER_REPORT_VARIABLES,
  fillManagerReport,
} from "@/lib/manager-report";
import { useMyDailyReport, useSetManagerReportTemplate } from "@/hooks/use-crm-data";

// "Hisobot" inside a funnel: today's report for the signed-in manager, ready
// to copy into the team's Telegram group. Nothing is downloaded -- the text
// is shown in the middle of the screen and can still be touched up (e.g.
// "Holat") before copying. Super admins and ROPs can change the template
// everyone's report follows.

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const area = document.createElement("textarea");
    area.value = text;
    area.style.position = "fixed";
    area.style.opacity = "0";
    document.body.appendChild(area);
    area.select();
    const ok = document.execCommand("copy");
    area.remove();
    return ok;
  }
}

export function ManagerReportDialog({
  open,
  onOpenChange,
  funnel,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  funnel: string;
}) {
  const { t } = useI18n();
  const { user } = useAuth();
  const canEditTemplate =
    user?.role === "super_admin" || user?.role === "rop" || user?.role === "platform_owner";
  const report = useMyDailyReport(funnel, open);
  const saveTemplate = useSetManagerReportTemplate();
  const data = report.data ?? null;
  const template = data?.template?.trim() ? data.template : DEFAULT_MANAGER_REPORT_TEMPLATE;

  const [text, setText] = useState("");
  const [copied, setCopied] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(template);
  const draftRef = useRef<HTMLTextAreaElement>(null);

  const filled = useMemo(
    () => (data ? fillManagerReport(editing ? draft : template, data, funnel) : ""),
    [data, template, draft, editing, funnel],
  );
  // The editable report text follows the numbers until the manager types.
  useEffect(() => setText(filled), [filled]);
  useEffect(() => {
    if (!open) {
      setEditing(false);
      setCopied(false);
    }
  }, [open]);

  async function copy() {
    if (await copyText(text)) {
      setCopied(true);
      toast.success(t("mreport.copied"));
      setTimeout(() => setCopied(false), 2000);
    } else {
      toast.error(t("mreport.copyFailed"));
    }
  }

  function insertVariable(name: string) {
    const token = `{${name}}`;
    const el = draftRef.current;
    if (!el) return setDraft((d) => d + token);
    const start = el.selectionStart ?? draft.length;
    const end = el.selectionEnd ?? draft.length;
    setDraft(draft.slice(0, start) + token + draft.slice(end));
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(start + token.length, start + token.length);
    });
  }

  async function save(next: string | null) {
    try {
      await saveTemplate.mutateAsync(next);
      toast.success(t("mreport.templateSaved"));
      setEditing(false);
    } catch (err) {
      toast.error(describeError(err, t("mreport.templateFailed")));
    }
  }

  const dayLabel = data?.day ? data.day.split("-").reverse().join(".") : "";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] max-w-xl gap-0 overflow-hidden p-0">
        <div className="flex items-start gap-3 border-b border-border px-5 pb-4 pt-5">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
            <FileText className="h-[18px] w-[18px]" />
          </span>
          <div className="min-w-0">
            <DialogTitle className="text-[15px] font-semibold">{t("mreport.title")}</DialogTitle>
            <p className="mt-0.5 truncate text-[12.5px] text-muted-foreground">
              {funnel}
              {dayLabel ? ` · ${dayLabel}` : ""}
            </p>
          </div>
        </div>

        <div className="max-h-[62dvh] overflow-y-auto px-5 py-4">
          {report.isLoading && (
            <div className="flex items-center gap-2 py-10 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> {t("mreport.loading")}
            </div>
          )}
          {report.error && (
            <p className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-[13px] text-destructive">
              {t("mreport.failed")}: {describeError(report.error, "")}
            </p>
          )}

          {data && editing && (
            <div className="mb-4 space-y-2">
              <p className="text-[12px] font-semibold uppercase tracking-wider text-subtle">
                {t("mreport.templateTitle")}
              </p>
              <textarea
                ref={draftRef}
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                rows={12}
                className="w-full resize-y rounded-lg border border-border bg-background p-3 font-mono text-[12.5px] leading-relaxed text-foreground outline-none focus:border-primary"
              />
              <p className="text-[12px] text-muted-foreground">{t("mreport.variablesHint")}</p>
              <div className="flex flex-wrap gap-1.5">
                {MANAGER_REPORT_VARIABLES.map((v) => (
                  <button
                    key={v}
                    type="button"
                    title={t(`mreport.var.${v}`)}
                    onClick={() => insertVariable(v)}
                    className="rounded-md border border-border bg-muted/50 px-1.5 py-0.5 font-mono text-[11.5px] text-foreground hover:border-primary/50 hover:bg-primary/5"
                  >
                    {`{${v}}`}
                  </button>
                ))}
              </div>
              <p className="pt-2 text-[12px] font-semibold uppercase tracking-wider text-subtle">
                {t("mreport.preview")}
              </p>
            </div>
          )}

          {data && (
            <>
              <textarea
                value={text}
                onChange={(e) => setText(e.target.value)}
                readOnly={editing}
                rows={Math.min(18, Math.max(10, text.split("\n").length + 1))}
                className={cn(
                  "w-full resize-y rounded-xl border border-border bg-muted/30 p-4 text-[14px] leading-relaxed text-foreground outline-none focus:border-primary",
                  editing && "opacity-80",
                )}
              />
              {!editing && (
                <p className="mt-2 text-[12px] text-muted-foreground">{t("mreport.hint")}</p>
              )}
            </>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2 border-t border-border bg-muted/30 px-5 py-3">
          {editing ? (
            <>
              <button
                type="button"
                disabled={saveTemplate.isPending}
                onClick={() => void save(draft)}
                className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-primary px-4 text-[13px] font-semibold text-primary-foreground shadow-sm hover:brightness-110 disabled:opacity-60"
              >
                {saveTemplate.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                {t("mreport.saveTemplate")}
              </button>
              <button
                type="button"
                disabled={saveTemplate.isPending}
                onClick={() => setDraft(DEFAULT_MANAGER_REPORT_TEMPLATE)}
                className="inline-flex h-9 items-center gap-1.5 rounded-lg px-3 text-[13px] font-medium text-muted-foreground hover:bg-accent hover:text-foreground"
              >
                <RotateCcw className="h-3.5 w-3.5" /> {t("mreport.resetTemplate")}
              </button>
              <button
                type="button"
                onClick={() => setEditing(false)}
                className="ml-auto h-9 rounded-lg px-3 text-[13px] font-medium text-muted-foreground hover:bg-accent hover:text-foreground"
              >
                {t("common.cancel")}
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                disabled={!data}
                onClick={() => void copy()}
                className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-primary px-4 text-[13px] font-semibold text-primary-foreground shadow-sm hover:brightness-110 disabled:opacity-60"
              >
                {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                {copied ? t("mreport.copied") : t("mreport.copy")}
              </button>
              <button
                type="button"
                disabled={report.isFetching}
                onClick={() => void report.refetch()}
                className="inline-flex h-9 items-center gap-1.5 rounded-lg px-3 text-[13px] font-medium text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-60"
              >
                <RefreshCw className={cn("h-3.5 w-3.5", report.isFetching && "animate-spin")} />
                {t("mreport.refresh")}
              </button>
              {canEditTemplate && data && (
                <button
                  type="button"
                  onClick={() => {
                    setDraft(template);
                    setEditing(true);
                  }}
                  className="ml-auto inline-flex h-9 items-center gap-1.5 rounded-lg px-3 text-[13px] font-medium text-muted-foreground hover:bg-accent hover:text-foreground"
                >
                  <Pencil className="h-3.5 w-3.5" /> {t("mreport.editTemplate")}
                </button>
              )}
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
