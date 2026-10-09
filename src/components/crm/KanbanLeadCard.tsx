import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import {
  Building2,
  CalendarClock,
  Clock,
  ExternalLink,
  Globe,
  Hash,
  Mail,
  Megaphone,
  MessageCircle,
  Phone,
  Send,
  Thermometer,
  User,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import { stamp } from "@/components/lead/amo-utils";
import {
  cardFieldLabel,
  cardFieldValue,
  initialsOf,
  shortDate,
  type CardCtx,
} from "@/components/crm/kanban-card-fields";
import { TagEditor } from "@/components/crm/tag-editor";
import { cn } from "@/lib/utils";
import type { CrmLeadView, KanbanCardLayout } from "@/hooks/use-crm-data";

// One lead's card on the funnel board, laid out from the company's
// "Karta ko'rinishi" settings: owner on top, one chosen field, the
// client's name, a contact line, then amount and task status.

const FIELD_ICON: Record<string, LucideIcon> = {
  owner: User,
  contactName: User,
  phone: Phone,
  altPhone: Phone,
  email: Mail,
  telegram: Send,
  whatsapp: MessageCircle,
  company: Building2,
  source: Globe,
  campaign: Megaphone,
  utm: Megaphone,
  temperature: Thermometer,
  amount: Wallet,
  budget: Wallet,
  created: CalendarClock,
  nextFollowUp: Clock,
  amocrmId: Hash,
};

// amoCRM's task marker: none planned (amber), overdue (red), upcoming (green).
function followUpState(iso: string | null): "none" | "overdue" | "planned" {
  if (!iso) return "none";
  return new Date(iso).getTime() < Date.now() ? "overdue" : "planned";
}

function OwnerBadge({ name }: { name: string }) {
  return (
    <span className="flex min-w-0 items-center gap-1.5">
      <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-primary text-[10px] font-bold text-primary-foreground">
        {initialsOf(name) || "?"}
      </span>
      <span className="truncate text-[12.5px] font-semibold text-foreground">{name}</span>
    </span>
  );
}

function IconLine({ id, children }: { id: string; children: ReactNode }) {
  const Icon = FIELD_ICON[id];
  return (
    <span className="flex min-w-0 items-center gap-1.5">
      {Icon && <Icon className="h-3.5 w-3.5 shrink-0 text-subtle" />}
      <span className="truncate">{children}</span>
    </span>
  );
}

export function KanbanLeadCard({
  lead: l,
  layout,
  ctx,
  amoLink,
  preview = false,
}: {
  lead: CrmLeadView;
  layout: KanbanCardLayout;
  ctx: CardCtx;
  amoLink?: string | null;
  // In the settings dialog: no links, no tag editing.
  preview?: boolean;
}) {
  const { t } = ctx;
  const val = (slot: keyof KanbanCardLayout) => {
    const id = layout[slot];
    return typeof id === "string" && id !== "none" ? cardFieldValue(l, id, ctx) : "";
  };

  const top = val("top");
  const second = val("second");
  const title = val("title") || l.company || l.name;
  const line = val("line");
  const footer = val("footer");
  const task = followUpState(l.nextFollowUpIso);
  const date = layout.showDate ? shortDate(l.createdAtIso, t) : "";
  const footerIsMoney = layout.footer === "amount" || layout.footer === "budget";

  return (
    <>
      {(top || date || amoLink) && (
        <div className="flex items-center justify-between gap-2">
          {top ? (
            layout.top === "owner" ? (
              <OwnerBadge name={top} />
            ) : (
              <span className="min-w-0 text-[12.5px] font-medium text-foreground/80">
                <IconLine id={layout.top}>{top}</IconLine>
              </span>
            )
          ) : (
            <span />
          )}
          <span className="flex shrink-0 items-center gap-1.5 text-[11.5px] text-subtle">
            {amoLink && !preview && (
              <a
                href={amoLink}
                target="_blank"
                rel="noreferrer"
                title={t("leadFilter.openInAmoCrm")}
                onClick={(e) => e.stopPropagation()}
                className="hidden hover:text-primary group-hover:inline"
              >
                <ExternalLink className="h-3.5 w-3.5" />
              </a>
            )}
            {date}
          </span>
        </div>
      )}

      {second && (
        <p className="mt-2 flex min-w-0 items-center gap-1.5 text-[12px]">
          <span className="shrink-0 text-subtle">{cardFieldLabel(layout.second, ctx)}:</span>
          <span className="truncate font-medium text-foreground/85">{second}</span>
        </p>
      )}

      {preview ? (
        <p className="mt-1.5 truncate text-[15px] font-semibold leading-5 text-foreground">
          {title}
        </p>
      ) : (
        <Link
          to="/crm/leads/$leadId"
          params={{ leadId: l.id }}
          search={{ from: "funnels" }}
          onClick={(e) => e.stopPropagation()}
          className="mt-1.5 block truncate text-[15px] font-semibold leading-5 text-foreground hover:text-primary"
        >
          {title}
        </Link>
      )}

      {line && (
        <p className="mt-1 text-[12.5px] tabular-nums text-muted-foreground">
          <IconLine id={layout.line}>{line}</IconLine>
        </p>
      )}

      {layout.showTags &&
        (preview ? (
          l.tags.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1">
              {l.tags.slice(0, 3).map((tag) => (
                <span
                  key={tag}
                  className="rounded-full bg-muted px-2 text-[11px] leading-5 text-muted-foreground"
                >
                  {tag}
                </span>
              ))}
            </div>
          )
        ) : (
          // Tags are edited right on the card. Clicks (also from the add-tag
          // popover, which React bubbles through the portal) stop here so
          // they don't open the lead.
          <div
            className="mt-2"
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => e.stopPropagation()}
          >
            <TagEditor leadId={l.id} tags={l.tags} />
          </div>
        ))}

      {(footer || layout.showTask) && (
        <div className="mt-2.5 flex items-center gap-2 border-t border-border/70 pt-2.5">
          {footer ? (
            <span
              className={cn(
                "min-w-0 truncate tabular-nums",
                footerIsMoney
                  ? "text-[13.5px] font-bold text-foreground"
                  : "text-[12.5px] text-muted-foreground",
              )}
            >
              {footerIsMoney ? footer : <IconLine id={layout.footer}>{footer}</IconLine>}
            </span>
          ) : (
            <span />
          )}
          <span className="flex-1" />
          {layout.showTask && (
            <span
              title={
                task === "overdue"
                  ? t("pipeline.taskOverdue")
                  : task === "planned"
                    ? t("pipeline.taskPlanned")
                    : t("pipeline.noTasks")
              }
              className={cn(
                "inline-flex shrink-0 items-center gap-1 rounded-full px-2 text-[11px] font-medium leading-5",
                task === "overdue"
                  ? "bg-destructive/10 text-destructive"
                  : task === "planned"
                    ? "bg-success/12 text-success"
                    : "bg-amber-500/12 text-amber-700 dark:text-amber-400",
              )}
            >
              <Clock className="h-3 w-3" />
              {task === "none" ? t("pipeline.noTasks") : stamp(l.nextFollowUpIso!, t)}
            </span>
          )}
        </div>
      )}
    </>
  );
}
