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
  shortDate,
  type CardCtx,
} from "@/components/crm/kanban-card-fields";
import { ClientAvatar, chatFileLabel } from "@/components/lead/ChatParts";
import { cn } from "@/lib/utils";
import type { BoardLastMessage, CrmLeadView, KanbanCardLayout } from "@/hooks/use-crm-data";

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

function IconLine({ id, children }: { id: string; children: ReactNode }) {
  const Icon = FIELD_ICON[id];
  return (
    <span className="flex min-w-0 items-center gap-1.5">
      {Icon && <Icon className="h-3.5 w-3.5 shrink-0 text-subtle" />}
      <span className="truncate">{children}</span>
    </span>
  );
}

/**
 * The lead's number as people say and search it: the lead_number column
 * (migration 20261127000000), or until then a stable number derived from
 * the id.
 */
export function leadNumber(l: Pick<CrmLeadView, "id" | "leadNumber">): string {
  if (l.leadNumber) return String(l.leadNumber);
  return String(parseInt(l.id.replace(/-/g, "").slice(0, 8), 16) % 1_000_000).padStart(6, "0");
}

export function KanbanLeadCard({
  lead: l,
  layout,
  ctx,
  amoLink,
  chat,
  preview = false,
}: {
  lead: CrmLeadView;
  layout: KanbanCardLayout;
  ctx: CardCtx;
  amoLink?: string | null;
  /** The lead's latest chat message and whether the client has a photo. */
  chat?: { last: BoardLastMessage | null; hasPhoto: boolean };
  // In the settings dialog: no links, no tag editing.
  preview?: boolean;
}) {
  const { t } = ctx;
  const val = (slot: keyof KanbanCardLayout) => {
    const id = layout[slot];
    return typeof id === "string" && id !== "none" ? cardFieldValue(l, id, ctx) : "";
  };

  // Top to bottom: number + created date, the owner (small, bold), the
  // client's name (the biggest line), the phone, then -- under a hairline
  // -- the amount and the task.
  const owner = val("top");
  const second = val("second");
  const title = val("title") || l.contactName || l.name;
  const line = val("line");
  const footer = val("footer");
  const task = followUpState(l.nextFollowUpIso);
  const date = layout.showDate ? shortDate(l.createdAtIso, t) : "";
  const footerIsMoney = layout.footer === "amount" || layout.footer === "budget";
  const titleClass =
    "min-w-0 truncate text-[16px] font-extrabold leading-[22px] tracking-[-0.01em] text-foreground";

  return (
    <>
      <div className="flex items-center justify-between gap-2 text-[12px] tabular-nums text-muted-foreground">
        <span className="font-mono font-semibold tracking-wide">{leadNumber(l)}</span>
        <span className="flex shrink-0 items-center gap-1.5">
          {l.repeatCount > 0 && (
            <span
              title={t("guard.repeatHint")}
              className="rounded-md bg-amber-500/15 px-1.5 text-[11px] font-bold text-amber-700 dark:text-amber-400"
            >
              ×{l.repeatCount + 1}
            </span>
          )}
          {amoLink && !preview && (
            <a
              href={amoLink}
              target="_blank"
              rel="noreferrer"
              title={t("leadFilter.openInAmoCrm")}
              onClick={(e) => e.stopPropagation()}
              className="hidden text-subtle hover:text-primary group-hover:inline-flex"
            >
              <ExternalLink className="h-3.5 w-3.5" />
            </a>
          )}
          {date}
        </span>
      </div>

      {owner && (
        <p className="mt-1.5 truncate text-[12px] font-bold text-foreground/70">
          {layout.top === "owner" ? owner : <IconLine id={layout.top}>{owner}</IconLine>}
        </p>
      )}

      <div className="mt-1 flex min-w-0 items-center gap-2">
        {layout.showProfile && (
          <ClientAvatar
            leadId={l.id}
            name={l.contactName || l.name}
            hasPhoto={!preview && !!chat?.hasPhoto}
            className="h-7 w-7 text-[11px]"
          />
        )}
        {preview ? (
          <p className={titleClass}>{title}</p>
        ) : (
          <Link
            to="/crm/leads/$leadId"
            params={{ leadId: l.id }}
            search={{ from: "funnels" }}
            onClick={(e) => e.stopPropagation()}
            className={cn(titleClass, "hover:text-primary")}
          >
            {title}
          </Link>
        )}
      </div>

      {line && (
        <p className="mt-1 text-[13px] font-medium tabular-nums text-foreground/80">
          <IconLine id={layout.line}>{line}</IconLine>
        </p>
      )}
      {second && (
        <p className="mt-0.5 flex min-w-0 items-center gap-1 text-[12px] text-muted-foreground">
          <span className="shrink-0">{cardFieldLabel(layout.second, ctx)}:</span>
          <span className="truncate font-medium text-foreground/75">{second}</span>
        </p>
      )}

      {/* The client wrote and nobody has answered yet (amoCRM's bubble). */}
      {layout.showLastMessage && chat?.last?.direction === "in" && (
        <div className="mt-2 flex items-end gap-1.5">
          <ClientAvatar
            leadId={l.id}
            name={l.contactName || l.name}
            hasPhoto={!!chat.hasPhoto}
            className="h-6 w-6 text-[10px]"
          />
          <p
            title={chat.last.text || undefined}
            className="line-clamp-2 min-w-0 rounded-2xl rounded-bl-md bg-sky-600 px-2.5 py-1 text-[12.5px] font-medium leading-[17px] text-white dark:bg-sky-600/90"
          >
            {chat.last.fileKind && (
              <span className="font-semibold">
                {chatFileLabel(chat.last.fileKind, chat.last.fileName, t)}
                {chat.last.text ? " · " : ""}
              </span>
            )}
            {chat.last.text}
          </p>
          <span
            title={t("pipeline.newMessage")}
            className="mb-1 h-2 w-2 shrink-0 animate-pulse rounded-full bg-amber-400"
          />
        </div>
      )}

      {/* Tags already on the lead; adding them happens in the lead. */}
      {layout.showTags && l.tags.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1">
          {l.tags.slice(0, 4).map((tag) => (
            <span
              key={tag}
              className="max-w-[140px] truncate rounded-md bg-foreground/[0.06] px-1.5 py-px text-[11px] font-semibold text-muted-foreground"
            >
              {tag}
            </span>
          ))}
          {l.tags.length > 4 && (
            <span className="px-1 text-[11px] font-semibold text-muted-foreground">
              +{l.tags.length - 4}
            </span>
          )}
        </div>
      )}

      {(footer || layout.showTask) && (
        <div className="mt-2.5 flex items-center gap-2 border-t border-foreground/[0.07] pt-2.5">
          {footer ? (
            <span
              className={cn(
                "min-w-0 truncate tabular-nums",
                footerIsMoney
                  ? "text-[14px] font-extrabold text-foreground"
                  : "text-[12.5px] font-medium text-muted-foreground",
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
                "inline-flex shrink-0 items-center gap-1.5 rounded-lg px-2 py-1 text-[12px] font-bold tabular-nums",
                task === "overdue"
                  ? "bg-red-500/10 text-red-700 dark:text-red-300"
                  : task === "planned"
                    ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
                    : "bg-amber-500/12 text-amber-700 dark:text-amber-400",
              )}
            >
              {task === "none" ? (
                <Clock className="h-3.5 w-3.5" />
              ) : (
                <CalendarClock className="h-3.5 w-3.5" />
              )}
              {task === "none" ? t("pipeline.noTasks") : stamp(l.nextFollowUpIso!, t)}
            </span>
          )}
        </div>
      )}
    </>
  );
}
