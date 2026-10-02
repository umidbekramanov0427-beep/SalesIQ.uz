import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { Copy, Download, MoreHorizontal, RefreshCw, Settings2, Upload } from "lucide-react";
import { toast } from "sonner";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { downloadCsv } from "@/lib/export-csv";
import { useI18n } from "@/lib/i18n";
import { useOrgAccess } from "@/lib/use-org-access";
import { describeError } from "@/lib/utils";
import {
  isKanbanCardFieldVisible,
  KANBAN_CARD_FIELD_KEYS,
  useOrgGeneralSettings,
  useUpdateOrgGeneralSettings,
  type CrmLeadView,
  type KanbanCardFieldKey,
} from "@/hooks/use-crm-data";

export type PipelineSortBy = "created" | "name" | "amount";

// The kanban board's own "..." menu -- AmoCRM shows this same set (card
// fields, sort order, auto-refresh, plus links out to Import/Export/
// duplicate search/bulk actions) sitting in its filter row, so this lives
// there too (in funnels.tsx) rather than floating above the board, which
// used to leave an empty-looking row before the actual columns started.
// Only relevant to the kanban view -- funnels.tsx renders it regardless of
// the active view so the "..." button doesn't jump around the filter row
// as you switch views, but Card appearance/Sort only affect the board.
export function KanbanToolbarMenu({
  funnel,
  leads,
  sortBy,
  onSortByChange,
  autoRefresh,
  onAutoRefreshChange,
}: {
  funnel: string;
  leads: CrmLeadView[];
  sortBy: PipelineSortBy;
  onSortByChange: (v: PipelineSortBy) => void;
  autoRefresh: boolean;
  onAutoRefreshChange: (v: boolean) => void;
}) {
  const { t } = useI18n();
  const access = useOrgAccess();
  const { data: orgSettings } = useOrgGeneralSettings();
  const updateOrgSettings = useUpdateOrgGeneralSettings();
  const [cardDialogOpen, setCardDialogOpen] = useState(false);

  async function toggleCardField(key: KanbanCardFieldKey, value: boolean) {
    const current = (orgSettings?.kanban_card_fields as Record<string, boolean> | null) ?? {};
    try {
      await updateOrgSettings.mutateAsync({
        kanban_card_fields: { ...current, [key]: value },
      });
    } catch (err) {
      toast.error(describeError(err, t("pipeline.cardFieldsSaveFailed")));
    }
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            aria-label={t("pipeline.toolbar.more")}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border border-primary/30 bg-primary/10 text-primary transition-colors hover:bg-primary/15 sm:h-9 sm:w-9"
          >
            <MoreHorizontal className="h-4 w-4 sm:h-5 sm:w-5" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-64">
          <DropdownMenuItem onClick={() => setCardDialogOpen(true)}>
            <Settings2 className="h-4 w-4" /> {t("pipeline.cardAppearance.title")}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuLabel>{t("pipeline.toolbar.sortBy")}</DropdownMenuLabel>
          <DropdownMenuRadioGroup
            value={sortBy}
            onValueChange={(v) => onSortByChange(v as PipelineSortBy)}
          >
            <DropdownMenuRadioItem value="created">
              {t("pipeline.toolbar.sortCreated")}
            </DropdownMenuRadioItem>
            <DropdownMenuRadioItem value="name">
              {t("pipeline.toolbar.sortName")}
            </DropdownMenuRadioItem>
            <DropdownMenuRadioItem value="amount">
              {t("pipeline.toolbar.sortAmount")}
            </DropdownMenuRadioItem>
          </DropdownMenuRadioGroup>
          <DropdownMenuSeparator />
          <DropdownMenuCheckboxItem
            checked={autoRefresh}
            onCheckedChange={(v) => onAutoRefreshChange(!!v)}
          >
            <RefreshCw className="h-4 w-4" /> {t("pipeline.toolbar.autoRefresh")}
          </DropdownMenuCheckboxItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem asChild>
            <Link to="/onboarding/data-import">
              <Upload className="h-4 w-4" /> {t("pipeline.toolbar.import")}
            </Link>
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={() =>
              !access.has("exports")
                ? toast.info(t("trial.exportLocked"))
                : downloadCsv(
                    funnel,
                    leads.map((l) => ({
                      [t("pipeline.export.name")]: l.name,
                      [t("pipeline.export.company")]: l.company,
                      [t("pipeline.export.phone")]: l.phone,
                      [t("pipeline.export.stage")]: l.stage,
                      [t("pipeline.export.owner")]: l.owner,
                      [t("pipeline.export.amount")]: l.expectedRevenue,
                      [t("pipeline.export.source")]: l.source,
                    })),
                  )
            }
          >
            <Download className="h-4 w-4" /> {t("pipeline.toolbar.export")}
          </DropdownMenuItem>
          <DropdownMenuItem asChild>
            <Link to="/admin/duplicates">
              <Copy className="h-4 w-4" /> {t("pipeline.toolbar.findDuplicates")}
            </Link>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={cardDialogOpen} onOpenChange={setCardDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Settings2 className="h-4 w-4 text-primary" /> {t("pipeline.cardAppearance.title")}
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">{t("pipeline.cardAppearance.desc")}</p>
          <ul className="space-y-1">
            {KANBAN_CARD_FIELD_KEYS.map((key) => (
              <li key={key}>
                <label className="flex cursor-pointer items-center gap-2.5 rounded-lg px-2 py-2 hover:bg-accent">
                  <Checkbox
                    checked={isKanbanCardFieldVisible(orgSettings, key)}
                    onCheckedChange={(v) => void toggleCardField(key, !!v)}
                  />
                  <span className="text-sm font-medium text-foreground">
                    {t(`pipeline.cardField.${key}`)}
                  </span>
                </label>
              </li>
            ))}
          </ul>
        </DialogContent>
      </Dialog>
    </>
  );
}
