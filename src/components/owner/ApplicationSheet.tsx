import { useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  ArrowRight,
  Copy,
  FileText,
  Loader2,
  Mail,
  MessageSquareText,
  Paperclip,
  Phone,
  Receipt,
  Send,
  Trash2,
  Users,
  type LucideIcon,
} from "lucide-react";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { APPLICATION_STATUSES, NOTE_KINDS } from "@/lib/applications";
import { apiFetch } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";

// Owner → Arizalar: one application's card -- contact, status, expected sum,
// and the timeline (notes, receipts with a sum, documents, files).

export const STATUS_LOOK: Record<string, string> = {
  new: "bg-sky-500/15 text-sky-700 dark:text-sky-300",
  contacted: "bg-violet-500/15 text-violet-700 dark:text-violet-300",
  demo: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
  won: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
  lost: "bg-slate-500/15 text-slate-600 dark:text-slate-300",
};

const NOTE_ICON: Record<string, LucideIcon> = {
  note: MessageSquareText,
  receipt: Receipt,
  document: FileText,
  file: Paperclip,
  status: ArrowRight,
};

export function money(n: number | null | undefined): string {
  if (n == null) return "—";
  return `${Math.round(n)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, " ")} so'm`;
}

type App = {
  id: string;
  name: string;
  phone: string;
  email: string | null;
  company: string | null;
  team_size: string | null;
  message: string;
  source: string;
  status: string;
  amount: number | null;
  utm: Record<string, string>;
  created_at: string;
};
type Note = {
  id: string;
  kind: string;
  body: string;
  amount: number | null;
  file_name: string | null;
  file_size: number | null;
  url: string | null;
  author: string | null;
  created_at: string;
};

