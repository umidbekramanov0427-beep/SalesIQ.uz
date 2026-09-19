// Accumulates the "Mijoz haqida ma'lumot" (customer profile) shown on a
// lead's workspace page across every analyzed call, instead of only ever
// reflecting whichever call happened to be analyzed most recently. Each
// scalar field keeps its latest known value (only overwritten when a call
// actually surfaces a new one); needs/preferences grow as a deduped,
// dated list so a need mentioned in an early call isn't lost once later
// calls stop repeating it.
export type CustomerProfileExtract = {
  interestLevel: string | null;
  budget: string | null;
  location: string | null;
  occupation: string | null;
  currentStatus: string | null;
  needs: string[];
  preferences: string[];
  otherNotes: string;
};

type DatedValue = { value: string; notedAt: string };
type DatedText = { text: string; notedAt: string };

export type StoredCustomerProfile = {
  interestLevel: DatedValue | null;
  budget: DatedValue | null;
  location: DatedValue | null;
  occupation: DatedValue | null;
  currentStatus: DatedValue | null;
  needs: DatedText[];
  preferences: DatedText[];
  otherNotes: string;
};

function mergeScalar(
  existing: DatedValue | null,
  incoming: string | null,
  notedAt: string,
): DatedValue | null {
  if (!incoming?.trim()) return existing;
  return { value: incoming.trim(), notedAt };
}

function mergeList(existing: DatedText[], incoming: string[], notedAt: string): DatedText[] {
  const seen = new Set(existing.map((e) => e.text.trim().toLowerCase()));
  const additions = incoming
    .map((text) => text.trim())
    .filter((text) => text && !seen.has(text.toLowerCase()))
    .map((text) => ({ text, notedAt }));
  return [...existing, ...additions];
}

export function mergeCustomerProfile(
  existing: StoredCustomerProfile | null,
  incoming: CustomerProfileExtract,
  notedAt: string,
): StoredCustomerProfile {
  const base: StoredCustomerProfile = existing ?? {
    interestLevel: null,
    budget: null,
    location: null,
    occupation: null,
    currentStatus: null,
    needs: [],
    preferences: [],
    otherNotes: "",
  };
  return {
    interestLevel: mergeScalar(base.interestLevel, incoming.interestLevel, notedAt),
    budget: mergeScalar(base.budget, incoming.budget, notedAt),
    location: mergeScalar(base.location, incoming.location, notedAt),
    occupation: mergeScalar(base.occupation, incoming.occupation, notedAt),
    currentStatus: mergeScalar(base.currentStatus, incoming.currentStatus, notedAt),
    needs: mergeList(base.needs, incoming.needs, notedAt),
    preferences: mergeList(base.preferences, incoming.preferences, notedAt),
    // Appended, not overwritten -- unlike needs/preferences this is
    // freeform prose with no natural dedupe key, so a running log (newest
    // last) is the honest representation rather than picking one call's
    // notes to keep and discarding the rest.
    otherNotes: incoming.otherNotes.trim()
      ? base.otherNotes
        ? `${base.otherNotes}\n${incoming.otherNotes.trim()}`
        : incoming.otherNotes.trim()
      : base.otherNotes,
  };
}
