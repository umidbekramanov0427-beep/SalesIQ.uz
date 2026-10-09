import { useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
  ArrowLeftRight,
  Check,
  ExternalLink,
  Loader2,
  Merge,
  Settings,
  ShieldAlert,
  Users,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { PageHeader, SectionCard, Pill } from "@/components/layout/Primitives";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { AdminBackLink } from "@/components/admin/AdminBackLink";
import { useI18n } from "@/lib/i18n";
import { useAuth } from "@/lib/auth";
import { cn, describeError, timeAgo } from "@/lib/utils";
import {
  useDismissDuplicateFlag,
  useDuplicateFlagLeads,
  useDuplicateFlags,
  useFunnelDuplicateGroups,
  useMergeFunnelDuplicates,
  useMergeLeads,
  useOrgGeneralSettings,
  useProfilesRaw,
  useUpdateOrgGeneralSettings,
  type DuplicateFlagLeadSummary,
  type LeadDuplicateFlagRow,
} from "@/hooks/use-crm-data";
import { CrmGate } from "@/components/CrmGate";

export const Route = createFileRoute("/admin/duplicates")({
  head: () => ({
    meta: [
      { title: "Dublikat lidlar — SalesIQ" },
      {
        name: "description",
        content: "Telefon raqami mos kelgan lidlarni ko'rib chiqing va birlashtiring.",
      },
    ],
  }),
  component: () => (
    <CrmGate>
      <AdminDuplicatesPage />
    </CrmGate>
  ),
});

const SOURCE_LABEL_KEY: Record<string, string> = {
  webhook: "duplicates.sourceWebhook",
  web_form: "duplicates.sourceWebForm",
  manual: "duplicates.sourceManual",
};

function LeadMiniCard({
  label,
  lead,
  ownerName,
}: {
  label: string;
  lead: DuplicateFlagLeadSummary | undefined;
  ownerName: string | null;
}) {
  const { t } = useI18n();
  if (!lead) {
    return (
      <div className="flex-1 rounded-xl border border-dashed border-border bg-surface p-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-subtle">{label}</p>
        <p className="mt-1 text-sm text-subtle">{t("duplicates.leadGone")}</p>
      </div>
    );
  }
  return (
    <div className="flex-1 rounded-xl border border-border bg-surface p-3">
      <p className="text-xs font-semibold uppercase tracking-wide text-subtle">{label}</p>
      <Link
        to="/crm/leads/$leadId"
        params={{ leadId: lead.id }}
        target="_blank"
        className="mt-1 flex items-center gap-1.5 text-sm font-semibold text-foreground hover:text-primary"
      >
        {lead.name} <ExternalLink className="h-3 w-3" />
      </Link>
      <p className="mt-0.5 text-xs text-subtle">{lead.company_name || "—"}</p>
      <p className="mt-0.5 text-xs text-subtle">
        {ownerName ?? t("duplicates.unassigned")} · {timeAgo(lead.created_at)}
      </p>
    </div>
  );
}

function DuplicateRow({
  flag,
  matched,
  fresh,
  ownerName,
}: {
  flag: LeadDuplicateFlagRow;
  matched: DuplicateFlagLeadSummary | undefined;
  fresh: DuplicateFlagLeadSummary | undefined;
  ownerName: (id: string | null) => string | null;
}) {
  const { t } = useI18n();
  const merge = useMergeLeads();
  const dismiss = useDismissDuplicateFlag();
  const [mergingDirection, setMergingDirection] = useState<"intoMatched" | "intoFresh" | null>(
    null,
  );

  const canMerge = !!matched && !!fresh;

  async function onMerge(direction: "intoMatched" | "intoFresh") {
    if (!matched || !fresh) return;
    setMergingDirection(direction);
    try {
      await merge.mutateAsync(
        direction === "intoMatched"
          ? { survivorLeadId: matched.id, loserLeadId: fresh.id }
          : { survivorLeadId: fresh.id, loserLeadId: matched.id },
      );
      toast.success(t("duplicates.mergeSuccess"));
    } catch (err) {
      toast.error(describeError(err, t("duplicates.mergeFailed")));
    } finally {
      setMergingDirection(null);
    }
  }

  async function onDismiss() {
    try {
      await dismiss.mutateAsync(flag.id);
    } catch (err) {
      toast.error(describeError(err, t("duplicates.dismissFailed")));
    }
  }

  return (
    <li className="rounded-xl border border-border bg-surface p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Users className="h-4 w-4 text-subtle" />
          <span className="text-sm font-semibold text-foreground">{flag.phone}</span>
          <Pill tone="warning">
            {t(SOURCE_LABEL_KEY[flag.source] ?? "duplicates.sourceManual")}
          </Pill>
        </div>
        <span className="text-xs text-subtle">{timeAgo(flag.created_at)}</span>
      </div>

      <div className="mt-3 flex flex-col gap-2 sm:flex-row">
        <LeadMiniCard
          label={t("duplicates.existingLead")}
          lead={matched}
          ownerName={ownerName(matched?.owner_id ?? null)}
        />
        <LeadMiniCard
          label={t("duplicates.newLead")}
          lead={fresh}
          ownerName={ownerName(fresh?.owner_id ?? null)}
        />
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-border pt-3">
        {canMerge && (
          <>
            <button
              type="button"
              onClick={() => void onMerge("intoMatched")}
              disabled={merge.isPending}
              className="inline-flex h-9 items-center gap-1.5 rounded-xl bg-primary px-3 text-xs font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-60"
            >
              {mergingDirection === "intoMatched" ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <ArrowLeftRight className="h-3.5 w-3.5" />
              )}
              {t("duplicates.mergeIntoExisting")}
            </button>
            <button
              type="button"
              onClick={() => void onMerge("intoFresh")}
              disabled={merge.isPending}
              className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-border bg-background px-3 text-xs font-medium text-foreground transition-colors hover:bg-accent disabled:opacity-60"
            >
              {mergingDirection === "intoFresh" ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <ArrowLeftRight className="h-3.5 w-3.5" />
              )}
              {t("duplicates.mergeIntoNew")}
            </button>
          </>
        )}
        <button
          type="button"
          onClick={() => void onDismiss()}
          disabled={dismiss.isPending}
          className="ml-auto inline-flex h-9 items-center gap-1.5 rounded-xl px-3 text-xs font-medium text-muted-foreground hover:bg-accent disabled:opacity-60"
        >
          {dismiss.isPending ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <X className="h-3.5 w-3.5" />
          )}
          {t("duplicates.notADuplicate")}
        </button>
      </div>
    </li>
  );
}