export function ApplicationSheet({ id, onClose }: { id: string | null; onClose: () => void }) {
  const { t } = useI18n();
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ["owner-application", id],
    enabled: !!id,
    queryFn: async (): Promise<{ app: App; notes: Note[] }> => {
      const res = await apiFetch(`/platform/applications-api?id=${id}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json();
    },
  });
  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ["owner-application", id] });
    void qc.invalidateQueries({ queryKey: ["owner-applications"] });
  };
  const patch = useMutation({
    mutationFn: async (p: Record<string, unknown>) => {
      const res = await apiFetch("/platform/applications-api", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id, ...p }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
    },
    onSuccess: refresh,
  });
  const delNote = useMutation({
    mutationFn: async (noteId: string) => {
      await apiFetch(`/platform/applications-api?note=${noteId}`, { method: "DELETE" });
    },
    onSuccess: refresh,
  });

  const app = data?.app;
  return (
    <Sheet open={!!id} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="flex w-full flex-col gap-0 p-0 sm:max-w-[520px]">
        {isLoading || !app ? (
          <div className="grid flex-1 place-items-center">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <>
            <div className="border-b border-border px-5 pb-4 pt-5">
              <SheetTitle className="pr-8 text-[17px] font-bold">{app.name}</SheetTitle>
              <p className="mt-0.5 text-[12.5px] text-muted-foreground">
                {[app.company, t(`apps.src.${app.source}`)].filter(Boolean).join(" · ")} ·{" "}
                {new Date(app.created_at).toLocaleString("ru-RU", {
                  day: "2-digit",
                  month: "2-digit",
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </p>
              <div className="mt-3 flex flex-wrap gap-1.5">
                {APPLICATION_STATUSES.map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => s !== app.status && patch.mutate({ status: s })}
                    className={cn(
                      "h-7 rounded-full px-3 text-[12px] font-semibold transition-colors",
                      s === app.status
                        ? STATUS_LOOK[s]
                        : "border border-border text-muted-foreground hover:text-foreground",
                    )}
                  >
                    {t(`apps.st.${s}`)}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex-1 overflow-y-auto">
              <div className="grid grid-cols-2 gap-px border-b border-border bg-border">
                <Fact icon={Phone} label={t("apps.phone")}>
                  <a href={`tel:${app.phone}`} className="hover:text-primary">
                    {app.phone}
                  </a>
                  <button
                    type="button"
                    aria-label={t("apps.copy")}
                    onClick={() => {
                      void navigator.clipboard.writeText(app.phone);
                      toast.success(t("apps.copied"));
                    }}
                    className="ml-1.5 text-subtle hover:text-foreground"
                  >
                    <Copy className="h-3.5 w-3.5" />
                  </button>
                </Fact>
                <Fact icon={Mail} label="Email">
                  {app.email ? (
                    <a href={`mailto:${app.email}`} className="truncate hover:text-primary">
                      {app.email}
                    </a>
                  ) : (
                    "—"
                  )}
                </Fact>
                <Fact icon={Users} label={t("apps.team")}>
                  {app.team_size ?? "—"}
                </Fact>
                <Fact icon={Receipt} label={t("apps.amount")}>
                  <AmountEdit value={app.amount} onSave={(v) => patch.mutate({ amount: v })} />
                </Fact>
              </div>
              {app.message && (
                <p className="whitespace-pre-line border-b border-border px-5 py-3.5 text-[13px] leading-relaxed text-foreground">
                  {app.message}
                </p>
              )}
              {Object.keys(app.utm ?? {}).length > 0 && (
                <p className="border-b border-border px-5 py-2 font-mono text-[11px] text-subtle">
                  {Object.entries(app.utm)
                    .map(([k, v]) => `${k}=${v}`)
                    .join("  ")}
                </p>
              )}

              <Composer appId={app.id} onDone={refresh} />

              <ul className="px-5 pb-6">
                {(data?.notes ?? []).map((n) => {
                  const Icon = NOTE_ICON[n.kind] ?? MessageSquareText;
                  const [from, to] = n.kind === "status" ? n.body.split("→") : [];
                  return (
                    <li key={n.id} className="group flex gap-3 border-b border-border/60 py-3">
                      <span className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-muted text-muted-foreground">
                        <Icon className="h-3.5 w-3.5" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="text-[11.5px] text-subtle">
                          {t(`apps.nk.${n.kind}`)}
                          {n.author ? ` · ${n.author}` : ""} ·{" "}
                          {new Date(n.created_at).toLocaleString("ru-RU", {
                            day: "2-digit",
                            month: "2-digit",
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </p>
                        {n.kind === "status" ? (
                          <p className="mt-0.5 text-[13px] text-foreground">
                            {t(`apps.st.${from}`)} → <b>{t(`apps.st.${to}`)}</b>
                          </p>
                        ) : (
                          n.body && (
                            <p className="mt-0.5 whitespace-pre-line text-[13px] text-foreground">
                              {n.body}
                            </p>
                          )
                        )}
                        {n.kind === "receipt" && n.amount != null && (
                          <p className="mt-0.5 text-[13px] font-semibold tabular-nums text-emerald-600 dark:text-emerald-400">
                            +{money(n.amount)}
                          </p>
                        )}
                        {n.url && (
                          <a
                            href={n.url}
                            target="_blank"
                            rel="noreferrer"
                            className="mt-1.5 inline-flex max-w-full items-center gap-1.5 rounded-md border border-border px-2 py-1 text-[12px] font-medium text-foreground hover:border-primary"
                          >
                            <Paperclip className="h-3 w-3 shrink-0" />
                            <span className="truncate">{n.file_name}</span>
                            {n.file_size != null && (
                              <span className="shrink-0 text-subtle">
                                {Math.max(1, Math.round(n.file_size / 1024))} KB
                              </span>
                            )}
                          </a>
                        )}
                      </div>
                      {n.kind !== "status" && (
                        <button
                          type="button"
                          aria-label={t("common.delete")}
                          onClick={() => delNote.mutate(n.id)}
                          className="h-7 w-7 shrink-0 rounded-md text-subtle opacity-0 transition-opacity hover:text-rose-600 group-hover:opacity-100"
                        >
                          <Trash2 className="mx-auto h-3.5 w-3.5" />
                        </button>
                      )}
                    </li>
                  );
                })}
              </ul>
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}

function Fact({
  icon: Icon,
  label,
  children,
}: {
  icon: LucideIcon;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="min-w-0 bg-dialog px-5 py-3">
      <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.06em] text-subtle">
        <Icon className="h-3 w-3" /> {label}
      </p>
      <div className="mt-1 flex min-w-0 items-center text-[13.5px] font-medium text-foreground">
        {children}
      </div>
    </div>
  );
}

function AmountEdit({
  value,
  onSave,
}: {
  value: number | null;
  onSave: (v: number | null) => void;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  if (draft === null)
    return (
      <button
        type="button"
        onClick={() => setDraft(value != null ? String(value) : "")}
        className="tabular-nums hover:text-primary"
      >
        {money(value)}
      </button>
    );
  const save = () => {
    const n = Number(draft.replace(/\s/g, ""));
    onSave(draft.trim() && Number.isFinite(n) ? n : null);
    setDraft(null);
  };
  return (
    <input
      autoFocus
      inputMode="numeric"
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={save}
      onKeyDown={(e) => e.key === "Enter" && save()}
      className="h-7 w-full rounded-md border border-primary bg-background px-2 text-[13px] tabular-nums outline-none"
    />
  );
}

function Composer({ appId, onDone }: { appId: string; onDone: () => void }) {
  const { t } = useI18n();
  const [kind, setKind] = useState<(typeof NOTE_KINDS)[number]>("note");
  const [body, setBody] = useState("");
  const [amount, setAmount] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const send = useMutation({
    mutationFn: async () => {
      const fd = new FormData();
      fd.set("id", appId);
      fd.set("kind", kind);
      fd.set("body", body);
      if (kind === "receipt") fd.set("amount", amount);
      if (file) fd.set("file", file);
      const res = await apiFetch("/platform/applications-api", { method: "POST", body: fd });
      const j = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(j.error ?? `HTTP ${res.status}`);
    },
    onSuccess: () => {
      setBody("");
      setAmount("");
      setFile(null);
      if (input.current) input.current.value = "";
      onDone();
    },
    onError: (e: Error) => toast.error(e.message === "TOO_BIG" ? t("apps.tooBig") : e.message),
  });
  const canSend = (body.trim() || file) && !send.isPending;
  return (
    <div className="border-b border-border bg-surface/60 px-5 py-3.5">
      <div className="flex gap-1">
        {NOTE_KINDS.map((k) => {
          const Icon = NOTE_ICON[k]!;
          return (
            <button
              key={k}
              type="button"
              onClick={() => setKind(k)}
              className={cn(
                "inline-flex h-7 items-center gap-1.5 rounded-md px-2.5 text-[12px] font-semibold transition-colors",
                kind === k
                  ? "bg-card text-foreground ring-1 ring-border"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              <Icon className="h-3.5 w-3.5" />
              {t(`apps.nk.${k}`)}
            </button>
          );
        })}
      </div>
      <textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        placeholder={t(`apps.ph.${kind}`)}
        rows={2}
        className="mt-2 w-full resize-none rounded-lg border border-border bg-background px-3 py-2 text-[13px] outline-none placeholder:text-subtle focus:border-primary"
      />
      <div className="mt-2 flex items-center gap-2">
        {kind === "receipt" && (
          <input
            inputMode="numeric"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder={t("apps.sumPh")}
            className="h-8 w-36 rounded-lg border border-border bg-background px-2.5 text-[12.5px] tabular-nums outline-none focus:border-primary"
          />
        )}
        <label className="inline-flex h-8 min-w-0 cursor-pointer items-center gap-1.5 rounded-lg border border-dashed border-border px-2.5 text-[12px] text-muted-foreground hover:text-foreground">
          <Paperclip className="h-3.5 w-3.5 shrink-0" />
          <span className="truncate">{file ? file.name : t("apps.attach")}</span>
          <input
            ref={input}
            type="file"
            className="hidden"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          />
        </label>
        <button
          type="button"
          disabled={!canSend}
          onClick={() => send.mutate()}
          className="ml-auto inline-flex h-8 items-center gap-1.5 rounded-lg bg-primary px-3 text-[12.5px] font-semibold text-primary-foreground disabled:opacity-40"
        >
          {send.isPending ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Send className="h-3.5 w-3.5" />
          )}
          {t("apps.add")}
        </button>
      </div>
    </div>
  );
}
