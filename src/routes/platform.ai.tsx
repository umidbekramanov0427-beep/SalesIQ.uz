import { createFileRoute } from "@tanstack/react-router";
import { Bot, ShieldAlert } from "lucide-react";
import { PageHeader, SectionCard, Pill } from "@/components/layout/Primitives";
import { useAuth } from "@/lib/auth";
import { useI18n } from "@/lib/i18n";
import { useAllAiAgents } from "@/hooks/use-crm-data";

export const Route = createFileRoute("/platform/ai")({
  head: () => ({
    meta: [{ title: "AI Settings — SalesIQ" }],
  }),
  component: PlatformAiPage,
});

function PlatformAiPage() {
  const { user } = useAuth();
  const { t } = useI18n();
  const { data: agents, isLoading } = useAllAiAgents();

  if (user && user.role !== "platform_owner") {
    return (
      <SectionCard
        icon={ShieldAlert}
        tone="rose"
        title={t("admin.restrictedTitle")}
        description={t("admin.restrictedDesc")}
      >
        <div className="flex items-center gap-3 text-sm text-muted-foreground">
          <ShieldAlert className="h-4 w-4" /> {t("admin.restrictedHint")}
        </div>
      </SectionCard>
    );
  }

  return (
    <>
      <PageHeader
        icon={Bot}
        tone="violet"
        title={t("platform.aiTitle")}
        description={t("platform.aiDesc")}
      />

      <SectionCard icon={Bot} tone="violet" title={t("platform.aiTitle")}>
        {isLoading ? (
          <p className="text-sm text-muted-foreground">{t("common.loading")}</p>
        ) : !agents?.length ? (
          <p className="flex items-center gap-2 text-sm text-subtle">
            <Bot className="h-4 w-4" /> {t("platform.noAiAgents")}
          </p>
        ) : (
          <ul className="divide-y divide-border">
            {agents.map((a) => (
              <li key={`${a.organization_id}-${a.kind}`} className="flex items-center gap-3 py-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-foreground">
                    {a.organizations?.name ?? "—"} · {a.kind}
                  </p>
                  <p className="truncate text-xs text-subtle">{a.model ?? "—"}</p>
                </div>
                <Pill tone={a.active ? "success" : "neutral"}>
                  {a.active ? t("platform.active") : t("platform.inactive")}
                </Pill>
              </li>
            ))}
          </ul>
        )}
      </SectionCard>
    </>
  );
}
