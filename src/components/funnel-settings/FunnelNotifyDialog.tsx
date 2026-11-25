import { useEffect, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { Link } from "@tanstack/react-router";
import {
  ArrowLeftRight,
  BellRing,
  Clock,
  Eye,
  RotateCcw,
  Monitor,
  PartyPopper,
  Send,
  Smartphone,
  Sparkles,
  Sunrise,
  UserPlus,
  Users,
  MessageSquare,
  type LucideIcon,
} from "lucide-react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { useOrgGeneralSettings, type PipelineRow, type StageRow } from "@/hooks/use-crm-data";
import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import {
  DEFAULT_CORNER,
  NOTIFY_CORNERS,
  onCornerChange,
  previewNotification,
  readCorner,
  saveCorner,
  type NotifyCorner,
} from "@/lib/notify-display";
import { AmoToggle } from "./AmoControls";
import {
  CelebrateCard,
  ClientMessageRules,
  MorningBoostCard,
  useSaveOrg,
} from "./ExtraSettingsCards";

// «Qo'shimcha sozlamalar» like 5CRM: one small card («Shu voronka
// bildirishnomalari» with «Sozlash» and «Umumiy bildirishnomalar»), and the
// window behind «Sozlash»: the notifications on the left in groups, the
// picked one on the right -- on/off, what it is, when / to whom / where it
// arrives, and its own settings.

type Key =
  | "notify_lead_assigned"
  | "notify_stage_changed"
  | "notify_sale_congrats"
  | "celebrate"
  | "boost"
  | "notify_task_reminder"
  | "client_messages";

const TOGGLES = [
  "notify_lead_assigned",
  "notify_stage_changed",
  "notify_sale_congrats",
  "notify_task_reminder",
] as const;
type ToggleKey = (typeof TOGGLES)[number];
const isToggle = (k: Key): k is ToggleKey => (TOGGLES as readonly string[]).includes(k);

type Group = { key: string; items: { key: Key; icon: LucideIcon }[] };
// As in 5CRM: a funnel's own notifications, and the company-wide ones
// (Sozlamalar → Bildirishnomalar → «Umumiy bildirishnomalar»).
const FUNNEL_GROUPS: Group[] = [
  {
    key: "leads",
    items: [
      { key: "notify_lead_assigned", icon: UserPlus },
      { key: "notify_stage_changed", icon: ArrowLeftRight },
    ],
  },
  { key: "sales", items: [{ key: "notify_sale_congrats", icon: PartyPopper }] },
  { key: "team", items: [{ key: "celebrate", icon: Sparkles }] },
];
const GENERAL_GROUPS: Group[] = [
  { key: "tasks", items: [{ key: "notify_task_reminder", icon: Clock }] },
  { key: "ai", items: [{ key: "client_messages", icon: MessageSquare }] },
  { key: "team", items: [{ key: "boost", icon: Sunrise }] },
];

export function FunnelNotifyCard({
  pipeline,
  stages,
  canManage,
}: {
  pipeline: PipelineRow;
  stages: StageRow[];
  canManage: boolean;
}) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  return (
    <section className="rounded-[4px] border border-border px-4 py-3.5">
      <h3 className="text-[14.5px] font-medium text-foreground">{t("fn.cardTitle")}</h3>
      <p className="mt-1 text-[12.5px] leading-snug text-muted-foreground">{t("fn.cardDesc")}</p>
      <div className="mt-2.5 flex flex-wrap gap-x-5 gap-y-1 text-[13px] font-semibold">
        <button type="button" onClick={() => setOpen(true)} className="text-primary underline">
          {t("fn.setUp")}
        </button>
        <Link
          to="/settings"
          search={{ section: "notifications" }}
          className="text-primary underline"
        >
          {t("fn.general")}
        </Link>
      </div>
      <FunnelNotifyDialog
        open={open}
        onOpenChange={setOpen}
        pipeline={pipeline}
        stages={stages}
        canManage={canManage}
      />
    </section>
  );
}

