import { useEffect, useState, type ReactNode } from "react";
import { createFileRoute } from "@tanstack/react-router";
import {
  CalendarClock,
  Coffee,
  Crosshair,
  FileText,
  Loader2,
  MapPin,
  Plus,
  Send,
  ShieldAlert,
  Timer,
  Trash2,
  UserCheck,
  Users,
} from "lucide-react";
import { toast } from "sonner";
import { PageHeader, SectionCard } from "@/components/layout/Primitives";
import { AdminBackLink } from "@/components/admin/AdminBackLink";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import {
  hoursText,
  parseAttendanceRules,
  type AttendanceRules,
  type Shift,
} from "@/lib/attendance-rules";
import { useAuth } from "@/lib/auth";
import { useI18n } from "@/lib/i18n";
import { cn, describeError } from "@/lib/utils";
import {
  useAttendanceRules,
  useProfilesRaw,
  useUpdateOrgGeneralSettings,
} from "@/hooks/use-crm-data";
import type { Json } from "@/integrations/supabase/types";

// Admin -> Davomat qoidalari (src/lib/attendance-rules.ts): where the office
// is and how close a Telegram check-in must be, allowed lateness, the
// automatic break, shifts and who works which, how people may check in and
// when the evening report reaches admins and heads of sales.

export const Route = createFileRoute("/admin/attendance")({
  head: () => ({ meta: [{ title: "Davomat qoidalari — SalesIQ" }] }),
  component: AttendanceRulesPage,
});

const RADII = [50, 100, 150, 300, 500];
const DAY_KEYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;

const inputCls =
  "h-10 rounded-xl border border-border bg-input px-3 text-[14px] text-foreground outline-none transition-colors focus:border-primary";

