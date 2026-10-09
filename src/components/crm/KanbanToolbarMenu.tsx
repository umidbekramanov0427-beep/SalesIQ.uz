import { useState } from "react";
import { Link } from "@tanstack/react-router";
import {
  Copy,
  Download,
  ListChecks,
  MoreHorizontal,
  RefreshCw,
  Settings2,
  Upload,
  Workflow,
  AlarmClock,
} from "lucide-react";
import { toast } from "sonner";
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
import { KanbanCardSettingsDialog } from "@/components/crm/KanbanCardSettingsDialog";
import { LeadImportDialog } from "@/components/crm/LeadImportDialog";
import { downloadCsv } from "@/lib/export-csv";
import { useAuth } from "@/lib/auth";
import { useCrmEnabled } from "@/lib/use-org-access";
import { useI18n } from "@/lib/i18n";
import { useOrgAccess } from "@/lib/use-org-access";
import type { CrmLeadView } from "@/hooks/use-crm-data";

export type PipelineSortBy = "lastMessage" | "lastEvent" | "created" | "name" | "amount";

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
  boardOptions = true,
  onBulkActions,
}: {
  funnel: string;
  leads: CrmLeadView[];
  sortBy: PipelineSortBy;
  onSortByChange: (v: PipelineSortBy) => void;
  autoRefresh: boolean;
  onAutoRefreshChange: (v: boolean) => void;
  // Card appearance, sorting and auto-refresh only mean something on the
  // board; list and gallery get the rest of the menu.
  boardOptions?: boolean;
  // amoCRM's "Массовые действия": opens the list with checkboxes.
  onBulkActions?: () => void;
}) {
  const { t } = useI18n();
  const access = useOrgAccess();
  const [cardDialogOpen, setCardDialogOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const { user } = useAuth();
  const crmEnabled = useCrmEnabled();
  const canImport = user?.role === "super_admin" || user?.role === "rop";
  // Duplicate merging is a company-wide clean-up -- super admin only.
  const isAdmin = user?.role === "super_admin" || user?.role === "platform_owner";

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
          {/* The layout is company-wide; only admins and managers may save it. */}
          {onBulkActions && (
            <>
              <DropdownMenuItem onClick={onBulkActions}>
                <ListChecks className="h-4 w-4" /> {t("pipeline.toolbar.bulk")}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
            </>
          )}
          {canImport && boardOptions && (
            <>
              <DropdownMenuItem onClick={() => setCardDialogOpen(true)}>
                <Settings2 className="h-4 w-4" /> {t("pipeline.cardAppearance.title")}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
            </>
          )}
          {boardOptions && (
            <>
              <DropdownMenuLabel>{t("pipeline.toolbar.sortBy")}</DropdownMenuLabel>
              <DropdownMenuRadioGroup
                value={sortBy}
                onValueChange={(v) => onSortByChange(v as PipelineSortBy)}
              >
                <DropdownMenuRadioItem value="lastMessage">
                  {t("pipeline.toolbar.sortLastMessage")}
                </DropdownMenuRadioItem>
                <DropdownMenuRadioItem value="lastEvent">
                  {t("pipeline.toolbar.sortLastEvent")}
                </DropdownMenuRadioItem>
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
            </>
          )}
          {canImport && crmEnabled && (
            <DropdownMenuItem asChild>
              <Link to="/admin/automations" search={{ funnel }}>
                <Workflow className="h-4 w-4" /> {t("pipeline.toolbar.automation")}
              </Link>
            </DropdownMenuItem>
          )}
          {canImport && (
            <DropdownMenuItem onClick={() => setImportOpen(true)}>
              <Upload className="h-4 w-4" /> {t("pipeline.toolbar.import")}
            </DropdownMenuItem>
          )}
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
          {isAdmin && crmEnabled && (
            <DropdownMenuItem asChild>
              <Link to="/admin/duplicates">
                <Copy className="h-4 w-4" /> {t("crm.item.dupControlTitle")}
              </Link>
            </DropdownMenuItem>
          )}
          {isAdmin && crmEnabled && (
            <DropdownMenuItem asChild>
              <Link to="/admin/task-control">
                <AlarmClock className="h-4 w-4" /> {t("taskControl.title")}
              </Link>
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      <LeadImportDialog open={importOpen} onOpenChange={setImportOpen} defaultFunnel={funnel} />

      <KanbanCardSettingsDialog
        open={cardDialogOpen}
        onOpenChange={setCardDialogOpen}
        funnel={funnel}
        leads={leads}
      />
    </>
  );
}