// Which fields count toward "this is the same person" -- phone was always
// the only rule; name/email are opt-in since they're more prone to false
// positives (two real customers can share a common name).
function DuplicateSettingsDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const { t } = useI18n();
  const { data: settings } = useOrgGeneralSettings();
  const update = useUpdateOrgGeneralSettings();

  async function toggle(
    field: "dedupe_match_phone" | "dedupe_match_name" | "dedupe_match_email",
    value: boolean,
  ) {
    try {
      await update.mutateAsync({ [field]: value });
    } catch (err) {
      toast.error(describeError(err, t("duplicates.settingsSaveFailed")));
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{t("duplicates.settingsTitle")}</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">{t("duplicates.settingsDesc")}</p>
        <div className="space-y-4 pt-2">
          <label className="flex items-center justify-between gap-3">
            <span className="text-sm font-medium text-foreground">
              {t("duplicates.matchPhone")}
            </span>
            <Switch
              checked={settings?.dedupe_match_phone ?? true}
              onCheckedChange={(v) => void toggle("dedupe_match_phone", v)}
            />
          </label>
          <label className="flex items-center justify-between gap-3">
            <span className="text-sm font-medium text-foreground">{t("duplicates.matchName")}</span>
            <Switch
              checked={settings?.dedupe_match_name ?? false}
              onCheckedChange={(v) => void toggle("dedupe_match_name", v)}
            />
          </label>
          <label className="flex items-center justify-between gap-3">
            <span className="text-sm font-medium text-foreground">
              {t("duplicates.matchEmail")}
            </span>
            <Switch
              checked={settings?.dedupe_match_email ?? false}
              onCheckedChange={(v) => void toggle("dedupe_match_email", v)}
            />
          </label>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/**
 * One client = one lead per funnel. The switch turns the rule on for new
 * registrations; the list collapses leads made before it (or while it was
 * off) -- each group into its oldest lead, history kept.
 */
function FunnelDedupeSection() {
  const { t } = useI18n();
  const { data: settings } = useOrgGeneralSettings();
  const update = useUpdateOrgGeneralSettings();
  const { data: groups, isLoading, error } = useFunnelDuplicateGroups();
  const merge = useMergeFunnelDuplicates();
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const on = settings?.dedupe_funnel_merge ?? true;
  const list = groups ?? [];
  const extra = list.reduce((sum, g) => sum + g.lead_ids.length - 1, 0);

  async function run(key: string, ids: string[][]) {
    setBusyKey(key);
    try {
      const r = await merge.mutateAsync(ids);
      toast.success(t("guard.mergedToast", { groups: r.groups, leads: r.merged }));
      if (r.errors.length) toast.error(r.errors[0]!);
    } catch (err) {
      toast.error(describeError(err, t("duplicates.mergeFailed")));
    } finally {
      setBusyKey(null);
    }
  }

  return (
    <SectionCard title={t("guard.funnelTitle")} description={t("guard.funnelDesc")}>
      <label className="flex items-center justify-between gap-4 rounded-xl border border-border bg-surface p-3">
        <span>
          <span className="block text-sm font-semibold text-foreground">
            {t("guard.funnelToggle")}
          </span>
          <span className="mt-0.5 block text-xs text-subtle">{t("guard.funnelToggleHint")}</span>
        </span>
        <Switch
          checked={on}
          onCheckedChange={(v) =>
            void update
              .mutateAsync({ dedupe_funnel_merge: v })
              .catch((err) => toast.error(describeError(err, t("duplicates.settingsSaveFailed"))))
          }
        />
      </label>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-semibold text-foreground">
          {t("guard.groupsTitle")}{" "}
          {list.length > 0 && (
            <span className="font-normal text-subtle">
              · {t("guard.groupsCount", { groups: list.length, leads: extra })}
            </span>
          )}
        </p>
        {list.length > 1 && (
          <button
            type="button"
            disabled={!!busyKey}
            onClick={() =>
              void run(
                "all",
                list.map((g) => g.lead_ids),
              )
            }
            className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-60"
          >
            {busyKey === "all" ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Merge className="h-3.5 w-3.5" />
            )}
            {t("guard.mergeAll")}
          </button>
        )}
      </div>
      {isLoading && (
        <div className="mt-3 flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> {t("common.loading")}
        </div>
      )}
      {error && <p className="mt-3 text-sm text-subtle">{t("guard.groupsUnavailable")}</p>}
      {!isLoading && !error && list.length === 0 && (
        <p className="mt-3 flex items-center gap-2 text-sm text-subtle">
          <Check className="h-4 w-4 text-success" /> {t("guard.groupsEmpty")}
        </p>
      )}
      <ul className="mt-3 space-y-2">
        {list.map((g) => {
          const key = `${g.funnel}|${g.phone}`;
          return (
            <li
              key={key}
              className="flex flex-wrap items-center gap-3 rounded-xl border border-border bg-surface p-3"
            >
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-foreground">
                  <span className="tabular-nums">{g.phone}</span>
                  <span className="ml-2 rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
                    {g.funnel}
                  </span>
                </p>
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  {g.lead_ids.map((id, i) => (
                    <Link
                      key={id}
                      to="/crm/leads/$leadId"
                      params={{ leadId: id }}
                      target="_blank"
                      className={cn(
                        "inline-flex max-w-[260px] items-center gap-1 rounded-lg border px-2 py-1 text-xs hover:border-primary/60",
                        i === 0
                          ? "border-primary/40 bg-primary/5 text-foreground"
                          : "border-border text-muted-foreground",
                      )}
                    >
                      <span className="truncate">{g.names[i]}</span>
                      <span className="shrink-0 text-subtle">
                        · {g.owner_names[i] || t("duplicates.unassigned")} ·{" "}
                        {timeAgo(g.created_ats[i]!)}
                      </span>
                    </Link>
                  ))}
                </div>
              </div>
              <button
                type="button"
                disabled={!!busyKey}
                onClick={() => void run(key, [g.lead_ids])}
                className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-semibold text-foreground hover:bg-accent disabled:opacity-60"
              >
                {busyKey === key ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Merge className="h-3.5 w-3.5" />
                )}
                {t("guard.mergeGroup", { count: g.lead_ids.length })}
              </button>
            </li>
          );
        })}
      </ul>
    </SectionCard>
  );
}

