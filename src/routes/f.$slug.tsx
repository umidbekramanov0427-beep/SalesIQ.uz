import { useEffect, useState, type FormEvent } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { CheckCircle2, Loader2 } from "lucide-react";
import { apiFetch } from "@/lib/api";
import { BrandMark } from "@/components/BrandMark";
import type { WebFormField } from "@/lib/forms/web-form-fields";

export const Route = createFileRoute("/f/$slug")({
  head: () => ({
    meta: [{ title: "SalesIQ" }, { name: "robots", content: "noindex" }],
  }),
  component: PublicWebFormPage,
});

type FormConfig = {
  name: string;
  fields: WebFormField[];
  successMessage: string | null;
  active: boolean;
};

const FIELD_LABEL_FALLBACK: Record<WebFormField["kind"], string> = {
  name: "Full name",
  phone: "Phone",
  email: "Email",
  company: "Company",
  message: "Message",
};

function PublicWebFormPage() {
  const { slug } = Route.useParams();
  const [config, setConfig] = useState<FormConfig | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [values, setValues] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    apiFetch(`/forms/${slug}`)
      .then(async (res) => {
        if (!res.ok) throw new Error("not found");
        return res.json();
      })
      .then((data: FormConfig) => {
        if (!cancelled) setConfig(data);
      })
      .catch(() => {
        if (!cancelled) setNotFound(true);
      });
    return () => {
      cancelled = true;
    };
  }, [slug]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!config) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await apiFetch(`/forms/${slug}/submit`, {
        method: "POST",
        body: JSON.stringify(values),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Something went wrong.");
      setSubmitted(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-surface px-4 py-10">
      <div className="w-full max-w-md">
        <BrandMark className="mb-6" />
        <div className="rounded-2xl border border-border bg-background p-6 shadow-soft">
          {notFound && (
            <p className="py-6 text-center text-sm text-subtle">This form is not available.</p>
          )}

          {!notFound && !config && (
            <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading…
            </div>
          )}

          {config && !config.active && (
            <p className="py-6 text-center text-sm text-subtle">
              This form is no longer accepting submissions.
            </p>
          )}

          {config && config.active && submitted && (
            <div className="flex flex-col items-center gap-2 py-8 text-center">
              <CheckCircle2 className="h-8 w-8 text-success" />
              <p className="text-sm font-medium text-foreground">
                {config.successMessage || "Thank you! We'll be in touch soon."}
              </p>
            </div>
          )}

          {config && config.active && !submitted && (
            <form onSubmit={(e) => void onSubmit(e)} className="space-y-4">
              <h1 className="text-lg font-semibold text-foreground">{config.name}</h1>
              {config.fields.map((field) => (
                <label key={field.kind} className="block space-y-1.5">
                  <span className="text-xs font-semibold text-muted-foreground">
                    {field.label || FIELD_LABEL_FALLBACK[field.kind]}
                    {field.required && <span className="text-destructive"> *</span>}
                  </span>
                  {field.kind === "message" ? (
                    <textarea
                      required={field.required}
                      value={values[field.kind] ?? ""}
                      onChange={(e) => setValues((v) => ({ ...v, [field.kind]: e.target.value }))}
                      className="h-24 w-full resize-none rounded-xl border border-border bg-surface p-3 text-sm outline-none focus:border-primary"
                    />
                  ) : (
                    <input
                      type={
                        field.kind === "email" ? "email" : field.kind === "phone" ? "tel" : "text"
                      }
                      required={field.required}
                      value={values[field.kind] ?? ""}
                      onChange={(e) => setValues((v) => ({ ...v, [field.kind]: e.target.value }))}
                      className="h-10 w-full rounded-xl border border-border bg-surface px-3 text-sm outline-none focus:border-primary"
                    />
                  )}
                </label>
              ))}

              {error && <p className="text-sm text-destructive">{error}</p>}

              <button
                type="submit"
                disabled={submitting}
                className="inline-flex h-10 w-full items-center justify-center gap-1.5 rounded-xl bg-primary text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-60"
              >
                {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
                Send
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
