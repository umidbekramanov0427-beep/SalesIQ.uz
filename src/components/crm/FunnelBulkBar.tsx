import { useState } from "react";
import { GitBranch, Loader2, Tag, Trash2, User, X } from "lucide-react";
import { toast } from "sonner";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useAuth } from "@/lib/auth";
import { useI18n } from "@/lib/i18n";
import { cn, describeError, stageColorProps } from "@/lib/utils";
import {
  useBulkAddLeadTag,
  useBulkDeleteLeads,
  useBulkUpdateLeads,
  usePermission,
  type ProfileRow,
  type StageRow,
} from "@/hooks/use-crm-data";

// amoCRM's "Массовые действия" for a funnel: the leads ticked in the list
// get a new stage, a new owner or a tag in one go, or are deleted.

const ACTION =
  "inline-flex h-9 items-center gap-1.5 rounded-xl border border-border bg-background px-3 text-[13px] font-medium text-foreground transition-colors hover:border-primary/40 hover:bg-accent disabled:opacity-50";

export function FunnelBulkBar({
  ids,
  stages,
  owners,
  onDone,
  onCancel,
}: {
  ids: string[];
  stages: StageRow[];
  owners: ProfileRow[];
  onDone: () => void;
  onCancel: () => void;
}) {
  const { t } = useI18n();
  const { user } = useAuth();
  const canMove = usePermission("Move deals");
  const isManager = user?.role === "super_admin" || user?.role === "rop";
  // Deleting leads: super admin only (RLS enforces the same).
  const canDelete = user?.role === "super_admin" || user?.role === "platform_owner";
  const update = useBulkUpdateLeads();
  const addTag = useBulkAddLeadTag();
  const remove = useBulkDeleteLeads();
  const [tag, setTag] = useState("");
  const [confirm, setConfirm] = useState(false);
  const busy = update.isPending || addTag.isPending || remove.isPending;

  async function run(fn: () => Promise<unknown>) {
    try {
      await fn();
      toast.success(t("bulk.done", { count: ids.length }));
      onDone();
    } catch (err) {
      toast.error(describeError(err, t("bulk.failed")));
    }
  }

  return (
    <div className="sticky bottom-3 z-20 mt-3 flex flex-wrap items-center gap-2 rounded-2xl border border-primary/30 bg-card/95 px-4 py-3 shadow-[0_8px_30px_rgba(16,24,40,0.12)] backdrop-blur">
      <span className="mr-1 text-[13px] font-semibold text-foreground">
        {ids.length ? t("bulk.selected", { count: ids.length }) : t("bulk.pick")}
      </span>

      {canMove && (
        <Popover>
          <PopoverTrigger asChild>
            <button type="button" disabled={!ids.length || busy} className={ACTION}>
              <GitBranch className="h-3.5 w-3.5" /> {t("bulk.stage")}
            </button>
          </PopoverTrigger>
          <PopoverContent align="start" side="top" className="max-h-72 w-60 overflow-y-auto p-1">
            {stages.map((s) => {
              const c = stageColorProps(s.color);
              return (
                <button
                  key={s.id}
                  type="button"
                  onClick={() =>
                    void run(() => update.mutateAsync({ ids, patch: { stage_id: s.id } }))
                  }
                  className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[13px] hover:bg-accent"
                >
                  <span className={cn("h-2.5 w-2.5 rounded-full", c.className)} style={c.style} />
                  <span className="truncate">{s.name}</span>
                </button>
              );
            })}
          </PopoverContent>
        </Popover>
      )}

      {isManager && (
        <Popover>
          <PopoverTrigger asChild>
            <button type="button" disabled={!ids.length || busy} className={ACTION}>
              <User className="h-3.5 w-3.5" /> {t("bulk.owner")}
            </button>
          </PopoverTrigger>
          <PopoverContent align="start" side="top" className="max-h-72 w-60 overflow-y-auto p-1">
            {owners.map((o) => (
              <button
                key={o.id}
                type="button"
                onClick={() =>
                  void run(() => update.mutateAsync({ ids, patch: { owner_id: o.id } }))
                }
                className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[13px] hover:bg-accent"
              >
                <span className="truncate">{o.full_name || o.email}</span>
              </button>
            ))}
          </PopoverContent>
        </Popover>
      )}

      <Popover>
        <PopoverTrigger asChild>
          <button type="button" disabled={!ids.length || busy} className={ACTION}>
            <Tag className="h-3.5 w-3.5" /> {t("bulk.tag")}
          </button>
        </PopoverTrigger>
        <PopoverContent align="start" side="top" className="w-64 p-2">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const v = tag.trim();
              if (!v) return;
              setTag("");
              void run(() => addTag.mutateAsync({ ids, tag: v }));
            }}
            className="flex gap-2"
          >
            <input
              autoFocus
              value={tag}
              onChange={(e) => setTag(e.target.value)}
              placeholder={t("bulk.tagPlaceholder")}
              className="h-9 min-w-0 flex-1 rounded-lg border border-border bg-background px-3 text-[13px] outline-none focus:border-primary"
            />
            <button
              type="submit"
              className="h-9 rounded-lg bg-primary px-3 text-[13px] font-semibold text-primary-foreground"
            >
              {t("bulk.add")}
            </button>
          </form>
        </PopoverContent>
      </Popover>

      {canDelete &&
        (confirm ? (
          <span className="flex items-center gap-1.5">
            <span className="text-[12.5px] text-muted-foreground">
              {t("bulk.confirmDelete", { count: ids.length })}
            </span>
            <button
              type="button"
              disabled={busy}
              onClick={() => void run(() => remove.mutateAsync(ids))}
              className="inline-flex h-9 items-center gap-1.5 rounded-xl bg-destructive px-3 text-[13px] font-semibold text-destructive-foreground"
            >
              {remove.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              {t("bulk.deleteYes")}
            </button>
            <button
              type="button"
              onClick={() => setConfirm(false)}
              className="h-9 rounded-xl px-2.5 text-[13px] text-muted-foreground hover:bg-accent"
            >
              {t("amo.no")}
            </button>
          </span>
        ) : (
          <button
            type="button"
            disabled={!ids.length || busy}
            onClick={() => setConfirm(true)}
            className={cn(
              ACTION,
              "text-destructive hover:border-destructive/40 hover:bg-destructive/10",
            )}
          >
            <Trash2 className="h-3.5 w-3.5" /> {t("bulk.delete")}
          </button>
        ))}

      <span className="flex-1" />
      <button
        type="button"
        onClick={onCancel}
        className="inline-flex h-9 items-center gap-1.5 rounded-xl px-3 text-[13px] font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
      >
        <X className="h-3.5 w-3.5" /> {t("bulk.exit")}
      </button>
    </div>
  );
}
