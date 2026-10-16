import { createFileRoute, Link } from "@tanstack/react-router";
import {
  Boxes,
  ChevronRight,
  Instagram,
  Mail,
  MessageSquareText,
  Send,
  Webhook,
  Workflow,
  type LucideIcon,
} from "lucide-react";
import { PageHeader, type CardTone } from "@/components/layout/Primitives";
import { AdminBackLink } from "@/components/admin/AdminBackLink";
import { PlanGate } from "@/components/PlanGate";
import { CrmGate } from "@/components/CrmGate";
import {
  AmoCrmCard,
  Bitrix24Card,
  SmsProviderCard,
  SmtpEmailCard,
  TelegramMiniAppCard,
  WebhookQuickCreateCard,
} from "@/components/integrations/IntegrationCards";
import { InstagramCard } from "@/components/integrations/InstagramCard";
import { usePermission } from "@/hooks/use-crm-data";
import { useI18n } from "@/lib/i18n";

// One integration per page: its title, one line on what it does, and only
// its own setup card.

// The one-time import of amoCRM funnels, fields and leads is part of the
// amoCRM page, not a card of its own.
function AmoImportLink() {
  const { t } = useI18n();
  return (
    <Link
      to="/admin/amocrm-import"
      className="mt-4 flex items-center gap-3 rounded-2xl border border-border bg-card p-4 transition-colors hover:border-primary/40"
    >
      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-sky-500/10 text-sky-600">
        <Workflow className="h-5 w-5" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold text-foreground">
          {t("hub.item.amocrmImport.title")}
        </span>
        <span className="block text-xs text-muted-foreground">
          {t("hub.item.amocrmImport.desc")}
        </span>
      </span>
      <ChevronRight className="h-4 w-4 text-muted-foreground" />
    </Link>
  );
}
type Page = {
  icon: LucideIcon;
  tone: CardTone;
  crmOnly?: boolean;
  manageOnly?: boolean;
  render: () => React.ReactNode;
};

const PAGES: Record<string, Page> = {
  amocrm: {
    icon: Boxes,
    tone: "sky",
    render: () => (
      <PlanGate feature="integrations">
        <AmoCrmCard />
        <AmoImportLink />
      </PlanGate>
    ),
  },
  bitrix24: {
    icon: Boxes,
    tone: "violet",
    render: () => (
      <PlanGate feature="integrations">
        <Bitrix24Card />
      </PlanGate>
    ),
  },
  sms: {
    icon: MessageSquareText,
    tone: "amber",
    crmOnly: true,
    manageOnly: true,
    render: () => <SmsProviderCard />,
  },
  email: {
    icon: Mail,
    tone: "rose",
    crmOnly: true,
    manageOnly: true,
    render: () => <SmtpEmailCard />,
  },
  webhook: {
    icon: Webhook,
    tone: "primary",
    crmOnly: true,
    manageOnly: true,
    render: () => <WebhookQuickCreateCard />,
  },
  instagram: {
    icon: Instagram,
    tone: "rose",
    crmOnly: true,
    manageOnly: true,
    render: () => <InstagramCard />,
  },
  "telegram-app": {
    icon: Send,
    tone: "sky",
    crmOnly: true,
    manageOnly: true,
    render: () => <TelegramMiniAppCard />,
  },
};

const ITEM_KEY: Record<string, string> = {
  amocrm: "amocrm",
  bitrix24: "bitrix24",
  sms: "sms",
  email: "email",
  webhook: "webhook",
  "telegram-app": "telegramApp",
  instagram: "instagram",
};

export const Route = createFileRoute("/integrations/$slug")({
  component: IntegrationPage,
});

function IntegrationPage() {
  const { slug } = Route.useParams();
  const { t } = useI18n();
  const canManage = usePermission("Manage integrations");
  const page = PAGES[slug];

  if (!page) {
    return (
      <>
        <AdminBackLink />
        <p className="py-10 text-center text-sm text-muted-foreground">
          {t("hub.notFound")}{" "}
          <Link to="/integrations" className="font-semibold text-primary hover:underline">
            {t("int.title")}
          </Link>
        </p>
      </>
    );
  }

  const key = ITEM_KEY[slug]!;
  const body =
    page.manageOnly && !canManage ? (
      <p className="py-10 text-center text-sm text-muted-foreground">{t("hub.noManageRight")}</p>
    ) : (
      page.render()
    );

  return (
    <>
      <PageHeader
        icon={page.icon}
        tone={page.tone}
        title={t(`hub.item.${key}.title`)}
        description={t(`hub.item.${key}.desc`)}
      />
      <div className="max-w-4xl">{page.crmOnly ? <CrmGate>{body}</CrmGate> : body}</div>
    </>
  );
}
