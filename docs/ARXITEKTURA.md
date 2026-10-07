# SalesIQ.uz — arxitektura, hosting va subdomenlar

Bu hujjatda uchta narsa bor:

1. Platforma qaysi dasturlash tillari va texnologiyalarda yozilgan.
2. Subdomenlar (`kompaniya.salesiq.uz`) qanday ishlaydi va ularni qanday yoqish kerak.
3. Og'ir fon ishlari uchun VPS: Eskiz yoki Hetzner, arxitektura va xavfsiz ulanish.

---

## 1. Texnologiyalar va dasturlash tillari

| Qism | Til / texnologiya | Qayerda |
|---|---|---|
| Frontend (platforma) | **TypeScript** + React 19, TanStack Router/Query | `src/routes/*.tsx`, `src/components/` |
| Sayt (salesiq.uz landing) | **TypeScript** + React. Platforma bilan bitta loyihada | `src/components/marketing/Landing.tsx` |
| Dizayn | **CSS** (Tailwind CSS v4), ECharts / Recharts grafiklari | `src/styles.css` |
| Backend (asosiy) | **TypeScript**, TanStack Start server route'lari (Nitro). Vercel serverless funksiyalarida ishlaydi | `src/routes/*.ts`, `src/lib/*.server.ts` |
| Ma'lumotlar bazasi | **SQL / PL/pgSQL**, Supabase (PostgreSQL): RLS, trigger'lar, `pg_cron` | `supabase/migrations/*.sql` |
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

### Yoqish uchun nima qilish kerak (bir martalik)

**DNS.** Sizda `*` CNAME allaqachon bor, bu yaxshi.

**Vercel (sayt shu yerda joylashgan):**

1. Project → Settings → Domains → **Add** → `*.salesiq.uz` qo'shing.
2. Muhim: Vercel wildcard domen uchun SSL sertifikatni faqat domen **Vercel nameserver'larida** bo'lsa beradi (`ns1.vercel-dns.com`, `ns2.vercel-dns.com`). Oddiy CNAME bilan `*.salesiq.uz` ochiladi, lekin sertifikat chiqmaydi.
3. Ikki yo'l bor:
   - **(Tavsiya)** `salesiq.uz` nameserver'larini Vercel'ga o'tkazing. Barcha DNS yozuvlarini (MX — pochta, TXT va b.) Vercel DNS ichida qayta yarating.
   - Yoki nameserver'ni o'zgartirmasdan, har bir kompaniya subdomenini Vercel'ga alohida qo'shing (`kampaniya1.salesiq.uz`). Bunda har biriga sertifikat alohida chiqadi. Kompaniyalar kam bo'lsa qulay.

**Supabase:** Authentication → URL Configuration → Redirect URLs ga `https://*.salesiq.uz/**` qo'shing. Busiz Google bilan kirish va parolni tiklash havolalari subdomenda ishlamaydi.

**Migratsiya:** `supabase/migrations/20261016010000_org_subdomains.sql` ni ishga tushiring.

---

## 3. Fon ishlari uchun VPS

### Nega kerak

Hozir hamma narsa Vercel serverless funksiyalarida ishlaydi. Bitta funksiya eng ko'pi bilan 120 soniya ishlaydi (`vite.config.ts` → `maxDuration: 120`). Quyidagi ishlar uchun bu tor:

- ko'plab qo'ng'iroqlarni ketma-ket tahlil qilish (Gemini band bo'lsa, qayta urinishlar);
- amoCRM/Bitrix24 dan katta sinxronlash;
- ommaviy xabar yuborish;
- uzun import, hisobotlar.

Bunday ishlarni doimiy ishlaydigan VPS'dagi navbatga (queue) o'tkazish to'g'ri.

### Eskiz yoki Hetzner?

