import { createFileRoute } from "@tanstack/react-router";
import {
  Activity,
  Copy,
  FolderKanban,
  Globe,
  Link2,
  PlugZap,
  Settings2,
  Tags,
  Users,
} from "lucide-react";
import { toast } from "sonner";
import { PageHeader, SectionCard } from "@/components/layout/Primitives";
import { Segmented } from "@/components/ui/segmented";
import { useAuth } from "@/lib/auth";
import { useI18n } from "@/lib/i18n";
import { companyOrigin } from "@/lib/subdomain";
import { canUseMarketing } from "@/lib/marketing";
import { moveSessionToPanel } from "@/lib/subdomain-handoff";
import { useMarketingData, useProfilesRaw } from "@/hooks/use-crm-data";
import { cn } from "@/lib/utils";
import { ProjectsBoard } from "@/components/marketing/ProjectsBoard";
import { SourcesBoard } from "@/components/marketing/SourcesBoard";
import { TrackingSettings } from "@/components/marketing/TrackingSettings";
import { useMarketingFilters } from "@/components/marketing/MarketingFilters";

// Marketing paneli -> Sozlash, in tabs: Loyihalar (projects: funnels + UTM
// campaigns, pictures, archive), Manbalar (Telegram channels, the Telegram
// account for live streams, the Meta ad account), Kuzatuv (picture interval,
// how often channels are re-read, what "leaving quickly" means), Jamoa (the
// panel's address and who works in it) and UTM (how leads get their source
// and campaign). Day / night and the language are in the person's tile at the
// bottom of the panel's menu -- their one place.

const TABS = ["projects", "sources", "tracking", "team", "utm"] as const;
type Tab = (typeof TABS)[number];

export const Route = createFileRoute("/marketing/settings")({
  validateSearch: (s: Record<string, unknown>): { tab?: Tab | undefined } => ({
    tab: TABS.includes(s["tab"] as Tab) ? (s["tab"] as Tab) : undefined,
  }),
  head: () => ({ meta: [{ title: "Sozlash — SalesIQ Marketing" }] }),
  component: MarketingSettings,
});

function MarketingSettings() {
  const { t } = useI18n();
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  const tab: Tab = search.tab ?? "projects";
  const f = useMarketingFilters();
  // The funnels and campaigns the company's leads use (for the project form).
  const { data } = useMarketingData(f.period);

  return (
    <div className="space-y-5">
      <PageHeader
        back={false}
        icon={Settings2}
        tone="slate"
        title={t("mkt.nav.settings")}
        description={t("mkt.settingsDesc2")}
      />
      <Segmented
        sticky
        value={tab}
        onChange={(next) =>
          void navigate({ search: { tab: next === "projects" ? undefined : next }, replace: true })
        }
        options={[
          { value: "projects", label: t("mkt.set.projects"), icon: FolderKanban },
          { value: "sources", label: t("mkt.set.sources"), icon: PlugZap },
          { value: "tracking", label: t("mkt.set.tracking"), icon: Activity },
          { value: "team", label: t("mkt.set.team"), icon: Users },
          { value: "utm", label: t("mkt.set.utm"), icon: Tags },
        ]}
      />
      {tab === "projects" && (
        <ProjectsBoard
          funnelNames={data?.funnelNames ?? []}
          campaignNames={data?.campaignNames ?? []}
        />
      )}
      {tab === "sources" && <SourcesBoard />}
      {tab === "tracking" && <TrackingSettings />}
      {tab === "team" && <TeamTab />}
      {tab === "utm" && <UtmTab />}
    </div>
  );
}

