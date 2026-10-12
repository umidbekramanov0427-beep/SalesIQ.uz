import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import {
  Activity,
  KeyRound,
  Laptop,
  Loader2,
  LogOut,
  MapPin,
  MonitorSmartphone,
  Smartphone,
  UserRound,
  type LucideIcon,
  BadgeCheck,
} from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { useI18n, LANGS, LANG_LABELS } from "@/lib/i18n";
import { cn, describeError } from "@/lib/utils";
import {
  currentDeviceId,
  useMyActivity,
  useMyLoginEvents,
  useMyOrganization,
  type AuditLogRow,
  type LoginEventRow,
} from "@/hooks/use-crm-data";

// The profile window behind the account bar's pencil: edit yourself, see
// what you did in the platform, and from which devices and places you
// signed in -- with a way to sign out everywhere else.

type Tab = "profile" | "activity" | "devices";

const FIELD =
  "h-10 w-full rounded-xl border border-border bg-background px-3 text-[14px] text-foreground outline-none transition-colors placeholder:text-subtle hover:border-primary/40 focus:border-primary focus:ring-2 focus:ring-primary/15 disabled:opacity-70";

const ROLE_KEY: Record<string, string> = {
  super_admin: "admin.roleAdmin",
  platform_owner: "admin.roleAdmin",
  rop: "admin.roleRop",
  sotuv_menejeri: "admin.roleRep",
};

function when(iso: string, lang: string): string {
  return new Date(iso).toLocaleString(lang === "en" ? "en-GB" : lang === "ru" ? "ru-RU" : "uz-UZ", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[12px] font-semibold text-muted-foreground">{label}</span>
      {children}
    </label>
  );
}

