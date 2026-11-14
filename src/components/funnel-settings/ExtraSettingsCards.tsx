import { useState, type ReactNode } from "react";
import {
  BellRing,
  ChevronRight,
  Eye,
  Loader2,
  PartyPopper,
  Pencil,
  RotateCcw,
  Sunrise,
} from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import {
  BOOST_ANIMATIONS,
  MorningBoostScreen,
  celebrate,
  sceneFor,
  type BoostTexts,
} from "@/components/team/TeamMoments";
import {
  useOrgGeneralSettings,
  useUpdateOrgGeneralSettings,
  useUpdatePipeline,
  type PipelineRow,
  type StageRow,
} from "@/hooks/use-crm-data";
import { useAuth } from "@/lib/auth";
import { useI18n } from "@/lib/i18n";
import { cn, describeError } from "@/lib/utils";
import { AmoToggle } from "./AmoControls";
import { useUiSettings } from "@/hooks/crm/ui-settings";
import { DEFAULT_CLIENT_NOTIFY, cleanKeywords, type ClientNotifyRules } from "@/lib/client-notify";

// Voronka sozlamalari → "Qo'shimcha sozlamalar" (what 5CRM adds to the
// amoCRM screen): sale celebration, morning boost, notification center.

function ExtraCard({
  icon: Icon,
  tone,
  title,
  toggle,
  children,
}: {
  icon: typeof BellRing;
  tone: string;
  title: string;
  toggle?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="rounded-[8px] border border-border bg-card px-4 py-3.5 shadow-[0_1px_1px_rgba(15,23,42,0.05)] transition-colors hover:border-[color-mix(in_oklab,var(--border)_60%,var(--primary))]">
      <div className="flex items-center gap-2.5">
        <span className={cn("grid h-8 w-8 shrink-0 place-items-center rounded-[8px]", tone)}>
          <Icon className="h-[17px] w-[17px]" />
        </span>
        <h3 className="min-w-0 flex-1 text-[14px] font-semibold text-foreground">{title}</h3>
        {toggle}
      </div>
      <div className="mt-2">{children}</div>
    </section>
  );
}

const ghostBtn =
  "inline-flex h-8 items-center gap-1.5 rounded-[4px] border border-border px-2.5 text-[12px] font-semibold text-foreground transition-colors hover:border-primary/50 hover:bg-primary/10 disabled:opacity-50";

function useSaveOrg() {
  const { t } = useI18n();
  const update = useUpdateOrgGeneralSettings();
  return {
    pending: update.isPending,
    save: (patch: Parameters<typeof update.mutate>[0], done?: string) =>
      update.mutate(patch, {
        onSuccess: () => toast.success(done ?? t("fs.saved")),
        onError: (e) => toast.error(describeError(e, t("fs.saveFailedMigration"))),
      }),
  };
}

