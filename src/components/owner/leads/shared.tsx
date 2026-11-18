// Owner -> Arizalar (company leads): data hooks and the small pieces shared
// by the board (platform.applications.tsx) and the lead page
// (platform.applications_.$appId.tsx).
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { apiFetch } from "@/lib/api";
import { stageOf, TEAM_SIZES, type ApplicationStatus } from "@/lib/applications";
import {
  BUSINESS_KINDS,
  CURRENT_TOOLS,
  LOST_REASONS,
  STAGE_TONE,
  type Health,
} from "@/lib/company-leads";
import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";

export type LeadOrg = {
  id: string;
  name: string;
  plan: string | null;
  isTrial: boolean;
  active: boolean;
  trialEndsAt: string | null;
  frozen: boolean;
};

export type LeadItem = {
  id: string;
  name: string;
  phone: string;
  email: string | null;
  company: string | null;
  team_size: string | null;
  message: string;
  source: string;
  status: string;
  amount: number | null;
  created_at: string;
  updated_at: string;
  organization_id: string | null;
  plan?: string | null;
  business?: string | null;
  sales_reps?: string | null;
  current_tool?: string | null;
  meeting_at?: string | null;
  meeting_note?: string | null;
  lost_reason?: string | null;
  assigned_to?: string | null;
  stage_changed_at?: string;
  last_activity_at?: string;
  utm?: Record<string, string>;
  notes: number;
  paid: number;
  issues: number;
  tasks: number;
  overdue: number;
  org: LeadOrg | null;
};

export type LeadsData = {
  ready: boolean;
  stagesReady?: boolean;
  owners: { id: string; full_name: string | null }[];
  items: LeadItem[];
};

export const LEADS_KEY = ["owner-applications"] as const;

export function useCompanyLeads() {
  return useQuery({
    queryKey: LEADS_KEY,
    refetchInterval: 60_000,
    queryFn: async (): Promise<LeadsData> => {
      const res = await apiFetch("/platform/applications-api");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const j = (await res.json()) as Partial<LeadsData>;
      return {
        ready: !!j.ready,
        stagesReady: j.stagesReady ?? true,
        owners: j.owners ?? [],
        items: (j.items ?? []).map((a) => ({ ...a, status: stageOf(a.status) })),
      };
    },
  });
}

/** PATCH / POST to the leads API; refreshes the board and the open lead. */
export function useLeadAction() {
  const qc = useQueryClient();
  const { t } = useI18n();
  return useMutation({
    mutationFn: async ({
      method = "POST",
      body,
    }: {
      method?: "POST" | "PATCH" | "DELETE";
      body?: Record<string, unknown>;
      query?: string;
    }) => {
      const res = await apiFetch("/platform/applications-api", {
        method,
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body ?? {}),
      });
      const j = (await res.json().catch(() => ({}))) as { error?: string; id?: string };
      if (!res.ok) throw new Error(j.error ?? `HTTP ${res.status}`);
      return j;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: LEADS_KEY });
      void qc.invalidateQueries({ queryKey: ["owner-application"] });
    },
    onError: (e: Error) => toast.error(errText(t, e.message)),
  });
}

/** A known error code's words (apps.err.*), else the server's own text. */
export function errText(t: (k: string) => string, msg: string): string {
  const key = `apps.err.${msg}`;
  const v = t(key);
  return v === key ? msg : v;
}

export function money(n: number | null | undefined): string {
  if (n == null) return "—";
  return `${Math.round(n).toLocaleString("ru-RU").replace(/,/g, " ")} so'm`;
}

/** "3 daq", "5 soat", "2 kun" ago -- compact, for cards. */
export function ago(
  iso: string | null | undefined,
  t: (k: string, v?: Record<string, string | number>) => string,
): string {
  if (!iso) return "—";
  const m = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60_000));
  if (m < 60) return t("lead.agoMin", { n: Math.max(1, m) });
  const h = Math.round(m / 60);
  if (h < 24) return t("lead.agoHour", { n: h });
  return t("lead.agoDay", { n: Math.round(h / 24) });
}