function FunnelNotifyDialog({
  open,
  onOpenChange,
  pipeline,
  stages,
  canManage,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  pipeline: PipelineRow;
  stages: StageRow[];
  canManage: boolean;
}) {
  const { t } = useI18n();
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="amo-skin flex h-[86dvh] max-w-[1080px] flex-col gap-0 overflow-hidden rounded-[6px] p-0 sm:max-w-[1080px] [&>button:last-child]:hidden">
        <DialogTitle className="sr-only">{t("fn.title")}</DialogTitle>
        <header className="flex items-start gap-4 border-b border-border px-6 py-4">
          <div className="min-w-0 flex-1">
            <h2 className="text-[18px] font-medium text-foreground">{t("fn.title")}</h2>
            <p className="mt-0.5 text-[13px] text-muted-foreground">
              {t("fn.only", { name: pipeline.name })}
            </p>
          </div>
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="h-9 rounded-[4px] bg-primary px-4 text-[13.5px] font-semibold text-primary-foreground"
          >
            {t("fn.done")}
          </button>
        </header>
        <NotifyCenter
          groups={FUNNEL_GROUPS}
          pipeline={pipeline}
          stages={stages}
          canManage={canManage}
        />
      </DialogContent>
    </Dialog>
  );
}

/**
 * The notifications list on the left in groups, the picked one on the right.
 * Used by the funnel's window and by Sozlamalar → Bildirishnomalar
 * («Umumiy bildirishnomalar», `general`).
 */
