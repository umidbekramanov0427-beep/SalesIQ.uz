// Admin → Qo'ng'iroq sozlamalari: the company's own rules for calls, kept
// in org_general_settings.ui_settings.phone (no migration needed). Pure:
// read by the Telefon page, the autodialer and the incoming-call window.

/** Telefon page sections an admin may hide from salespeople. */
export const REP_HIDEABLE = ["reports", "operators", "auto", "voice", "rating"] as const;
export type RepHideable = (typeof REP_HIDEABLE)[number];

export const CALL_PERIODS = ["today", "week", "month"] as const;
export type CallPeriod = (typeof CALL_PERIODS)[number];

export const AUTO_GAPS = [5, 10, 15, 30, 60] as const;

export type CallSettings = {
  /** The incoming-call window pops up for whoever's line rings. */
  popup: boolean;
  /** The period the Telefon page opens with. */
  period: CallPeriod;
  /** Seconds the autodialer waits between calls (the starting value). */
  autoGap: number;
  /** Telefon sections salespeople don't see. */
  hiddenForReps: RepHideable[];
};

export const DEFAULT_CALL_SETTINGS: CallSettings = {
  popup: true,
  period: "today",
  autoGap: 10,
  hiddenForReps: [],
};

const isObj = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === "object" && !Array.isArray(v);

/** Whatever is stored, as clean settings (defaults for anything missing or wrong). */
export function parseCallSettings(raw: unknown): CallSettings {
  const o = isObj(raw) ? raw : {};
  const d = DEFAULT_CALL_SETTINGS;
  const gap = o["autoGap"];
  const hidden = Array.isArray(o["hiddenForReps"])
    ? o["hiddenForReps"].filter((x): x is RepHideable =>
        (REP_HIDEABLE as readonly unknown[]).includes(x),
      )
    : d.hiddenForReps;
  return {
    popup: typeof o["popup"] === "boolean" ? o["popup"] : d.popup,
    period: (CALL_PERIODS as readonly unknown[]).includes(o["period"])
      ? (o["period"] as CallPeriod)
      : d.period,
    autoGap: (AUTO_GAPS as readonly unknown[]).includes(gap) ? (gap as number) : d.autoGap,
    hiddenForReps: Array.from(new Set(hidden)),
  };
}

/** Only what differs from the defaults (what gets stored). */
export function compactCallSettings(s: CallSettings): Partial<CallSettings> {
  const out: Partial<CallSettings> = {};
  const d = DEFAULT_CALL_SETTINGS;
  if (s.popup !== d.popup) out.popup = s.popup;
  if (s.period !== d.period) out.period = s.period;
  if (s.autoGap !== d.autoGap) out.autoGap = s.autoGap;
  if (s.hiddenForReps.length) out.hiddenForReps = [...s.hiddenForReps];
  return out;
}

/** Whether a person with this role sees a Telefon section. */
export function sectionVisible(
  section: string,
  role: string | null | undefined,
  s: CallSettings,
): boolean {
  if (role !== "sotuv_menejeri") return true;
  return !(s.hiddenForReps as string[]).includes(section);
}
