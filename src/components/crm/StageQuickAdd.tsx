import { useRef, useState, type FormEvent } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { Loader2, Plus, X } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { fetchFunnelDuplicate, usePhoneRules } from "@/hooks/use-crm-data";
import { useAuth } from "@/lib/auth";
import { parseGuardError } from "@/lib/crm-guards";
import { useI18n } from "@/lib/i18n";
import { checkPhone } from "@/lib/leads/intake-clean";
import { describeError } from "@/lib/utils";

// amoCRM's "Быстрое добавление": a lead added right inside a stage column
// with just a name and a phone (and optionally the budget). Same rules as
// the big form: one phone format, one client = one lead per funnel.
export function StageQuickAdd({ stageId, funnel }: { stageId: string; funnel: string }) {
  const { t } = useI18n();
  const phoneRules = usePhoneRules();
  const { user } = useAuth();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [budget, setBudget] = useState("");
  const [busy, setBusy] = useState(false);
  const nameRef = useRef<HTMLInputElement>(null);

  function reset() {
    setName("");
    setPhone("");
    setBudget("");
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!name.trim() || busy || !user?.organizationId) return;
    let cleanPhone: string | null = null;
    if (phone.trim()) {
      const checked = checkPhone(phone, phoneRules);
      if (!checked.ok) {
        toast.error(
          checked.reason === "fake"
            ? t("qc.phoneFake")
            : checked.reason === "country"
              ? t("qc.phoneCountry")
              : t("qc.phoneInvalid"),
        );
        return;
      }
      cleanPhone = checked.phone;
    }
    setBusy(true);
    let contactId: string | null = null;
    try {
      const existing = cleanPhone ? await fetchFunnelDuplicate(funnel, cleanPhone) : null;
      if (existing) {
        toast.error(t("guard.dupTitle", { funnel }), {
          description: `${existing.name} · ${existing.owner_name || t("guard.noOwner")}`,
          action: {
            label: t("guard.openLead"),
            onClick: () =>
              void navigate({
                to: "/crm/leads/$leadId",
                params: { leadId: existing.id },
                search: { from: "funnels" },
              }),
          },
        });
        return;
      }
      if (cleanPhone) {
        const { data: contact, error } = await supabase
          .from("contacts")
          .insert({
            full_name: name.trim(),
            phone: cleanPhone,
            owner_id: user.id,
            organization_id: user.organizationId,
          })
          .select("id")
          .single();
        if (error) throw error;
        contactId = contact.id;
      }
      const amount = Number(budget.replace(/\s/g, ""));
      const { error } = await supabase.from("leads").insert({
        name: name.trim(),
        contact_id: contactId,
        owner_id: user.id,
        organization_id: user.organizationId,
        stage_id: stageId,
        funnel,
        source: "manual",
        ...(amount > 0 ? { budget: amount, expected_revenue: amount } : {}),
      });
      if (error) {
        if (contactId && parseGuardError(error)?.kind === "duplicate") {
          await supabase.from("contacts").delete().eq("id", contactId);
        }
        throw error;
      }
      void qc.invalidateQueries({ queryKey: ["leads"] });
      void qc.invalidateQueries({ queryKey: ["pipeline_board_leads"] });
      toast.success(t("qc.leadCreated"));
      reset();
      // Ready for the next one, like amoCRM.
      nameRef.current?.focus();
    } catch (err) {
      toast.error(
        parseGuardError(err)?.kind === "duplicate"
          ? t("guard.dupTitle", { funnel })
          : describeError(err, t("qc.leadCreateFailed")),
      );
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mb-1.5 flex h-8 w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-border text-[12.5px] font-semibold text-muted-foreground opacity-0 transition-[opacity,colors] hover:border-primary/50 hover:bg-primary/[0.05] hover:text-primary focus-visible:opacity-100 group-hover/col:opacity-100 group-hover/stage:opacity-100 phone:opacity-100"
      >
        <Plus className="h-3.5 w-3.5" /> {t("qa.button")}
      </button>
    );
  }

  return (
    <form
      onSubmit={(e) => void onSubmit(e)}
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          setOpen(false);
          reset();
        }
      }}
      className="mb-1.5 space-y-1.5 rounded-lg border border-primary/40 bg-card p-2 shadow-[0_4px_14px_-6px_rgba(16,24,40,0.25)]"
    >
      <input
        ref={nameRef}
        autoFocus
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder={t("qa.name")}
        maxLength={200}
        className="h-8 w-full rounded-md border border-border bg-background px-2 text-[13px] outline-none focus:border-primary/60"
      />
      <input
        value={phone}
        onChange={(e) => setPhone(e.target.value)}
        placeholder={t("qa.phone")}
        inputMode="tel"
        className="h-8 w-full rounded-md border border-border bg-background px-2 text-[13px] outline-none focus:border-primary/60"
      />
      <input
        value={budget}
        onChange={(e) => setBudget(e.target.value.replace(/[^\d\s]/g, ""))}
        placeholder={t("qa.budget")}
        inputMode="numeric"
        className="h-8 w-full rounded-md border border-border bg-background px-2 text-[13px] tabular-nums outline-none focus:border-primary/60"
      />
      <div className="flex items-center gap-1.5">
        <button
          type="submit"
          disabled={!name.trim() || busy}
          className="inline-flex h-8 flex-1 items-center justify-center gap-1.5 rounded-md bg-primary text-[12.5px] font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-40"
        >
          {busy && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
          {t("qa.add")}
        </button>
        <button
          type="button"
          onClick={() => {
            setOpen(false);
            reset();
          }}
          aria-label={t("common.cancel")}
          className="grid h-8 w-8 place-items-center rounded-md border border-border text-muted-foreground hover:bg-accent"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    </form>
  );
}