const AVATAR = [
  "from-sky-500 to-indigo-500",
  "from-violet-500 to-fuchsia-500",
  "from-emerald-500 to-teal-500",
  "from-amber-500 to-orange-500",
  "from-rose-500 to-pink-500",
  "from-cyan-500 to-blue-500",
];

/** A company's initials on a gradient picked by its name. */
export function CompanyMark({ name, size = "md" }: { name: string; size?: "sm" | "md" | "lg" }) {
  const letters =
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((w) => w[0]!.toUpperCase())
      .join("") || "?";
  let h = 0;
  for (const c of name) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return (
    <span
      className={cn(
        "grid shrink-0 place-items-center bg-gradient-to-br font-bold text-white shadow-sm",
        AVATAR[h % AVATAR.length],
        size === "sm" && "h-8 w-8 rounded-lg text-[11.5px]",
        size === "md" && "h-10 w-10 rounded-xl text-[13px]",
        size === "lg" && "h-14 w-14 rounded-2xl text-[18px]",
      )}
    >
      {letters}
    </span>
  );
}

export function StageChip({ stage, className }: { stage: string; className?: string }) {
  const { t } = useI18n();
  const s = stageOf(stage);
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11.5px] font-semibold",
        STAGE_TONE[s].chip,
        className,
      )}
    >
      <span className={cn("h-1.5 w-1.5 rounded-full", STAGE_TONE[s].dot)} />
      {t(`lead.st.${s}`)}
    </span>
  );
}

export const HEALTH_DOT: Record<Health, string> = {
  good: "bg-emerald-500",
  watch: "bg-amber-500",
  risk: "bg-rose-500",
};

/** Trial / paid / expired / frozen, from the lead's company. */
export function orgPhaseOf(org: LeadOrg | null): "none" | "trial" | "paid" | "expired" | "frozen" {
  if (!org) return "none";
  if (org.frozen) return "frozen";
  if (!org.active || (org.trialEndsAt && new Date(org.trialEndsAt).getTime() < Date.now()))
    return "expired";
  return org.isTrial ? "trial" : "paid";
}

export const PHASE_CHIP: Record<string, string> = {
  trial: "bg-sky-500/12 text-sky-700 dark:text-sky-300",
  paid: "bg-emerald-500/12 text-emerald-700 dark:text-emerald-300",
  expired: "bg-rose-500/12 text-rose-700 dark:text-rose-300",
  frozen: "bg-slate-500/15 text-slate-700 dark:text-slate-300",
};

const field =
  "h-10 w-full rounded-xl border border-border bg-card px-3 text-[13.5px] outline-none placeholder:text-subtle focus:border-primary";

