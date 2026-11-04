import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  BellRing,
  CreditCard,
  ExternalLink,
  Newspaper,
  Sparkles,
  X,
  type LucideIcon,
} from "lucide-react";
import { apiFetch } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";

// Owner → E'lonlar, as a company sees them: one quiet strip per
// announcement under the trial banner, tinted by its kind. The owner's
// page uses the same strip as the live preview.

export const KIND_LOOK: Record<string, { icon: LucideIcon; strip: string; chip: string }> = {
  update: {
    icon: Sparkles,
    strip: "bg-sky-500/10 border-sky-500/25 text-sky-950 dark:text-sky-100",
    chip: "bg-sky-500/15 text-sky-700 dark:text-sky-300",
  },
  payment: {
    icon: CreditCard,
    strip: "bg-amber-500/12 border-amber-500/30 text-amber-950 dark:text-amber-100",
    chip: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
  },
  news: {
    icon: Newspaper,
    strip: "bg-violet-500/10 border-violet-500/25 text-violet-950 dark:text-violet-100",
    chip: "bg-violet-500/15 text-violet-700 dark:text-violet-300",
  },
  reminder: {
    icon: BellRing,
    strip: "bg-emerald-500/10 border-emerald-500/25 text-emerald-950 dark:text-emerald-100",
    chip: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
  },
  warning: {
    icon: AlertTriangle,
    strip: "bg-rose-500/12 border-rose-500/30 text-rose-950 dark:text-rose-100",
    chip: "bg-rose-500/15 text-rose-700 dark:text-rose-300",
  },
};

export type AnnouncementView = {
  id: string;
  title: string;
  body: string;
  kind: string;
  linkUrl: string | null;
  linkLabel: string | null;
  dismissible: boolean;
};

export function AnnouncementStrip({ a, onClose }: { a: AnnouncementView; onClose?: () => void }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const look = KIND_LOOK[a.kind] ?? KIND_LOOK["news"]!;
  const Icon = look.icon;
  const body = a.body.trim();
  return (
    <div
      role="status"
      className={cn(
        "flex items-start gap-3 border-b px-4 py-2.5 text-[13px] phone:px-3 phone:text-[12.5px]",
        look.strip,
      )}
    >
      <span className={cn("mt-px grid h-6 w-6 shrink-0 place-items-center rounded-md", look.chip)}>
        <Icon className="h-3.5 w-3.5" />
      </span>
      <button
        type="button"
        onClick={() => body && setOpen((v) => !v)}
        className={cn("min-w-0 flex-1 text-left", body ? "cursor-pointer" : "cursor-default")}
      >
        <span className="font-semibold">{a.title}</span>
        {body && (
          <span
            className={cn(
              "opacity-80",
              open ? "mt-0.5 block whitespace-pre-line" : "ml-2 line-clamp-1 inline phone:hidden",
            )}
          >
            {body}
          </span>
        )}
      </button>
      {a.linkUrl && (
        <a
          href={a.linkUrl}
          target="_blank"
          rel="noreferrer"
          className="inline-flex shrink-0 items-center gap-1 rounded-md bg-background/70 px-2.5 py-1 text-[12px] font-semibold text-foreground ring-1 ring-border transition-colors hover:bg-background"
        >
          {a.linkLabel || t("ann.open")}
          <ExternalLink className="h-3 w-3" />
        </a>
      )}
      {a.dismissible && onClose && (
        <button
          type="button"
          onClick={onClose}
          aria-label={t("common.close")}
          className="shrink-0 rounded-md p-1 opacity-60 transition-opacity hover:opacity-100"
        >
          <X className="h-4 w-4" />
        </button>
      )}
    </div>
  );
}

/** The live banners for a company member (nothing for the platform owner). */
export function AnnouncementBanners() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const enabled = !!user && user.role !== "platform_owner";
  const { data } = useQuery({
    queryKey: ["announcements-active"],
    enabled,
    staleTime: 5 * 60_000,
    refetchInterval: 10 * 60_000,
    queryFn: async (): Promise<AnnouncementView[]> => {
      const res = await apiFetch("/announcements/active");
      if (!res.ok) return [];
      return ((await res.json()) as { items: AnnouncementView[] }).items ?? [];
    },
  });
  if (!enabled || !data?.length) return null;
  const close = (id: string) => {
    qc.setQueryData<AnnouncementView[]>(["announcements-active"], (old) =>
      (old ?? []).filter((a) => a.id !== id),
    );
    void apiFetch("/announcements/active", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id }),
    });
  };
  return (
    <div>
      {data.map((a) => (
        <AnnouncementStrip key={a.id} a={a} onClose={() => close(a.id)} />
      ))}
    </div>
  );
}
