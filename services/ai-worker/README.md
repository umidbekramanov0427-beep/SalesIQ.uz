# SalesIQ AI worker (Python / FastAPI)

SalesIQ ilovasi yonida doim ishlab turadigan kichik xizmat. U ilovaning
backend'ini **almashtirmaydi**: frontend, Supabase va TypeScript server qismi
o'zgarmaydi. Xizmatning yagona vazifasi — serverless funksiyaning vaqt
chegarasiga sig'maydigan uzoq AI ishlarini bajarish.

## Nima qiladi

1. **AI tahlil navbati.** Yozuvi bor, lekin hali tahlil qilinmagan
   qo'ng'iroqlarni eng eskisidan boshlab, bir vaqtda bir nechtadan
   (`CONCURRENCY`) tahlil qildiradi va navbat bo'shaguncha to'xtamaydi.
   - AI band bo'lsa (429/503) hammasini `AI_BUSY_BACKOFF_SECONDS` ga to'xtatadi.
   - Obunasi tugagan yoki sinov limiti tugagan kompaniyani `ORG_BLOCK_MINUTES`
     ga chetga qo'yadi, boshqalarning navbatini to'sib qo'ymaydi.
   - 3 marta muvaffaqiyatsiz bo'lgan qo'ng'iroq qayta urinilmaydi
     (Audio tahlil sahifasidan qo'lda tahlil qilish mumkin).
2. **Qayta tahlil.** Mezonlar yoki AI ko'rsatmalari o'zgargandan keyin bitta
   kompaniyaning (yoki hammasining) barcha qo'ng'iroqlarini qayta tahlil qiladi.

Tahlilning o'zi (yozuvni yuklash, matnga aylantirish, ball qo'yish, natijani
saqlash) ilovada qoladi: xizmat har bir qo'ng'iroq uchun
`POST https://salesiq.uz/audio-analytics/analyze-one` ni chaqiradi. Shu sababli
promptlar va qoidalar bitta joyda turadi.

Ikki marta to'lamaslik: qo'ng'iroq tahlil qilinayotganda
`amocrm_calls.analysis_started_at` bilan belgilanadi, shuning uchun pg_cron
(har 5 daqiqada) va bu xizmat bitta qo'ng'iroqni ikki marta tahlil qilmaydi.

## API

| Yo'l                                | Kalit | Vazifa                                                               |
| ----------------------------------- | ----- | -------------------------------------------------------------------- |
| `GET /health`                       | yo'q  | Railway/Render tekshiruvi                                            |
| `GET /v1/queue`                     | bor   | Navbat holati: tahlil qilindi / xato / chetga qo'yilgan kompaniyalar |
| `POST /v1/queue/pause`, `/resume`   | bor   | Navbatni to'xtatish / davom ettirish                                 |
| `POST /v1/jobs/reanalyze`           | bor   | Qayta tahlil: `{"organization_id": "...", "only_failed": false}`     |
| `GET /v1/jobs`, `GET /v1/jobs/{id}` | bor   | Ishlar va ularning borishi                                           |
| `POST /v1/jobs/{id}/cancel`         | bor   | Ishni to'xtatish                                                     |

Kalit: `Authorization: Bearer <WORKER_API_KEY>`. Hujjat: `/docs`.

```bash
curl -H "Authorization: Bearer $WORKER_API_KEY" https://<worker>.up.railway.app/v1/queue
curl -X POST -H "Authorization: Bearer $WORKER_API_KEY" -H "content-type: application/json" \
     -d '{"organization_id":"<kompaniya id>"}' https://<worker>.up.railway.app/v1/jobs/reanalyze
```

Bu kalit **server kaliti**, uni React kodiga yoki brauzerga qo'ymang.

## Railway'ga joylash

1. `supabase/migrations/20261107000000_ai_worker.sql` serverdagi bazaga qo'llangan bo'lsin (CLAUDE.md dagi SSH usuli).
2. Kuchli tasodifiy ikki qiymat yarating (masalan `openssl rand -hex 32`):
   `WORKER_SECRET` va `WORKER_API_KEY`.
3. Serverdagi `/opt/salesiq/.env.server` ga `WORKER_SECRET` = 2-qadamdagi qiymat,
   keyin `systemctl restart salesiq`.
4. **Railway** → New Project → Deploy from GitHub repo → shu repo.
   - Settings → **Root Directory**: `services/ai-worker`
     (Dockerfile va `railway.json` shu yerdan topiladi).
   - Variables: `.env.example` dagilar — `SUPABASE_URL`,
     `SUPABASE_SERVICE_ROLE_KEY`, `APP_BASE_URL=https://salesiq.uz`,
     `WORKER_SECRET`, `WORKER_API_KEY`.
   - Replikalar soni: **1** (ikkita nusxa bir xil qo'ng'iroqlar uchun raqobat qiladi).
5. Deploy tugagach `https://<nom>.up.railway.app/health` → `{"status":"ok"}`,
   `/v1/queue` da `processed` o'sib boradi.

Render.com ham ishlaydi (Docker, Root Directory `services/ai-worker`,
Health Check Path `/health`). Lekin bepul tarifda xizmat 15 daqiqa ishlatilmasa
uxlab qoladi va navbat to'xtaydi — kamida pullik "Starter" tarif kerak.

## Mahalliy ishga tushirish va testlar

```bash
cd services/ai-worker
python -m venv .venv && . .venv/bin/activate
pip install -r requirements-dev.txt
cp .env.example .env   # qiymatlarni to'ldiring
uvicorn app.main:app --reload
pytest
```
