// The staff bot (Platforma -> Botlar): what it says to a plain /start. Pure,
// so the wording is tested; the webhook (telegram.webhook.ts) sends it.

/** A bare /start (the bot's own link, no payload). */
export const PLAIN_START = /^\/start(@\w+)?\s*$/i;

/**
 * The reply to a plain /start: how to link, or that the person is linked.
 * `attendance`: they are one of a company's people (the platform owner and
 * an account without a company get no attendance buttons).
 */
export function staffStartReply(
  person: { name: string | null; attendance?: boolean } | null,
): string {
  if (!person) {
    return [
      "👋 Bu SalesIQ xodimlar boti: davomat, vazifalar, eslatmalar va hisobotlar shu yerga keladi.",
      "",
      "Ulash uchun SalesIQ'da: Sozlamalar → Telegram → «Ulash» tugmasini bosing — u sizni shu botga qaytaradi va akkauntingiz ulanadi.",
    ].join("\n");
  }
  const hi = person.name ? `, ${person.name.split(" ")[0]}` : "";
  if (person.attendance === false) {
    return [
      `✅ Siz SalesIQ'ga ulangansiz${hi}.`,
      "",
      "Akkauntingiz hech qaysi kompaniyaning xodimi emas (masalan, platforma egasi), shuning uchun davomat tugmalari sizda chiqmaydi.",
      "Kompaniya xodimlarida pastda «✅ Keldim», «📝 Izoh yozish» va «📊 Davomatim» tugmalari bo'ladi.",
    ].join("\n");
  }
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
