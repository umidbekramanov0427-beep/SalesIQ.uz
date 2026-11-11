import { useEffect, useMemo, useState } from "react";
import {
  AudioWaveform,
  Check,
  ChartNoAxesCombined,
  ChartPie,
  Gauge,
  GraduationCap,
  KeyRound,
  Loader2,
  MessageCircleMore,
  Save,
  Sparkles,
  SquareKanban,
  type LucideIcon,
} from "lucide-react";
import { toast } from "sonner";
import { SectionCard } from "@/components/layout/Primitives";
import { Segmented } from "@/components/ui/segmented";
import { useAccessRules, useFunnelListStats, useSaveAccessRules } from "@/hooks/use-crm-data";
import {
  ACCESS_SECTIONS,
  LEAD_SCOPES,
  defaultLeadScope,
  type AccessRules,
  type LeadScope,
  type ManagedRole,
  type SectionKey,
} from "@/lib/access-rules";
import { useAuth } from "@/lib/auth";
import { useI18n } from "@/lib/i18n";
import { cn, describeError } from "@/lib/utils";

// Sozlamalar → Huquqlar, the amoCRM way: per role, whose leads they see
// and a table of the sections (each funnel on its own row) they open.
// Edits stay local until "Saqlash"; only a super admin saves.

const SECTION_ICON: Record<SectionKey, LucideIcon> = {
  funnels: SquareKanban,
  inbox: MessageCircleMore,
  audio: AudioWaveform,
  leadAnalytics: ChartNoAxesCombined,
  analytics: ChartPie,
  attendance: Gauge,
  classroom: GraduationCap,
  ai: Sparkles,
};

function Tick({
  on,
  disabled,
  onChange,
  label,
}: {
  on: boolean;
  disabled?: boolean;
  onChange: (v: boolean) => void;
  label: string;
}) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={on}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!on)}
      className={cn(
        "grid h-[22px] w-[22px] shrink-0 place-items-center rounded-md border transition-colors disabled:cursor-not-allowed disabled:opacity-50",
        on
          ? "border-primary bg-primary text-primary-foreground"
          : "border-border bg-background hover:border-primary/60",
      )}
    >
      {on && <Check className="h-3.5 w-3.5" strokeWidth={3} />}
    </button>
  );
}

