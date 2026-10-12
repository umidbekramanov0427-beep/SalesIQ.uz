import { CheckCircle2, MessageSquareText } from "lucide-react";
import { Pill, SectionCard } from "@/components/layout/Primitives";
import { useI18n } from "@/lib/i18n";
import { useProfilesRaw, useUnlinkManagerTelegram, type ProfileRow } from "@/hooks/use-crm-data";

// Who in the team has linked the Telegram bot (profiles.telegram_chat_id).
// Shown once, on the daily report page -- the bot's reports, reminders and
// alerts all go to these chats.
export function TelegramRosterPanel({ profiles }: { profiles: ProfileRow[] }) {
  const { t } = useI18n();
  const unlink = useUnlinkManagerTelegram();
  const linkedCount = profiles.filter((p) => p.telegram_chat_id).length;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[13px] font-bold text-foreground">{t("tel.rosterTitle")}</p>
        <Pill tone="neutral">
          {linkedCount}/{profiles.length} {t("telephony.linkedSuffix")}
        </Pill>
      </div>
      <p className="text-xs text-muted-foreground">
        {t("tel.rosterHintBefore")}{" "}
        <a href="/settings" className="text-primary underline underline-offset-2">
          {t("tel.rosterHintLink")}
        </a>{" "}
        {t("tel.rosterHintAfter")}
      </p>
      <ul className="space-y-1.5">
        {profiles.map((p) => (
          <li
            key={p.id}
            className="flex items-center justify-between gap-2 rounded-xl border border-border bg-surface px-3 py-2 text-sm"
          >
            <span className="truncate text-foreground">{p.full_name}</span>
            {p.telegram_chat_id ? (
              <div className="flex shrink-0 items-center gap-2">
                <Pill tone="success">
                  <CheckCircle2 className="mr-1 inline h-3 w-3" /> {t("telephony.connected")}
                </Pill>
                <button
                  type="button"
                  onClick={() => void unlink.mutateAsync(p.id)}
                  disabled={unlink.isPending}
                  className="text-xs font-semibold text-destructive hover:underline"
                >
                  {t("telephony.unlinkButton")}
                </button>
              </div>
            ) : (
              <Pill tone="neutral">{t("telephony.notConnected")}</Pill>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

export function TelegramRosterCard() {
  const { t } = useI18n();
  const { data: profiles } = useProfilesRaw();
  return (
    <SectionCard
      icon={MessageSquareText}
      tone="sky"
      title={t("hub.item.telegramLink.title")}
      description={t("hub.item.telegramLink.desc")}
    >
      <TelegramRosterPanel profiles={profiles ?? []} />
    </SectionCard>
  );
}
