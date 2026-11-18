// The shared (trial) bot: a company's new clients may come in through it
// for 14 days after sign-up (organizations.shared_bot_until); after that the
// company connects its own bot. Clients already talking go on. Pure.

export const SHARED_BOT_DAYS = 14;

/** Whether new clients of the company may still start the shared bot. */
export function sharedBotOpen(
  org: { shared_bot_until?: string | null } | null | undefined,
  now = new Date(),
): boolean {
  if (!org) return false;
  // Before the migration there is no date: nothing changes.
  if (org.shared_bot_until === undefined) return true;
  if (!org.shared_bot_until) return false;
  return new Date(org.shared_bot_until).getTime() > now.getTime();
}

/** Whole days left on the shared bot (0 when over, null without a date). */
export function sharedBotDaysLeft(
  until: string | null | undefined,
  now = new Date(),
): number | null {
  if (!until) return null;
  const ms = new Date(until).getTime() - now.getTime();
  return ms <= 0 ? 0 : Math.ceil(ms / 86_400_000);
}

/** What a client hears when the company's time on the shared bot is over. */
export function sharedBotClosedText(ownBotUsername: string | null): string {
  return ownBotUsername
    ? `Bu kompaniya endi o'z botida ishlaydi. Shu yerga yozing: https://t.me/${ownBotUsername}`
    : "Bu bot hozir ishlamayapti. Kompaniyaga boshqa yo'l bilan murojaat qiling.";
}
