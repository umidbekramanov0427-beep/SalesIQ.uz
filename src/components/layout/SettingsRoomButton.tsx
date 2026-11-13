import { Settings2 } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { useI18n } from "@/lib/i18n";

/**
 * A section's "Sozlash" button (top right of its page): opens the section's
 * own settings room. Heads (super admin, ROP) only -- others never see it.
 */
export function SettingsRoomButton({ onClick }: { onClick: () => void }) {
  const { t } = useI18n();
  const { user } = useAuth();
  if (!user || !["super_admin", "rop", "platform_owner"].includes(user.role)) return null;
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex h-10 items-center gap-2 rounded-xl ctl-soft px-4 text-sm font-semibold text-foreground"
    >
      <Settings2 className="h-4 w-4 text-primary" />
      {t("room.settings")}
    </button>
  );
}
