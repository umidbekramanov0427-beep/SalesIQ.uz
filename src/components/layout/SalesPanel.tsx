import { useMemo, useState, type ReactNode } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import {
  Archive,
  ArchiveRestore,
  Building2,
  ChevronLeft,
  ChevronRight,
  Copy,
  FileText,
  List,
  Loader2,
  MoreHorizontal,
  Plus,
  Settings2,
  Trash2,
  Undo2,
  UserRound,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useAuth } from "@/lib/auth";
import {
  useCreatePipeline,
  useCreateStage,
  useCrmStages,
  useDeletePipeline,
  usePipelines,
  useUpdatePipeline,
} from "@/hooks/use-crm-data";
import { DEFAULT_FUNNEL_STAGES, defaultStageRows, createStageRows } from "@/lib/funnel-defaults";
import { useI18n } from "@/lib/i18n";
import { cn, describeError } from "@/lib/utils";

// The rail's «Voronkalar» panel (5CRM's «Sotuv» panel): every funnel with
// the active one marked, a new funnel typed in place, each funnel's own menu
// (settings, copy, archive, delete), the sales directory (contacts,
// companies, files, all leads, refunds) and the archived funnels on an inner
// screen. Setting funnels up is the company admin's; others only open them.

export function SalesPanel({
  activeFunnel,
  onDone,
  onMenu,
}: {
  activeFunnel?: string;
  onDone: () => void;
  onMenu?: (open: boolean) => void;
}) {
  const { t } = useI18n();
  const navigate = useNavigate();
  const { user } = useAuth();
  const canSetUp = user?.role === "super_admin" || user?.role === "platform_owner";
  const { data: pipelines = [] } = usePipelines();
  const { data: stages = [] } = useCrmStages();
  const createPipeline = useCreatePipeline();
  const updatePipeline = useUpdatePipeline();
  const deletePipeline = useDeletePipeline();
  const createStage = useCreateStage();
  const [archiveView, setArchiveView] = useState(false);
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [toDelete, setToDelete] = useState<(typeof pipelines)[number] | null>(null);
  const [agree, setAgree] = useState(false);
  async function confirmDelete() {
    const p = toDelete;
    if (!p) return;
    setBusy(p.id);
    try {
      await deletePipeline.mutateAsync(p.id);
      toast.success(t("salesp.deleted"));
      setToDelete(null);
      setAgree(false);
      onMenu?.(false);
    } catch (err) {
      toast.error(describeError(err, t("fs.saveFailed")));
    } finally {
      setBusy(null);
    }
  }
  const deleteWindow = (
    <Dialog
      open={!!toDelete}
      onOpenChange={(v) => {
        if (!v) {
          setToDelete(null);
          setAgree(false);
          onMenu?.(false);
        }
      }}
    >
      <DialogContent className="amo-skin max-w-[440px] rounded-[6px] p-6">
        <DialogTitle className="pr-6 text-[16px] font-medium leading-snug">
          {t("salesp.deleteConfirm", { name: toDelete?.name ?? "" })}
        </DialogTitle>
        <label className="mt-3 flex cursor-pointer items-start gap-2.5 text-[13px] leading-snug text-muted-foreground">
          <input
            type="checkbox"
            checked={agree}
            onChange={(e) => setAgree(e.target.checked)}
            className="mt-0.5 h-4 w-4 accent-[var(--primary)]"
          />
          {t("salesp.deleteAgree")}
        </label>
        <div className="mt-5 flex items-center gap-3">
          <button
            type="button"
            disabled={!agree || busy === toDelete?.id}
            onClick={() => void confirmDelete()}
            className="h-9 rounded-[4px] bg-destructive px-4 text-[13px] font-semibold text-white disabled:opacity-40"
          >
            {t("salesp.deleteYes")}
          </button>
          <button
            type="button"
            onClick={() => {
              setToDelete(null);
              setAgree(false);
              onMenu?.(false);
            }}
            className="h-9 px-2 text-[13px] font-semibold text-muted-foreground hover:text-foreground"
          >
            {t("common.cancel")}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );

  const sorted = useMemo(
    () => [...pipelines].sort((a, b) => (a.position ?? 0) - (b.position ?? 0)),
    [pipelines],
  );
  const isArchived = (p: (typeof sorted)[number]) =>
    !!(p as { archived_at?: string | null }).archived_at;
  // A funnel can live only in its stages (made before funnels had their own
  // row): it is listed too, without the set-up menu.
  const orphans = useMemo(() => {
    const known = new Set(pipelines.map((p) => p.name));
    const names = new Set<string>();
    for (const st of stages) {
      const n = st.pipeline_name || "";
      if (n && !known.has(n) && !st.pipeline_id) names.add(n);
    }
    return [...names]
      .sort()
      .map(
        (name) =>
          ({ id: `name:${name}`, name, position: 9999 }) as unknown as (typeof sorted)[number],
      );
  }, [pipelines, stages]);
  const live = [...sorted.filter((p) => !isArchived(p)), ...orphans];
  const archived = sorted.filter(isArchived);

  const open = (name: string) => {
    onDone();
    void navigate({ to: "/funnels", search: { funnel: name } });
  };

  async function addFunnel() {
    const name = newName.trim();
    if (!name || !user?.organizationId) return;
    if (sorted.some((p) => p.name.toLowerCase() === name.toLowerCase())) {
      toast.error(t("salesp.nameTaken"));
      return;
    }
    setBusy("new");
    try {
      const created = await createPipeline.mutateAsync({
        name,
        organization_id: user.organizationId,
        position: sorted.length,
      });
      await createStageRows(
        defaultStageRows(DEFAULT_FUNNEL_STAGES, t, {
          organization_id: user.organizationId,
          pipeline_id: created.id,
          pipeline_name: name,
          from: 0,
        }),
        (row) => createStage.mutateAsync(row),
      );
      setAdding(false);
      setNewName("");
      toast.success(t("fs.funnelCreated"));
      onDone();
      void navigate({ to: "/funnels/settings", search: { funnel: name } });
    } catch (err) {
      toast.error(describeError(err, t("fs.saveFailed")));
    } finally {
      setBusy(null);
    }
  }

  async function copyFunnel(p: (typeof sorted)[number]) {
    if (!user?.organizationId) return;
    const taken = new Set(sorted.map((x) => x.name));
    let name = `${p.name} (${t("amo.copySuffix")})`;
    for (let n = 2; taken.has(name); n++) name = `${p.name} (${t("amo.copySuffix")} ${n})`;
    setBusy(p.id);
    try {
      const copy = await createPipeline.mutateAsync({
        name,
        organization_id: user.organizationId,
        position: sorted.length,
      });
      for (const s of stages.filter(
        (s) => s.pipeline_id === p.id || (!s.pipeline_id && s.pipeline_name === p.name),
      )) {
        await createStage.mutateAsync({
          name: s.name,
          key: `custom-${crypto.randomUUID()}`,
          organization_id: user.organizationId,
          pipeline_id: copy.id,
          pipeline_name: name,
          color: s.color,
          position: s.position,
          is_won: s.is_won,
          is_lost: s.is_lost,
          hint: s.hint,
          hint_novice: s.hint_novice,
          hint_experienced: s.hint_experienced,
          stage_value: s.stage_value,
          lead_quality: s.lead_quality,
        });
      }
      toast.success(t("amo.copied", { name }));
    } catch (err) {
      toast.error(describeError(err, t("fs.saveFailed")));
    } finally {
      setBusy(null);
    }
  }

  async function archiveFunnel(p: (typeof sorted)[number], on: boolean) {
    setBusy(p.id);
    try {
      await updatePipeline.mutateAsync({
        id: p.id,
        archived_at: on ? new Date().toISOString() : null,
      } as never);
      toast.success(on ? t("salesp.archived") : t("salesp.unarchived"));
    } catch (err) {
      toast.error(describeError(err, t("fs.saveFailed")));
    } finally {
      setBusy(null);
    }
  }

  // Deleting is for an empty funnel only: its leads are never lost. One
  // with leads is archived (or its leads moved) first.
  async function deleteFunnel(p: (typeof sorted)[number]) {
    if (live.length <= 1 && !isArchived(p)) {
      toast.error(t("salesp.lastFunnel"));
      return;
    }
    setBusy(p.id);
    try {
      const { count, error } = await supabase
        .from("leads")
        .select("id", { count: "exact", head: true })
        .eq("funnel", p.name);
      if (error) throw error;
      if ((count ?? 0) > 0) {
        toast.error(t("salesp.hasLeads", { n: count ?? 0 }));
        return;
      }
      onMenu?.(true);
      setToDelete(p);
    } catch (err) {
      toast.error(describeError(err, t("fs.saveFailed")));
    } finally {
      setBusy(null);
    }
  }

  const row = (p: (typeof sorted)[number]) => (
    <div
      key={p.id}
      className="group/f flex items-center border-b border-[var(--amo-divider)] pr-2 transition-colors hover:bg-accent/60"
    >
      <button
        type="button"
        onClick={() => open(p.name)}
        className={cn(
          "min-w-0 flex-1 truncate px-5 py-3 text-left text-[14px]",
          activeFunnel === p.name ? "font-medium text-primary" : "text-foreground",
        )}
        title={p.name}
      >
        {p.name}
      </button>
      {busy === p.id && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
      {canSetUp && !p.id.startsWith("name:") && (
        <DropdownMenu onOpenChange={(o) => onMenu?.(o)}>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              aria-label={t("salesp.menu")}
              className="grid h-7 w-7 place-items-center rounded text-muted-foreground opacity-0 transition-opacity hover:text-foreground group-hover/f:opacity-100 data-[state=open]:opacity-100"
            >
              <MoreHorizontal className="h-4 w-4" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="amo-skin z-[70] w-52">
            <DropdownMenuItem asChild>
              <Link to="/funnels/settings" search={{ funnel: p.name }} onClick={onDone}>
                <Settings2 className="mr-2 h-4 w-4" /> {t("salesp.settings")}
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => void copyFunnel(p)}>
              <Copy className="mr-2 h-4 w-4" /> {t("salesp.copy")}
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => void archiveFunnel(p, !isArchived(p))}>
              {isArchived(p) ? (
                <ArchiveRestore className="mr-2 h-4 w-4" />
              ) : (
                <Archive className="mr-2 h-4 w-4" />
              )}
              {isArchived(p) ? t("salesp.unarchive") : t("salesp.archive")}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onSelect={() => void deleteFunnel(p)}
              className="text-rose-500 focus:text-rose-500"
            >
              <Trash2 className="mr-2 h-4 w-4" /> {t("salesp.delete")}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </div>
  );

  const BOTTOM =
    "flex w-full items-center gap-2 border-t border-[var(--amo-divider)] px-5 py-3.5 text-left text-[14px] text-foreground transition-colors hover:bg-accent/60";
  const link = (to: string, label: string, search?: Record<string, string>, tail?: ReactNode) => (
    <Link to={to} {...(search ? { search } : {})} onClick={onDone} className={BOTTOM}>
      <span className="flex-1">{label}</span>
      {tail}
    </Link>
  );

  if (archiveView)
    return (
      <Shell>
        {deleteWindow}
        <button
          type="button"
          onClick={() => setArchiveView(false)}
          className="flex w-full items-center gap-2 border-b border-[var(--amo-divider)] px-4 py-3.5 text-[12px] font-bold uppercase tracking-[0.1em] text-foreground"
        >
          <ChevronLeft className="h-4 w-4" /> {t("salesp.archiveTitle")}
        </button>
        <div className="flex-1 overflow-y-auto p-2">
          {archived.length === 0 ? (
            <p className="px-3 py-2 text-[13px] text-muted-foreground">
              {t("salesp.archiveEmpty")}
            </p>
          ) : (
            archived.map(row)
          )}
        </div>
      </Shell>
    );

  return (
    <Shell>
      {deleteWindow}
      <p className="px-5 pb-3 pt-5 text-[13px] font-bold uppercase tracking-[0.08em] text-foreground">
        {t("salesp.title")}
      </p>
      <div className="min-h-0 flex-1 overflow-y-auto border-t border-[var(--amo-divider)]">
        {live.map(row)}
        {canSetUp &&
          (adding ? (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void addFunnel();
              }}
              className="flex items-center gap-1.5 border-b border-[var(--amo-divider)] px-4 py-2"
            >
              <input
                autoFocus
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => e.key === "Escape" && setAdding(false)}
                placeholder={t("salesp.newName")}
                className="h-8 min-w-0 flex-1 rounded-[3px] border border-primary bg-background px-2.5 text-[13px] outline-none"
              />
              <button
                type="submit"
                disabled={!newName.trim() || busy === "new"}
                className="grid h-8 w-8 place-items-center rounded-[3px] bg-primary text-primary-foreground disabled:opacity-50"
                aria-label={t("salesp.add")}
              >
                {busy === "new" ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Plus className="h-4 w-4" />
                )}
              </button>
            </form>
          ) : (
            <button
              type="button"
              onClick={() => setAdding(true)}
              className="flex w-full items-center justify-between px-5 py-3 text-[14px] text-muted-foreground transition-colors hover:bg-accent/60 hover:text-foreground"
            >
              {t("salesp.add")}
              <span className="grid h-6 w-6 place-items-center rounded-[3px] border border-border">
                <Plus className="h-3.5 w-3.5" />
              </span>
            </button>
          ))}
      </div>
      <div>
        {link("/funnels", t("dir.tab.contacts"), { sec: "contacts" })}
        {link("/funnels", t("dir.tab.companies"), { sec: "companies" })}
        {link("/funnels", t("dir.tab.files"), { sec: "files" })}
        {link(
          "/crm/leads",
          t("dir.tab.allLeads"),
          undefined,
          <List className="h-4 w-4 text-muted-foreground" />,
        )}
        {link("/refunds", t("refund.title"))}
        <button type="button" onClick={() => setArchiveView(true)} className={BOTTOM}>
          <span className="flex-1">{t("salesp.archiveTitle")}</span>
          <ChevronRight className="h-4 w-4 text-muted-foreground" />
        </button>
      </div>
    </Shell>
  );
}

function Shell({ children }: { children: ReactNode }) {
  return <div className="flex h-full w-full flex-col">{children}</div>;
}
