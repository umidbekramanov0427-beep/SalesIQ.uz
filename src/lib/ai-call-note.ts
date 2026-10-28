// The note the AI leaves on a lead after analysing a call -- in amoCRM and
// in the lead's own timeline. A manager reads it at a glance: the date on
// top, then one line per fact about the client (the company's own intake
// questions first, "Mijoz ismi: ...", "Maqsadi: ..."), the objections, and
// what was agreed last. Pure, so it is unit-tested.

export type CallNoteInput = {
  analysedAt: Date;
  /** The company's intake questions with the answers the AI found ("" = not found). */
  intake: { question: string; answer: string }[];
  /** What the AI learned about the client besides the intake questions. */
  facts: { label: string; value: string | null }[];
  objections: string[];
  summary: string;
  agreements: string[];
  nextStep: string | null;
};

/** dd.mm.yyyy in Tashkent time. */
export function tashkentDate(d: Date): string {
  const t = new Date(d.getTime() + 5 * 60 * 60 * 1000);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(t.getUTCDate())}.${pad(t.getUTCMonth() + 1)}.${t.getUTCFullYear()}`;
}

const clean = (s: string | null | undefined) => (s ?? "").replace(/\s+/g, " ").trim();

// "Mijoz ismi?" -> "Mijoz ismi": a question works as a label without its
// question mark or trailing colon.
const asLabel = (q: string) => clean(q).replace(/[?:：]+$/u, "");

export function buildCallNote(input: CallNoteInput): string {
  const lines = [`Tahlil qilindi: ${tashkentDate(input.analysedAt)}`];
  const seen = new Set<string>();
  const add = (label: string, value: string | null | undefined) => {
    const v = clean(value);
    const l = asLabel(label);
    if (!v || !l || seen.has(l.toLowerCase())) return;
    seen.add(l.toLowerCase());
    lines.push(`${l}: ${v}`);
  };

  for (const q of input.intake) add(q.question, q.answer);
  for (const f of input.facts) add(f.label, f.value);
  const objections = input.objections.map(clean).filter(Boolean);
  if (objections.length) add("E'tirozlari", objections.join("; "));
  // Without any client facts the gist of the call stands in for them.
  if (lines.length === 1 && clean(input.summary)) add("Qisqacha", input.summary);

  const agreed = [...input.agreements.map(clean).filter(Boolean)];
  const next = clean(input.nextStep);
  if (next && !agreed.some((a) => a.toLowerCase() === next.toLowerCase())) agreed.push(next);
  lines.push("", `Kelishuv / keyingi qadam: ${agreed.length ? agreed.join("; ") : "—"}`);
  return lines.join("\n");
}
