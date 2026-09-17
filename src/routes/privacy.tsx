import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/privacy")({
  head: () => ({
    meta: [
      { title: "Privacy Policy — SalesIQ CRM" },
      {
        name: "description",
        content: "How SalesIQ collects, uses and protects data.",
      },
      { name: "robots", content: "index, follow" },
    ],
  }),
  component: PrivacyPage,
});

function PrivacyPage() {
  return (
    <main className="mx-auto max-w-2xl px-6 py-16 text-foreground">
      <h1 className="text-3xl font-bold">SalesIQ — Maxfiylik siyosati</h1>
      <p className="mt-2 text-sm text-muted-foreground">Oxirgi yangilanish: 2026-yil sentabr</p>

      <div className="mt-8 space-y-6 text-sm leading-relaxed">
        <section>
          <h2 className="text-lg font-semibold text-foreground">1. Umumiy ma'lumot</h2>
          <p className="mt-2">
            SalesIQ ("biz", "platforma") — savdo jamoalari uchun mo'ljallangan CRM va sun'iy
            intellekt tahlili xizmati. Ushbu sahifa platformadan foydalanuvchilar (kompaniya
            xodimlari) haqida qanday ma'lumot to'planishi, ishlatilishi va saqlanishini
            tushuntiradi.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-foreground">2. To'planadigan ma'lumotlar</h2>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            <li>Hisob ma'lumotlari: ism, email manzil, telefon raqami, lavozim.</li>
            <li>
              Google yoki Telegram orqali kirganda — o'sha xizmat taqdim etadigan asosiy profil
              ma'lumotlari (ism, email yoki Telegram foydalanuvchi ID'si).
            </li>
            <li>
              Ish faoliyati ma'lumotlari: lidlar, bitimlar, qo'ng'iroq yozuvlari va ularning AI
              tahlili — kompaniyangiz tomonidan platformaga kiritilgan yoki AmoCRM orqali
              sinxronlangan.
            </li>
          </ul>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-foreground">3. Ma'lumotlardan foydalanish</h2>
          <p className="mt-2">
            Ma'lumotlar faqat platforma xizmatini ko'rsatish uchun ishlatiladi: tizimga kirish,
            savdo ko'rsatkichlarini hisoblash, qo'ng'iroqlarni AI orqali tahlil qilish va hisobotlar
            tayyorlash. Ma'lumotlar uchinchi tomonlarga sotilmaydi.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-foreground">4. Ma'lumotlarni saqlash</h2>
          <p className="mt-2">
            Ma'lumotlar Supabase (PostgreSQL) infratuzilmasida shifrlangan holda saqlanadi. Kirish
            faqat tegishli kompaniya xodimlariga, ularning roliga mos ravishda cheklangan.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-foreground">5. Bog'lanish</h2>
          <p className="mt-2">
            Maxfiylik siyosati bo'yicha savollar uchun: platformangizni sozlagan administrator bilan
            bog'laning.
          </p>
        </section>
      </div>
    </main>
  );
}