function AttendanceRulesPage() {
  const { t } = useI18n();
  const { user } = useAuth();
  const saved = useAttendanceRules();
  const savedKey = JSON.stringify(saved);
  const [draft, setDraft] = useState<AttendanceRules>(saved);
  useEffect(() => setDraft(JSON.parse(savedKey) as AttendanceRules), [savedKey]);
  const clean = parseAttendanceRules(draft);
  const dirty = JSON.stringify(clean) !== savedKey;
  const update = useUpdateOrgGeneralSettings();

  if (user && user.role !== "super_admin" && user.role !== "platform_owner") {
    return (
      <>
        <AdminBackLink />
        <SectionCard
          icon={ShieldAlert}
          tone="rose"
          title={t("admin.restrictedTitle")}
          description={t("admin.restrictedDesc")}
        >
          <p className="text-sm text-muted-foreground">{t("admin.restrictedHint")}</p>
        </SectionCard>
      </>
    );
  }

  async function save() {
    try {
      await update.mutateAsync({ attendance_rules: clean as unknown as Json });
      toast.success(t("attRules.saved"));
    } catch (err) {
      toast.error(
        err instanceof Error && /attendance_rules/.test(err.message)
          ? t("attRules.migrationPending")
          : describeError(err, t("attRules.saveFailed")),
      );
    }
  }

  const set = (patch: Partial<AttendanceRules>) => setDraft((d) => ({ ...d, ...patch }));

  return (
    <>
      <PageHeader
        title={t("attRules.title")}
        description={t("attRules.desc")}
        icon={UserCheck}
        tone="sky"
        actions={
          <>
            {dirty && (
              <Button variant="outline" onClick={() => setDraft(saved)}>
                {t("common.cancel")}
              </Button>
            )}
            <Button onClick={() => void save()} disabled={!dirty || update.isPending}>
              {t("common.save")}
            </Button>
          </>
        }
      />
      <div className="grid gap-5 xl:grid-cols-2">
        <OfficeCard rules={draft} onChange={(office) => set({ office })} />

        <SectionCard
          icon={Timer}
          tone="amber"
          title={t("attRules.timeTitle")}
          description={t("attRules.timeDesc")}
        >
          <div className="space-y-3">
            <NumberRow
              icon={Timer}
              tone="amber"
              title={t("attRules.grace")}
              hint={t("attRules.graceHint")}
              value={draft.graceMin}
              max={180}
              onChange={(graceMin) => set({ graceMin })}
            />
            <NumberRow
              icon={Coffee}
              tone="emerald"
              title={t("attRules.break")}
              hint={t("attRules.breakHint", { hours: hoursText(clean.breakAfterMin) })}
              value={draft.breakMin}
              max={240}
              onChange={(breakMin) => set({ breakMin })}
            />
            <NumberRow
              icon={CalendarClock}
              tone="sky"
              title={t("attRules.breakAfter")}
              hint={t("attRules.breakAfterHint")}
              value={draft.breakAfterMin}
              max={900}
              onChange={(breakAfterMin) => set({ breakAfterMin })}
            />
            <p className="rounded-lg bg-muted/60 px-3 py-2 text-[12.5px] text-muted-foreground">
              {t("attRules.example", {
                start: clean.shifts[0]?.start ?? "09:00",
                late: clean.shifts[0]
                  ? addMinutes(clean.shifts[0].start, clean.graceMin + 1)
                  : "09:11",
                worked: hoursText(
                  Math.max(0, 9 * 60 - (9 * 60 > clean.breakAfterMin ? clean.breakMin : 0)),
                ),
              })}
            </p>
          </div>
        </SectionCard>

        <ShiftsCard rules={draft} onChange={set} />

        <SectionCard
          icon={Send}
          tone="violet"
          title={t("attRules.methodsTitle")}
          description={t("attRules.methodsDesc")}
          className="xl:col-span-2"
        >
          <div className="grid gap-2.5 lg:grid-cols-3">
            <ToggleRow
              title={t("attRules.methodTelegram")}
              hint={t("attRules.methodTelegramHint")}
              checked={draft.methods.telegram}
              onChange={(v) => set({ methods: { ...draft.methods, telegram: v } })}
            />
            <ToggleRow
              title={t("attRules.methodWeb")}
              hint={t("attRules.methodWebHint")}
              checked={draft.methods.web}
              onChange={(v) => set({ methods: { ...draft.methods, web: v } })}
            />
            <div className="flex items-center gap-3 rounded-xl border border-border px-3.5 py-3">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-violet-500/15 text-violet-700 dark:text-violet-300">
                <FileText className="h-5 w-5" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-[14px] font-semibold text-foreground">{t("attRules.report")}</p>
                <p className="text-[12.5px] leading-snug text-muted-foreground">
                  {t("attRules.reportHint")}
                </p>
              </div>
              <HmInput
                value={draft.report.time}
                disabled={!draft.report.enabled}
                onChange={(time) => set({ report: { ...draft.report, time } })}
                className="h-10 w-[76px]"
              />
              <Switch
                checked={draft.report.enabled}
                onCheckedChange={(v) => set({ report: { ...draft.report, enabled: v } })}
              />
            </div>
          </div>
        </SectionCard>
      </div>
    </>
  );
}

