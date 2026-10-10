import { useEffect, useState, type FormEvent } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Bot, Loader2, Pencil, Plus, ShieldAlert, Trash2, MessageSquareReply } from "lucide-react";
import { toast } from "sonner";
import { PageHeader, SectionCard, Pill } from "@/components/layout/Primitives";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { AdminBackLink } from "@/components/admin/AdminBackLink";
import { useI18n } from "@/lib/i18n";
import { useAuth } from "@/lib/auth";
import { cn } from "@/lib/utils";
import {
  useAutoRespondersRaw,
  useCreateAutoResponder,
  useUpdateAutoResponder,
  useDeleteAutoResponder,
  type AutoResponderRow,
} from "@/hooks/use-crm-data";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { CrmGate } from "@/components/CrmGate";

export const Route = createFileRoute("/admin/auto-responders")({
  head: () => ({
    meta: [
      { title: "Auto-responders — SalesIQ" },
      { name: "description", content: "Admin-only messaging auto-responder rules." },
    ],
  }),
  component: () => (
    <CrmGate>
      <AutoRespondersPage />
    </CrmGate>
  ),
});

const CHANNELS = ["telegram_bot", "telegram", "whatsapp", "instagram"] as const;
type Channel = (typeof CHANNELS)[number];

const CHANNEL_LABEL: Record<Channel, string> = {
  telegram_bot: "Telegram Bot",
  telegram: "Telegram",
  whatsapp: "WhatsApp",
  instagram: "Instagram",
};

type FormState = {
  name: string;
  triggerText: string;
  message: string;
  targetField: string;
  channels: Channel[];
};

const EMPTY_FORM: FormState = {
  name: "",
  triggerText: "",
  message: "",
  targetField: "",
  channels: [],
};