export function CelebrateCard({
  pipeline,
  stages,
  canManage,
}: {
  pipeline: PipelineRow;
  stages: StageRow[];
  canManage: boolean;
}) {
  const { t } = useI18n();
  const { user } = useAuth();
  const update = useUpdatePipeline();
  const on = !!pipeline.celebrate_stage_id;
  function set(stageId: string | null) {
    update.mutate(
      { id: pipeline.id, patch: { celebrate_stage_id: stageId } },
      {
        onSuccess: () => toast.success(t("fs.saved")),
        onError: (e) => toast.error(describeError(e, t("fs.saveFailedMigration"))),
      },
    );
  }
  const fallback = stages.find((s) => s.is_won) ?? stages[stages.length - 1];
  return (
    <ExtraCard
      icon={PartyPopper}
      tone="bg-emerald-500/15 text-emerald-400"
      title={t("xs.celebrate")}
      toggle={
        <AmoToggle
          checked={on}
          disabled={!canManage}
          label={t("xs.celebrate")}
          onChange={(v) => set(v ? (fallback?.id ?? null) : null)}
        />
      }
    >
      <p className="text-[12px] leading-snug text-muted-foreground">{t("xs.celebrateDesc")}</p>
      {on && (
        <label className="mt-2.5 flex items-center gap-2 text-[12px] text-muted-foreground">
          {t("xs.celebrateStage")}
          <select
            value={pipeline.celebrate_stage_id ?? ""}
            disabled={!canManage}
            onChange={(e) => set(e.target.value || null)}
            className="h-8 min-w-0 flex-1 rounded-[4px] border border-border bg-background px-2 text-[12.5px] font-semibold text-foreground outline-none focus:border-primary"
          >
            {stages.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </label>
      )}
      <button
        type="button"
        className={cn(ghostBtn, "mt-2.5")}
        onClick={() => celebrate({ seller: user?.name ?? "", lead: t("xs.previewLead") })}
      >
        <Eye className="h-3.5 w-3.5" /> {t("xs.preview")}
      </button>
    </ExtraCard>
  );
}

export function MorningBoostCard({ canManage }: { canManage: boolean }) {
  const { t } = useI18n();
  const { user } = useAuth();
  const { data: s } = useOrgGeneralSettings();
  const { save, pending } = useSaveOrg();
  const [preview, setPreview] = useState(false);
  const [textsOpen, setTextsOpen] = useState(false);
  const texts = (s?.morning_boost_texts ?? null) as BoostTexts | null;
  const [draft, setDraft] = useState<BoostTexts>({});
  const animation = s?.morning_boost_animation ?? "sun";

  return (
    <ExtraCard
      icon={Sunrise}
      tone="bg-amber-500/15 text-amber-400"
      title={t("xs.boost")}
      toggle={
        <AmoToggle
          checked={!!s?.morning_boost_enabled}
          disabled={!canManage}
          label={t("xs.boost")}
          onChange={(v) => save({ morning_boost_enabled: v })}
        />
      }
    >
      <p className="text-[12px] leading-snug text-muted-foreground">{t("xs.boostDesc")}</p>
      <div className="mt-2.5 flex flex-wrap gap-1.5">
        <button type="button" className={ghostBtn} onClick={() => setPreview(true)}>
          <Eye className="h-3.5 w-3.5" /> {t("xs.view")}
        </button>
        <button
          type="button"
          className={ghostBtn}
          disabled={!canManage || pending}
          onClick={() =>
            save({ morning_boost_reset_at: new Date().toISOString() }, t("xs.shownAgain"))
          }
        >
          <RotateCcw className="h-3.5 w-3.5" /> {t("xs.showAgain")}
        </button>
        <button
          type="button"
          className={ghostBtn}
          disabled={!canManage}
          onClick={() => {
            setDraft(texts ?? {});
            setTextsOpen(true);
          }}
        >
          <Pencil className="h-3.5 w-3.5" /> {t("xs.texts")}
        </button>
      </div>
      <label className="mt-2.5 flex items-center gap-2 text-[12px] font-semibold text-muted-foreground">
        {t("xs.animation")}
        <select
          value={animation}
          disabled={!canManage}
          onChange={(e) => save({ morning_boost_animation: e.target.value })}
          className="h-8 min-w-0 flex-1 rounded-[4px] border border-border bg-background px-2 text-[12.5px] font-semibold text-foreground outline-none focus:border-primary"
        >
          {BOOST_ANIMATIONS.map((a) => (
            <option key={a} value={a}>
              {t(`xs.anim.${a}`)}
            </option>
          ))}
        </select>
      </label>
      <p className="mt-2 text-[11px] leading-snug text-subtle">{t("xs.boostFoot")}</p>

      {preview && (
        <MorningBoostScreen
          name={user?.name ?? ""}
          scene={sceneFor(animation)}
          texts={texts}
          result={{ sales: 3, moves: 12 }}
          onClose={() => setPreview(false)}
        />
      )}

      <Dialog open={textsOpen} onOpenChange={setTextsOpen}>
        <DialogContent className="amo-skin max-w-md">
          <DialogTitle>{t("xs.texts")}</DialogTitle>
          <p className="text-[12.5px] text-muted-foreground">{t("xs.textsHint")}</p>
          <div className="mt-1 space-y-3">
            {(["greeting", "meaning", "goal"] as const).map((k) => (
              <label key={k} className="block">
                <span className="mb-1 block text-[12px] font-semibold text-muted-foreground">
                  {t(`xs.t.${k}`)}
                </span>
                <textarea
                  rows={k === "meaning" ? 3 : 2}
                  value={draft[k] ?? ""}
                  placeholder={t(`moment.${k}`)}
                  onChange={(e) => setDraft({ ...draft, [k]: e.target.value.slice(0, 300) })}
                  className="w-full resize-none rounded-[4px] border border-border bg-background px-3 py-2 text-[13px] text-foreground outline-none focus:border-primary"
                />
              </label>
            ))}
          </div>
          <button
            type="button"
            disabled={pending}
            onClick={() => {
              const clean = Object.fromEntries(
                Object.entries(draft).filter(([, v]) => typeof v === "string" && v.trim()),
              );
              save({ morning_boost_texts: Object.keys(clean).length ? clean : null });
              setTextsOpen(false);
            }}
            className="mt-2 inline-flex h-10 w-full items-center justify-center gap-2 rounded-[4px] bg-primary text-sm font-semibold text-primary-foreground disabled:opacity-50"
          >
            {pending && <Loader2 className="h-4 w-4 animate-spin" />}
            {t("xs.saveTexts")}
          </button>
        </DialogContent>
      </Dialog>
    </ExtraCard>
  );
}

const NOTIFY_KEYS = [
  "notify_lead_assigned",
  "notify_stage_changed",
  "notify_sale_congrats",
  "notify_task_reminder",
] as const;

export function NotifyCenterCard({ canManage }: { canManage: boolean }) {
  const { t } = useI18n();
  const { data: s } = useOrgGeneralSettings();
  const { save } = useSaveOrg();
  const [open, setOpen] = useState<string | null>(null);
  return (
    <ExtraCard icon={BellRing} tone="bg-primary/15 text-primary" title={t("xs.notify")}>
      <p className="text-[12px] leading-snug text-muted-foreground">{t("xs.notifyDesc")}</p>
      <ul className="mt-2 divide-y divide-border border-y border-border">
        {NOTIFY_KEYS.map((k) => (
          <li key={k}>
            <div className="flex items-center gap-1.5 py-2">
              <button
                type="button"
                onClick={() => setOpen(open === k ? null : k)}
                className="flex min-w-0 flex-1 items-center gap-1.5 text-left text-[12.5px] font-semibold text-foreground"
              >
                <ChevronRight
                  className={cn(
                    "h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform duration-200",
                    open === k && "rotate-90",
                  )}
                />
                {t(`xs.n.${k}`)}
              </button>
              <AmoToggle
                checked={s?.[k] ?? true}
                disabled={!canManage}
                label={t(`xs.n.${k}`)}
                onChange={(v) => save({ [k]: v })}
              />
            </div>
            <div
              className={cn(
                "grid transition-[grid-template-rows] duration-200",
                open === k ? "grid-rows-[1fr]" : "grid-rows-[0fr]",
              )}
            >
              <p className="overflow-hidden pl-5 text-[11.5px] leading-snug text-muted-foreground">
                <span className="block pb-2">{t(`xs.n.${k}Desc`)}</span>
              </p>
            </div>
          </li>
        ))}
      </ul>
      <ClientMessageRules canManage={canManage} />
      <p className="mt-2 text-[11px] leading-snug text-subtle">{t("xs.notifyFoot")}</p>
    </ExtraCard>
  );
}

/**
 * «Mijoz xabarlari»: whether a client's message notifies its owner when the
 * client is new / already known, and the keywords that raise a separate
 * alert (src/lib/client-notify.ts, read by notifyClientMessage).
 */
function ClientMessageRules({ canManage }: { canManage: boolean }) {
  const { t } = useI18n();
  const ui = useUiSettings();
  const rules = ui.settings.notify ?? DEFAULT_CLIENT_NOTIFY;
  const [word, setWord] = useState("");
  const edit = canManage && ui.canEdit;

  function save(next: Partial<ClientNotifyRules>) {
    void ui
      .save({ ...ui.settings, notify: { ...rules, ...next } })
      .then(() => toast.success(t("fs.saved")))
      .catch((e: unknown) => toast.error(describeError(e, t("fs.saveFailedMigration"))));
  }
  function addWord() {
    const list = cleanKeywords([...rules.keywords, ...word.split(",")]);
    setWord("");
    if (list.length !== rules.keywords.length) save({ keywords: list });
  }

  const rows: [keyof ClientNotifyRules, string][] = [
    ["newClient", "xs.cm.newClient"],
    ["existingClient", "xs.cm.existingClient"],
  ];
  return (
    <div className="mt-3">
      <p className="text-[11px] font-bold uppercase tracking-[0.1em] text-muted-foreground">
        {t("xs.cm.title")}
      </p>
      <ul className="mt-1.5 divide-y divide-border border-y border-border">
        {rows.map(([k, label]) => (
          <li key={k} className="flex items-center gap-2 py-2">
            <span className="min-w-0 flex-1 text-[12.5px] font-semibold text-foreground">
              {t(label)}
            </span>
            <AmoToggle
              checked={rules[k] as boolean}
              disabled={!edit}
              label={t(label)}
              onChange={(v) => save({ [k]: v })}
            />
          </li>
        ))}
      </ul>
      <p className="mt-2.5 text-[12.5px] font-semibold text-foreground">{t("xs.cm.keywords")}</p>
      <p className="text-[11.5px] leading-snug text-muted-foreground">{t("xs.cm.keywordsDesc")}</p>
      <div className="mt-1.5 flex flex-wrap gap-1.5">
        {rules.keywords.map((k) => (
          <span
            key={k}
            className="inline-flex items-center gap-1 rounded-full bg-rose-500/12 py-0.5 pl-2.5 pr-1 text-[12px] font-semibold text-rose-700 dark:text-rose-300"
          >
            {k}
            {edit && (
              <button
                type="button"
                aria-label={t("common.delete")}
                onClick={() => save({ keywords: rules.keywords.filter((x) => x !== k) })}
                className="grid h-4 w-4 place-items-center rounded-full hover:bg-rose-500/20"
              >
                ×
              </button>
            )}
          </span>
        ))}
      </div>
      {edit && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            addWord();
          }}
          className="mt-2 flex gap-1.5"
        >
          <input
            value={word}
            onChange={(e) => setWord(e.target.value)}
            placeholder={t("xs.cm.keywordPh")}
            className="h-8 min-w-0 flex-1 rounded-[8px] border border-border bg-background px-2.5 text-[12.5px] outline-none focus:border-primary phone:text-base"
          />
          <button
            type="submit"
            disabled={!word.trim()}
            className="ctl-soft h-8 shrink-0 rounded-[8px] px-3 text-[12px] font-semibold disabled:opacity-50"
          >
            {t("fs.add")}
          </button>
        </form>
      )}
      <div className="mt-2 flex items-center gap-2">
        <span className="min-w-0 flex-1 text-[12px] text-muted-foreground">
          {t("xs.cm.toManagers")}
        </span>
        <AmoToggle
          checked={rules.keywordsToManagers}
          disabled={!edit}
          label={t("xs.cm.toManagers")}
          onChange={(v) => save({ keywordsToManagers: v })}
        />
      </div>
    </div>
  );
}
