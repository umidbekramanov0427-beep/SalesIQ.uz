// Marketing: is a lead qualified (Kval)? The owner's rule -- a qualified
// lead picked up the phone AND watched the webinar; whether it is then sold
// is the sales team's job. A lead that is not qualified carries why. Pure.
//   * picked up: a call to the lead was answered (pbx_calls duration > 0);
//   * watched: marked by the manager, or the AI heard it in a call;
//   * a manager's own verdict (leads.qual_status) wins over the automatic one.

export type NotQualReason = "wrong_number" | "no_number" | "no_answer" | "no_webinar" | "other";
export const NOT_QUAL_REASONS: NotQualReason[] = [
  "wrong_number",
  "no_number",
  "no_answer",
  "no_webinar",
  "other",
];

export type QualInput = {
  phone: string | null;
  answeredCalls: number;
  unansweredCalls: number;
  watched: boolean | null;
  manualStatus: "qualified" | "not_qualified" | null;
  manualReason: NotQualReason | null;
};

export type QualVerdict = {
  status: "qualified" | "not_qualified" | "pending";
  reason: NotQualReason | null;
  /** The verdict came from the manager (not worked out). */
  manual: boolean;
};

/** A phone a person could call: 9-15 digits. */
export function phoneLooksValid(phone: string | null): boolean {
  const digits = (phone ?? "").replace(/\D/g, "");
  return digits.length >= 9 && digits.length <= 15;
}

/** Unanswered calls after which a lead counts as "did not pick up". */
export const NO_ANSWER_AFTER = 3;

export function qualOf(q: QualInput): QualVerdict {
  if (q.manualStatus === "qualified") return { status: "qualified", reason: null, manual: true };
  if (q.manualStatus === "not_qualified")
    return { status: "not_qualified", reason: q.manualReason ?? "other", manual: true };
  if (!q.phone?.trim()) return { status: "not_qualified", reason: "no_number", manual: false };
  if (!phoneLooksValid(q.phone))
    return { status: "not_qualified", reason: "wrong_number", manual: false };
  if (q.answeredCalls > 0 && q.watched === true)
    return { status: "qualified", reason: null, manual: false };
  if (q.answeredCalls === 0 && q.unansweredCalls >= NO_ANSWER_AFTER)
    return { status: "not_qualified", reason: "no_answer", manual: false };
  if (q.answeredCalls > 0 && q.watched === false)
    return { status: "not_qualified", reason: "no_webinar", manual: false };
  return { status: "pending", reason: null, manual: false };
}