function ProfileTab() {
  const { t, lang, setLang } = useI18n();
  const { user, refreshProfile } = useAuth();
  const { data: org } = useMyOrganization();
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [position, setPosition] = useState("");
  const [password, setPassword] = useState("");
  const [password2, setPassword2] = useState("");
  const [saving, setSaving] = useState(false);
  const [savingPw, setSavingPw] = useState(false);

  useEffect(() => {
    if (!user?.id) return;
    void supabase
      .from("profiles")
      .select("full_name, phone, email, position")
      .eq("id", user.id)
      .maybeSingle()
      .then(({ data }) => {
        setName(data?.full_name ?? user.name ?? "");
        setPhone(data?.phone ?? "");
        setEmail(data?.email ?? user.email ?? "");
        setPosition(data?.position ?? "");
      });
  }, [user?.id, user?.name, user?.email]);

  async function save() {
    if (!user?.id || !name.trim()) return;
    setSaving(true);
    try {
      const { error } = await supabase
        .from("profiles")
        .update({ full_name: name.trim(), phone: phone.trim() || null })
        .eq("id", user.id);
      if (error) throw error;
      await refreshProfile();
      toast.success(t("profileWin.saved"));
    } catch (err) {
      toast.error(describeError(err, t("profileWin.saveFailed")));
    } finally {
      setSaving(false);
    }
  }

  async function changePassword() {
    if (password.length < 8) {
      toast.error(t("profileWin.pwShort"));
      return;
    }
    if (password !== password2) {
      toast.error(t("profileWin.pwMismatch"));
      return;
    }
    setSavingPw(true);
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
      setPassword("");
      setPassword2("");
      toast.success(t("profileWin.pwChanged"));
    } catch (err) {
      toast.error(describeError(err, t("profileWin.saveFailed")));
    } finally {
      setSavingPw(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4 rounded-2xl border border-border bg-muted/30 p-4">
        <span className="grid h-16 w-16 shrink-0 place-items-center rounded-2xl bg-primary/15 text-xl font-bold text-primary">
          {user?.initials ?? "?"}
        </span>
        <div className="min-w-0">
          <p className="truncate text-lg font-bold text-foreground">{user?.name}</p>
          <p className="truncate text-[13px] text-muted-foreground">
            {[user?.role ? t(ROLE_KEY[user.role] ?? "") : "", position, org?.name]
              .filter(Boolean)
              .join(" · ")}
          </p>
          <p className="mt-0.5 truncate font-mono text-[11.5px] text-subtle">ID {user?.id}</p>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={t("profileWin.name")}>
          <input value={name} onChange={(e) => setName(e.target.value)} className={FIELD} />
        </Field>
        <Field label={t("profileWin.phone")}>
          <input
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="+998"
            className={FIELD}
          />
          {user?.phoneVerified && phone.trim() === (user.phone ?? "") && (
            <span className="mt-1 inline-flex items-center gap-1 text-xs font-medium text-success">
              <BadgeCheck className="h-3.5 w-3.5" /> {t("profile.phoneVerified")}
            </span>
          )}
        </Field>
        <Field label="Email">
          <input value={email} disabled className={FIELD} />
        </Field>
        <Field label={t("profileWin.language")}>
          <select
            value={lang}
            onChange={(e) => setLang(e.target.value as (typeof LANGS)[number])}
            className={cn(FIELD, "[color-scheme:light] dark:[color-scheme:dark]")}
          >
            {LANGS.map((l) => (
              <option key={l} value={l}>
                {LANG_LABELS[l]}
              </option>
            ))}
          </select>
        </Field>
      </div>
      <button
        type="button"
        disabled={saving || !name.trim()}
        onClick={() => void save()}
        className="inline-flex h-10 items-center gap-2 rounded-xl bg-primary px-5 text-[13.5px] font-semibold text-primary-foreground shadow-sm transition-[filter] hover:brightness-110 disabled:opacity-60"
      >
        {saving && <Loader2 className="h-4 w-4 animate-spin" />}
        {t("profileWin.save")}
      </button>

      <div className="rounded-2xl border border-border p-4">
        <p className="mb-3 flex items-center gap-2 text-[13px] font-bold text-foreground">
          <KeyRound className="h-4 w-4 text-primary" /> {t("profileWin.password")}
        </p>
        <div className="grid gap-3 sm:grid-cols-[1fr_1fr_auto]">
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder={t("profileWin.newPassword")}
            autoComplete="new-password"
            className={FIELD}
          />
          <input
            type="password"
            value={password2}
            onChange={(e) => setPassword2(e.target.value)}
            placeholder={t("profileWin.repeatPassword")}
            autoComplete="new-password"
            className={FIELD}
          />
          <button
            type="button"
            disabled={savingPw || !password}
            onClick={() => void changePassword()}
            className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-border px-4 text-[13px] font-semibold text-foreground transition-colors hover:bg-accent disabled:opacity-60"
          >
            {savingPw && <Loader2 className="h-4 w-4 animate-spin" />}
            {t("profileWin.changePassword")}
          </button>
        </div>
      </div>
    </div>
  );
}

const ENTITY_KEY: Record<string, string> = {
  leads: "profileWin.entity.lead",
  tasks: "profileWin.entity.task",
  contacts: "profileWin.entity.contact",
  companies: "profileWin.entity.company",
  profiles: "profileWin.entity.user",
  pipeline_stages: "profileWin.entity.stage",
  lead_activities: "profileWin.entity.note",
};

const SKIP_FIELDS = new Set(["updated_at", "created_at", "stage_changed_at", "score"]);

function activityLine(row: AuditLogRow, t: (k: string) => string) {
  const meta = (row.meta ?? {}) as { old?: Record<string, unknown>; new?: Record<string, unknown> };
  const rec = meta.new ?? meta.old ?? {};
  const title = String(rec["name"] ?? rec["title"] ?? rec["full_name"] ?? rec["content"] ?? "");
  const changed =
    row.action === "update" && meta.old && meta.new
      ? Object.keys(meta.new).filter(
          (k) =>
            !SKIP_FIELDS.has(k) && JSON.stringify(meta.new?.[k]) !== JSON.stringify(meta.old?.[k]),
        )
      : [];
  return {
    verb: t(`profileWin.action.${row.action}`),
    entity: ENTITY_KEY[row.entity_type] ? t(ENTITY_KEY[row.entity_type]!) : row.entity_type,
    title: title.length > 80 ? `${title.slice(0, 80)}…` : title,
    changed,
  };
}

function ActivityTab({ onOpenLead }: { onOpenLead: (id: string) => void }) {
  const { t, lang } = useI18n();
  const { data: rows = [], isLoading } = useMyActivity();
  if (isLoading)
    return <p className="py-10 text-center text-[13px] text-subtle">{t("common.loading")}</p>;
  if (!rows.length)
    return (
      <p className="rounded-2xl border border-dashed border-border px-4 py-10 text-center text-[13px] text-subtle">
        {t("profileWin.noActivity")}
      </p>
    );
  return (
    <ol className="relative space-y-1 border-l border-border pl-5">
      {rows.map((r) => {
        const a = activityLine(r, t);
        const lead = r.entity_type === "leads" && r.action !== "delete" && r.entity_id;
        return (
          <li key={r.id} className="relative">
            <span
              className={cn(
                "absolute -left-[26px] top-3 h-2.5 w-2.5 rounded-full ring-4 ring-background",
                r.action === "insert"
                  ? "bg-success"
                  : r.action === "delete"
                    ? "bg-destructive"
                    : "bg-primary",
              )}
            />
            <button
              type="button"
              disabled={!lead}
              onClick={() => lead && onOpenLead(r.entity_id!)}
              className={cn(
                "w-full rounded-xl px-3 py-2 text-left transition-colors",
                lead && "hover:bg-accent",
              )}
            >
              <p className="text-[13.5px] text-foreground">
                <span className="font-semibold">{a.verb}</span>{" "}
                <span className="text-muted-foreground">{a.entity}</span>
                {a.title && <> «{a.title}»</>}
              </p>
              <p className="mt-0.5 text-[12px] text-subtle">
                {when(r.created_at, lang)}
                {a.changed.length > 0 && (
                  <>
                    {" "}
                    · {t("profileWin.fields")}: {a.changed.slice(0, 5).join(", ")}
                  </>
                )}
              </p>
            </button>
          </li>
        );
      })}
    </ol>
  );
}

function deviceIcon(label: string | null): LucideIcon {
  return /iOS|Android/.test(label ?? "") ? Smartphone : Laptop;
}

function DevicesTab() {
  const { t, lang } = useI18n();
  const { data: events = [], isLoading } = useMyLoginEvents();
  const [signingOut, setSigningOut] = useState(false);
  const here = useMemo(() => (typeof window === "undefined" ? "" : currentDeviceId()), []);

  // One row per device: its latest sign-in.
  const devices = useMemo(() => {
    const m = new Map<string, LoginEventRow & { count: number }>();
    for (const e of events) {
      const d = m.get(e.device_id);
      if (d) d.count += 1;
      else m.set(e.device_id, { ...e, count: 1 });
    }
    return [...m.values()];
  }, [events]);

  async function signOutOthers() {
    setSigningOut(true);
    try {
      const { error } = await supabase.auth.signOut({ scope: "others" });
      if (error) throw error;
      toast.success(t("profileWin.othersSignedOut"));
    } catch (err) {
      toast.error(describeError(err, t("profileWin.saveFailed")));
    } finally {
      setSigningOut(false);
    }
  }

  const place = (e: LoginEventRow) => [e.city, e.country].filter(Boolean).join(", ") || "—";

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-xl text-[13px] text-muted-foreground">{t("profileWin.devicesHint")}</p>
        <button
          type="button"
          disabled={signingOut}
          onClick={() => void signOutOthers()}
          className="inline-flex h-10 items-center gap-2 rounded-xl border border-destructive/40 px-4 text-[13px] font-semibold text-destructive transition-colors hover:bg-destructive/10 disabled:opacity-60"
        >
          {signingOut ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <LogOut className="h-4 w-4" />
          )}
          {t("profileWin.signOutOthers")}
        </button>
      </div>

      {isLoading ? (
        <p className="py-6 text-center text-[13px] text-subtle">{t("common.loading")}</p>
      ) : devices.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-border px-4 py-8 text-center text-[13px] text-subtle">
          {t("profileWin.noDevices")}
        </p>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {devices.map((d) => {
            const Icon = deviceIcon(d.device_label);
            const current = d.device_id === here;
            return (
              <div
                key={d.device_id}
                className={cn(
                  "flex items-start gap-3 rounded-2xl border p-4",
                  current ? "border-success/50 bg-success/[0.05]" : "border-border",
                )}
              >
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-muted text-muted-foreground">
                  <Icon className="h-5 w-5" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="flex items-center gap-2 text-[14px] font-semibold text-foreground">
                    <span className="truncate">
                      {d.device_label || t("profileWin.unknownDevice")}
                    </span>
                    {current && (
                      <span className="rounded-full bg-success/15 px-2 py-0.5 text-[11px] font-semibold text-success">
                        {t("profileWin.thisDevice")}
                      </span>
                    )}
                  </p>
                  <p className="mt-1 flex items-center gap-1.5 text-[12.5px] text-muted-foreground">
                    <MapPin className="h-3.5 w-3.5" /> {place(d)} · {d.ip ?? "—"}
                  </p>
                  <p className="mt-0.5 text-[12px] text-subtle">
                    {t("profileWin.lastSignIn")}: {when(d.created_at, lang)} ·{" "}
                    {t("profileWin.signIns", { count: d.count })}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {events.length > 0 && (
        <div>
          <p className="mb-2 text-[12px] font-bold uppercase tracking-wider text-subtle">
            {t("profileWin.history")}
          </p>
          <div className="overflow-x-auto rounded-2xl border border-border">
            <table className="w-full min-w-[560px] text-[13px]">
              <thead>
                <tr className="border-b border-border bg-muted/40 text-left text-[11.5px] font-semibold uppercase tracking-wide text-muted-foreground">
                  <th className="px-4 py-2.5">{t("profileWin.col.when")}</th>
                  <th className="px-3 py-2.5">{t("profileWin.col.device")}</th>
                  <th className="px-3 py-2.5">{t("profileWin.col.place")}</th>
                  <th className="px-4 py-2.5">IP</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {events.map((e) => (
                  <tr key={e.id}>
                    <td className="px-4 py-2.5 tabular-nums text-foreground">
                      {when(e.created_at, lang)}
                    </td>
                    <td className="px-3 py-2.5 text-foreground">
                      {e.device_label || "—"}
                      {e.device_id === here && (
                        <span className="ml-2 text-[11px] font-semibold text-success">
                          {t("profileWin.thisDevice")}
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-muted-foreground">{place(e)}</td>
                    <td className="px-4 py-2.5 font-mono text-[12px] text-muted-foreground">
                      {e.ip ?? "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

export function ProfileDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const { t } = useI18n();
  const navigate = useNavigate();
  const [tab, setTab] = useState<Tab>("profile");
  useEffect(() => {
    if (open) setTab("profile");
  }, [open]);

  const tabs: { key: Tab; icon: LucideIcon; label: string }[] = [
    { key: "profile", icon: UserRound, label: t("profileWin.tab.profile") },
    { key: "activity", icon: Activity, label: t("profileWin.tab.activity") },
    { key: "devices", icon: MonitorSmartphone, label: t("profileWin.tab.devices") },
  ];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex h-[88dvh] max-w-5xl flex-col gap-0 overflow-hidden p-0 sm:flex-row">
        <DialogTitle className="sr-only">{t("profileWin.title")}</DialogTitle>
        <nav className="flex shrink-0 gap-1 overflow-x-auto border-b border-border bg-muted/30 p-3 sm:w-56 sm:flex-col sm:border-b-0 sm:border-r">
          <p className="hidden px-2 pb-2 pt-1 text-[12px] font-bold uppercase tracking-wider text-subtle sm:block">
            {t("profileWin.title")}
          </p>
          {tabs.map((tb) => (
            <button
              key={tb.key}
              type="button"
              onClick={() => setTab(tb.key)}
              className={cn(
                "flex shrink-0 items-center gap-2.5 rounded-xl px-3 py-2.5 text-left text-[13.5px] font-medium transition-colors",
                tab === tb.key
                  ? "bg-card text-foreground shadow-sm"
                  : "text-muted-foreground hover:bg-accent hover:text-foreground",
              )}
            >
              <tb.icon className={cn("h-4 w-4", tab === tb.key && "text-primary")} />
              {tb.label}
            </button>
          ))}
        </nav>
        <div className="min-w-0 flex-1 overflow-y-auto p-6">
          <h2 className="mb-5 text-xl font-bold text-foreground">
            {tabs.find((x) => x.key === tab)?.label}
          </h2>
          {tab === "profile" && <ProfileTab />}
          {tab === "activity" && (
            <ActivityTab
              onOpenLead={(id) => {
                onOpenChange(false);
                void navigate({
                  to: "/crm/leads/$leadId",
                  params: { leadId: id },
                  search: { from: "funnels" },
                });
              }}
            />
          )}
          {tab === "devices" && <DevicesTab />}
        </div>
      </DialogContent>
    </Dialog>
  );
}
