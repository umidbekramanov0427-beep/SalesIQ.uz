import {
  useAmoConnectionStatus,
  useBitrix24ConnectionStatus,
  useLeadSources,
  useSmsStatus,
  useSmtpStatus,
  useTelephonyStatus,
  useWhatsappStatus,
} from "@/hooks/use-crm-data";
import { useCrmEnabled, useOrgAccess } from "@/lib/use-org-access";

export type IntegrationKey =
  "telephony" | "amocrm" | "bitrix24" | "whatsapp" | "sms" | "email" | "webhooks";

export type IntegrationState = {
  key: IntegrationKey;
  // Not offered on this company's plan / module set.
  available: boolean;
  // undefined while its status is still loading.
  connected: boolean | undefined;
};

// One read of every integration's connection state, for the admin hub tile
// and the integrations table -- each card keeps its own detailed queries;
// these are the same query keys, so nothing is fetched twice.
export function useIntegrationsSummary() {
  const crm = useCrmEnabled();
  const access = useOrgAccess();
  const amo = useAmoConnectionStatus();
  const bitrix = useBitrix24ConnectionStatus();
  const telephony = useTelephonyStatus();
  const whatsapp = useWhatsappStatus();
  const sms = useSmsStatus();
  const email = useSmtpStatus();
  const sources = useLeadSources();

  const integrationsOnPlan = access.has("integrations");
  const telephonyOnPlan = crm && access.has("telephony");
  const loaded = <T>(q: { data: T | undefined; isLoading: boolean; isError: boolean }) =>
    q.isLoading ? undefined : q.data;

  const items: IntegrationState[] = [
    {
      key: "telephony",
      available: telephonyOnPlan,
      connected: telephony.isLoading
        ? undefined
        : Object.values(telephony.data ?? {}).some((s) => s?.connected),
    },
    {
      key: "amocrm",
      available: integrationsOnPlan,
      connected: amo.isLoading ? undefined : !!loaded(amo),
    },
    {
      key: "bitrix24",
      available: integrationsOnPlan,
      connected: bitrix.isLoading ? undefined : !!loaded(bitrix),
    },
    {
      key: "whatsapp",
      available: crm,
      connected: whatsapp.isLoading ? undefined : !!whatsapp.data?.connected,
    },
    { key: "sms", available: crm, connected: sms.isLoading ? undefined : !!sms.data?.connected },
    {
      key: "email",
      available: crm,
      connected: email.isLoading ? undefined : !!email.data?.connected,
    },
    {
      key: "webhooks",
      available: crm,
      connected: sources.isLoading ? undefined : (sources.data?.length ?? 0) > 0,
    },
  ];

  const offered = items.filter((i) => i.available);
  return {
    items,
    total: offered.length,
    connected: offered.filter((i) => i.connected).length,
    loading: offered.some((i) => i.connected === undefined),
  };
}
