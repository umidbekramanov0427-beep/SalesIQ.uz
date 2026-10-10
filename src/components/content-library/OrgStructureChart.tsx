import { useEffect, useMemo, useState, type FormEvent } from "react";
import { toast } from "sonner";
import { Loader2, Pencil, Plus, Trash2, UserPlus, Users, Network } from "lucide-react";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { SectionCard } from "@/components/layout/Primitives";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  useCreateOrgStructureNode,
  useDeleteOrgStructureNode,
  useOrgStructureNodes,
  useUpdateOrgStructureNode,
  type OrgStructureNodeRow,
} from "@/hooks/use-crm-data";
import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";

// Supabase's PostgrestError is a plain object, not an Error instance --
// `err instanceof Error` always falls through to the generic fallback.
function errorMessage(err: unknown, fallback: string): string {
  if (err && typeof err === "object" && "message" in err && typeof err.message === "string") {
    return err.message || fallback;
  }
  return fallback;
}

// A distinct color per depth so the hierarchy reads at a glance --
// CEO/ROP/Team Leader/Tur Agent/Tur Operator each land on their own hue
// instead of every box in the chart looking identical.
const DEPTH_ICON_TONE = [
  "bg-amber-500/15 text-amber-600 dark:text-amber-400",
  "bg-blue-500/15 text-blue-600 dark:text-blue-400",
  "bg-purple-500/15 text-purple-600 dark:text-purple-400",
  "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
  "bg-rose-500/15 text-rose-600 dark:text-rose-400",
];
const DEPTH_BORDER = [
  "border-l-amber-500",
  "border-l-blue-500",
  "border-l-purple-500",
  "border-l-emerald-500",
  "border-l-rose-500",
];

type TreeNode = OrgStructureNodeRow & { children: TreeNode[] };

function buildTree(nodes: OrgStructureNodeRow[]): TreeNode[] {
  const byId = new Map<string, TreeNode>();
  for (const n of nodes) byId.set(n.id, { ...n, children: [] });
  const roots: TreeNode[] = [];
  for (const n of nodes) {
    const withChildren = byId.get(n.id)!;
    if (n.parent_id && byId.has(n.parent_id)) {
      byId.get(n.parent_id)!.children.push(withChildren);
    } else {
      roots.push(withChildren);
    }
  }
  return roots;
}

// A node can't become its own descendant's parent -- collect the whole
// subtree so the parent picker can exclude it and prevent an infinite loop.
function collectDescendantIds(nodeId: string, nodes: OrgStructureNodeRow[]): Set<string> {
  const childrenByParent = new Map<string, string[]>();
  for (const n of nodes) {
    if (!n.parent_id) continue;
    const arr = childrenByParent.get(n.parent_id) ?? [];
    arr.push(n.id);
    childrenByParent.set(n.parent_id, arr);
  }
  const result = new Set<string>();
  const stack = [nodeId];
  while (stack.length) {
    const current = stack.pop()!;
    for (const childId of childrenByParent.get(current) ?? []) {
      if (!result.has(childId)) {
        result.add(childId);
        stack.push(childId);
      }
    }
  }
  return result;
}

function flattenForSelect(
  nodes: OrgStructureNodeRow[],
  excludeIds: Set<string>,
): { id: string; label: string }[] {
  const tree = buildTree(nodes.filter((n) => !excludeIds.has(n.id)));
  const out: { id: string; label: string }[] = [];
  function walk(list: TreeNode[], depth: number) {
    for (const n of list) {
      out.push({ id: n.id, label: `${"— ".repeat(depth)}${n.title}` });
      walk(n.children, depth + 1);
    }
  }
  walk(tree, 0);
  return out;
}

