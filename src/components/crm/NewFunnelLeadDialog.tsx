import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { Loader2, Plus, StickyNote, User, X } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { useAuth } from "@/lib/auth";
import { useI18n } from "@/lib/i18n";
import { cn, describeError, stageColorProps } from "@/lib/utils";
import {
  useCreateContact,
  useCreateLead,
  useCreateLeadActivity,
  useLeadCustomFieldDefs,
  useProfilesRaw,
  type StageRow,
} from "@/hooks/use-crm-data";

// amoCRM's "+ New deal": a blank lead card for this funnel -- name, stage,
// owner, budget, the contact, tags, the company's select fields and a first
// note -- saved in one go, then opened like any other lead.

const FIELD =
  "h-9 w-full min-w-0 rounded-lg border border-border bg-background px-3 text-[13.5px] text-foreground outline-none transition-colors placeholder:text-subtle hover:border-primary/40 focus:border-primary focus:ring-2 focus:ring-primary/15";

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="grid grid-cols-[120px_minmax(0,1fr)] items-center gap-3 text-[13.5px]">
      <span className="truncate text-muted-foreground">{label}</span>
      {children}
    </label>
  );
}

export function NewFunnelLeadDialog({
  open,
  onOpenChange,
  funnel,
  stages,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  funnel: string;
  stages: StageRow[];
}) {
  const { t } = useI18n();
  const { user } = useAuth();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const createLead = useCreateLead();
  const createContact = useCreateContact();
  const createActivity = useCreateLeadActivity();
  const { data: profiles = [] } = useProfilesRaw();
  const { data: fieldDefs = [] } = useLeadCustomFieldDefs();

  // Only the funnel's working stages: a new lead isn't won or lost yet.
  const openStages = useMemo(() => stages.filter((s) => !s.is_won && !s.is_lost), [stages]);
  const canPickOwner = user?.role === "super_admin" || user?.role === "rop";
  const selectDefs = fieldDefs.filter(
    (d) => d.field_type === "select" && Array.isArray(d.options) && d.options.length > 0,
  );

  const [name, setName] = useState("");
  const [stageId, setStageId] = useState("");
  const [ownerId, setOwnerId] = useState("");
  const [budget, setBudget] = useState("");
  const [contactName, setContactName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [tagDraft, setTagDraft] = useState("");
  const [custom, setCustom] = useState<Record<string, string>>({});
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  // A clean card every time it opens.
  useEffect(() => {
    if (!open) return;
    setName("");
    setStageId(openStages[0]?.id ?? "");
    setOwnerId(user?.id ?? "");
    setBudget("");
    setContactName("");
    setPhone("");
    setEmail("");
    setTags([]);
    setTagDraft("");
    setCustom({});
    setNote("");
  }, [open, openStages, user?.id]);

  function addTag() {
    const v = tagDraft.trim();
    setTagDraft("");
    if (v && !tags.includes(v)) setTags([...tags, v]);
  }

  async function save() {
    if (!user?.organizationId) return;
    setBusy(true);
    try {
      let contactId: string | null = null;
      if (contactName.trim() || phone.trim() || email.trim()) {
        const contact = await createContact.mutateAsync({
          organization_id: user.organizationId,
          full_name: contactName.trim() || name.trim() || phone.trim(),
          phone: phone.trim() || null,
          email: email.trim() || null,
          owner_id: ownerId || user.id,
        });
        contactId = contact.id;
      }
      const amount = Number(budget.replace(/\s/g, "")) || 0;
      const lead = await createLead.mutateAsync({
        organization_id: user.organizationId,
        name: name.trim() || contactName.trim() || t("newLead.untitled"),
        funnel,
        stage_id: stageId || null,
        owner_id: ownerId || user.id,
        contact_id: contactId,
        budget: amount,
        expected_revenue: amount,
        tags:
          tagDraft.trim() && !tags.includes(tagDraft.trim()) ? [...tags, tagDraft.trim()] : tags,
        custom_fields: custom,
        source: "manual",
      });
      if (note.trim()) {
        await createActivity.mutateAsync({
          lead_id: lead.id,
          type: "note",
          content: note.trim(),
          created_by: user.id,
        });
      }
      void qc.invalidateQueries({ queryKey: ["pipeline_board_leads"] });
      toast.success(t("newLead.created"));
      onOpenChange(false);
      void navigate({
        to: "/crm/leads/$leadId",
        params: { leadId: lead.id },
        search: { from: "funnels" },
      });
    } catch (err) {
      toast.error(describeError(err, t("newLead.failed")));
    } finally {
      setBusy(false);
    }
  }

  const stage = openStages.find((s) => s.id === stageId);
  const tint = stage ? stageColorProps(stage.color) : null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92dvh] max-w-2xl overflow-hidden p-0">
        {/* Head, like the lead card's: name, funnel and stage. */}
        <div className="border-b border-border bg-muted/40 px-6 pb-4 pt-5">
          <DialogTitle className="sr-only">{t("newLead.title")}</DialogTitle>
          <p className="text-[11.5px] font-semibold uppercase tracking-wider text-subtle">
            {t("newLead.title")} · {funnel}
          </p>
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={t("newLead.namePlaceholder")}
            className="mt-1.5 w-full bg-transparent text-[22px] font-semibold text-foreground outline-none placeholder:text-subtle"
          />
          <div className="mt-3 flex flex-wrap gap-1.5">
            {openStages.map((s) => {
              const on = s.id === stageId;
              const c = stageColorProps(s.color);
              return (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => setStageId(s.id)}
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[12px] font-medium transition-colors",
                    on
                      ? "border-primary bg-primary/10 text-foreground"
                      : "border-border text-muted-foreground hover:text-foreground",
                  )}
                >
                  <span className={cn("h-2 w-2 rounded-full", c.className)} style={c.style} />
                  {s.name}
                </button>
              );
            })}
          </div>
          {tint && (
            <span
              className={cn("mt-3 block h-[3px] w-full rounded-full", tint.className)}
              style={tint.style}
            />
          )}
        </div>

        <div className="max-h-[56dvh] space-y-5 overflow-y-auto px-6 py-5">
          <div className="space-y-2.5">
            <Row label={t("newLead.owner")}>
              <select
                value={ownerId}
                disabled={!canPickOwner}
                onChange={(e) => setOwnerId(e.target.value)}
                className={cn(FIELD, "[color-scheme:light] dark:[color-scheme:dark]")}
              >
                {profiles.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.full_name || p.email}
                  </option>
                ))}
              </select>
            </Row>
            <Row label={t("newLead.budget")}>
              <input
                inputMode="numeric"
                value={budget}
                onChange={(e) => setBudget(e.target.value.replace(/[^\d\s]/g, ""))}
                placeholder="0"
                className={cn(FIELD, "tabular-nums")}
              />
            </Row>
            <Row label={t("newLead.tags")}>
              <div className="flex min-h-9 flex-wrap items-center gap-1.5 rounded-lg border border-border bg-background px-2 py-1 focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/15">
                {tags.map((tag) => (
                  <span
                    key={tag}
                    className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[12px]"
                  >
                    {tag}
                    <button
                      type="button"
                      onClick={() => setTags(tags.filter((x) => x !== tag))}
                      className="text-subtle hover:text-foreground"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </span>
                ))}
                <input
                  value={tagDraft}
                  onChange={(e) => setTagDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === ",") {
                      e.preventDefault();
                      addTag();
                    }
                  }}
                  onBlur={addTag}
                  placeholder={tags.length ? "" : t("newLead.tagPlaceholder")}
                  className="h-7 min-w-[80px] flex-1 bg-transparent text-[13px] outline-none placeholder:text-subtle"
                />
              </div>
            </Row>
            {selectDefs.map((d) => (
              <Row key={d.id} label={d.label}>
                <select
                  value={custom[d.key] ?? ""}
                  onChange={(e) => {
                    const next = { ...custom };
                    if (e.target.value) next[d.key] = e.target.value;
                    else delete next[d.key];
                    setCustom(next);
                  }}
                  className={cn(FIELD, "[color-scheme:light] dark:[color-scheme:dark]")}
                >
                  <option value="">{t("amo.choose")}</option>
                  {(d.options as string[]).map((o) => (
                    <option key={o} value={o}>
                      {o}
                    </option>
                  ))}
                </select>
              </Row>
            ))}
          </div>

          {/* The contact */}
          <div className="rounded-2xl border border-border p-4">
            <p className="mb-3 flex items-center gap-2 text-[12px] font-bold uppercase tracking-wider text-subtle">
              <User className="h-3.5 w-3.5" /> {t("newLead.contact")}
            </p>
            <div className="space-y-2.5">
              <Row label={t("newLead.contactName")}>
                <input
                  value={contactName}
                  onChange={(e) => setContactName(e.target.value)}
                  className={FIELD}
                />
              </Row>
              <Row label={t("newLead.phone")}>
                <input
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="+998"
                  className={cn(FIELD, "tabular-nums")}
                />
              </Row>
              <Row label="Email">
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className={FIELD}
                />
              </Row>
            </div>
          </div>

          {/* First note, like amoCRM's composer under a new deal. */}
          <div>
            <p className="mb-2 flex items-center gap-2 text-[12px] font-bold uppercase tracking-wider text-subtle">
              <StickyNote className="h-3.5 w-3.5" /> {t("newLead.note")}
            </p>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={3}
              placeholder={t("newLead.notePlaceholder")}
              className="w-full resize-y rounded-xl border border-border bg-background px-3 py-2 text-[13.5px] text-foreground outline-none placeholder:text-subtle focus:border-primary focus:ring-2 focus:ring-primary/15"
            />
          </div>
        </div>

        <div className="flex items-center gap-2 border-t border-border bg-muted/30 px-6 py-3">
          <button
            type="button"
            disabled={busy}
            onClick={() => void save()}
            className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-primary px-5 text-[13px] font-semibold text-primary-foreground shadow-sm transition-[filter] hover:brightness-110 disabled:opacity-60"
          >
            {busy ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Plus className="h-3.5 w-3.5" />
            )}
            {t("newLead.add")}
          </button>
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="h-9 rounded-lg px-3 text-[13px] font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            {t("amo.cancel")}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
