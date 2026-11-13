// One key per phone number for finding the same client again (duplicates,
// repeat requests, missed calls). Uzbek numbers come in every format --
// "90 123 45 67", "+998 90 123-45-67", "8 (90) 123 45 67" -- and all get the
// full "998901234567"; any other country keeps its whole number, so
// +7 990 123 45 67 is never taken for +998 90 123 45 67 (comparing only the
// last 9 digits did that). Mirrored in SQL by public.phone9 (migration
// 20270119000000_phone_key_country.sql) -- change both together.

/** The number's key, or null when it has fewer than 7 digits. */
export function phoneKey(raw: string | null | undefined): string | null {
  const d = (raw ?? "").replace(/\D/g, "");
  if (d.length < 7) return null;
  if (d.length === 12 && d.startsWith("998")) return d;
  if (d.length === 9) return `998${d}`; // Uzbek, without the country code
  if (d.length === 10 && d.startsWith("8")) return `998${d.slice(1)}`; // old "8 90 …"
  if (d.length === 11 && d.startsWith("8")) return `7${d.slice(1)}`; // Russian "8 9xx …"
  return d;
}

/** Same client number? (Never true for numbers too short to tell.) */
export function samePhone(a: string | null | undefined, b: string | null | undefined): boolean {
  const ka = phoneKey(a);
  return !!ka && ka === phoneKey(b);
}