export function AccessRulesCard() {
  const { t } = useI18n();
  const { user } = useAuth();
  const canManage = user?.role === "super_admin" || user?.role === "platform_owner";
  const { rules, isLoading } = useAccessRules();
  const save = useSaveAccessRules();
  // Every funnel the company has, as the Voronkalar page lists them.
  const funnelStats = useFunnelListStats(true);
  const funnels = useMemo(
    () => [...new Set(funnelStats.funnels.map((f) => f.name))].sort(),
    [funnelStats.funnels],
  );
  const [role, setRole] = useState<ManagedRole>("rop");
  const [draft, setDraft] = useState<AccessRules>(rules);
  useEffect(() => setDraft(rules), [rules]);
  const dirty = useMemo(() => JSON.stringify(draft) !== JSON.stringify(rules), [draft, rules]);

  const r = draft[role] ?? {};
  const scope: LeadScope = r.leads ?? defaultLeadScope(role);
  const sectionOn = (k: SectionKey) => r.sections?.[k] !== false;
  const funnelOn = (f: string) => r.funnels?.[f] !== false;

  function patch(next: Partial<NonNullable<AccessRules[ManagedRole]>>) {
    setDraft((d) => ({ ...d, [role]: { ...(d[role] ?? {}), ...next } }));
  }
  function setFlag(kind: "sections" | "funnels", key: string, on: boolean) {
    const cur = { ...(r[kind] ?? {}) };
    // Only closed ones are stored: an open section is the default.
    if (on) delete cur[key];
    else cur[key] = false;
    patch({ [kind]: cur });
  }

  async function onSave() {
    try {
      await save.mutateAsync(draft);
      toast.success(t("access.saved"));
    } catch (e) {
      toast.error(
        e instanceof Error && e.message === "MIGRATION_PENDING"
          ? t("access.migrationPending")
          : describeError(e, t("access.saveFailed")),
      );
    }
  }

  return (
    <SectionCard
      icon={KeyRound}
      tone="violet"
      title={t("access.title")}
      description={t("access.desc")}
      actions={
        canManage ? (
          <div className="flex items-center gap-2">
            {dirty && (
              <button
                type="button"
                onClick={() => setDraft(rules)}
                className="inline-flex h-9 items-center rounded-lg border border-border px-3.5 text-sm font-medium text-foreground hover:bg-accent"
              >
                {t("rbac.discard")}
              </button>
            )}
            <button
              type="button"
              disabled={!dirty || save.isPending}
              onClick={() => void onSave()}
              className="inline-flex h-9 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-40"
            >
              {save.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Save className="h-4 w-4" />
              )}
              {t("rbac.save")}
            </button>
          </div>
        ) : undefined
      }
    >
      {isLoading ? (
        <div className="flex items-center gap-2 py-4 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> {t("common.loading")}
        </div>
      ) : (
        <div className="space-y-5">
          <Segmented
            value={role}
            onChange={setRole}
            options={[
              { value: "rop", label: t("admin.roleRop") },
              { value: "sotuv_menejeri", label: t("admin.roleRep") },
            ]}
          />

          <div>
            <p className="text-[12px] font-bold uppercase tracking-[0.06em] text-muted-foreground">
              {t("access.leadsTitle")}
            </p>
            <div className="mt-2 grid gap-2 sm:grid-cols-3">
              {LEAD_SCOPES.map((s) => {
                const on = s === scope;
                return (
                  <button
                    key={s}
                    type="button"
                    disabled={!canManage}
                    onClick={() => patch({ leads: s })}
                    className={cn(
                      "flex items-start gap-2.5 rounded-xl border px-3.5 py-3 text-left transition-colors disabled:cursor-not-allowed",
                      on
                        ? "border-primary/60 bg-primary/[0.07]"
                        : "border-border hover:border-primary/35 hover:bg-accent/40",
                    )}
                  >
                    <span
                      className={cn(
                        "mt-0.5 grid h-4 w-4 shrink-0 place-items-center rounded-full border",
                        on ? "border-primary bg-primary text-primary-foreground" : "border-border",
                      )}
                    >
                      {on && <Check className="h-2.5 w-2.5" strokeWidth={3.5} />}
                    </span>
                    <span className="min-w-0">
                      <span className="block text-[13.5px] font-semibold text-foreground">
                        {t(`access.scope.${s}`)}
                      </span>
                      <span className="mt-0.5 block text-[12px] leading-snug text-muted-foreground">
                        {t(`access.scope.${s}.${role}`)}
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <p className="text-[12px] font-bold uppercase tracking-[0.06em] text-muted-foreground">
              {t("access.sectionsTitle")}
            </p>
            <div className="mt-2 overflow-hidden rounded-xl border border-border">
              <div className="flex items-center gap-3 border-b border-border bg-surface px-4 py-2 text-[11px] font-bold uppercase tracking-[0.06em] text-subtle">
                <span className="flex-1">{t("access.colSection")}</span>
                <span className="w-16 text-center">{t("access.colAccess")}</span>
              </div>
              {ACCESS_SECTIONS.map(({ key }) => {
                const Icon = SECTION_ICON[key];
                const open = sectionOn(key);
                return (
                  <div key={key} className="border-b border-border last:border-b-0">
                    <div className="flex items-center gap-3 px-4 py-2.5">
                      <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-muted text-muted-foreground">
                        <Icon className="h-4 w-4" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-[13.5px] font-semibold text-foreground">
                          {t(`access.section.${key}`)}
                        </span>
                        {key === "funnels" && open && funnels.length > 0 && (
                          <span className="block text-[11.5px] text-muted-foreground">
                            {t("access.funnelsHint")}
                          </span>
                        )}
                      </span>
                      <span className="grid w-16 place-items-center">
                        <Tick
                          on={open}
                          disabled={!canManage}
                          label={t(`access.section.${key}`)}
                          onChange={(v) => setFlag("sections", key, v)}
                        />
                      </span>
                    </div>
                    {key === "funnels" && open && (
                      <div className="bg-surface/60">
                        {funnels.map((f) => (
                          <div
                            key={f}
                            className="flex items-center gap-3 border-t border-border/70 py-2 pl-[60px] pr-4"
                          >
                            <span className="min-w-0 flex-1 truncate text-[13px] text-foreground">
                              {f}
                            </span>
                            <span className="grid w-16 place-items-center">
                              <Tick
                                on={funnelOn(f)}
                                disabled={!canManage}
                                label={f}
                                onChange={(v) => setFlag("funnels", f, v)}
                              />
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
            <p className="mt-2 text-[12px] text-subtle">{t("access.adminNote")}</p>
          </div>
        </div>
      )}
    </SectionCard>
  );
}