function addMinutes(hm: string, add: number): string {
  const m = Number(hm.slice(0, 2)) * 60 + Number(hm.slice(3, 5)) + add;
  return `${String(Math.floor(m / 60) % 24).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
}

function OfficeCard({
  rules,
  onChange,
}: {
  rules: AttendanceRules;
  onChange: (office: AttendanceRules["office"]) => void;
}) {
  const { t } = useI18n();
  const [locating, setLocating] = useState(false);
  const office = rules.office;
  const radius = office?.radiusM ?? 150;

  function here() {
    if (!("geolocation" in navigator)) {
      toast.error(t("attRules.geoUnavailable"));
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocating(false);
        onChange({
          lat: Number(pos.coords.latitude.toFixed(6)),
          lng: Number(pos.coords.longitude.toFixed(6)),
          radiusM: radius,
        });
        toast.success(t("attRules.geoSet", { m: Math.round(pos.coords.accuracy) }));
      },
      () => {
        setLocating(false);
        toast.error(t("attRules.geoDenied"));
      },
      { enableHighAccuracy: true, timeout: 15000 },
    );
  }

  const coord = (key: "lat" | "lng", v: string) => {
    const n = Number(v.replace(",", "."));
    if (!v.trim()) return;
    if (!Number.isFinite(n)) return;
    onChange({ lat: office?.lat ?? 0, lng: office?.lng ?? 0, radiusM: radius, [key]: n });
  };

  return (
    <SectionCard
      icon={MapPin}
      tone="rose"
      title={t("attRules.officeTitle")}
      description={t("attRules.officeDesc")}
    >
      <div className="grid gap-4 sm:grid-cols-[1fr_168px]">
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <label className="space-y-1">
              <span className="console-caption">{t("attRules.lat")}</span>
              <input
                inputMode="decimal"
                defaultValue={office?.lat ?? ""}
                key={`lat-${office?.lat}`}
                onBlur={(e) => coord("lat", e.target.value)}
                placeholder="41.311081"
                className={cn(inputCls, "w-full font-mono tabular-nums")}
              />
            </label>
            <label className="space-y-1">
              <span className="console-caption">{t("attRules.lng")}</span>
              <input
                inputMode="decimal"
                defaultValue={office?.lng ?? ""}
                key={`lng-${office?.lng}`}
                onBlur={(e) => coord("lng", e.target.value)}
                placeholder="69.240562"
                className={cn(inputCls, "w-full font-mono tabular-nums")}
              />
            </label>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" onClick={here} disabled={locating}>
              {locating ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Crosshair className="h-4 w-4" />
              )}
              {t("attRules.useHere")}
            </Button>
            {office && (
              <>
                <a
                  href={`https://www.google.com/maps?q=${office.lat},${office.lng}`}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex h-9 items-center rounded-md px-3 text-[13px] font-semibold text-primary hover:underline"
                >
                  {t("attRules.openMap")}
                </a>
                <Button type="button" variant="ghost" onClick={() => onChange(null)}>
                  {t("attRules.clearOffice")}
                </Button>
              </>
            )}
          </div>
          <div>
            <p className="console-caption mb-2">{t("attRules.radius")}</p>
            <div className="flex flex-wrap gap-2">
              {RADII.map((r) => (
                <button
                  key={r}
                  type="button"
                  disabled={!office}
                  onClick={() => office && onChange({ ...office, radiusM: r })}
                  className={cn(
                    "h-8 rounded-lg border px-3 font-mono text-[12.5px] font-semibold tabular-nums transition-colors disabled:opacity-40",
                    radius === r
                      ? "border-primary/50 bg-primary/10 text-primary"
                      : "border-border text-muted-foreground hover:text-foreground",
                  )}
                >
                  {r} m
                </button>
              ))}
            </div>
          </div>
          {!office && (
            <p className="rounded-lg bg-amber-500/10 px-3 py-2 text-[12.5px] text-amber-800 dark:text-amber-200">
              {t("attRules.noOffice")}
            </p>
          )}
        </div>
        <RadiusPicture radius={radius} active={!!office} />
      </div>
    </SectionCard>
  );
}

// The check-in zone drawn to scale against the largest choice: the office
// pin in the middle, the allowed circle, and where 500 m would reach.
function RadiusPicture({ radius, active }: { radius: number; active: boolean }) {
  const { t } = useI18n();
  const pct = Math.max(14, (radius / 500) * 100);
  return (
    <div className="relative grid aspect-square place-items-center overflow-hidden rounded-2xl border border-border bg-[repeating-linear-gradient(0deg,transparent_0_19px,var(--border)_19px_20px),repeating-linear-gradient(90deg,transparent_0_19px,var(--border)_19px_20px)] bg-surface">
      <span className="absolute inset-[6%] rounded-full border border-dashed border-muted-foreground/30" />
      <span
        className={cn(
          "absolute rounded-full border-2 transition-all",
          active
            ? "border-emerald-500 bg-emerald-500/15"
            : "border-muted-foreground/30 bg-muted/40",
        )}
        style={{ width: `${pct * 0.88}%`, height: `${pct * 0.88}%` }}
      />
      <MapPin
        className={cn(
          "relative h-7 w-7 -translate-y-2",
          active ? "fill-rose-500/20 text-rose-600" : "text-muted-foreground",
        )}
      />
      <span className="absolute bottom-2 left-1/2 -translate-x-1/2 rounded-md bg-card/90 px-2 py-0.5 font-mono text-[11.5px] font-semibold text-foreground shadow-sm">
        {active ? `${radius} m` : t("attRules.notSet")}
      </span>
    </div>
  );
}

