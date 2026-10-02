// Shared, side-effect-free telephony/integrations catalog -- imported from
// both the client UI (admin.telephony.tsx) and server code
// (telephony-data.server.ts, the credentials route) so the provider list
// and its copy/field requirements live in one place.
//
// This page was rebuilt to match a reference product's "Integratsiyalar"
// settings page card-for-card, so each provider's "kind" below reflects
// that reference's own actual interaction pattern for it (a plain
// key/secret form, a locked "Yoqish" gate, an install-an-agent-and-get-a-
// token flow, a webhook-signing flow, or a pull-from-the-client's-own-API
// flow) rather than one generic shape forced onto all of them.
//
// org_telephony_credentials has five generic value columns (api_key,
// api_secret, pbx_domain, caller_id, sms_sender_name) -- every "form"-kind
// provider below reuses them under a provider-specific meaning (documented
// per entry) instead of needing its own columns.
export type TelephonyProvider =
  | "metasell_calls"
  | "telegram"
  | "moizvonki"
  | "binotel"
  | "onlinepbx"
  | "sipuni"
  | "freepbx"
  | "issabel"
  | "newtel"
  | "api_inbound"
  | "api_outbound";

export type TelephonyFieldKey = "apiKey" | "apiSecret" | "pbxDomain" | "callerId" | "smsSenderName";

export type TelephonyFieldSpec = {
  key: TelephonyFieldKey;
  labelKey: string;
  placeholder?: string;
  inputType?: "text" | "password" | "email";
  required: boolean;
};

export type TelephonyProviderKind =
  | "static" // Metasell Calls -- no real backend of ours to connect to, display only
  | "roster-telegram" // per-manager Telegram link status, from profiles.telegram_chat_id
  | "pbx-inline" // OnlinePBX/Sipuni -- credentials form always shown, "Tekshirish va ulash"
  | "pbx-gated" // MoiZvonki/Binotel -- locked "O'chirilgan" card until "Yoqish" reveals the form
  | "agent-token-simple" // FreePBX -- generate a provisioning token, nothing else yet
  | "agent-token-monitor" // Issabel -- provisioning token + install steps + static monitoring + extension links
  | "webhook-signing" // New-Tel -- save a signing key for our webhook + extension links
  | "api-pull" // API orqali ulash -- we poll the client's own API (base URL + token)
  | "api-push"; // API orqali yuborish -- the client pushes to our endpoint (url + signing key)

export type TelephonyProviderMeta = {
  id: TelephonyProvider;
  labelKey: string;
  descriptionKey: string;
  kind: TelephonyProviderKind;
  fields: TelephonyFieldSpec[];
};

