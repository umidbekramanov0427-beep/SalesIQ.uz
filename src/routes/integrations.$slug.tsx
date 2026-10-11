import { createFileRoute, Link } from "@tanstack/react-router";
import { Boxes, Mail, MessageSquareText, Send, Webhook, type LucideIcon } from "lucide-react";
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
import { usePermission } from "@/hooks/use-crm-data";
import { useI18n } from "@/lib/i18n";

// One integration per page: its title, one line on what it does, and only
// its own setup card.
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
      <AdminBackLink />
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