function DuplicatesSettingsPage() {
  const { t } = useI18n();
  const { data: flags, isLoading } = useDuplicateFlags();
  const { data: profiles } = useProfilesRaw();
  const [settingsOpen, setSettingsOpen] = useState(false);

  const leadIds = useMemo(
    () =>
      (flags ?? [])
        .flatMap((f) => [f.matched_lead_id, f.new_lead_id])
        .filter((v): v is string => !!v),
    [flags],
  );
  const { data: leads } = useDuplicateFlagLeads(leadIds);
  const leadById = useMemo(() => new Map((leads ?? []).map((l) => [l.id, l])), [leads]);
  const ownerName = (id: string | null) =>
    id ? ((profiles ?? []).find((p) => p.id === id)?.full_name ?? null) : null;

  return (
    <>
      <AdminBackLink />
      <PageHeader
        title={t("duplicates.title")}
        description={t("duplicates.desc")}
        actions={
          <button
            type="button"
            onClick={() => setSettingsOpen(true)}
            className="inline-flex items-center gap-2 rounded-xl border border-border bg-surface px-3 py-2 text-sm font-semibold text-foreground transition-colors hover:bg-accent"
          >
            <Settings className="h-4 w-4" /> {t("duplicates.settingsButton")}
          </button>
        }
      />

      <DuplicateSettingsDialog open={settingsOpen} onOpenChange={setSettingsOpen} />

      <FunnelDedupeSection />

      <SectionCard title={t("duplicates.queueTitle")}>
        {isLoading && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> {t("common.loading")}
          </div>
        )}
        {!isLoading && (flags ?? []).length === 0 && (
          <div className="flex flex-col items-center gap-2 py-10 text-center">
            <Check className="h-6 w-6 text-success" />
            <p className="text-sm text-subtle">{t("duplicates.empty")}</p>
          </div>
        )}
        <ul className="space-y-3">
          {(flags ?? []).map((flag) => (
            <DuplicateRow
              key={flag.id}
              flag={flag}
              matched={flag.matched_lead_id ? leadById.get(flag.matched_lead_id) : undefined}
              fresh={flag.new_lead_id ? leadById.get(flag.new_lead_id) : undefined}
              ownerName={ownerName}
            />
          ))}
        </ul>
      </SectionCard>
    </>
  );
}

function AdminDuplicatesPage() {
  const { user } = useAuth();
  const { t } = useI18n();

  if (user && user.role !== "super_admin" && user.role !== "platform_owner") {
    return (
      <>
        <AdminBackLink />
        <SectionCard title={t("admin.restrictedTitle")} description={t("admin.restrictedDesc")}>
          <div className="flex items-center gap-3 text-sm text-muted-foreground">
            <ShieldAlert className="h-4 w-4" /> {t("admin.restrictedHint")}
          </div>
        </SectionCard>
      </>
    );
  }

  return <DuplicatesSettingsPage />;
}
