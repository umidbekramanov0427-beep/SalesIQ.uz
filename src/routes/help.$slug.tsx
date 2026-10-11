import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, ArrowRight, Sparkles } from "lucide-react";
import { GuideText } from "@/components/help/GuideText";
import { BackChip } from "@/components/admin/AdminBackLink";
import { HELP_ARTICLES, helpArticle, pick } from "@/lib/help/articles";
import { useI18n } from "@/lib/i18n";

// One guide: what you need, the steps, what to watch out for, common
// questions, and a button straight to the page it's about.
export const Route = createFileRoute("/help/$slug")({
  component: HelpArticlePage,
});

function HelpArticlePage() {
  const { slug } = Route.useParams();
  const { t, lang } = useI18n();
  const article = helpArticle(slug);

  if (!article) {
    return (
      <div className="mx-auto max-w-3xl py-10 text-center text-sm text-muted-foreground">
        {t("help.notFound")}{" "}
        <Link to="/help" className="font-semibold text-primary hover:underline">
          {t("help.back")}
        </Link>
      </div>
    );
  }

  const index = HELP_ARTICLES.findIndex((a) => a.slug === slug);

  return (
    <article className="mx-auto max-w-3xl pb-10">
      <BackChip to="/help" label={t("help.back")} />

      <p className="text-xs font-bold uppercase tracking-[0.08em] text-muted-foreground">
        {t(`help.group.${article.group}`)} · {index + 1} / {HELP_ARTICLES.length}
      </p>
      <h1 className="mt-2 font-display text-3xl font-semibold tracking-tight text-foreground">
        {pick(article.title, lang)}
      </h1>
      <p className="mt-2 text-[15px] leading-relaxed text-muted-foreground">
        {pick(article.summary, lang)}
      </p>

      {article.need && (
        <div className="mt-6 rounded-xl border border-border bg-card px-4 py-3">
          <p className="text-[11px] font-bold uppercase tracking-wide text-subtle">
            {t("help.need")}
          </p>
          <p className="mt-1 text-sm text-foreground">
            <GuideText text={pick(article.need, lang)} />
          </p>
        </div>
      )}

      <h2 className="mt-8 text-lg font-semibold text-foreground">{t("help.stepsTitle")}</h2>
      <ol className="mt-3 space-y-3">
        {article.steps.map((step, i) => (
          <li key={i} className="flex gap-3">
            <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-primary/10 text-xs font-bold text-primary">
              {i + 1}
            </span>
            <span className="pt-0.5 text-[15px] leading-relaxed text-muted-foreground">
              <GuideText text={pick(step, lang)} />
            </span>
          </li>
        ))}
      </ol>

      {article.notes.length > 0 && (
        <>
          <h2 className="mt-8 text-lg font-semibold text-foreground">{t("help.notes")}</h2>
          <div className="mt-3 space-y-2">
            {article.notes.map((note, i) => (
              <p
                key={i}
                className="rounded-r-xl border-l-[3px] border-amber-500 bg-amber-500/5 px-4 py-2.5 text-sm leading-relaxed text-foreground"
              >
                <GuideText text={pick(note, lang)} />
              </p>
            ))}
          </div>
        </>
      )}

      {article.faq.length > 0 && (
        <>
          <h2 className="mt-8 text-lg font-semibold text-foreground">{t("help.faq")}</h2>
          <div className="mt-3 space-y-2">
            {article.faq.map((f, i) => (
              <div key={i} className="rounded-xl border border-border bg-card px-4 py-3">
                <p className="text-sm font-semibold text-foreground">{pick(f.q, lang)}</p>
                <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                  <GuideText text={pick(f.a, lang)} />
                </p>
              </div>
            ))}
          </div>
        </>
      )}

      <div className="mt-10 rounded-2xl border border-border bg-card p-5">
        <p className="flex items-start gap-2 text-sm leading-relaxed text-muted-foreground">
          <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
          {t("help.aiHint")}
        </p>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <Link
            to={article.open}
            className="inline-flex h-10 items-center gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90"
          >
            {t("help.openPanel")} <ArrowRight className="h-4 w-4" />
          </Link>
          <Link to="/help" className="text-sm font-semibold text-primary hover:underline">
            {t("help.others")}
          </Link>
        </div>
      </div>
    </article>
  );
}
