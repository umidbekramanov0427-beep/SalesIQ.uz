import { useState } from "react";
import { CreditCard, FolderOpen, Loader2, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { PageHeader, SectionCard } from "@/components/layout/Primitives";
import { inputCls } from "@/components/automations/ActionEditor";
import {
  useChatTemplates,
  useCreateChatTemplate,
  useDeleteChatTemplate,
  useUpdateChatTemplate,
  type ChatTemplateRow,
  useReplyRules,
} from "@/hooks/use-crm-data";
import { useAuth } from "@/lib/auth";
import { useI18n } from "@/lib/i18n";
import { describeError } from "@/lib/utils";
import { findCardNumbers } from "@/lib/reply-rules";

// Company chat templates by group: "/" in a lead's chat lists them, "//"
// lists the groups. Anyone adds; the author or a head edits and deletes.
export function ChatTemplatesTab() {
  const { t } = useI18n();
  const { user } = useAuth();
  const { data: list = [], isLoading } = useChatTemplates();
  const create = useCreateChatTemplate();
  const update = useUpdateChatTemplate();
  const remove = useDeleteChatTemplate();
  const [draft, setDraft] = useState({ group_name: "", title: "", body: "" });
  const head = user?.role === "super_admin" || user?.role === "rop";
  const groups = [...new Set(list.map((x) => x.group_name))].sort();
  const fail = (e: unknown) => toast.error(describeError(e, t("tpl.saveFailed")));

  async function add() {
    const body = draft.body.trim();
    if (!body || !user?.organizationId) return;
    try {
      await create.mutateAsync({
        organization_id: user.organizationId,
        group_name: draft.group_name.trim(),
        title: draft.title.trim() || body.split("\n")[0]!.slice(0, 60),
        body,
      });
      setDraft({ ...draft, title: "", body: "" });
      toast.success(t("tpl.saved"));
    } catch (e) {
      fail(e);
    }
  }

  const canEdit = (x: ChatTemplateRow) => head || x.created_by === user?.id;

  return (
    <>
      <PageHeader title={t("tpl.title")} description={t("tpl.desc")} />
      <div className="grid gap-4 lg:grid-cols-[360px_minmax(0,1fr)]">
        <SectionCard title={t("tpl.new")} icon={Plus} tone="primary">
          <div className="space-y-2">
            <input
              list="tpl-groups"
              value={draft.group_name}
              onChange={(e) => setDraft({ ...draft, group_name: e.target.value })}
              placeholder={t("tpl.group")}
              className={inputCls}
            />
            <datalist id="tpl-groups">
              {groups.filter(Boolean).map((g) => (
                <option key={g} value={g} />
              ))}
            </datalist>
            <input
              value={draft.title}
              onChange={(e) => setDraft({ ...draft, title: e.target.value })}
              placeholder={t("tpl.name")}
              className={inputCls}
            />
            <textarea
              value={draft.body}
              onChange={(e) => setDraft({ ...draft, body: e.target.value })}
              placeholder={t("tpl.bodyPh")}
              rows={5}
              className={`${inputCls} h-auto py-2`}
            />
            <CardWarning text={draft.body} />
            <p className="text-[11px] text-subtle">{t("tpl.vars")}</p>
            <button
              type="button"
              onClick={() => void add()}
              disabled={!draft.body.trim() || create.isPending}
              className="inline-flex h-9 w-full items-center justify-center gap-2 rounded-lg bg-primary text-sm font-semibold text-primary-foreground disabled:opacity-50"
            >
              {create.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              {t("tpl.add")}
            </button>
          </div>
        </SectionCard>

        <div className="space-y-3">
          {isLoading && <Loader2 className="h-5 w-5 animate-spin text-subtle" />}
          {!isLoading && list.length === 0 && (
            <p className="text-sm text-muted-foreground">{t("tpl.empty")}</p>
          )}
          {groups.map((g) => (
            <section key={g} className="rounded-xl border border-border bg-card">
              <h3 className="flex items-center gap-2 border-b border-border px-4 py-2.5 text-[13px] font-bold text-foreground">
                <FolderOpen className="h-4 w-4 text-primary" />
                {g || t("amo.tplNoGroup")}
              </h3>
              <ul className="divide-y divide-border">
                {list
                  .filter((x) => x.group_name === g)
                  .map((x) => (
                    <li key={x.id} className="flex items-start gap-3 px-4 py-2.5">
                      <div className="min-w-0 flex-1">
                        <input
                          defaultValue={x.title}
                          disabled={!canEdit(x)}
                          onBlur={(e) =>
                            e.target.value.trim() &&
                            e.target.value !== x.title &&
                            update.mutate(
                              { id: x.id, patch: { title: e.target.value.trim() } },
                              { onError: fail },
                            )
                          }
                          className="w-full bg-transparent text-[13px] font-semibold text-foreground outline-none focus:text-primary"
                        />
                        <textarea
                          defaultValue={x.body}
                          disabled={!canEdit(x)}
                          rows={2}
                          onBlur={(e) =>
                            e.target.value.trim() &&
                            e.target.value !== x.body &&
                            update.mutate(
                              { id: x.id, patch: { body: e.target.value } },
                              { onError: fail },
                            )
                          }
                          className="mt-0.5 w-full resize-y bg-transparent text-[12.5px] text-muted-foreground outline-none focus:text-foreground"
                        />
                        <CardWarning text={x.body} />
                      </div>
                      {canEdit(x) && (
                        <button
                          type="button"
                          aria-label={t("amo.deleteTemplate")}
                          onClick={() => remove.mutate(x.id, { onError: fail })}
                          className="mt-0.5 rounded-md p-1 text-subtle hover:bg-destructive/10 hover:text-destructive"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      )}
                    </li>
                  ))}
              </ul>
            </section>
          ))}
        </div>
      </div>
    </>
  );
}

// A saved reply carrying a bank card number: said right under it, so a card
// doesn't go to every client who gets this reply (Admin -> Javob qoidalari).
function CardWarning({ text }: { text: string }) {
  const { t } = useI18n();
  const rules = useReplyRules();
  const cards = rules.cardWarning ? findCardNumbers(text) : [];
  if (!cards.length) return null;
  return (
    <p className="mt-1.5 flex items-start gap-1.5 rounded-lg bg-amber-500/10 px-2.5 py-1.5 text-[12px] font-medium leading-snug text-amber-800 dark:text-amber-200">
      <CreditCard className="mt-0.5 h-3.5 w-3.5 shrink-0" />
      {t("reply.templateCard", { cards: cards.map((c) => `${c.brand} ${c.masked}`).join(", ") })}
    </p>
  );
}