function RuleFormDialog({
  open,
  onOpenChange,
  editing,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  editing: AutoResponderRow | null;
  onSaved: () => void;
}) {
  const { t } = useI18n();
  const { user } = useAuth();
  const createRule = useCreateAutoResponder();
  const updateRule = useUpdateAutoResponder();
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    if (editing) {
      setForm({
        name: editing.name,
        triggerText: editing.trigger_text,
        message: editing.message,
        targetField: editing.target_field ?? "",
        channels: (editing.channels as Channel[]).filter((c) => CHANNELS.includes(c)),
      });
    } else {
      setForm(EMPTY_FORM);
    }
  }, [open, editing]);

  function toggleChannel(c: Channel) {
    setForm((f) => ({
      ...f,
      channels: f.channels.includes(c) ? f.channels.filter((x) => x !== c) : [...f.channels, c],
    }));
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!form.name.trim() || !form.message.trim()) return;
    setSaving(true);
    try {
      if (editing) {
        await updateRule.mutateAsync({
          id: editing.id,
          patch: {
            name: form.name.trim(),
            trigger_text: form.triggerText.trim(),
            message: form.message.trim(),
            target_field: form.targetField.trim() || null,
            channels: form.channels,
          },
        });
        toast.success(t("admin.ar.updated"));
      } else {
        await createRule.mutateAsync({
          name: form.name.trim(),
          trigger_text: form.triggerText.trim(),
          message: form.message.trim(),
          target_field: form.targetField.trim() || null,
          channels: form.channels,
          active: true,
          created_by: user?.id ?? null,
          organization_id: user!.organizationId!,
        });
        toast.success(t("admin.ar.created"));
      }
      onOpenChange(false);
      onSaved();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("admin.ar.saveFailed"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Bot className="h-4 w-4 text-primary" />
            {editing ? t("admin.ar.editTitle") : t("admin.ar.newTitle")}
          </DialogTitle>
          <DialogDescription>{t("admin.ar.formDesc")}</DialogDescription>
        </DialogHeader>

        <form onSubmit={onSubmit} className="space-y-4">
          <label className="block">
            <span className="text-[13px] font-medium text-muted-foreground">
              {t("admin.ar.name")}
            </span>
            <input
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              className="mt-1.5 h-10 w-full rounded-xl border border-border bg-background px-3 text-sm outline-none focus:border-primary/40"
            />
          </label>

          <label className="block">
            <span className="text-[13px] font-medium text-muted-foreground">
              {t("admin.ar.triggerText")}
            </span>
            <input
              value={form.triggerText}
              onChange={(e) => setForm((f) => ({ ...f, triggerText: e.target.value }))}
              placeholder={t("admin.ar.triggerTextPlaceholder")}
              className="mt-1.5 h-10 w-full rounded-xl border border-border bg-background px-3 text-sm outline-none focus:border-primary/40"
            />
          </label>

          <label className="block">
            <span className="text-[13px] font-medium text-muted-foreground">
              {t("admin.ar.message")}
            </span>
            <textarea
              value={form.message}
              onChange={(e) => setForm((f) => ({ ...f, message: e.target.value }))}
              rows={3}
              className="mt-1.5 w-full resize-none rounded-xl border border-border bg-background p-3 text-sm outline-none focus:border-primary/40"
            />
          </label>

          <label className="block">
            <span className="text-[13px] font-medium text-muted-foreground">
              {t("admin.ar.targetField")}
            </span>
            <input
              value={form.targetField}
              onChange={(e) => setForm((f) => ({ ...f, targetField: e.target.value }))}
              placeholder="phone"
              className="mt-1.5 h-10 w-full rounded-xl border border-border bg-background px-3 text-sm outline-none focus:border-primary/40"
            />
          </label>

          <div>
            <span className="text-[13px] font-medium text-muted-foreground">
              {t("admin.ar.channels")}
            </span>
            <div className="mt-1.5 flex flex-wrap gap-2">
              {CHANNELS.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => toggleChannel(c)}
                  className={cn(
                    "rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors",
                    form.channels.includes(c)
                      ? "border-primary/40 bg-primary/10 text-primary"
                      : "border-border text-muted-foreground hover:bg-accent",
                  )}
                >
                  {CHANNEL_LABEL[c]}
                </button>
              ))}
            </div>
          </div>

          <DialogFooter>
            <button
              type="submit"
              disabled={saving || !form.name.trim() || !form.message.trim()}
              className="inline-flex h-10 items-center gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-60"
            >
              {saving && <Loader2 className="h-4 w-4 animate-spin" />}
              {t("common.save")}
            </button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function RuleRow({
  rule,
  onEdit,
  onDelete,
}: {
  rule: AutoResponderRow;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const { t } = useI18n();
  const updateRule = useUpdateAutoResponder();

  async function toggleActive() {
    try {
      await updateRule.mutateAsync({ id: rule.id, patch: { active: !rule.active } });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("admin.ar.saveFailed"));
    }
  }

  return (
    <li className="rounded-xl border border-border bg-surface p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <p className="truncate text-sm font-semibold text-foreground">{rule.name}</p>
            <Pill tone={rule.active ? "success" : "neutral"}>
              {rule.active ? t("common.active") : t("common.inactive")}
            </Pill>
          </div>
          <p className="mt-1 truncate text-xs text-subtle">{rule.message}</p>
          {(rule.channels as string[]).length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {(rule.channels as string[]).map((c) => (
                <Pill key={c} tone="info">
                  {CHANNEL_LABEL[c as Channel] ?? c}
                </Pill>
              ))}
            </div>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          <button
            type="button"
            onClick={() => void toggleActive()}
            className="rounded-lg border border-border px-2.5 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent"
          >
            {rule.active ? t("admin.ar.pause") : t("admin.ar.resume")}
          </button>
          <button
            type="button"
            onClick={onEdit}
            aria-label={t("admin.editRole")}
            className="rounded-lg p-2 text-subtle hover:bg-accent hover:text-foreground"
          >
            <Pencil className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={onDelete}
            aria-label={t("int.remove")}
            className="rounded-lg p-2 text-subtle hover:bg-destructive/10 hover:text-destructive"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    </li>
  );
}

function AutoRespondersPage() {
  const { user } = useAuth();
  const { t } = useI18n();
  const { data: rules, isLoading } = useAutoRespondersRaw();
  const deleteRule = useDeleteAutoResponder();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<AutoResponderRow | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<AutoResponderRow | null>(null);

  if (user && user.role !== "super_admin" && user.role !== "platform_owner") {
    return (
      <>
        <AdminBackLink />
        <SectionCard title={t("admin.restrictedTitle")} description={t("admin.restrictedDesc")}>
          <div className="flex items-center gap-3 text-sm text-muted-foreground">
            <ShieldAlert className="h-4 w-4" /> {t("admin.restrictedHint")}
          </div>
        </SectionCard>
      </>
    );
  }

  async function remove() {
    if (!confirmDelete) return;
    try {
      await deleteRule.mutateAsync(confirmDelete.id);
      toast.success(t("admin.ar.deleted"));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("admin.ar.saveFailed"));
    } finally {
      setConfirmDelete(null);
    }
  }

  return (
    <>
      <AdminBackLink />
      <PageHeader
        title={t("admin.autoResponders")}
        icon={MessageSquareReply}
        tone="sky"
        description={t("admin.autoRespondersDesc")}
        actions={
          <button
            type="button"
            onClick={() => {
              setEditing(null);
              setDialogOpen(true);
            }}
            className="inline-flex items-center gap-2 rounded-xl bg-primary h-10 px-4 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90"
          >
            <Plus className="h-4 w-4" /> {t("admin.ar.new")}
          </button>
        }
      />

      <p className="mb-6 rounded-xl border border-warning/30 bg-warning/10 px-3 py-2 text-xs text-warning-foreground">
        {t("admin.ar.channelNotice")}
      </p>

      <SectionCard>
        {isLoading ? (
          <p className="text-sm text-muted-foreground">{t("common.loading")}</p>
        ) : (rules ?? []).length === 0 ? (
          <p className="py-6 text-center text-sm text-subtle">{t("admin.ar.empty")}</p>
        ) : (
          <ul className="space-y-3">
            {(rules ?? []).map((r) => (
              <RuleRow
                key={r.id}
                rule={r}
                onEdit={() => {
                  setEditing(r);
                  setDialogOpen(true);
                }}
                onDelete={() => setConfirmDelete(r)}
              />
            ))}
          </ul>
        )}
      </SectionCard>

      <RuleFormDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        editing={editing}
        onSaved={() => setEditing(null)}
      />

      <ConfirmDialog
        open={confirmDelete !== null}
        onOpenChange={(o) => !o && setConfirmDelete(null)}
        title={t("admin.ar.deleteConfirmTitle")}
        description={confirmDelete?.name ?? ""}
        onConfirm={() => void remove()}
      />
    </>
  );
}
