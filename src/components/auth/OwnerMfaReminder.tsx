import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { ShieldAlert } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { useI18n } from "@/lib/i18n";
import { getMfaStatus } from "@/lib/mfa";

// The platform owner's account opens every company, so until two-step
// sign-in is on, a thin bar on every page says so and links to the setup.
export function OwnerMfaReminder() {
  const { t } = useI18n();
  const { user } = useAuth();
  const [show, setShow] = useState(false);
  const owner = user?.role === "platform_owner";

  useEffect(() => {
    if (!owner) return;
    let cancelled = false;
    void getMfaStatus()
      .then((s) => !cancelled && setShow(!s.enabled))
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [owner]);

  if (!owner || !show) return null;
  return (
    <div className="flex items-center justify-center gap-2 border-b border-warning/30 bg-warning/10 px-4 py-2 text-[13px] text-warning-foreground">
      <ShieldAlert className="h-4 w-4 shrink-0" />
      <span>{t("mfa.ownerReminder")}</span>
      <Link
        to="/settings"
        search={{ section: "profile" }}
        className="font-semibold underline underline-offset-2"
      >
        {t("mfa.turnOn")}
      </Link>
    </div>
  );
}