/** «Yo'qotildi»: why, picked or written -- required. */
export function LostDialog({
  open,
  onClose,
  onConfirm,
  busy,
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: (reason: string) => void;
  busy?: boolean;
}) {
  const { t } = useI18n();
  const [pick, setPick] = useState<string>("");
  const [text, setText] = useState("");
  const reason = [pick ? t(`lead.lost.${pick}`) : "", text.trim()].filter(Boolean).join(": ");
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{t("lead.lostTitle")}</DialogTitle>
        </DialogHeader>
        <div className="flex flex-wrap gap-2">
          {LOST_REASONS.map((r) => (
            <button
              key={r}
              type="button"
              onClick={() => setPick(pick === r ? "" : r)}
              className={cn(
                "h-9 rounded-lg border px-3 text-[13px] font-medium",
                pick === r
                  ? "border-rose-500/50 bg-rose-500/10 text-rose-700 dark:text-rose-300"
                  : "border-border text-foreground hover:bg-muted",
              )}
            >
              {t(`lead.lost.${r}`)}
            </button>
          ))}
        </div>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={t("lead.lostPh")}
          className={cn(field, "h-20 resize-none py-2")}
        />
        <DialogFooter>
          <button
            type="button"
            disabled={!reason || busy}
            onClick={() => onConfirm(reason)}
            className="inline-flex h-10 items-center gap-2 rounded-xl bg-rose-600 px-4 text-[13.5px] font-semibold text-white disabled:opacity-40"
          >
            {busy && <Loader2 className="h-4 w-4 animate-spin" />}
            {t("lead.lostConfirm")}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** «Lid qo'shish»: a company found by phone, Telegram or a meeting. */
export function AddLeadDialog({
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: (id: string) => void;
}) {
  const { t } = useI18n();
  const qc = useQueryClient();
  const empty = {
    name: "",
    phone: "",
    company: "",
    email: "",
    teamSize: "",
    business: "",
    currentTool: "",
    message: "",
  };
  const [f, setF] = useState(empty);
  const create = useMutation({
    mutationFn: async () => {
      const res = await apiFetch("/platform/applications-api", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(f),
      });
      const j = (await res.json().catch(() => ({}))) as { id?: string; error?: string };
      if (!res.ok || !j.id) throw new Error(j.error ?? `HTTP ${res.status}`);
      return j.id;
    },
    onSuccess: (id) => {
      void qc.invalidateQueries({ queryKey: LEADS_KEY });
      setF(empty);
      onClose();
      onCreated(id);
    },
    onError: (e: Error) => toast.error(errText(t, e.message)),
  });
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{t("lead.add")}</DialogTitle>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-2.5">
          <input
            className={field}
            placeholder={t("apps.f.company")}
            value={f.company}
            onChange={(e) => setF({ ...f, company: e.target.value })}
          />
          <input
            className={field}
            placeholder={t("apps.f.name")}
            value={f.name}
            onChange={(e) => setF({ ...f, name: e.target.value })}
          />
          <input
            className={field}
            placeholder={t("apps.f.phone")}
            value={f.phone}
            onChange={(e) => setF({ ...f, phone: e.target.value })}
          />
          <input
            className={field}
            placeholder="Email"
            value={f.email}
            onChange={(e) => setF({ ...f, email: e.target.value })}
          />
          <select
            className={field}
            value={f.business}
            onChange={(e) => setF({ ...f, business: e.target.value })}
          >
            <option value="">{t("wiz.q1")}</option>
            {BUSINESS_KINDS.map((k) => (
              <option key={k} value={t(`wiz.biz.${k}`)}>
                {t(`wiz.biz.${k}`)}
              </option>
            ))}
          </select>
          <select
            className={field}
            value={f.teamSize}
            onChange={(e) => setF({ ...f, teamSize: e.target.value })}
          >
            <option value="">{t("wiz.q2")}</option>
            {TEAM_SIZES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
          <select
            className={cn(field, "col-span-2")}
            value={f.currentTool}
            onChange={(e) => setF({ ...f, currentTool: e.target.value })}
          >
            <option value="">{t("wiz.q3")}</option>
            {CURRENT_TOOLS.map((k) => (
              <option key={k} value={k}>
                {t(`wiz.tool.${k}`)}
              </option>
            ))}
          </select>
          <textarea
            className={cn(field, "col-span-2 h-20 resize-none py-2")}
            placeholder={t("apps.f.message")}
            value={f.message}
            onChange={(e) => setF({ ...f, message: e.target.value })}
          />
        </div>
        <DialogFooter>
          <button
            type="button"
            disabled={!f.name.trim() || !f.phone.trim() || create.isPending}
            onClick={() => create.mutate()}
            className="ctl-lit inline-flex h-10 items-center gap-1.5 rounded-xl px-4 text-[13.5px] font-semibold disabled:opacity-40"
          >
            {create.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
            {t("apps.save")}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function isStage(s: string): s is ApplicationStatus {
  return stageOf(s) === s;
}
