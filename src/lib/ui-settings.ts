import { parseClientNotify, type ClientNotifyRules } from "./client-notify";
import { compactCallSettings, parseCallSettings, type CallSettings } from "./call-settings";

// The company's own settings kept in org_general_settings.ui_settings (the
// owner panel's in platform_settings.ui_settings): client message
// notifications and the call settings. Pure rules here; the hook is
// hooks/crm/ui-settings.ts. Keys this app no longer reads are kept as
// they are, so saving never drops what is stored.

export type UiSettings = {
  /** Client message notifications (client-notify.ts); absent = defaults. */
  notify?: ClientNotifyRules;
  /** Admin → Qo'ng'iroq sozlamalari (call-settings.ts); absent = defaults. */
  phone?: Partial<CallSettings>;
  [key: string]: unknown;
};

const isObj = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === "object" && !Array.isArray(v);

/** Whatever is stored, with the parts this app reads cleaned. */
export function parseUiSettings(raw: unknown): UiSettings {
  const out: UiSettings = isObj(raw) ? { ...raw } : {};
  delete out.notify;
  delete out.phone;
  if (isObj(raw) && isObj(raw["notify"])) out.notify = parseClientNotify(raw["notify"]);
  if (isObj(raw) && isObj(raw["phone"]))
    out.phone = compactCallSettings(parseCallSettings(raw["phone"]));
  return out;
}
