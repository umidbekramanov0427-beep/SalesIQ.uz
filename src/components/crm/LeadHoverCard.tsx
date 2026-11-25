import { useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, Clock, FileText, Globe, History, Phone, User, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useProfilesRaw, type CrmLeadView, type StageRow } from "@/hooks/use-crm-data";
import { useI18n } from "@/lib/i18n";

// 5CRM's lead preview: resting the pointer on a card for a moment opens a
// window beside it -- the client, phone and source, the last note, the last
// stage move (from → to, when, by whom), when the lead was made / changed,
// and «To'liq sahifa». The note and the history are fetched only when the
// window opens, one small query each.

const stamp = (iso: string | null | undefined) => {
  if (!iso) return "—";
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getDate())}.${p(d.getMonth() + 1)}.${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}`;
};

export function LeadHoverCard({
  lead,
  anchor,
  stages,
  onClose,
  onKeep,
  onLeave,
}: {
  lead: CrmLeadView;
  anchor: DOMRect;
  stages: StageRow[];
  onClose: () => void;
  onKeep: () => void;
  onLeave: () => void;
}) {
  const { t } = useI18n();
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number }>({
    left: anchor.right + 12,
    top: anchor.top,
  });
  const { data: profiles = [] } = useProfilesRaw();

  const { data } = useQuery({
    queryKey: ["lead-hover", lead.id],
    staleTime: 30_000,
    queryFn: async () => {
      const [note, events] = await Promise.all([
        supabase
          .from("lead_activities")
          .select("content, created_at")
          .eq("lead_id", lead.id)
          .eq("type", "note")
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle(),
        supabase
          .from("lead_stage_events")
          .select("stage_id, owner_id, entered_at")
          .eq("lead_id", lead.id)
          .order("entered_at", { ascending: false })
          .limit(2),
      ]);
      return {
        note: note.data as { content: string; created_at: string } | null,
        events: (events.data ?? []) as {
          stage_id: string;
          owner_id: string | null;
          entered_at: string;
        }[],
      };
    },
  });

  // Beside the card, on the left when the right side has no room, and
  // never below the bottom of the screen.
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const w = el.offsetWidth;
    const h = el.offsetHeight;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    let left = anchor.right + 12;
    if (left + w > vw - 12) left = Math.max(12, anchor.left - w - 12);
    const top = Math.max(12, Math.min(anchor.top, vh - h - 12));
    setPos({ left, top });
  }, [anchor, data]);

  const stageName = (id: string) => stages.find((s) => s.id === id)?.name ?? "—";
  const personName = (id: string | null) =>
    (id && profiles.find((p) => p.id === id)?.full_name) || "";
  const last = data?.events[0];
  const prev = data?.events[1];
  const client = lead.contactName || lead.name;

  const row = (Icon: typeof User, label: string, value: React.ReactNode) => (
    <p className="flex items-center gap-2 text-[13.5px]">
      <Icon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
      <span className="text-muted-foreground">{label}:</span>
      <span className="min-w-0 truncate text-foreground">{value}</span>
    </p>
  );

  return createPortal(
    <div
      ref={ref}
      role="dialog"
      aria-label={lead.name}
      onMouseEnter={onKeep}
      onMouseLeave={onLeave}
      style={{ left: pos.left, top: pos.top }}
      className="amo-skin fixed z-[70] w-[380px] overflow-hidden rounded-[6px] border border-border bg-card text-foreground shadow-[0_18px_48px_-12px_rgba(0,0,0,0.55)] motion-safe:animate-in motion-safe:fade-in-0 motion-safe:zoom-in-[0.98] phone:hidden"
    >
      <header className="flex items-start gap-3 border-b border-[var(--amo-divider)] px-5 pb-3 pt-4">
        <h3 className="min-w-0 flex-1 break-words text-[17px] font-semibold">{lead.name}</h3>
        <button
          type="button"
          onClick={onClose}
          aria-label={t("common.close")}
          className="grid h-7 w-7 place-items-center rounded text-muted-foreground hover:text-foreground"
        >
          <X className="h-4 w-4" />
        </button>
      </header>
      <div className="space-y-2 border-b border-[var(--amo-divider)] px-5 py-3.5">
        {client && row(User, t("hover.client"), client)}
        {lead.phone &&
          row(
            Phone,
            t("hover.phone"),
            <a
              href={`tel:${lead.phone}`}
              className="text-primary hover:underline"
              onClick={(e) => e.stopPropagation()}
            >
              {lead.phone}
            </a>,
          )}
        {row(Globe, t("hover.source"), lead.source || "—")}
      </div>
      <section className="border-b border-[var(--amo-divider)] px-5 py-3.5">
        <p className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.08em] text-muted-foreground">
          <FileText className="h-3.5 w-3.5" /> {t("hover.lastNote")}
        </p>
        <p className="mt-2 line-clamp-3 text-[13.5px] text-foreground/90">
          {data?.note?.content || t("hover.noNote")}
        </p>
      </section>
      <section className="border-b border-[var(--amo-divider)] px-5 py-3.5">
        <p className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.08em] text-muted-foreground">
          <History className="h-3.5 w-3.5" /> {t("hover.lastHistory")}
        </p>
        {last ? (
          <>
            <p className="mt-2 text-[13.5px] text-foreground">
              {t("hover.stage")}: {prev ? `${stageName(prev.stage_id)} → ` : ""}
              {stageName(last.stage_id)}
            </p>
            <p className="mt-0.5 text-[12px] text-muted-foreground">
              {stamp(last.entered_at)}
              {personName(last.owner_id) ? ` · ${personName(last.owner_id)}` : ""}
            </p>
          </>
        ) : (
          <p className="mt-2 text-[13.5px] text-muted-foreground">{t("hover.noHistory")}</p>
        )}
      </section>
      <div className="space-y-1 bg-[var(--amo-quiet)] px-5 py-3 text-[12.5px]">
        <p className="flex items-center gap-1.5">
          <Clock className="h-3 w-3 text-muted-foreground" />
          <span className="text-muted-foreground">{t("hover.created")}:</span>{" "}
          {stamp(lead.createdAtIso)}
        </p>
        <p className="flex items-center gap-1.5">
          <Clock className="h-3 w-3 text-muted-foreground" />
          <span className="text-muted-foreground">{t("hover.updated")}:</span>{" "}
          {stamp(lead.updatedAtIso)}
        </p>
      </div>
      <div className="border-t border-[var(--amo-divider)] px-5 py-3">
        <Link
          to="/crm/leads/$leadId"
          params={{ leadId: lead.id }}
          search={{ from: "funnels" }}
          className="inline-flex items-center gap-1 text-[13.5px] font-semibold text-primary hover:underline"
        >
          {t("hover.full")} <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      </div>
    </div>,
    document.body,
  );
}
