// Shared by the admin builder, the public form page, and the submission
// handler -- the public page sends a submission payload keyed by `kind`
// directly (never by a translatable label), so the three never need to
// agree on anything fuzzier than this fixed set of field kinds.
export type WebFormFieldKind = "name" | "phone" | "email" | "company" | "message";

export const WEB_FORM_FIELD_KINDS: WebFormFieldKind[] = [
  "name",
  "phone",
  "email",
  "company",
  "message",
];

export type WebFormField = {
  kind: WebFormFieldKind;
  label: string;
  required: boolean;
};

export function defaultWebFormFields(): WebFormField[] {
  return [
    { kind: "name", label: "Name", required: true },
    { kind: "phone", label: "Phone", required: true },
    { kind: "email", label: "Email", required: false },
  ];
}

function isFieldKind(v: unknown): v is WebFormFieldKind {
  return typeof v === "string" && (WEB_FORM_FIELD_KINDS as string[]).includes(v);
}

export function parseWebFormFields(raw: unknown): WebFormField[] {
  if (!Array.isArray(raw)) return defaultWebFormFields();
  const parsed = raw
    .filter((f): f is Record<string, unknown> => !!f && typeof f === "object")
    .map((f) => ({
      kind: isFieldKind(f["kind"]) ? f["kind"] : "message",
      label: typeof f["label"] === "string" && f["label"].trim() ? f["label"] : "Field",
      required: !!f["required"],
    }));
  return parsed.length > 0 ? parsed : defaultWebFormFields();
}