| | Hetzner (Germaniya/Finlyandiya) | O'zbekistondagi provayder (Eskiz va b.) |
|---|---|---|
| Narx / quvvat | Juda yaxshi: arzon narxda ko'p CPU/RAM | Odatda qimmatroq va konfiguratsiya tanlovi kamroq |
| Ishonchlilik, API, snapshot, backup | Yetuk: API, snapshot, firewall, private network | Provayderga qarab |
| Tezlik (Toshkentdan) | ~70–100 ms. Fon ishlari uchun ahamiyatsiz | Eng past kechikish |
| To'lov | Xalqaro karta | So'mda, mahalliy shartnoma |
| **Shaxsiy ma'lumotlar qonuni** | Chet elda | O'zbekistonda |

**Tavsiya:**

- **Fon ishlari (worker) uchun — Hetzner.** Worker faqat hisob-kitob qiladi. U ma'lumotni Supabase'dan oladi va natijani yana Supabase'ga yozadi, o'zida mijoz bazasini saqlamaydi. Shuning uchun narx/sifat bo'yicha Hetzner yutadi. Boshlash uchun 4 vCPU / 8 GB RAM sinfidagi server yetarli.
- **Muhim:** O'zbekistonda fuqarolarning shaxsiy ma'lumotlarini (ism, telefon) mamlakat ichidagi serverlarda saqlash talabi bor (shaxsiy ma'lumotlar to'g'risidagi qonun, 2021-yildagi lokalizatsiya talabi). Bu talab, avvalo, **asosiy ma'lumotlar bazasiga** (hozir Supabase) taalluqli. Agar katta korporativ mijozlar yoki davlat bilan ishlasangiz, yurist bilan maslahatlashing. Kerak bo'lsa, ma'lumotlar bazasini O'zbekistondagi serverga (Eskiz yoki boshqa mahalliy data-markaz) ko'chirish rejasini tuzing. Worker esa qayerda bo'lishidan qat'i nazar shu bazaga ulanadi.

### Arxitektura

```
 Brauzer ──► Vercel (salesiq.uz, *.salesiq.uz)          Hetzner VPS (worker.salesiq.uz)
              │  TanStack Start (UI + API)                ┌───────────────────────────────┐
              │                                           │ Caddy (HTTPS, faqat 443-port) │
              │  1. "ish qo'sh" ── HMAC imzo ───────────► │   └► api  (navbatga qo'shadi) │
              │                                           │ Redis (faqat ichki tarmoq)    │
              │                                           │ worker x N (navbatdan oladi)  │
              ▼                                           └──────────────┬────────────────┘
          Supabase (PostgreSQL, Storage)  ◄── 2. natija (service role) ──┘
              ▲
              └── 3. UI natijani Supabase'dan o'qiydi (Realtime yoki qayta so'rov)
```

**Til tanlovi:** Celery — Python uchun navbat. Bizning backend esa TypeScript. Shuning uchun ikki yo'l bor:

- **A (tavsiya): BullMQ + Redis (Node.js/TypeScript).** Worker `src/lib/*.server.ts` dagi mavjud kodni (audio tahlil, amoCRM sinxroni, Telegram) to'g'ridan-to'g'ri qayta ishlatadi. Ikkinchi tilda qayta yozish shart emas.
- **B: Celery + Redis (Python).** Agar backend'ni `backend-python/` (FastAPI) ga to'liq ko'chirish rejasi bo'lsa. Bunda tahlil va sinxron mantiqini Python'da qayta yozish kerak.

### `docker-compose.yml` (variant A, VPS'da)

```yaml
services:
  caddy:
    image: caddy:2
    ports: ["80:80", "443:443"]
    volumes:
      - ./Caddyfile:/etc/caddy/Caddyfile
      - caddy_data:/data
    restart: unless-stopped

  api:                      # Vercel'dan ish qabul qiladi, imzoni tekshiradi, navbatga qo'yadi
    build: .
    command: node dist/worker-api.js
    env_file: .env
    depends_on: [redis]
    restart: unless-stopped

  worker:                   # navbatdagi ishlarni bajaradi; ko'paytirish: --scale worker=3
    build: .
    command: node dist/worker.js
    env_file: .env
    depends_on: [redis]
    restart: unless-stopped

  redis:
    image: redis:7-alpine
    command: ["redis-server", "--appendonly", "yes", "--requirepass", "${REDIS_PASSWORD}"]
    volumes: [redis_data:/data]
    restart: unless-stopped
    # ports YO'Q — Redis tashqi dunyoga ochilmaydi

volumes:
  caddy_data:
  redis_data:
```

`Caddyfile`:

```
worker.salesiq.uz {
  reverse_proxy api:3000
}
```

Variant B (Celery) uchun ham shu tuzilma ishlaydi: `api` — FastAPI, `worker` — `celery -A app.worker worker -c 4`. Rejali ishlar uchun `celery beat` qo'shiladi.

### Vercel ↔ VPS xavfsiz ulanishi

1. **Faqat HTTPS** (Caddy avtomatik Let's Encrypt sertifikat oladi). Firewall'da (Hetzner Cloud Firewall yoki `ufw`) faqat 22 (SSH, kalit bilan, parolsiz) va 443 ochiq. Redis va ichki portlar tashqariga ochilmaydi.
2. **HMAC imzo.** Vercel har bir so'rovga quyidagi sarlavhalarni qo'shadi:
   - `X-Timestamp`;
   - `X-Signature = HMAC_SHA256(WORKER_SECRET, timestamp + "." + body)`.

   VPS ikki narsani tekshiradi: imzo to'g'ri bo'lishi va vaqt 5 daqiqadan eski bo'lmasligi. Ikkinchisi takroriy (replay) hujumlardan himoya qiladi. `WORKER_SECRET` faqat Vercel va VPS'ning env o'zgaruvchilarida saqlanadi, git'ga hech qachon yozilmaydi.
3. **Idempotentlik.** Har bir ishning `jobId` si bor, masalan `analyze:<callId>`. Bir xil ish ikki marta kelsa, navbat uni takrorlamaydi.
4. **Natija qaytishi.** Worker natijani to'g'ridan-to'g'ri Supabase'ga `SUPABASE_SERVICE_ROLE_KEY` bilan yozadi; bu kalit faqat VPS'da saqlanadi. Shunda VPS'dan Vercel'ga teskari ulanish kerak emas. UI natijani odatdagidek Supabase'dan o'qiydi.
5. **Kuzatuv.** Muvaffaqiyatsiz ishlar uchun qayta urinishlar: eksponensial kutish, keyin "dead-letter" ro'yxati. Navbatni kuzatish uchun BullMQ'da Bull Board (Celery'da Flower) qo'yiladi. U faqat VPN yoki parol orqasida bo'lishi kerak.

### Bosqichma-bosqich o'tish

1. VPS + docker-compose ni ko'taring. Birinchi bo'lib **audio tahlil** navbatini o'tkazing (`audio-analytics/analyze-pending` cron'i o'rniga).
2. Keyin amoCRM/Bitrix24 sinxroni va ommaviy xabarlarni o'tkazing.
3. Vercel'da faqat UI va tezkor API qoladi. Og'ir ish VPS'da bajariladi.

---

## Xavfsizlik bo'yicha eslatma

`supabase/migrations/20261011030000_fix_cron_urls_to_salesiq_uz.sql` faylida `x-cron-secret` qiymati ochiq matnda git'ga yozilgan. Quyidagilarni qiling:

1. Vercel'da `CRON_SECRET` ni yangi qiymatga almashtiring.
2. `cron.job` dagi jadvallarni yangi sir bilan qayta ro'yxatdan o'tkazing. Buni SQL Editor'da qo'lda bajaring, faylga yozmang.
3. Yangi sirni bundan buyon migratsiya fayllariga yozmang. Yangi `20261016000000_intern_mentor.sql` sirni mavjud cron ishidan nusxa qiladi va faylda saqlamaydi.
