import { useMemo, useState } from "react";
import { createFileRoute, Link, Outlet, useRouterState } from "@tanstack/react-router";
import { ArrowRight, BookOpen, Search, Sparkles } from "lucide-react";
import { PageHeader } from "@/components/layout/Primitives";
import { AdminBackLink } from "@/components/admin/AdminBackLink";
import { HELP_ARTICLES, HELP_GROUPS, pick } from "@/lib/help/articles";
import { useI18n } from "@/lib/i18n";

// Qo'llanma: every guide, grouped, with a search box. A guide itself opens
// at /help/<slug> (help.$slug.tsx).
export const Route = createFileRoute("/help")({
  head: () => ({ meta: [{ title: "Guide — SalesIQ" }] }),
  component: HelpRoute,
});

function HelpRoute() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  return pathname.replace(/\/$/, "") === "/help" ? <HelpHub /> : <Outlet />;
}

function HelpHub() {
  const { t, lang } = useI18n();
  const [query, setQuery] = useState("");
  const q = query.trim().toLowerCase();
  const matches = useMemo(
    () =>
      HELP_ARTICLES.filter(
        (a) =>
          !q ||
          [a.title, a.summary, ...a.steps].some((x) => pick(x, lang).toLowerCase().includes(q)),
      ),
    [q, lang],
  );

  return (
    <div className="mx-auto max-w-5xl">
      <AdminBackLink />
      <PageHeader icon={BookOpen} tone="sky" title={t("help.title")} description={t("help.desc")} />

      <div className="mb-8 flex flex-wrap items-center gap-3">
        <Link
          to="/help/$slug"
          params={{ slug: "start" }}
          className="inline-flex h-11 items-center gap-2 rounded-xl bg-primary px-5 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90"
        >
          {t("help.start")} <ArrowRight className="h-4 w-4" />
        </Link>
        <span className="text-sm text-muted-foreground">{t("help.startHint")}</span>
      </div>

      <label
        htmlFor="help-search"
        className="mb-8 flex h-12 max-w-xl items-center gap-2.5 rounded-xl border border-border bg-card px-4 focus-within:border-primary/50"
      >
        <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
        <input
          id="help-search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t("help.search")}
          className="h-full w-full bg-transparent text-[15px] outline-none placeholder:text-subtle"
        />
      </label>

      <div className="space-y-9">
        {HELP_GROUPS.map((group) => {
          const items = matches.filter((a) => a.group === group);
          if (items.length === 0) return null;
          return (
            <section key={group}>
              <h2 className="mb-3 text-xs font-bold uppercase tracking-[0.08em] text-muted-foreground">
                {t(`help.group.${group}`)}
              </h2>
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {items.map((a) => (
                  <Link
                    key={a.slug}
                    to="/help/$slug"
                    params={{ slug: a.slug }}
                    className="group flex flex-col gap-1.5 rounded-2xl border border-border bg-card p-4 transition-colors hover:border-primary/40"
                  >
                    <span className="text-[15px] font-semibold text-foreground">
                      {pick(a.title, lang)}
                    </span>
                    <span className="text-[13px] leading-snug text-muted-foreground">
                      {pick(a.summary, lang)}
                    </span>
                    <span className="mt-auto pt-1 text-xs font-semibold text-primary">
                      {t("help.steps", { count: a.steps.length })} →
                    </span>
                  </Link>
                ))}
              </div>
            </section>
          );
        })}
        {matches.length === 0 && (
          <p className="py-8 text-center text-sm text-muted-foreground">{t("help.empty")}</p>
        )}
      </div>

      <div className="mt-10 rounded-2xl border border-border bg-card p-5">
        <p className="flex items-center gap-2 font-semibold text-foreground">
          <Sparkles className="h-4 w-4 text-primary" /> {t("help.noAnswer")}
        </p>
        <p className="mt-1.5 text-sm text-muted-foreground">{t("help.noAnswerDesc")}</p>
      </div>
    </div>
  );
}
