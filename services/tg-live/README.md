# SalesIQ tg-live

Marketing paneli uchun kichik xizmat: kompaniyaning Telegram akkaunti orqali
kanal efirida **nechta odam tomosha qilayotganini** o'qiydi va **efir kadrini**
(isbot-screenshot) oladi; kanalning **qo'shilish/chiqishlari** (so'nggi 48 soat)
va **Telegram statistikasini** o'qiydi; YouTube efirining haqiqiy kadrini
(yt-dlp + ffmpeg) kesib beradi. Telegram bu ma'lumotni botlarga bermaydi, shuning
uchun akkaunt (MTProto, Telethon) kerak.

- VPS'da `127.0.0.1:3100` da ishlaydi (`salesiq-tglive.service`), tashqaridan
  ochilmaydi. Uni faqat ilova chaqiradi (`x-tglive-secret` sarlavhasi bilan).
- Xizmat hech narsa saqlamaydi: akkaunt sessiyasini ilova bazada shifrlab
  saqlaydi (`marketing_tg_accounts`) va har so'rovda uzatadi.
- Ilova har daqiqada (`/crm/speed-to-lead` cron) "efirlarni kuzatish" yoqilgan
  kanallarni tekshiradi: efir boshlansa vebinar o'zi ochiladi, tomoshabinlar
  har daqiqada, kadr sozlangan oraliqda (Sozlash → Kuzatuv, standart 5 daqiqa)
  yoziladi. Kadr faqat RTMP efirda
  chiqadi; chiqmasa vaqt va son yozilgan isbot-kartochka saqlanadi.

## API

| Yo'l | Vazifa |
| --- | --- |
| `GET /health` | holat |
| `POST /v1/login/start {phone}` | Telegram'ga kod yuboradi → `{loginId}` |
| `POST /v1/login/code {login_id, code, password?}` | `{session, user}` yoki `{needPassword: true}` |
| `POST /v1/live {session, channel}` | `{live, participants, title, rtmp}` |
| `POST /v1/frame {session, channel}` | JPEG yoki 204 |
| `POST /v1/channel-stats {session, channel}` | Telegram statistikasi (grafiklar) yoki 403 (admin emas / 500 dan kam obunachi) |
| `POST /v1/admin-log {session, channel, since}` | `{events: [{at, kind, user, link, name}]}` yoki 403 |
| `POST /v1/youtube-frame {video_id}` | YouTube efirining joriy kadri (JPEG) yoki 204 |

## O'rnatish (bir marta)

1. https://my.telegram.org → API development tools → `api_id` va `api_hash`.
   Ularni `/opt/salesiq/.env.server` ga `TELEGRAM_API_ID=` va
   `TELEGRAM_API_HASH=` qilib qo'shing.
2. `bash /opt/salesiq/services/tg-live/install.sh` (yt-dlp'ni ham yangilaydi;
   YouTube o'zgarganda qayta ishga tushiring).

## Test

```bash
pip install -r requirements-dev.txt && pytest
```