export function NotifyCenter({
  groups = GENERAL_GROUPS,
  pipeline,
  stages = [],
  canManage,
}: {
  groups?: Group[];
  pipeline?: PipelineRow;
  stages?: StageRow[];
  canManage: boolean;
}) {
  const { t } = useI18n();
  const { data: s } = useOrgGeneralSettings();
  const { save } = useSaveOrg();
  const [pick, setPick] = useState<Key>(groups[0]!.items[0]!.key);
  const on = (k: ToggleKey) => (s as Record<string, unknown> | undefined)?.[k] !== false;
  const celebrateOn = !!pipeline?.celebrate_stage_id;
  const status = (k: Key) =>
    isToggle(k)
      ? on(k)
        ? t("fn.on")
        : t("fn.off")
      : k === "celebrate"
        ? celebrateOn
          ? t("fn.on")
          : t("fn.off")
        : t("fn.custom");

  return (
    <div className="flex min-h-0 flex-1 phone:flex-col">
      <nav className="w-[320px] shrink-0 overflow-y-auto border-r border-border phone:w-full phone:border-b phone:border-r-0">
        {groups.map((g) => (
          <div key={g.key}>
            <p className="px-4 pb-1.5 pt-3 text-[12.5px] text-muted-foreground">
              {t(`fn.g.${g.key}`)}
            </p>
            {g.items.map(({ key, icon: Icon }) => (
              <div
                key={key}
                className={cn(
                  "flex items-center gap-3 border-l-2 px-4 py-2.5 transition-colors",
                  pick === key
                    ? "border-primary bg-accent"
                    : "border-transparent hover:bg-accent/60",
                )}
              >
                <button
                  type="button"
                  onClick={() => setPick(key)}
                  className="flex min-w-0 flex-1 items-center gap-3 text-left"
                >
                  <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
                  <span className="min-w-0">
                    <span className="block text-[14px] text-foreground">{t(`fn.i.${key}`)}</span>
                    <span className="block text-[12px] text-muted-foreground">{status(key)}</span>
                  </span>
                </button>
                {isToggle(key) && (
                  <AmoToggle
                    checked={on(key)}
                    disabled={!canManage}
                    label={t(`fn.i.${key}`)}
                    onChange={(v) => save({ [key]: v })}
                  />
                )}
              </div>
            ))}
          </div>
        ))}
      </nav>
      <div className="min-w-0 flex-1 overflow-y-auto p-6">
        {isToggle(pick) ? (
          <ToggleDetail
            k={pick}
            on={on(pick)}
            canManage={canManage}
            onChange={(v) => save({ [pick]: v })}
          />
        ) : pick === "celebrate" && pipeline ? (
          <CelebrateCard pipeline={pipeline} stages={stages} canManage={canManage} />
        ) : pick === "boost" ? (
          <MorningBoostCard canManage={canManage} />
        ) : (
          <div>
            <h3 className="text-[17px] font-medium text-foreground">{t("fn.i.client_messages")}</h3>
            <p className="mt-1 text-[13px] text-muted-foreground">{t("fn.d.client_messages")}</p>
            <div className="mt-4 rounded-[6px] border border-border p-4">
              <ClientMessageRules canManage={canManage} />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function ToggleDetail({
  k,
  on,
  canManage,
  onChange,
}: {
  k: ToggleKey;
  on: boolean;
  canManage: boolean;
  onChange: (v: boolean) => void;
}) {
  const { t } = useI18n();
  const row = (icon: LucideIcon, label: string, value: ReactNode) => {
    const Icon = icon;
    return (
      <div className="flex gap-3">
        <Icon className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
        <div>
          <p className="text-[12.5px] text-muted-foreground">{label}</p>
          <div className="text-[14px] text-foreground">{value}</div>
        </div>
      </div>
    );
  };
  const where: [LucideIcon, string][] = [
    [Monitor, t("fn.w.screen")],
    [Smartphone, t("fn.w.push")],
    [Send, t("fn.w.telegram")],
  ];
  return (
    <div>
      <div className="flex items-start gap-3">
        <BellRing className="mt-1 h-5 w-5 text-muted-foreground" />
        <div className="min-w-0 flex-1">
          <h3 className="text-[17px] font-medium text-foreground">{t(`fn.i.${k}`)}</h3>
          <p className={cn("text-[12.5px]", on ? "text-primary" : "text-muted-foreground")}>
            {on ? t("fn.on") : t("fn.off")}
          </p>
        </div>
        <AmoToggle checked={on} disabled={!canManage} label={t(`fn.i.${k}`)} onChange={onChange} />
      </div>
      <p className="mt-3 text-[13px] leading-relaxed text-muted-foreground">{t(`xs.n.${k}Desc`)}</p>
      <div className="mt-4 space-y-3.5 rounded-[6px] bg-accent/40 p-4">
        <p className="text-[12.5px] text-muted-foreground">{t("fn.how")}</p>
        {row(Clock, t("fn.when"), t(`fn.d.${k}.when`))}
        {row(Users, t("fn.who"), t(`fn.d.${k}.who`))}
        {row(
          Monitor,
          t("fn.where"),
          <ul className="mt-0.5 space-y-1">
            {where.map(([Icon, label]) => (
              <li
                key={label}
                className={cn(
                  "flex items-center gap-2 text-[13.5px]",
                  !on && "text-muted-foreground line-through",
                )}
              >
                <Icon className="h-3.5 w-3.5" /> {label}
              </li>
            ))}
          </ul>,
        )}
        {!on && <p className="text-[12.5px] text-muted-foreground">{t("fn.offNote")}</p>}
      </div>
      <NotifyLook k={k} />
      <section className="mt-4 rounded-[6px] bg-accent/40 p-4">
        <p className="text-[12.5px] text-muted-foreground">{t("fn.settings")}</p>
        <CornerPicker />
      </section>
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => previewNotification(sample(k, t))}
          className="inline-flex h-9 items-center gap-2 rounded-[4px] border border-border px-3.5 text-[13px] font-semibold text-foreground hover:bg-accent/60"
        >
          <Eye className="h-4 w-4" /> {t("fn.preview")}
        </button>
        <button
          type="button"
          disabled={!canManage}
          onClick={() => {
            onChange(true);
            saveCorner(DEFAULT_CORNER);
            toast.success(t("fn.resetDone"));
          }}
          className="inline-flex h-9 items-center gap-2 rounded-[4px] border border-border px-3.5 text-[13px] font-semibold text-muted-foreground hover:bg-accent/60 hover:text-foreground disabled:opacity-50"
        >
          <RotateCcw className="h-4 w-4" /> {t("fn.reset")}
        </button>
      </div>
      <p className="mt-2 text-[12px] text-muted-foreground">{t("fn.resetNote")}</p>
    </div>
  );
}

// The sample a notification shows (on screen and on the phone), for the
// «Ko'rinishi — namuna» block and «Ekranda ko'rish».
function sample(k: ToggleKey, t: (key: string) => string) {
  const type =
    k === "notify_task_reminder"
      ? "TaskSoon"
      : k === "notify_sale_congrats"
        ? "TaskDue"
        : "task_assigned";
  return { type, title: t(`fn.s.${k}.title`), body: t(`fn.s.${k}.body`) };
}

function NotifyLook({ k }: { k: ToggleKey }) {
  const { t } = useI18n();
  const s = sample(k, t);
  const [corner, setCorner] = useState<NotifyCorner>(DEFAULT_CORNER);
  useEffect(() => {
    setCorner(readCorner());
    return onCornerChange(setCorner);
  }, []);
  return (
    <section className="mt-4 rounded-[6px] bg-accent/40 p-4">
      <p className="text-[12.5px] text-muted-foreground">{t("fn.look")}</p>
      <div className="mt-3 grid gap-4 sm:grid-cols-[140px_1fr]">
        <div className="relative h-[86px] rounded-[4px] border border-border bg-background">
          <span
            className={cn(
              "absolute h-3.5 w-9 rounded-[2px] bg-primary",
              corner === "tl" && "left-2 top-2",
              corner === "tr" && "right-2 top-2",
              corner === "bl" && "bottom-2 left-2",
              corner === "br" && "bottom-2 right-2",
            )}
          />
        </div>
        <div className="rounded-[6px] border border-border bg-card p-3 shadow-[0_6px_18px_-10px_rgba(0,0,0,0.5)]">
          <p className="flex items-center gap-2 text-[13px] font-semibold text-foreground">
            <BellRing className="h-4 w-4 text-primary" /> {s.title}
          </p>
          <p className="mt-1 text-[12.5px] leading-snug text-muted-foreground">{s.body}</p>
        </div>
      </div>
      <p className="mt-4 flex items-center gap-1.5 text-[12px] text-muted-foreground">
        <Smartphone className="h-3.5 w-3.5" /> {t("fn.w.push")}
      </p>
      <div className="mt-2 max-w-[340px] rounded-[10px] border border-border bg-card px-3 py-2.5">
        <p className="flex items-center justify-between text-[11px] text-muted-foreground">
          <span className="font-semibold uppercase tracking-wide">SalesIQ</span>
          <span>09:41</span>
        </p>
        <p className="mt-1 text-[13px] font-semibold text-foreground">{s.title}</p>
        <p className="text-[12.5px] leading-snug text-muted-foreground">{s.body}</p>
      </div>
    </section>
  );
}

/** «Ekranda qayerda chiqsin»: one choice per person, for every funnel. */
function CornerPicker() {
  const { t } = useI18n();
  const [corner, setCorner] = useState<NotifyCorner>(DEFAULT_CORNER);
  useEffect(() => {
    setCorner(readCorner());
    return onCornerChange(setCorner);
  }, []);
  return (
    <>
      <p className="mt-2 text-[13px] text-foreground">{t("fn.where2")}</p>
      <div className="mt-2 grid max-w-[460px] grid-cols-2 gap-2">
        {NOTIFY_CORNERS.map((c) => (
          <button
            key={c}
            type="button"
            onClick={() => saveCorner(c)}
            aria-pressed={corner === c}
            className={cn(
              "flex items-center gap-3 rounded-[4px] border px-3 py-2.5 text-left text-[13px] transition-colors",
              corner === c
                ? "border-primary bg-primary/10 font-semibold text-primary"
                : "border-border text-foreground hover:bg-accent/60",
            )}
          >
            <span className="relative h-6 w-9 shrink-0 rounded-[3px] border border-current/40">
              <span
                className={cn(
                  "absolute h-1.5 w-3 rounded-[1px] bg-current",
                  c === "tl" && "left-0.5 top-0.5",
                  c === "tr" && "right-0.5 top-0.5",
                  c === "bl" && "bottom-0.5 left-0.5",
                  c === "br" && "bottom-0.5 right-0.5",
                )}
              />
            </span>
            {t(`fn.corner.${c}`)}
          </button>
        ))}
      </div>
      <p className="mt-2 text-[12px] text-muted-foreground">{t("fn.cornerNote")}</p>
    </>
  );
}