function TeamTab() {
  const { t } = useI18n();
  const { user } = useAuth();
  const { data: profiles } = useProfilesRaw();
  const address = companyOrigin(user?.orgSubdomain ?? null, "marketing").replace("https://", "");
  const people = (profiles ?? []).filter((p) =>
    canUseMarketing({
      role: p.role,
      marketingAccess: (p as { marketing_access?: boolean }).marketing_access === true,
    }),
  );
  const isAdmin = user?.role === "super_admin" || user?.role === "platform_owner";
  const roleKey = (r: string, access: boolean) =>
    r === "marketolog"
      ? "admin.roleMarketolog"
      : r === "super_admin"
        ? "admin.roleAdmin"
        : access
          ? "mkt.guestRole"
          : "admin.roleRep";
  return (
    <div className="grid gap-5 xl:grid-cols-2">
      <SectionCard
        icon={Globe}
        tone="sky"
        title={t("mkt.addressTitle")}
        description={t("mkt.addressDesc")}
      >
        <div className="flex items-center gap-2 rounded-xl border border-border bg-surface px-3 py-2.5">
          <Link2 className="h-4 w-4 shrink-0 text-muted-foreground" />
          <span className="min-w-0 flex-1 truncate font-mono text-[14px] font-semibold text-foreground">
            {address}
          </span>
          <button
            type="button"
            onClick={() => {
              void navigator.clipboard?.writeText(`https://${address}`);
              toast.success(t("mkt.copied"));
            }}
            className="grid h-8 w-8 place-items-center rounded-lg text-muted-foreground hover:bg-accent hover:text-foreground"
            aria-label={t("mkt.copy")}
          >
            <Copy className="h-4 w-4" />
          </button>
        </div>
        <p className="mt-3 text-[12.5px] leading-relaxed text-muted-foreground">
          {user?.orgSubdomain ? t("mkt.addressOwn") : t("mkt.addressShared")}
        </p>
      </SectionCard>

      <SectionCard
        icon={Users}
        tone="emerald"
        title={t("mkt.peopleTitle")}
        description={t("mkt.peopleDesc")}
        actions={
          isAdmin ? (
            <button
              type="button"
              onClick={() =>
                void moveSessionToPanel("crm", user?.orgSubdomain ?? null, "/admin/employees")
              }
              className="inline-flex h-8 items-center rounded-lg border border-border px-2.5 text-[12.5px] font-semibold text-foreground hover:border-primary/40 hover:text-primary"
            >
              {t("mkt.managePeople")}
            </button>
          ) : undefined
        }
      >
        <ul className="divide-y divide-border">
          {people.map((p) => {
            const access = (p as { marketing_access?: boolean }).marketing_access === true;
            return (
              <li key={p.id} className="flex items-center gap-3 py-2.5">
                <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-mint text-[11px] font-semibold text-mint-foreground">
                  {(p.full_name || p.email || "?").slice(0, 2).toUpperCase()}
                </span>
                <span className="min-w-0 flex-1 truncate text-[13.5px] font-medium text-foreground">
                  {p.full_name || p.email}
                </span>
                <span
                  className={cn(
                    "rounded-md px-2 py-0.5 text-[11.5px] font-semibold",
                    p.role === "marketolog"
                      ? "bg-rose-500/12 text-rose-700 dark:text-rose-300"
                      : "bg-muted text-muted-foreground",
                  )}
                >
                  {t(roleKey(p.role, access))}
                </span>
              </li>
            );
          })}
        </ul>
      </SectionCard>
    </div>
  );
}

function UtmTab() {
  const { t } = useI18n();
  return (
    <SectionCard
      icon={Tags}
      tone="violet"
      title={t("mkt.tagsTitle")}
      description={t("mkt.tagsDesc")}
    >
      <ol className="grid gap-3 text-[13px] leading-relaxed text-muted-foreground md:grid-cols-3">
        {(["tag1", "tag2", "tag3"] as const).map((k, i) => (
          <li key={k} className="rounded-xl border border-border p-3">
            <span className="mb-1 grid h-6 w-6 place-items-center rounded-full bg-violet-500/12 font-mono text-[12px] font-bold text-violet-700 dark:text-violet-300">
              {i + 1}
            </span>
            <p className="font-semibold text-foreground">{t(`mkt.${k}Title`)}</p>
            <p className="mt-1">{t(`mkt.${k}Desc`)}</p>
          </li>
        ))}
      </ol>
      <code className="mt-3 block overflow-x-auto rounded-lg bg-surface px-3 py-2 font-mono text-[12.5px] text-foreground">
        https://sayt.uz/?utm_source=instagram&amp;utm_campaign=kuz_aksiyasi
      </code>
    </SectionCard>
  );
}