export const TELEPHONY_PROVIDERS: TelephonyProviderMeta[] = [
  {
    id: "metasell_calls",
    labelKey: "telephony.provider.metasell_calls",
    descriptionKey: "telephony.providerDesc.metasell_calls",
    kind: "static",
    fields: [],
  },
  {
    id: "telegram",
    labelKey: "telephony.provider.telegram",
    descriptionKey: "telephony.providerDesc.telegram",
    kind: "roster-telegram",
    fields: [],
  },
  {
    id: "moizvonki",
    labelKey: "telephony.provider.moizvonki",
    descriptionKey: "telephony.providerDesc.moizvonki",
    kind: "pbx-gated",
    fields: [
      {
        key: "pbxDomain",
        labelKey: "telephony.moizvonkiApiUrlLabel",
        placeholder: "yourcompany.moizvonki.ru",
        required: true,
      },
      { key: "apiKey", labelKey: "telephony.moizvonkiApiKeyLabel", required: true },
      {
        key: "apiSecret",
        labelKey: "telephony.moizvonkiUserNameLabel",
        inputType: "email",
        required: true,
      },
    ],
  },
  {
    id: "binotel",
    labelKey: "telephony.provider.binotel",
    descriptionKey: "telephony.providerDesc.binotel",
    kind: "pbx-gated",
    fields: [
      { key: "apiKey", labelKey: "telephony.binotelApiKeyLabel", required: true },
      {
        key: "apiSecret",
        labelKey: "telephony.binotelApiSecretLabel",
        inputType: "password",
        required: true,
      },
      {
        key: "callerId",
        labelKey: "telephony.binotelExtLabel",
        placeholder: "101",
        required: false,
      },
    ],
  },
  {
    id: "onlinepbx",
    labelKey: "telephony.provider.onlinepbx",
    descriptionKey: "telephony.providerDesc.onlinepbx",
    kind: "pbx-inline",
    fields: [
      {
        key: "pbxDomain",
        labelKey: "telephony.pbxDomainLabel",
        placeholder: "example.onpbx.ru",
        required: true,
      },
      { key: "apiKey", labelKey: "telephony.apiKeyLabel", required: true },
      {
        key: "apiSecret",
        labelKey: "telephony.apiSecretLabel",
        inputType: "password",
        required: true,
      },
      {
        key: "callerId",
        labelKey: "telephony.callerIdLabel",
        placeholder: "+998901234567",
        required: false,
      },
      {
        key: "smsSenderName",
        labelKey: "telephony.smsSenderLabel",
        placeholder: "SalesIQ",
        required: false,
      },
    ],
  },
  {
    id: "sipuni",
    labelKey: "telephony.provider.sipuni",
    descriptionKey: "telephony.providerDesc.sipuni",
    kind: "pbx-inline",
    fields: [
      {
        key: "callerId",
        labelKey: "telephony.sipNumberLabel",
        placeholder: "101",
        required: false,
      },
      { key: "apiKey", labelKey: "telephony.sipUserLabel", required: true },
      {
        key: "apiSecret",
        labelKey: "telephony.sipSecretLabel",
        inputType: "password",
        required: true,
      },
    ],
  },
  {
    id: "freepbx",
    labelKey: "telephony.provider.freepbx",
    descriptionKey: "telephony.providerDesc.freepbx",
    kind: "agent-token-simple",
    fields: [],
  },
  {
    id: "issabel",
    labelKey: "telephony.provider.issabel",
    descriptionKey: "telephony.providerDesc.issabel",
    kind: "agent-token-monitor",
    fields: [],
  },
  {
    id: "newtel",
    labelKey: "telephony.provider.newtel",
    descriptionKey: "telephony.providerDesc.newtel",
    kind: "webhook-signing",
    fields: [
      {
        key: "apiSecret",
        labelKey: "telephony.newtelWebhookKeyLabel",
        inputType: "password",
        required: true,
      },
    ],
  },
  {
    id: "api_inbound",
    labelKey: "telephony.provider.api_inbound",
    descriptionKey: "telephony.providerDesc.api_inbound",
    kind: "api-pull",
    fields: [
      {
        key: "pbxDomain",
        labelKey: "telephony.apiBaseUrlLabel",
        placeholder: "https://example.com/api",
        required: true,
      },
      {
        key: "apiSecret",
        labelKey: "telephony.apiTokenLabel",
        inputType: "password",
        required: true,
      },
      {
        key: "callerId",
        labelKey: "telephony.apiCustomHeadersLabel",
        placeholder: '{"X-Custom": "value"}',
        required: false,
      },
    ],
  },
  {
    id: "api_outbound",
    labelKey: "telephony.provider.api_outbound",
    descriptionKey: "telephony.providerDesc.api_outbound",
    kind: "api-push",
    fields: [
      {
        key: "pbxDomain",
        labelKey: "telephony.outboundUrlLabel",
        placeholder: "https://example.com/webhook",
        required: true,
      },
      {
        key: "apiSecret",
        labelKey: "telephony.outboundSecretLabel",
        inputType: "password",
        required: true,
      },
    ],
  },
];

export function getTelephonyProviderMeta(id: TelephonyProvider): TelephonyProviderMeta {
  const meta = TELEPHONY_PROVIDERS.find((p) => p.id === id);
  if (!meta) throw new Error(`Unknown telephony provider: ${id}`);
  return meta;
}

export function isTelephonyProvider(value: unknown): value is TelephonyProvider {
  return typeof value === "string" && TELEPHONY_PROVIDERS.some((p) => p.id === value);
}
