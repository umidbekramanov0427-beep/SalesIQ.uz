# SalesIQ.uz — arxitektura, hosting va subdomenlar

Bu hujjatda uchta narsa bor:

1. Platforma qaysi dasturlash tillari va texnologiyalarda yozilgan.
2. Subdomenlar (`kompaniya.salesiq.uz`) qanday ishlaydi.
3. Platforma qayerda ishlaydi: o'z serverimiz (Eskiz VPS).

---

## 1. Texnologiyalar va dasturlash tillari

| Qism | Til / texnologiya | Qayerda |
|---|---|---|
| Frontend (platforma) | **TypeScript** + React 19, TanStack Router/Query | `src/routes/*.tsx`, `src/components/` |
| Sayt (salesiq.uz landing) | **TypeScript** + React. Platforma bilan bitta loyihada | `src/components/marketing/Landing.tsx` |
| Dizayn | **CSS** (Tailwind CSS v4), ECharts / Recharts grafiklari | `src/styles.css` |
| Backend (asosiy) | **TypeScript**, TanStack Start server route'lari (Nitro). Serverda bitta Node jarayoni sifatida ishlaydi | `src/routes/*.ts`, `src/lib/*.server.ts` |
| Ma'lumotlar bazasi | **SQL / PL/pgSQL**, o'z serverimizdagi Supabase (PostgreSQL): RLS, trigger'lar, `pg_cron` | `supabase/migrations/*.sql` |
| Fayllar | Supabase Storage (audio yozuvlar, dars videolari, fayllar) | — |
| AI | Google Gemini (audio tahlil, AI yordamchi, AI mentor), promptlar o'zbek tilida | `src/lib/gemini.server.ts` |
| Backend (port, ishlanmoqda) | **Python** — FastAPI | `backend-python/` (holati `PORT_STATUS.md` da) |
| Integratsiyalar | REST API: amoCRM, Bitrix24, Telegram Bot API, telefoniya (OnlinePBX, MoiZvonki va b.), Payme/Click | `src/lib/*` |

**Qisqasi:** frontend, sayt va asosiy backend — bitta **TypeScript** loyihasi. Ma'lumotlar bazasi — **PostgreSQL (SQL)**. Python faqat tajriba sifatidagi FastAPI porti.

---

## 2. Subdomenlar: `kompaniya.salesiq.uz`

### Qanday ishlaydi

1. Har bir kompaniyada `organizations.subdomain` maydoni bor. Masalan, `kampaniya1`.
2. Kompaniya admini manzilni o'zi tanlaydi: **Sozlamalar → Umumiy → Kompaniya manzili**. Platforma format va bandlikni tekshiradi; `www`, `api`, `admin` kabi tizim nomlarini bermaydi.
3. Brauzer `kampaniya1.salesiq.uz` ni ochganda ilova manzildan subdomenni o'qiydi (`src/lib/subdomain.ts`):
   - **Kirish sahifasida** "Kampaniya1 — kirish" yozuvi chiqadi.
   - **Kirgandan keyin** foydalanuvchi shu kompaniya a'zosi ekani tekshiriladi (`SubdomainGuard`). Boshqa kompaniya xodimi kirsa, unga "Bu boshqa kompaniyaning manzili" oynasi va o'z manziliga havola ko'rsatiladi.
   - Platforma egasi (platform_owner) istalgan subdomenga kira oladi.
4. Ma'lumotlar xavfsizligi subdomenga bog'liq emas. Har bir so'rov baribir Supabase RLS orqali faqat o'z kompaniyasi ma'lumotlarini oladi. Subdomen — qulaylik va brending qatlami.
5. Sessiyalar subdomen bo'yicha alohida: `a.salesiq.uz` va `b.salesiq.uz` da login alohida saqlanadi.

### Yoqish uchun nima kerak

Hammasi sozlangan, yangi kompaniya uchun qo'shimcha ish yo'q:

- **DNS:** `*.salesiq.uz` server IP'siga (`185.191.141.144`) yo'naltirilgan.
- **HTTPS:** Caddy har bir yangi subdomen uchun sertifikatni birinchi ochilganda o'zi oladi. Oldin ilovaning `/tls-allowed` manzili bu subdomen bazada borligini tasdiqlaydi.
- **Kirish havolalari:** serverdagi Supabase sozlamasida (`/opt/supabase/.env`, `ADDITIONAL_REDIRECT_URLS`) `https://*.salesiq.uz/**` bor, shuning uchun Google bilan kirish va parolni tiklash subdomenlarda ham ishlaydi.

---

## 3. Platforma qayerda ishlaydi

Hammasi bitta Eskiz VPS'da (Ubuntu 24.04):

| Qism | Qayerda |
|---|---|
| Ilova (sayt + backend) | `/opt/salesiq`, `salesiq.service` (Node, 127.0.0.1:3000) |
| Baza, auth, fayllar | Supabase, Docker Compose: `/opt/supabase`, ommaviy manzil `https://api.salesiq.uz` |
| HTTPS va domenlar | Caddy (`/etc/caddy/Caddyfile`) |
| Yangilanish | `main` ga push → `salesiq-autodeploy.timer` 5 daqiqa ichida build qilib, qayta ishga tushiradi |
| Rejali ishlar | `pg_cron` → `https://vps.salesiq.uz/...` (`x-cron-secret` bilan) |
| Backup | har kecha 03:30: serverda 7 kun, Backblaze B2'da shifrlangan 30 kun |
| Email | Brevo SMTP (`noreply@salesiq.uz`) |

Batafsil buyruqlar va qoidalar — `CLAUDE.md` dagi "Production server" bo'limida.

Server bitta uzoq ishlaydigan jarayon bo'lgani uchun so'rov vaqtiga serverless cheklovi yo'q; amoCRM sinxroni va audio tahlil kabi og'ir ishlar shu serverning o'zida, cron orqali bajariladi.

---

## Xavfsizlik bo'yicha eslatma

`supabase/migrations/20261011030000_fix_cron_urls_to_salesiq_uz.sql` faylida eski `x-cron-secret` qiymati ochiq matnda turibdi. U endi ishlamaydi: `CRON_SECRET` serverda yangidan yaratilgan va `public.set_cron_secret` orqali bazaga yozilgan (`20261203000000_set_cron_secret.sql`). Sirlarni bundan buyon migratsiya fayllariga yozmang.
