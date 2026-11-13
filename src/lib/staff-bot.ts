// The staff bot (Platforma -> Botlar): what it says to a plain /start. Pure,
// so the wording is tested; the webhook (telegram.webhook.ts) sends it.

/** A bare /start (the bot's own link, no payload). */
export const PLAIN_START = /^\/start(@\w+)?\s*$/i;

/** The reply to a plain /start: how to link, or that the person is linked. */
export function staffStartReply(person: { name: string | null } | null): string {
  if (!person) {
    return [
      "👋 Bu SalesIQ xodimlar boti: davomat, vazifalar, eslatmalar va hisobotlar shu yerga keladi.",
      "",
      "Ulash uchun SalesIQ'da: Sozlamalar → Telegram → «Ulash» tugmasini bosing — u sizni shu botga qaytaradi va akkauntingiz ulanadi.",
    ].join("\n");
  }
  const hi = person.name ? `, ${person.name.split(" ")[0]}` : "";
  return [
    `✅ Siz SalesIQ'ga ulangansiz${hi}.`,
    "",
    "Pastdagi tugmalar:",
    "✅ Keldim — ishga kelganingizni belgilash (joylashuv bilan)",
    "🏁 Ketdim — ish kunini tugatish",
    "📝 Izoh yozish — kechikish yoki boshqa sababni yozib qo'yish",
    "📊 Davomatim — bugungi va shu oydagi davomatingiz",
  ].join("\n");
}
