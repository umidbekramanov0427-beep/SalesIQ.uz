import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { PhoneIncoming, UserPlus, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { NewLeadDialog } from "@/components/crm/quick-create";
import { useAuth } from "@/lib/auth";
import { appRoleOf } from "@/lib/nav";
import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";

// The moment the PBX reports an incoming call ringing (the telephony
// webhook writes it to pbx_calls), a card slides in with who is calling:
// the client's lead if the number is known, otherwise a one-click "create
// lead" with the number filled in. Rides on Supabase Realtime (pbx_calls is
// added to the publication in 20261105000000_telephony_missed_calls.sql),
// so RLS decides which rows reach whom: a rep gets the calls routed to
// their own extension, a head of sales/admin also gets calls no one is
// assigned to yet. The card goes away once the call is answered or ends.

type CallRow = {
  id: string;
  organization_id: string;
  direction: string;
  status: string;
  from_number: string | null;
  initiated_by: string | null;
  lead_id: string | null;
  contact_id: string | null;
};

type Incoming = {
  id: string;
  number: string;
  leadId: string | null;
  name: string | null;
  shownAt: number;
};

const MAX_RING_MS = 60_000;

async function describe(row: CallRow): Promise<{ leadId: string | null; name: string | null }> {
  if (row.lead_id) {
    const { data } = await supabase
      .from("leads")
      .select("id, name")
      .eq("id", row.lead_id)
      .maybeSingle();
    if (data) return { leadId: data.id, name: data.name };
  }
  if (row.contact_id) {
    const { data } = await supabase
      .from("contacts")
      .select("full_name")
      .eq("id", row.contact_id)
      .maybeSingle();
    if (data?.full_name) return { leadId: null, name: data.full_name };
  }
  return { leadId: null, name: null };
}

export function IncomingCallPopup({ enabled }: { enabled: boolean }) {
  const { user } = useAuth();
  const [calls, setCalls] = useState<Incoming[]>([]);
  const userId = user?.id ?? null;
  const orgId = user?.organizationId ?? null;
  const role = appRoleOf(user);
  const seesUnassigned = role === "super_admin" || role === "rop";

  useEffect(() => {
    if (!enabled || !userId || !orgId) return;
    const mine = (r: CallRow) =>
      r.initiated_by === userId || (r.initiated_by === null && seesUnassigned);

    const channel = supabase
      .channel(`incoming-calls-${orgId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "pbx_calls", filter: `organization_id=eq.${orgId}` },
        (payload) => {
          const row = payload.new as CallRow | undefined;
          if (!row?.id || row.direction !== "incoming") return;
          if (row.status !== "ringing") {
            setCalls((prev) => prev.filter((c) => c.id !== row.id));
            return;
          }
          if (!mine(row)) {
            // Re-routed to someone else's extension.
            setCalls((prev) => prev.filter((c) => c.id !== row.id));
            return;
          }
          void describe(row).then(({ leadId, name }) => {
            setCalls((prev) => {
              const rest = prev.filter((c) => c.id !== row.id);
              const existing = prev.find((c) => c.id === row.id);
              return [
                {
                  id: row.id,
                  number: row.from_number ?? "",
                  leadId,
                  name,
                  shownAt: existing?.shownAt ?? Date.now(),
                },
                ...rest,
              ].slice(0, 3);
            });
          });
        },
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [enabled, userId, orgId, seesUnassigned]);

  // A missed webhook must not leave a card up forever.
  useEffect(() => {
    if (calls.length === 0) return;
    const id = setInterval(() => {
      setCalls((prev) => prev.filter((c) => Date.now() - c.shownAt < MAX_RING_MS));
    }, 5_000);
    return () => clearInterval(id);
  }, [calls.length]);

  if (calls.length === 0) return null;
  return (
    <div className="pointer-events-none fixed right-4 top-4 z-[70] flex w-[min(360px,calc(100vw-32px))] flex-col gap-2.5">
      {calls.map((c) => (
        <CallCard
          key={c.id}
          call={c}
          onClose={() => setCalls((prev) => prev.filter((x) => x.id !== c.id))}
        />
      ))}
    </div>
  );
}

function CallCard({ call, onClose }: { call: Incoming; onClose: () => void }) {
  const { t } = useI18n();
  const [shown, setShown] = useState(false);
  useEffect(() => {
    const id = requestAnimationFrame(() => setShown(true));
    return () => cancelAnimationFrame(id);
  }, []);

  return (
    <div
      role="alert"
      className={cn(
        "pointer-events-auto relative overflow-hidden rounded-2xl border border-border bg-popover p-4 pr-10 text-popover-foreground shadow-[0_18px_44px_-12px_rgba(0,0,0,0.35)] transition-all duration-200 ease-out motion-reduce:transition-none",
        shown ? "translate-y-0 opacity-100" : "-translate-y-2 opacity-0",
      )}
    >
      <span aria-hidden className="absolute inset-x-0 top-0 h-1 bg-success" />
      <div className="flex items-center gap-3">
        <span className="relative grid h-11 w-11 shrink-0 place-items-center rounded-full bg-success text-white">
          <span className="absolute inset-0 animate-ping rounded-full bg-success/40 motion-reduce:animate-none" />
          <PhoneIncoming className="relative h-5 w-5" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold uppercase tracking-wide text-success">
            {t("incomingCall.title")}
          </p>
          <p className="truncate text-[15px] font-semibold leading-tight">
            {call.name ?? t("incomingCall.unknown")}
          </p>
          <p className="truncate font-mono text-[13px] text-muted-foreground tabular-nums">
            {call.number}
          </p>
        </div>
      </div>
      <div className="mt-3.5 flex gap-2">
        {call.leadId ? (
          <Link
            to="/crm/leads/$leadId"
            params={{ leadId: call.leadId }}
            onClick={onClose}
            className="inline-flex h-9 flex-1 items-center justify-center rounded-lg bg-primary px-3 text-sm font-semibold text-primary-foreground hover:opacity-90"
          >
            {t("incomingCall.openLead")}
          </Link>
        ) : (
          <NewLeadDialog
            initialPhone={call.number}
            trigger={
              <button
                type="button"
                className="inline-flex h-9 flex-1 items-center justify-center gap-1.5 rounded-lg bg-primary px-3 text-sm font-semibold text-primary-foreground hover:opacity-90"
              >
                <UserPlus className="h-4 w-4" /> {t("incomingCall.createLead")}
              </button>
            }
          />
        )}
      </div>
      <button
        type="button"
        onClick={onClose}
        aria-label={t("common.close")}
        className="absolute right-2.5 top-3 grid h-7 w-7 place-items-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}