function ShiftsCard({
  rules,
  onChange,
}: {
  rules: AttendanceRules;
  onChange: (patch: Partial<AttendanceRules>) => void;
}) {
  const { t } = useI18n();
  const { data: profiles } = useProfilesRaw();
  const people = (profiles ?? []).filter((p) => p.role !== "platform_owner");
  const setShift = (id: string, patch: Partial<Shift>) =>
    onChange({ shifts: rules.shifts.map((s) => (s.id === id ? { ...s, ...patch } : s)) });

  function addShift() {
    const id = `s${Date.now().toString(36)}`;
    onChange({
      shifts: [
        ...rules.shifts,
        { id, name: t("attRules.newShift"), start: "14:00", end: "22:00", days: [1, 2, 3, 4, 5] },
      ],
    });
  }

  function removeShift(id: string) {
    const assign = Object.fromEntries(Object.entries(rules.assign).filter(([, v]) => v !== id));
    onChange({ shifts: rules.shifts.filter((s) => s.id !== id), assign });
  }

  return (
    <SectionCard
      icon={CalendarClock}
      tone="sky"
      title={t("attRules.shiftsTitle")}
      description={t("attRules.shiftsDesc")}
      className="xl:col-span-2"
    >
      <div className="grid gap-5 lg:grid-cols-[1.25fr_1fr]">
        <div className="space-y-2.5">
          {rules.shifts.map((s, i) => (
            <div key={s.id} className="rounded-xl border border-border p-3">
              <div className="flex flex-wrap items-center gap-2">
                <input
                  value={s.name}
                  onChange={(e) => setShift(s.id, { name: e.target.value })}
                  className={cn(inputCls, "h-9 min-w-0 flex-1 font-semibold")}
                />
                <HmInput
                  value={s.start}
                  onChange={(start) => setShift(s.id, { start })}
                  className="h-9 w-[72px]"
                />
                <span className="text-muted-foreground">–</span>
                <HmInput
                  value={s.end}
                  onChange={(end) => setShift(s.id, { end })}
                  className="h-9 w-[72px]"
                />
                {i > 0 && (
                  <button
                    type="button"
                    onClick={() => removeShift(s.id)}
                    title={t("common.delete")}
                    className="grid h-9 w-9 place-items-center rounded-lg text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                )}
              </div>
              <div className="mt-2.5 flex flex-wrap gap-1.5">
                {DAY_KEYS.map((d, idx) => {
                  const n = idx + 1;
                  const on = s.days.includes(n);
                  return (
                    <button
                      key={d}
                      type="button"
                      onClick={() =>
                        setShift(s.id, {
                          days: on ? s.days.filter((x) => x !== n) : [...s.days, n].sort(),
                        })
                      }
                      className={cn(
                        "h-8 min-w-[42px] rounded-lg border px-2 text-[12.5px] font-semibold transition-colors",
                        on
                          ? "border-sky-500/50 bg-sky-500/15 text-sky-800 dark:text-sky-200"
                          : "border-border text-muted-foreground hover:text-foreground",
                      )}
                    >
                      {t(`attRules.day.${d}`)}
                    </button>
                  );
                })}
                <span className="ml-auto self-center text-[12px] text-muted-foreground">
                  {i === 0
                    ? t("attRules.defaultShift")
                    : t("attRules.peopleCount", {
                        n: Object.values(rules.assign).filter((v) => v === s.id).length,
                      })}
                </span>
              </div>
            </div>
          ))}
          <Button type="button" variant="outline" onClick={addShift}>
            <Plus className="h-4 w-4" />
            {t("attRules.addShift")}
          </Button>
        </div>
        <div>
          <p className="console-caption mb-2 flex items-center gap-1.5">
            <Users className="h-3.5 w-3.5" />
            {t("attRules.assignTitle")}
          </p>
          <ul className="max-h-[360px] space-y-1.5 overflow-y-auto pr-1">
            {people.map((p) => (
              <li
                key={p.id}
                className="flex items-center gap-2.5 rounded-lg border border-border px-2.5 py-1.5"
              >
                <span className="grid h-7 w-7 shrink-0 place-items-center rounded-md bg-mint text-[11px] font-semibold text-mint-foreground">
                  {(p.full_name || p.email || "?").slice(0, 1).toUpperCase()}
                </span>
                <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-foreground">
                  {p.full_name || p.email}
                </span>
                <select
                  value={rules.assign[p.id] ?? rules.shifts[0]?.id}
                  onChange={(e) => {
                    const assign = { ...rules.assign };
                    if (e.target.value === rules.shifts[0]?.id) delete assign[p.id];
                    else assign[p.id] = e.target.value;
                    onChange({ assign });
                  }}
                  className="h-8 rounded-lg border border-border bg-input px-2 text-[12.5px] text-foreground outline-none"
                >
                  {rules.shifts.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name} · {s.start}–{s.end}
                    </option>
                  ))}
                </select>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </SectionCard>
  );
}

function NumberRow({
  icon: Icon,
  tone,
  title,
  hint,
  value,
  max,
  onChange,
}: {
  icon: typeof Timer;
  tone: "amber" | "emerald" | "sky";
  title: string;
  hint: string;
  value: number;
  max: number;
  onChange: (v: number) => void;
}) {
  const { t } = useI18n();
  const tile = {
    amber: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
    emerald: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
    sky: "bg-sky-500/15 text-sky-700 dark:text-sky-300",
  }[tone];
  return (
    <div className="flex items-center gap-3.5 rounded-xl border border-border px-3.5 py-3">
      <span className={cn("grid h-10 w-10 shrink-0 place-items-center rounded-xl", tile)}>
        <Icon className="h-5 w-5" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-[14px] font-semibold text-foreground">{title}</p>
        <p className="text-[12.5px] leading-snug text-muted-foreground">{hint}</p>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <input
          type="number"
          min={0}
          max={max}
          inputMode="numeric"
          value={value}
          onChange={(e) => onChange(Number(e.target.value) || 0)}
          className="h-11 w-20 rounded-xl border border-border bg-input px-2 text-center font-mono text-[17px] font-semibold tabular-nums text-foreground outline-none transition-colors focus:border-primary"
        />
        <span className="text-[13px] text-muted-foreground">{t("reply.min")}</span>
      </div>
    </div>
  );
}

function ToggleRow({
  title,
  hint,
  checked,
  onChange,
}: {
  title: ReactNode;
  hint: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex cursor-pointer items-center justify-between gap-4 rounded-xl border border-border px-3.5 py-3">
      <span className="min-w-0">
        <span className="block text-[14px] font-semibold text-foreground">{title}</span>
        <span className="block text-[12.5px] leading-snug text-muted-foreground">{hint}</span>
      </span>
      <Switch checked={checked} onCheckedChange={onChange} />
    </label>
  );
}

// A 24-hour "HH:MM" field (the browser's time input shows AM/PM in some
// languages): free typing, tidied to HH:MM on leaving, reverted if invalid.
function HmInput({
  value,
  onChange,
  disabled,
  className,
}: {
  value: string;
  onChange: (hm: string) => void;
  disabled?: boolean;
  className?: string;
}) {
  const [text, setText] = useState(value);
  useEffect(() => setText(value), [value]);
  function commit() {
    const m = text.trim().match(/^(\d{1,2})[:.\s]?(\d{2})?$/);
    const h = m ? Number(m[1]) : NaN;
    const min = m ? Number(m[2] ?? 0) : NaN;
    if (h >= 0 && h <= 23 && min >= 0 && min <= 59) {
      const hm = `${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}`;
      setText(hm);
      if (hm !== value) onChange(hm);
    } else setText(value);
  }
  return (
    <input
      value={text}
      disabled={disabled}
      inputMode="numeric"
      maxLength={5}
      placeholder="09:00"
      onChange={(e) => setText(e.target.value.replace(/[^\d:.]/g, ""))}
      onBlur={commit}
      onKeyDown={(e) => e.key === "Enter" && commit()}
      className={cn(
        inputCls,
        "px-2 text-center font-mono tabular-nums disabled:opacity-50",
        className,
      )}
    />
  );
}