function NodeDialog({
  open,
  onOpenChange,
  node,
  defaultParentId,
  allNodes,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  node: OrgStructureNodeRow | null;
  defaultParentId: string | null;
  allNodes: OrgStructureNodeRow[];
}) {
  const { t } = useI18n();
  const createNode = useCreateOrgStructureNode();
  const updateNode = useUpdateOrgStructureNode();
  const [title, setTitle] = useState("");
  const [subtitle, setSubtitle] = useState("");
  const [responsibilities, setResponsibilities] = useState("");
  const [parentId, setParentId] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setTitle(node?.title ?? "");
    setSubtitle(node?.subtitle ?? "");
    setResponsibilities(node?.responsibilities ?? "");
    setParentId((node ? node.parent_id : defaultParentId) ?? "");
  }, [open, node, defaultParentId]);

  const excludeIds = useMemo(() => {
    if (!node) return new Set<string>();
    const ids = collectDescendantIds(node.id, allNodes);
    ids.add(node.id);
    return ids;
  }, [node, allNodes]);

  const parentOptions = useMemo(
    () => flattenForSelect(allNodes, excludeIds),
    [allNodes, excludeIds],
  );

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    setSaving(true);
    try {
      if (node) {
        await updateNode.mutateAsync({
          id: node.id,
          patch: {
            title: title.trim(),
            subtitle: subtitle.trim(),
            responsibilities: responsibilities.trim(),
            parentId: parentId || null,
          },
        });
        toast.success(t("orgChart.updated"));
      } else {
        await createNode.mutateAsync({
          parentId: parentId || null,
          title,
          subtitle,
          responsibilities,
        });
        toast.success(t("orgChart.added"));
      }
      onOpenChange(false);
    } catch (err) {
      toast.error(errorMessage(err, t("orgChart.saveFailed")));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{node ? t("orgChart.editNode") : t("orgChart.addNode")}</DialogTitle>
        </DialogHeader>
        <form onSubmit={(e) => void handleSubmit(e)} className="space-y-4">
          <label className="block">
            <span className="text-sm font-medium text-muted-foreground">
              {t("orgChart.fieldTitle")}
            </span>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={t("orgChart.fieldTitlePlaceholder")}
              required
              autoFocus
              className="mt-1.5 h-11 w-full rounded-xl border border-border bg-accent px-3 text-sm outline-none focus:border-primary/40"
            />
          </label>

          <label className="block">
            <span className="text-sm font-medium text-muted-foreground">
              {t("orgChart.fieldSubtitle")}
            </span>
            <input
              value={subtitle}
              onChange={(e) => setSubtitle(e.target.value)}
              placeholder={t("orgChart.fieldSubtitlePlaceholder")}
              className="mt-1.5 h-11 w-full rounded-xl border border-border bg-accent px-3 text-sm outline-none focus:border-primary/40"
            />
          </label>

          <label className="block">
            <span className="text-sm font-medium text-muted-foreground">
              {t("orgChart.fieldResponsibilities")}
            </span>
            <textarea
              value={responsibilities}
              onChange={(e) => setResponsibilities(e.target.value)}
              rows={5}
              placeholder={t("orgChart.fieldResponsibilitiesPlaceholder")}
              className="mt-1.5 w-full rounded-xl border border-border bg-accent px-3 py-2 text-sm outline-none focus:border-primary/40"
            />
          </label>

          <label className="block">
            <span className="text-sm font-medium text-muted-foreground">
              {t("orgChart.fieldParent")}
            </span>
            <select
              value={parentId}
              onChange={(e) => setParentId(e.target.value)}
              className="mt-1.5 h-11 w-full rounded-xl border border-border bg-accent px-3 text-sm outline-none focus:border-primary/40"
            >
              <option value="">{t("orgChart.noParent")}</option>
              {parentOptions.map((opt) => (
                <option key={opt.id} value={opt.id}>
                  {opt.label}
                </option>
              ))}
            </select>
          </label>

          <div className="flex justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              className="rounded-xl px-4 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent"
            >
              {t("common.cancel")}
            </button>
            <button
              type="submit"
              disabled={saving}
              className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {saving && <Loader2 className="h-4 w-4 animate-spin" />}
              {t("common.save")}
            </button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function NodeBox({
  node,
  depth,
  canEdit,
  onAddChild,
  onEdit,
  onDelete,
}: {
  node: TreeNode;
  depth: number;
  canEdit: boolean;
  onAddChild: (parentId: string) => void;
  onEdit: (node: OrgStructureNodeRow) => void;
  onDelete: (node: OrgStructureNodeRow) => void;
}) {
  const { t } = useI18n();
  const responsibilities = node.responsibilities
    ? node.responsibilities
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean)
    : [];
  const iconTone = DEPTH_ICON_TONE[depth % DEPTH_ICON_TONE.length];
  const borderTone = DEPTH_BORDER[depth % DEPTH_BORDER.length];

  return (
    <li>
      <div
        className={cn(
          "w-64 rounded-2xl border border-l-4 border-border bg-card p-4 text-left shadow-card transition-shadow hover:shadow-elevated",
          borderTone,
        )}
      >
        <div className="flex items-start gap-2.5">
          <span
            className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-lg", iconTone)}
          >
            <Users className="h-4 w-4" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-bold text-foreground">{node.title}</p>
            {node.subtitle && (
              <p className="truncate text-xs font-medium text-muted-foreground">{node.subtitle}</p>
            )}
          </div>
        </div>

        {responsibilities.length > 0 && (
          <div className="mt-2.5 space-y-1 border-t border-border/70 pt-2.5 text-left text-xs text-subtle">
            {responsibilities.map((line, i) => (
              <div key={i} className="flex gap-1.5">
                <span className="text-muted-foreground">•</span>
                <span>{line}</span>
              </div>
            ))}
          </div>
        )}

        {canEdit && (
          <div className="mt-3 flex items-center gap-1 border-t border-border/70 pt-2">
            <button
              type="button"
              onClick={() => onAddChild(node.id)}
              aria-label={t("orgChart.addChild")}
              className="rounded-lg p-1.5 text-subtle transition-colors hover:bg-accent hover:text-foreground"
            >
              <UserPlus className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onClick={() => onEdit(node)}
              aria-label={t("contentLibrary.editItem")}
              className="rounded-lg p-1.5 text-subtle transition-colors hover:bg-accent hover:text-foreground"
            >
              <Pencil className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onClick={() => onDelete(node)}
              aria-label={t("contentLibrary.deleteConfirmTitle")}
              className="ml-auto rounded-lg p-1.5 text-subtle transition-colors hover:bg-destructive/10 hover:text-destructive"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        )}
      </div>

      {node.children.length > 0 && (
        <ul>
          {node.children.map((child) => (
            <NodeBox
              key={child.id}
              node={child}
              depth={depth + 1}
              canEdit={canEdit}
              onAddChild={onAddChild}
              onEdit={onEdit}
              onDelete={onDelete}
            />
          ))}
        </ul>
      )}
    </li>
  );
}

