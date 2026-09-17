import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/terms")({
  head: () => ({
    meta: [
      { title: "Terms of Service — SalesIQ CRM" },
      {
        name: "description",
        content: "The terms under which SalesIQ is provided to your company.",
      },
      { name: "robots", content: "index, follow" },
    ],
  }),
  component: TermsPage,
});

function TermsPage() {
  return (
    <main className="mx-auto max-w-2xl px-6 py-16 text-foreground">
      <h1 className="text-3xl font-bold">SalesIQ — Foydalanish shartlari</h1>
      <p className="mt-2 text-sm text-muted-foreground">Oxirgi yangilanish: 2026-yil sentabr</p>

      <div className="mt-8 space-y-6 text-sm leading-relaxed">
        <section>
          <h2 className="text-lg font-semibold text-foreground">1. Xizmat</h2>
          <p className="mt-2">
            SalesIQ — savdo jamoalari uchun CRM va sun'iy intellekt tahlili xizmati. Platformadan
            faqat administratoringiz ro'yxatdan o'tkazgan xodimlar foydalana oladi; ochiq,
            o'z-o'zidan ro'yxatdan o'tish mavjud emas.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-foreground">2. Hisob va kirish</h2>
          <p className="mt-2">
            Hisobingizga email/parol, Google yoki Telegram orqali kirishingiz mumkin. Hisobingiz
            xavfsizligi uchun javobgarlik sizga tegishli — parolingizni boshqalarga bermang.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-foreground">3. Ma'lumotlar egaligi</h2>
          <p className="mt-2">
            Platformaga kiritilgan yoki AmoCRM orqali sinxronlangan barcha savdo ma'lumotlari
            (lidlar, bitimlar, qo'ng'iroqlar) sizning kompaniyangizga tegishli bo'lib qoladi.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-foreground">4. Javobgarlik chegarasi</h2>
          <p className="mt-2">
            Platforma "bor holicha" taqdim etiladi. AI tomonidan berilgan tahlil va tavsiyalar
            yordamchi xarakterga ega — muhim qarorlarni faqat shularga tayangan holda qabul qilmang.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-foreground">5. Bog'lanish</h2>
          <p className="mt-2">
            Foydalanish shartlari bo'yicha savollar uchun: platformangizni sozlagan administrator
            bilan bog'laning.
          </p>
        </section>
      </div>
    </main>
  );
}
