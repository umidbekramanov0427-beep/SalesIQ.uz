// Shared, side-effect-free telephony/integrations catalog -- imported from
// both the client UI (admin.telephony.tsx) and server code
// (telephony-data.server.ts, the credentials route) so the provider list
// and its copy/field requirements live in one place.
//
// Supported: OnlinePBX, Sipuni and MoiZvonki (plus "telegram", the
// per-manager Telegram link roster shown on the same page). Each "kind"
// below is the card's interaction pattern.
//
// org_telephony_credentials has five generic value columns (api_key,
// api_secret, pbx_domain, caller_id, sms_sender_name) -- every "form"-kind
// provider below reuses them under a provider-specific meaning (documented
// per entry) instead of needing its own columns.
export type TelephonyProvider = "telegram" | "moizvonki" | "onlinepbx" | "sipuni";

export type TelephonyFieldKey = "apiKey" | "apiSecret" | "pbxDomain" | "callerId" | "smsSenderName";

export type TelephonyFieldSpec = {
  key: TelephonyFieldKey;
  labelKey: string;
  placeholder?: string;
  inputType?: "text" | "password" | "email";
  required: boolean;
};

export type TelephonyProviderKind =
  | "roster-telegram" // per-manager Telegram link status, from profiles.telegram_chat_id
  | "pbx-inline" // OnlinePBX/Sipuni -- credentials form always shown, "Tekshirish va ulash"
  | "pbx-gated"; // MoiZvonki -- locked "O'chirilgan" card until "Yoqish" reveals the form

export type TelephonyProviderMeta = {
  id: TelephonyProvider;
  labelKey: string;
  descriptionKey: string;
  kind: TelephonyProviderKind;
  fields: TelephonyFieldSpec[];
};

export const TELEPHONY_PROVIDERS: TelephonyProviderMeta[] = [
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
        required: false,
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
];

export function getTelephonyProviderMeta(id: TelephonyProvider): TelephonyProviderMeta {
  const meta = TELEPHONY_PROVIDERS.find((p) => p.id === id);
  if (!meta) throw new Error(`Unknown telephony provider: ${id}`);
  return meta;
}

export function isTelephonyProvider(value: unknown): value is TelephonyProvider {
  return typeof value === "string" && TELEPHONY_PROVIDERS.some((p) => p.id === value);
}