export function OrgStructureChart({ canEdit }: { canEdit: boolean }) {
  const { t } = useI18n();
  const { data: nodes, isLoading } = useOrgStructureNodes();
  const deleteNode = useDeleteOrgStructureNode();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingNode, setEditingNode] = useState<OrgStructureNodeRow | null>(null);
  const [newParentId, setNewParentId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<OrgStructureNodeRow | null>(null);

  const rows = useMemo(() => nodes ?? [], [nodes]);
  const tree = useMemo(() => buildTree(rows), [rows]);

  function openAddRoot() {
    setEditingNode(null);
    setNewParentId(null);
    setDialogOpen(true);
  }
  function openAddChild(parentId: string) {
    setEditingNode(null);
    setNewParentId(parentId);
    setDialogOpen(true);
  }
  function openEdit(node: OrgStructureNodeRow) {
    setEditingNode(node);
    setNewParentId(null);
    setDialogOpen(true);
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    try {
      await deleteNode.mutateAsync(deleteTarget.id);
      toast.success(t("contentLibrary.deleted"));
    } catch (err) {
      toast.error(errorMessage(err, t("contentLibrary.deleteFailed")));
    } finally {
      setDeleteTarget(null);
    }
  }

  return (
    <SectionCard
      icon={Network}
      tone="violet"
      title={t("contentLibrary.orgStructureTitle")}
      description={t("contentLibrary.orgStructureDesc")}
      actions={
        canEdit ? (
          <button
            type="button"
            onClick={openAddRoot}
            className="inline-flex items-center gap-1.5 rounded-xl border border-dashed border-border px-3 py-1.5 text-xs font-semibold text-subtle transition-colors hover:border-primary/40 hover:text-primary"
          >
            <Plus className="h-3.5 w-3.5" />
            {t("orgChart.addRole")}
          </button>
        ) : undefined
      }
    >
      {isLoading ? (
        <Loader2 className="mx-auto h-5 w-5 animate-spin text-subtle" />
      ) : tree.length === 0 ? (
        <p className="py-10 text-center text-sm text-subtle">{t("orgChart.empty")}</p>
      ) : (
        <div className="-mx-5 overflow-x-auto px-5 pb-2">
          <ul className="org-chart-tree">
            {tree.map((root) => (
              <NodeBox
                key={root.id}
                node={root}
                depth={0}
                canEdit={canEdit}
                onAddChild={openAddChild}
                onEdit={openEdit}
                onDelete={setDeleteTarget}
              />
            ))}
          </ul>
        </div>
      )}

      <NodeDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        node={editingNode}
        defaultParentId={newParentId}
        allNodes={rows}
      />
      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(o) => !o && setDeleteTarget(null)}
        title={t("contentLibrary.deleteConfirmTitle")}
        description={t("orgChart.deleteNodeDesc")}
        onConfirm={() => void confirmDelete()}
      />
    </SectionCard>
  );
}
