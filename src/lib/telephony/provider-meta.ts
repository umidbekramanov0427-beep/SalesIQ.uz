// Shared, side-effect-free telephony provider catalog -- imported from both
// the client UI (admin.telephony.tsx) and server code (telephony-data.server.ts,
// the credentials route) so the provider list, its field requirements, and
// which actions it supports live in exactly one place instead of being
// re-declared (and liable to drift) across three files like before this
// module existed.
//
// org_telephony_credentials only has five generic value columns
// (api_key, api_secret, pbx_domain, caller_id, sms_sender_name) -- every
// provider below reuses them under a provider-specific meaning (documented
// per entry) rather than needing its own columns, the same pattern the
// original OnlinePBX/Sipuni/MoiZvonki integrations already established.
export type TelephonyProvider =
  | "onlinepbx"
  | "sipuni"
  | "moizvonki"
  | "binotel"
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

export type TelephonyProviderMeta = {
  id: TelephonyProvider;
  labelKey: string;
  descriptionKey: string;
  fields: TelephonyFieldSpec[];
  supportsCall: boolean;
  supportsSms: boolean;
  // "generic" providers (api_inbound/api_outbound) render a key/webhook
  // panel instead of the normal credentials form -- see admin.telephony.tsx.
  kind: "pbx" | "generic-inbound" | "generic-outbound";
};

export const TELEPHONY_PROVIDERS: TelephonyProviderMeta[] = [
  {
    id: "onlinepbx",
    labelKey: "telephony.provider.onlinepbx",
    descriptionKey: "telephony.providerDesc.onlinepbx",
    kind: "pbx",
    supportsCall: true,
    supportsSms: true,
    fields: [
      {
        key: "pbxDomain",
        labelKey: "telephony.pbxDomainLabel",
        placeholder: "mycompany.onlinepbx.ru",
        required: true,
      },
      {
        key: "callerId",
        labelKey: "telephony.callerIdLabel",
        placeholder: "+998901234567",
        required: false,
      },
      { key: "apiKey", labelKey: "telephony.apiKeyLabel", required: true },
      {
        key: "apiSecret",
        labelKey: "telephony.apiSecretLabel",
        inputType: "password",
        required: true,
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
    kind: "pbx",
    supportsCall: true,
    supportsSms: false,
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
    id: "moizvonki",
    labelKey: "telephony.provider.moizvonki",
    descriptionKey: "telephony.providerDesc.moizvonki",
    kind: "pbx",
    supportsCall: true,
    supportsSms: false,
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
    kind: "pbx",
    supportsCall: true,
    supportsSms: false,
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
    id: "freepbx",
    labelKey: "telephony.provider.freepbx",
    descriptionKey: "telephony.providerDesc.freepbx",
    kind: "pbx",
    supportsCall: false,
    supportsSms: false,
    fields: [
      {
        key: "pbxDomain",
        labelKey: "telephony.freepbxDomainLabel",
        placeholder: "pbx.mycompany.uz",
        required: true,
      },
      { key: "apiKey", labelKey: "telephony.freepbxClientIdLabel", required: true },
      {
        key: "apiSecret",
        labelKey: "telephony.freepbxClientSecretLabel",
        inputType: "password",
        required: true,
      },
    ],
  },
  {
    id: "issabel",
    labelKey: "telephony.provider.issabel",
    descriptionKey: "telephony.providerDesc.issabel",
    kind: "pbx",
    supportsCall: false,
    supportsSms: false,
    fields: [
      {
        key: "pbxDomain",
        labelKey: "telephony.issabelDomainLabel",
        placeholder: "pbx.mycompany.uz",
        required: true,
      },
      { key: "apiKey", labelKey: "telephony.issabelUserLabel", required: true },
      {
        key: "apiSecret",
        labelKey: "telephony.issabelPasswordLabel",
        inputType: "password",
        required: true,
      },
    ],
  },
  {
    id: "newtel",
    labelKey: "telephony.provider.newtel",
    descriptionKey: "telephony.providerDesc.newtel",
    kind: "pbx",
    supportsCall: false,
    supportsSms: false,
    fields: [
      { key: "apiKey", labelKey: "telephony.newtelApiKeyLabel", required: true },
      {
        key: "apiSecret",
        labelKey: "telephony.newtelApiSignatureLabel",
        inputType: "password",
        required: true,
      },
      {
        key: "callerId",
        labelKey: "telephony.callerIdLabel",
        placeholder: "+998901234567",
        required: false,
      },
    ],
  },
  {
    id: "api_inbound",
    labelKey: "telephony.provider.api_inbound",
    descriptionKey: "telephony.providerDesc.api_inbound",
    kind: "generic-inbound",
    supportsCall: false,
    supportsSms: false,
    fields: [{ key: "apiKey", labelKey: "telephony.inboundKeyLabel", required: true }],
  },
  {
    id: "api_outbound",
    labelKey: "telephony.provider.api_outbound",
    descriptionKey: "telephony.providerDesc.api_outbound",
    kind: "generic-outbound",
    supportsCall: false,
    supportsSms: false,
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
