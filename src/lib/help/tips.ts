// The explainers behind every "!" (InfoTip): what a card, page or menu
// item is, how its figure is counted and what can be done there, in
// Uzbek, Russian and English. Keys: a card label's i18n key, "nav:<path>"
// for a menu item, "page:<path>" for a page. Loaded on demand
// (tips-loader.ts), so none of this is in the main bundle.
import type { L } from "./articles";

export type Tip = { what: L; calc?: L; act?: L };

export const TIPS: Record<string, Tip> = {
  "nav:/": {
    what: {
      uz: "Bosh sahifa — kompaniyaning bugungi holati: lidlar, sotuvlar, vazifalar, qo'ng'iroqlar va jamoa intizomi bir joyda.",
      ru: "Главная — состояние компании на сегодня: лиды, продажи, задачи, звонки и дисциплина команды в одном месте.",
      en: "Home — the company today: leads, sales, tasks, calls and team discipline in one place.",
    },
    calc: {
      uz: "Raqamlar tanlangan davr va voronka bo'yicha CRM'dagi lidlar, bitimlar va qo'ng'iroqlardan hisoblanadi; menejer faqat o'zinikini ko'radi.",
      ru: "Цифры считаются из лидов, сделок и звонков CRM за выбранный период и воронку; менеджер видит только свои.",
      en: "Figures come from the CRM's leads, deals and calls for the chosen period and funnel; a rep sees only their own.",
    },
    act: {
      uz: "Tablar: Ish stoli (asosiy ko'rsatkichlar, plan/fakt, kanallar, menejerlar), Umumiy, Konversiya, Reyting, Faollik, Prognoz, Moliya. Har bir kartaning ⚙️ belgisidan maqsad va ko'rinishni sozlang.",
      ru: "Вкладки: Рабочий стол (основные показатели, план/факт, каналы, менеджеры), Общее, Конверсия, Рейтинг, Активность, Прогноз, Финансы. Цель и вид карточки — через её ⚙️.",
      en: "Tabs: Desk (main figures, plan vs actual, channels, managers), Overview, Conversion, Rating, Activity, Forecast, Finance. Set a card's goal and view from its ⚙️.",
    },
  },
  "nav:/funnels": {
    what: {
      uz: "Voronkalar — lidlar bosqichma-bosqich kanban doskada: yangi lid kelishidan to'lovgacha.",
      ru: "Воронки — лиды по этапам на канбан-доске: от заявки до оплаты.",
      en: "Funnels — leads stage by stage on a kanban board, from the first request to payment.",
    },
    calc: {
      uz: "Har bir ustundagi son va summa — shu bosqichdagi ochiq lidlar va ularning byudjeti yig'indisi.",
      ru: "Число и сумма в колонке — открытые лиды этапа и сумма их бюджетов.",
      en: "Each column's count and sum are the open leads in that stage and their budgets added up.",
    },
    act: {
      uz: "Lidni sudrab bosqichini o'zgartiring, kartani ochib qo'ng'iroq qiling, vazifa qo'ying. Voronka sozlamalari — ⚙️ orqali.",
      ru: "Перетаскивайте лиды между этапами, открывайте карточку, звоните, ставьте задачи. Настройки воронки — через ⚙️.",
      en: "Drag leads between stages, open a card to call or set a task. Funnel settings are under ⚙️.",
    },
  },
  "nav:/inbox": {
    what: {
      uz: "Inbox — Telegram, Instagram va boshqa kanallardagi barcha mijoz yozishmalari bitta ro'yxatda.",
      ru: "Inbox — вся переписка с клиентами из Telegram, Instagram и других каналов в одном списке.",
      en: "Inbox — every client conversation from Telegram, Instagram and other channels in one list.",
    },
    act: {
      uz: "Javob bering, suhbatni lidga biriktiring, menejer tayinlang; javobsiz qolganlar tepada turadi.",
      ru: "Отвечайте, привязывайте диалог к лиду, назначайте менеджера; неотвеченные — сверху.",
      en: "Reply, link a chat to a lead, assign a manager; unanswered chats stay on top.",
    },
  },
  "nav:/audio-analytics": {
    what: {
      uz: "Audio tahlil — har bir qo'ng'iroqni AI tinglab baholaydi: sotuv bosqichlari, xatolar, natija.",
      ru: "Аудиоаналитика — ИИ слушает каждый звонок и оценивает: этапы продаж, ошибки, итог.",
      en: "Audio analysis — AI listens to every call and grades it: sales stages, mistakes, outcome.",
    },
    calc: {
      uz: "Baho 0–100: A ≥ 80, B 60–79, C 40–59, D < 40. Faqat uzunligi chegaradan oshgan suhbatlar tahlil qilinadi.",
      ru: "Оценка 0–100: A ≥ 80, B 60–79, C 40–59, D < 40. Анализируются разговоры длиннее порога.",
      en: "Score 0–100: A ≥ 80, B 60–79, C 40–59, D < 40. Only talks longer than the threshold are analysed.",
    },
    act: {
      uz: "Filtrlab menejer va davrni tanlang, kartani ochib xatolarni o'qing, Excel'ga yuklang.",
      ru: "Фильтруйте по менеджеру и периоду, открывайте карточку звонка, выгружайте в Excel.",
      en: "Filter by manager and period, open a call's card to read the mistakes, export to Excel.",
    },
  },
  "nav:/lead-analytics": {
    what: {
      uz: "Lid tahlili — lidlarning sifati, harorati (issiq/sovuq) va nima uchun yo'qotilgani.",
      ru: "Анализ лидов — качество лидов, их «температура» и причины потерь.",
      en: "Lead analysis — lead quality, temperature (hot/cold) and why leads were lost.",
    },
    calc: {
      uz: "AI har bir lidni yozishma va qo'ng'iroqlar bo'yicha teglaydi; foizlar — tanlangan davrdagi lidlar ichidagi ulush.",
      ru: "ИИ размечает лиды по переписке и звонкам; проценты — доля среди лидов периода.",
      en: "AI tags each lead from its chats and calls; percentages are shares of the period's leads.",
    },
    act: {
      uz: "Davr va voronkani tanlang, teg ustiga bosib o'sha lidlar ro'yxatini oching.",
      ru: "Выберите период и воронку, нажмите на тег, чтобы открыть эти лиды.",
      en: "Pick the period and funnel, click a tag to open those leads.",
    },
  },
  "nav:/attendance": {
    what: {
      uz: "Nazorat — jamoa intizomi: davomat (keldi/ketdi), normativlar, eslatmalar, jarimalar va KPI.",
      ru: "Контроль — дисциплина команды: посещаемость, нормативы, напоминания, штрафы и KPI.",
      en: "Control — team discipline: attendance, targets, reminders, fines and KPI.",
    },
    calc: {
      uz: "Ish boshlanishi tugma, birinchi qo'ng'iroq yoki xabar bo'yicha belgilanadi (Admin → Davomat sozlamasi).",
      ru: "Начало дня отмечается кнопкой, первым звонком или сообщением (Админ → Посещаемость).",
      en: "The work start is marked by a button, the first call or message (Admin → Attendance).",
    },
    act: {
      uz: "Tablarni almashtiring, kechikkanlarni ko'ring, normativ va jarima qoidalarini ⚙️ orqali sozlang.",
      ru: "Переключайте вкладки, смотрите опоздавших, правила нормативов и штрафов — через ⚙️.",
      en: "Switch tabs, see who is late, set targets and fine rules from ⚙️.",
    },
  },
  "nav:/content-library": {
    what: {
      uz: "Sinfxona — jamoani o'qitish: darslar, skriptlar, testlar va mentor.",
      ru: "Учебный класс — обучение команды: уроки, скрипты, тесты и наставник.",
      en: "Classroom — team training: lessons, scripts, tests and a mentor.",
    },
    act: {
      uz: "Dars qo'shing, xodimga biriktiring, kim qancha o'tganini kuzating.",
      ru: "Добавляйте уроки, назначайте сотрудникам, отслеживайте прогресс.",
      en: "Add lessons, assign them to people, track who finished what.",
    },
  },
  "nav:/ai-assistant": {
    what: {
      uz: "AI yordamchi — platforma bo'yicha savollarga javob beradi va ma'lumotlaringizni tahlil qiladi.",
      ru: "ИИ-помощник — отвечает на вопросы о платформе и анализирует ваши данные.",
      en: "AI assistant — answers questions about the platform and analyses your data.",
    },
    act: {
      uz: "Savolni oddiy tilda yozing; kerak bo'lsa «Operator» tabidan jonli yordamga yozing.",
      ru: "Пишите вопрос обычным языком; для живой поддержки — вкладка «Оператор».",
      en: "Ask in plain words; for live help use the «Operator» tab.",
    },
  },
  "nav:/settings": {
    what: {
      uz: "Sozlamalar — shaxsiy profil, bildirishnomalar, til va mavzu, kompaniya biznes ma'lumotlari.",
      ru: "Настройки — профиль, уведомления, язык и тема, данные компании.",
      en: "Settings — your profile, notifications, language and theme, company details.",
    },
  },
  "nav:/admin": {
    what: {
      uz: "Admin panel — kompaniyaning barcha sozlamalari: xodimlar, huquqlar, voronkalar, integratsiyalar, avtomatlar.",
      ru: "Админ-панель — все настройки компании: сотрудники, права, воронки, интеграции, автоматизации.",
      en: "Admin panel — every company setting: staff, permissions, funnels, integrations, automations.",
    },
    act: {
      uz: "Kerakli kartani bosing — har biri alohida sahifada ochiladi. Faqat super admin va ROP ko'radi.",
      ru: "Нажмите нужную карточку — каждая открывается отдельной страницей. Видят только супер-админ и РОП.",
      en: "Click a card — each opens its own page. Only the super admin and head of sales see it.",
    },
  },
  "nav:/invoices": {
    what: {
      uz: "Hisob-fakturalar — mijozlarga chiqarilgan hisoblar va ularning to'lov holati.",
      ru: "Счета — выставленные клиентам счета и статус их оплаты.",
      en: "Invoices — bills issued to clients and whether they were paid.",
    },
    act: {
      uz: "Yangi hisob yarating, PDF yuboring, to'langanini belgilang.",
      ru: "Создавайте счёт, отправляйте PDF, отмечайте оплату.",
      en: "Create an invoice, send the PDF, mark it paid.",
    },
  },
  "nav:/platform/companies": {
    what: {
      uz: "Kompaniyalar — platformaga ulangan barcha kompaniyalar: tarif, xodimlar soni, holat.",
      ru: "Компании — все подключённые компании: тариф, число сотрудников, статус.",
      en: "Companies — every company on the platform: plan, staff count, status.",
    },
    act: {
      uz: "«Kirish» — kompaniyaga super admin sifatida kirish; «Boshqarish» — tarif, muzlatish, integratsiyalar.",
      ru: "«Войти» — зайти в компанию как супер-админ; «Управление» — тариф, заморозка, интеграции.",
      en: "«Enter» signs you in as the company's super admin; «Manage» covers plan, freezing, integrations.",
    },
  },
  "nav:/platform/applications": {
    what: {
      uz: "Arizalar — saytdan kelgan yangi mijoz arizalari va ularning savdo bosqichi.",
      ru: "Заявки — новые заявки клиентов с сайта и их этап продажи.",
      en: "Applications — new client requests from the website and their sales stage.",
    },
    act: {
      uz: "Arizani oching, qo'ng'iroq natijasini yozing, bosqichini o'zgartiring.",
      ru: "Откройте заявку, запишите итог звонка, смените этап.",
      en: "Open a request, log the call result, move its stage.",
    },
  },
  "nav:/platform/revenue": {
    what: {
      uz: "Daromad — platforma obunalaridan tushum: MRR, churn, LTV, sinovdan to'lovga o'tish.",
      ru: "Доход — выручка подписок платформы: MRR, отток, LTV, переход из триала в оплату.",
      en: "Revenue — subscription income: MRR, churn, LTV, trial-to-paid.",
    },
    calc: {
      uz: "To'lovlar Payme/Click va qo'lda kiritilgan to'lovlardan; MRR — faol to'lovchi kompaniyalarning oylik tarif summasi.",
      ru: "Из платежей Payme/Click и ручных; MRR — сумма месячных тарифов платящих компаний.",
      en: "From Payme/Click and manual payments; MRR is the monthly plan price of every paying company added up.",
    },
  },
  "nav:/platform/partners": {
    what: {
      uz: "Hamkorlar — taklif dasturi: kim kimni olib keldi, nechtasi to'lovchi bo'ldi, qancha komissiya.",
      ru: "Партнёры — реферальная программа: кто кого привёл, сколько стали платящими, комиссия.",
      en: "Partners — the referral programme: who invited whom, how many pay, the commission.",
    },
    act: {
      uz: "Hamkor qo'shing, uning havolasini bering, komissiyani to'langan deb belgilang.",
      ru: "Добавьте партнёра, выдайте ссылку, отметьте выплату комиссии.",
      en: "Add a partner, give them their link, mark the commission paid.",
    },
  },
  "nav:/platform/sessions": {
    what: {
      uz: "Tashriflar — platformaga har bir kirish: kim, qaysi kompaniya, qurilma, shahar va ichkarida nima qilgan.",
      ru: "Визиты — каждый вход: кто, какая компания, устройство, город и что делал внутри.",
      en: "Visits — every sign-in: who, which company, device, city and what they did inside.",
    },
    calc: {
      uz: "Bitta brauzer oynasi seansi — bitta tashrif; 30 kundan eskilari o'chiriladi.",
      ru: "Одна сессия вкладки браузера — один визит; старше 30 дней удаляются.",
      en: "One browser-tab session is one visit; visits older than 30 days are removed.",
    },
    act: {
      uz: "Kartani bosib vaqt chizig'ini oching; shubhali seansni «Seansni yopish» bilan tugating.",
      ru: "Откройте карточку для хронологии; подозрительную сессию завершите кнопкой «Закрыть сессию».",
      en: "Open a card for its timeline; end a suspicious one with «Close session».",
    },
  },
  "nav:/platform/actions": {
    what: {
      uz: "Amallar — barcha kompaniyalardagi muhim o'zgarishlar jurnali: kim, nima, qachon.",
      ru: "Действия — журнал важных изменений во всех компаниях: кто, что, когда.",
      en: "Actions — a log of important changes in every company: who, what, when.",
    },
    act: {
      uz: "Kompaniya, odam yoki amal turi bo'yicha filtrlang.",
      ru: "Фильтруйте по компании, человеку или типу действия.",
      en: "Filter by company, person or kind of action.",
    },
  },
  "nav:/platform/errors": {
    what: {
      uz: "Xatolar — server va brauzer xatolari, sekin so'rovlar; har biri Telegram'ga ham keladi.",
      ru: "Ошибки — ошибки сервера и браузера, медленные запросы; каждая приходит и в Telegram.",
      en: "Errors — server and browser errors and slow requests; each is also sent to Telegram.",
    },
    act: {
      uz: "Xatoni ochib tafsilotini o'qing, tuzatilgach «Hal qilindi» deb belgilang.",
      ru: "Откройте ошибку, прочитайте детали, после исправления отметьте «Решено».",
      en: "Open an error for details and mark it resolved once fixed.",
    },
  },
  "nav:/platform/support": {
    what: {
      uz: "Yordam — kompaniyalarning «Operator» orqali yozgan savollari; Telegram'da reply qilib ham javob berasiz.",
      ru: "Поддержка — вопросы компаний через «Оператор»; отвечать можно и реплаем в Telegram.",
      en: "Support — questions companies send through «Operator»; you can also reply in Telegram.",
    },
    act: {
      uz: "Kutayotgan suhbatni oching va javob yozing — javob mijozning ochiq oynasiga darhol yetadi.",
      ru: "Откройте ожидающий диалог и ответьте — ответ сразу придёт в открытое окно клиента.",
      en: "Open a waiting chat and answer — it reaches the client's open window at once.",
    },
  },
  "nav:/platform/notifications": {
    what: {
      uz: "So'rovlar — kompaniyalardan obunani uzaytirish va tarif o'zgartirish so'rovlari.",
      ru: "Запросы — запросы компаний на продление подписки и смену тарифа.",
      en: "Requests — companies asking to renew or change their plan.",
    },
    act: {
      uz: "So'rovni tasdiqlang yoki rad eting; tasdiqlansa muddat avtomatik uzayadi.",
      ru: "Одобрите или отклоните запрос; при одобрении срок продлится сам.",
      en: "Approve or decline; an approval extends the term automatically.",
    },
  },
  "nav:/platform/announcements": {
    what: {
      uz: "E'lonlar — barcha kompaniyalarga platforma ichida (va Telegram'da) ko'rinadigan xabarlar.",
      ru: "Объявления — сообщения всем компаниям внутри платформы (и в Telegram).",
      en: "Announcements — messages shown to every company inside the platform (and on Telegram).",
    },
    act: {
      uz: "Yangi e'lon yozing, kimga va qachongacha ko'rinishini tanlang.",
      ru: "Напишите объявление, выберите кому и до какого числа показывать.",
      en: "Write an announcement, choose who sees it and until when.",
    },
  },
  "nav:/platform/bot": {
    what: {
      uz: "Botlar — platformaning 3 ta Telegram boti (mijozlar, xodimlar, nazoratchi) va kompaniyalar holati.",
      ru: "Боты — 3 Telegram-бота платформы (клиенты, сотрудники, мониторинг) и состояние компаний.",
      en: "Bots — the platform's three Telegram bots (clients, staff, monitoring) and company health.",
    },
    act: {
      uz: "Har bir bot tokenini shu yerda saqlang; nazoratchi bot hisobotini qo'lda yuborish mumkin.",
      ru: "Сохраняйте токен каждого бота здесь; отчёт мониторинга можно отправить вручную.",
      en: "Save each bot's token here; the monitoring report can be sent by hand.",
    },
  },
  "nav:/platform/users": {
    what: {
      uz: "Akkauntlar — platformadagi barcha foydalanuvchilar: rol, kompaniya, oxirgi kirish.",
      ru: "Аккаунты — все пользователи платформы: роль, компания, последний вход.",
      en: "Accounts — every user on the platform: role, company, last sign-in.",
    },
    act: {
      uz: "Parolni tiklang, rolini o'zgartiring yoki akkauntni o'chiring.",
      ru: "Сбросьте пароль, смените роль или удалите аккаунт.",
      en: "Reset a password, change a role or delete an account.",
    },
  },
  "nav:/platform/integrations": {
    what: {
      uz: "Integratsiya — barcha kompaniyalarning ulangan xizmatlari (amoCRM, telefoniya, Instagram…) va xatolari.",
      ru: "Интеграции — подключённые сервисы всех компаний (amoCRM, телефония, Instagram…) и их ошибки.",
      en: "Integrations — every company's connected services (amoCRM, telephony, Instagram…) and their errors.",
    },
    act: {
      uz: "Muammoli integratsiyani to'xtatib turing yoki qayta ishga tushiring.",
      ru: "Приостановите проблемную интеграцию или перезапустите.",
      en: "Pause a failing integration or restart it.",
    },
  },
  "nav:/platform/settings": {
    what: {
      uz: "Sozlamalar — platformaning umumiy sozlamalari: to'lov kassasi, rekvizitlar, aloqa, AI, xavfsizlik, zaxira.",
      ru: "Настройки — общие настройки платформы: касса, реквизиты, контакты, ИИ, безопасность, резервная копия.",
      en: "Settings — platform-wide settings: cashbox, requisites, contacts, AI, security, backup.",
    },
  },
  "nav:/marketing": {
    what: {
      uz: "Umumiy — marketing ko'rsatkichlari: yangi lidlar, issiq lidlar, AI bahosi, reklama xarajati, lid narxi, ROI.",
      ru: "Общее — показатели маркетинга: новые и горячие лиды, оценка ИИ, расход, цена лида, ROI.",
      en: "Overview — marketing figures: new and hot leads, AI score, ad spend, cost per lead, ROI.",
    },
    calc: {
      uz: "Davr va loyiha filtri bo'yicha CRM lidlari va ulangan reklama kabinetlaridan hisoblanadi.",
      ru: "Считается из лидов CRM и подключённых рекламных кабинетов по периоду и проекту.",
      en: "Counted from CRM leads and connected ad accounts for the chosen period and project.",
    },
  },
  "nav:/marketing/ads": {
    what: {
      uz: "Reklama — Meta (Facebook/Instagram) kampaniyalari: xarajat, lidlar, lid narxi va sifati.",
      ru: "Реклама — кампании Meta (Facebook/Instagram): расход, лиды, цена и качество лида.",
      en: "Ads — Meta (Facebook/Instagram) campaigns: spend, leads, cost and quality per lead.",
    },
    act: {
      uz: "Kabinetni ulang, kampaniyani bosib uning lidlarini ko'ring.",
      ru: "Подключите кабинет, нажмите на кампанию, чтобы увидеть её лиды.",
      en: "Connect an ad account, click a campaign to see its leads.",
    },
  },
  "nav:/marketing/quality": {
    what: {
      uz: "Lid sifati — AI har bir lidga 0–100 baho beradi: issiq, iliq yoki sovuq.",
      ru: "Качество лидов — ИИ ставит каждому лиду оценку 0–100: горячий, тёплый или холодный.",
      en: "Lead quality — AI scores every lead 0–100: hot, warm or cold.",
    },
    calc: {
      uz: "Baho lidning yozishmasi, qo'ng'iroqlari va bosqichidan; issiq ≥ 70, sovuq < 40.",
      ru: "Оценка — по переписке, звонкам и этапу лида; горячий ≥ 70, холодный < 40.",
      en: "From the lead's chats, calls and stage; hot ≥ 70, cold < 40.",
    },
  },
  "nav:/marketing/channels": {
    what: {
      uz: "Kanallar — Telegram kanallaringiz: obunachilar, qo'shilgan va chiqib ketganlar, eng faol soatlar.",
      ru: "Каналы — ваши Telegram-каналы: подписчики, пришедшие и ушедшие, активные часы.",
      en: "Channels — your Telegram channels: subscribers, joins and leaves, busiest hours.",
    },
    act: {
      uz: "Kanal qo'shing va kartasini bosib to'liq analitikani oching.",
      ru: "Добавьте канал и откройте его карточку для полной аналитики.",
      en: "Add a channel and open its card for the full analytics.",
    },
  },
  "nav:/marketing/webinars": {
    what: {
      uz: "Vebinarlar — efirlar (YouTube/Telegram): ro'yxatdan o'tganlar, eng ko'p tomoshabin, efir rasmlari.",
      ru: "Вебинары — эфиры (YouTube/Telegram): регистрации, пик зрителей, кадры эфира.",
      en: "Webinars — live streams (YouTube/Telegram): sign-ups, peak viewers, stream snapshots.",
    },
  },
  "nav:/marketing/settings": {
    what: {
      uz: "Sozlash — marketing paneli sozlamalari: loyihalar, manbalar, sayt hisoblagichi, kuzatuv oralig'i.",
      ru: "Настройки — проекты, источники, счётчик сайта, интервалы отслеживания.",
      en: "Settings — projects, sources, the website counter, tracking intervals.",
    },
  },
  "pc.statAll": {
    what: {
      uz: "Platformaga ulangan barcha kompaniyalar soni.",
      ru: "Сколько всего компаний на платформе.",
      en: "How many companies are on the platform.",
    },
    calc: {
      uz: "Barcha yozuvlar (faol, faol emas va muzlatilgan); izohda — oxirgi 30 kunda qo'shilganlar.",
      ru: "Все записи (активные, неактивные, замороженные); в подписи — новые за 30 дней.",
      en: "Every company (active, inactive, frozen); the note shows those added in the last 30 days.",
    },
    act: {
      uz: "Pastdagi ro'yxatdan kompaniyani toping, «Kirish» yoki «Boshqarish» ni bosing.",
      ru: "Найдите компанию в списке ниже и нажмите «Войти» или «Управление».",
      en: "Find a company in the list below and click «Enter» or «Manage».",
    },
  },
  "pc.statActive": {
    what: {
      uz: "Hozir ishlayotgan (obunasi yoki sinovi amal qilayotgan) kompaniyalar.",
      ru: "Компании, которые сейчас работают (подписка или триал активны).",
      en: "Companies working now (subscription or trial active).",
    },
    calc: {
      uz: "active = true bo'lgan kompaniyalar soni.",
      ru: "Число компаний с active = true.",
      en: "Companies with active = true.",
    },
  },
  "pc.statInactive": {
    what: {
      uz: "O'chirilgan yoki muddati tugagan kompaniyalar.",
      ru: "Отключённые компании и компании с истёкшим сроком.",
      en: "Switched-off companies and those whose term ended.",
    },
    calc: {
      uz: "active = false; izohda — ulardan muzlatilganlari.",
      ru: "active = false; в подписи — из них замороженные.",
      en: "active = false; the note shows how many of them are frozen.",
    },
    act: {
      uz: "Kompaniyani «Boshqarish» orqali qayta yoqing yoki muddatini uzaytiring.",
      ru: "Включите компанию снова через «Управление» или продлите срок.",
      en: "Turn a company back on or extend its term via «Manage».",
    },
  },
  "pc.statPeople": {
    what: {
      uz: "Barcha kompaniyalardagi foydalanuvchilar (xodim akkauntlari) soni.",
      ru: "Число пользователей (аккаунтов сотрудников) во всех компаниях.",
      en: "Users (staff accounts) across all companies.",
    },
    calc: {
      uz: "Har bir kompaniyaning xodimlari yig'indisi.",
      ru: "Сумма сотрудников всех компаний.",
      en: "Each company's staff added up.",
    },
  },
  "apps.statNew": {
    what: {
      uz: "Hali ishlanmagan yangi arizalar.",
      ru: "Новые необработанные заявки.",
      en: "New requests nobody has worked yet.",
    },
    calc: {
      uz: "«Yangi» bosqichidagi arizalar soni.",
      ru: "Заявки на этапе «Новая».",
      en: "Requests in the «New» stage.",
    },
    act: {
      uz: "Arizani oching va mijozga qo'ng'iroq qiling.",
      ru: "Откройте заявку и позвоните клиенту.",
      en: "Open a request and call the client.",
    },
  },
  "apps.statPipeline": {
    what: {
      uz: "Ish jarayonidagi arizalar (bog'lanilgan, demo, kutilmoqda…).",
      ru: "Заявки в работе (связались, демо, ожидание…).",
      en: "Requests in progress (contacted, demo, waiting…).",
    },
    calc: {
      uz: "Yangi va yopilganlardan tashqari barcha bosqichlar.",
      ru: "Все этапы, кроме новых и закрытых.",
      en: "Every stage except new and closed.",
    },
  },
  "apps.statWon": {
    what: {
      uz: "Kompaniya ochilgan (yutilgan) arizalar.",
      ru: "Заявки, по которым открыта компания (выиграно).",
      en: "Requests that became a company (won).",
    },
    calc: {
      uz: "«Yutildi» bosqichidagi arizalar soni.",
      ru: "Заявки на этапе «Выиграно».",
      en: "Requests in the «Won» stage.",
    },
  },
  "apps.statPaid": {
    what: {
      uz: "Arizadan kelib to'lov qilgan kompaniyalar.",
      ru: "Компании из заявок, которые оплатили.",
      en: "Companies from requests that have paid.",
    },
    calc: {
      uz: "Ariza bilan bog'langan va kamida bitta to'lovi bor kompaniyalar.",
      ru: "Компании из заявок хотя бы с одной оплатой.",
      en: "Companies linked to a request with at least one payment.",
    },
  },
  "rev.mrr": {
    what: {
      uz: "MRR — har oy takrorlanadigan obuna tushumi.",
      ru: "MRR — ежемесячная повторяющаяся выручка подписок.",
      en: "MRR — the subscription income that recurs every month.",
    },
    calc: {
      uz: "Faol to'lovchi kompaniyalarning oylik tarif narxlari yig'indisi (yillik tarif ÷ 12).",
      ru: "Сумма месячных цен тарифов платящих компаний (годовой ÷ 12).",
      en: "The monthly plan prices of every paying company added up (yearly ÷ 12).",
    },
    act: {
      uz: "Pasaysa — churn va muzlatilganlarni tekshiring.",
      ru: "Если падает — проверьте отток и заморозки.",
      en: "If it drops, look at churn and frozen companies.",
    },
  },
  "rev.paying": {
    what: {
      uz: "Hozir pul to'layotgan kompaniyalar.",
      ru: "Компании, которые сейчас платят.",
      en: "Companies paying right now.",
    },
    calc: {
      uz: "Faol, sinovda bo'lmagan va obunasi to'langan kompaniyalar.",
      ru: "Активные, не на триале, с оплаченной подпиской.",
      en: "Active, not on trial, with a paid subscription.",
    },
  },
  "rev.trials": {
    what: {
      uz: "Hozir bepul sinov davridagi kompaniyalar.",
      ru: "Компании на бесплатном пробном периоде.",
      en: "Companies on the free trial now.",
    },
    calc: {
      uz: "is_trial = true va sinov muddati tugamagan.",
      ru: "is_trial = true и пробный срок не истёк.",
      en: "is_trial = true with the trial not over.",
    },
    act: {
      uz: "Sinovdagilarga qo'ng'iroq qiling — ular eng yaqin to'lovchilar.",
      ru: "Позвоните триальным — это ближайшие платящие.",
      en: "Call trial companies — they are your next payers.",
    },
  },
  "rev.conversion": {
    what: {
      uz: "Sinovdan to'lovga o'tganlar ulushi.",
      ru: "Доля перешедших из триала в оплату.",
      en: "Share of trials that became paying.",
    },
    calc: {
      uz: "Sinovni boshlagan kompaniyalardan to'lov qilganlar ÷ sinovni tugatganlar × 100%.",
      ru: "Оплатившие ÷ завершившие триал × 100%.",
      en: "Paid ÷ trials that ended × 100%.",
    },
  },
  "rev.churn": {
    what: {
      uz: "Churn — oxirgi 30 kunda to'lashni to'xtatganlar.",
      ru: "Отток — перестали платить за 30 дней.",
      en: "Churn — companies that stopped paying in the last 30 days.",
    },
    calc: {
      uz: "30 kunda ketgan to'lovchilar ÷ 30 kun oldingi to'lovchilar × 100%.",
      ru: "Ушедшие за 30 дней ÷ платящие 30 дней назад × 100%.",
      en: "Payers lost in 30 days ÷ payers 30 days ago × 100%.",
    },
    act: {
      uz: "Ketganlar bilan bog'lanib sababini so'rang.",
      ru: "Свяжитесь с ушедшими и узнайте причину.",
      en: "Contact those who left and ask why.",
    },
  },
  "rev.ltv": {
    what: {
      uz: "LTV — bitta mijoz butun davomida keltiradigan o'rtacha tushum.",
      ru: "LTV — средняя выручка с клиента за всё время.",
      en: "LTV — the average income one customer brings over their lifetime.",
    },
    calc: {
      uz: "O'rtacha oylik to'lov ÷ oylik churn.",
      ru: "Средний месячный платёж ÷ месячный отток.",
      en: "Average monthly payment ÷ monthly churn.",
    },
  },
  "rev.collected30": {
    what: {
      uz: "Oxirgi 30 kunda haqiqatan tushgan pul.",
      ru: "Реально полученные деньги за 30 дней.",
      en: "Money actually received in the last 30 days.",
    },
    calc: {
      uz: "Payme, Click va qo'lda kiritilgan to'lovlar yig'indisi.",
      ru: "Сумма платежей Payme, Click и ручных.",
      en: "Payme, Click and manual payments added up.",
    },
  },
  "rev.frozen": {
    what: {
      uz: "Muzlatilgan (vaqtincha to'xtatilgan) kompaniyalar.",
      ru: "Замороженные (приостановленные) компании.",
      en: "Frozen (paused) companies.",
    },
    calc: {
      uz: "frozen_at belgilangan kompaniyalar; muzlatilgan kunlar ochilganda qaytariladi.",
      ru: "Компании с frozen_at; дни заморозки возвращаются при разморозке.",
      en: "Companies with frozen_at; the frozen days are credited back on unfreezing.",
    },
  },
  "partners.statReferrals": {
    what: {
      uz: "Hamkorlar havolasi orqali ro'yxatdan o'tgan kompaniyalar.",
      ru: "Компании, зарегистрированные по ссылкам партнёров.",
      en: "Companies that signed up through partners' links.",
    },
  },
  "partners.statCompanies": {
    what: {
      uz: "Kamida bitta kompaniya olib kelgan hamkorlar.",
      ru: "Партнёры, приведшие хотя бы одну компанию.",
      en: "Partners who brought at least one company.",
    },
  },
  "partners.statPaid": {
    what: {
      uz: "Taklif qilinganlardan to'lov qilganlari.",
      ru: "Приглашённые, которые начали платить.",
      en: "Invited companies that started paying.",
    },
    calc: {
      uz: "Birinchi Payme/Click to'lovi bo'lgan taklif qilingan kompaniyalar.",
      ru: "Приглашённые с первым платежом Payme/Click.",
      en: "Invited companies with a first Payme/Click payment.",
    },
  },
  "partners.statUnpaid": {
    what: {
      uz: "Hamkorlarga hali to'lanmagan komissiya.",
      ru: "Комиссия партнёрам, ещё не выплаченная.",
      en: "Commission not yet paid to partners.",
    },
    calc: {
      uz: "To'lovlar × hamkor foizi − to'langan komissiya.",
      ru: "Платежи × процент партнёра − выплаченное.",
      en: "Payments × partner's rate − commission already paid.",
    },
    act: {
      uz: "Komissiyani to'lab, «To'landi» deb belgilang.",
      ru: "Выплатите и отметьте «Выплачено».",
      en: "Pay it and mark it paid.",
    },
  },
  "ref.statInvited": {
    what: {
      uz: "Sizning havolangiz orqali ro'yxatdan o'tgan kompaniyalar.",
      ru: "Компании, зарегистрированные по вашей ссылке.",
      en: "Companies that signed up with your link.",
    },
    act: {
      uz: "Havolani nusxalab tanishlaringizga yuboring.",
      ru: "Скопируйте ссылку и отправьте знакомым.",
      en: "Copy your link and send it to people you know.",
    },
  },
  "ref.statPaid": {
    what: {
      uz: "Taklif qilganlaringizdan to'lov qilganlari.",
      ru: "Приглашённые вами, которые оплатили.",
      en: "Companies you invited that have paid.",
    },
  },
  "ref.statDays": {
    what: {
      uz: "Takliflar uchun olingan bepul kunlar.",
      ru: "Бесплатные дни, полученные за приглашения.",
      en: "Free days earned for invitations.",
    },
    calc: {
      uz: "Har bir to'lov qilgan taklif uchun +30 kun.",
      ru: "+30 дней за каждого оплатившего приглашённого.",
      en: "+30 days for each invited company that pays.",
    },
  },
  "oa.statActions": {
    what: {
      uz: "Tanlangan davrdagi muhim amallar soni.",
      ru: "Число важных действий за период.",
      en: "Important actions in the period.",
    },
  },
  "oa.statPeople": {
    what: {
      uz: "Amal bajargan turli odamlar soni.",
      ru: "Сколько разных людей совершали действия.",
      en: "How many different people acted.",
    },
  },
  "oa.statPages": {
    what: {
      uz: "Ochilgan sahifalar soni.",
      ru: "Сколько страниц было открыто.",
      en: "Pages opened.",
    },
  },
  "oa.statFailed": {
    what: {
      uz: "Bajarilmay qolgan urinishlar (xato yoki ruxsat yo'q).",
      ru: "Неудачные попытки (ошибка или нет доступа).",
      en: "Attempts that failed (an error or no permission).",
    },
    act: {
      uz: "Ko'p bo'lsa — kim va qaysi sahifada ekanini filtrlab ko'ring.",
      ru: "Если много — отфильтруйте, кто и на какой странице.",
      en: "If many, filter to see who and on which page.",
    },
  },
  "monitoring.serverErrors24h": {
    what: {
      uz: "Oxirgi 24 soatdagi server xatolari (5xx).",
      ru: "Ошибки сервера (5xx) за 24 часа.",
      en: "Server errors (5xx) in the last 24 hours.",
    },
    act: {
      uz: "Xatoni ochib qaysi so'rovda bo'lganini ko'ring.",
      ru: "Откройте ошибку и посмотрите запрос.",
      en: "Open an error to see the request it happened in.",
    },
  },
  "monitoring.slowRequests24h": {
    what: {
      uz: "24 soatda sekin javob bergan so'rovlar.",
      ru: "Медленные запросы за 24 часа.",
      en: "Slow requests in 24 hours.",
    },
    calc: {
      uz: "Belgilangan chegaradan uzoq davom etgan foydalanuvchi so'rovlari.",
      ru: "Запросы пользователей дольше порога.",
      en: "Person-facing requests that took longer than the limit.",
    },
  },
  "monitoring.clientErrors24h": {
    what: {
      uz: "24 soatda foydalanuvchilar brauzerida yuz bergan xatolar.",
      ru: "Ошибки в браузерах пользователей за 24 часа.",
      en: "Errors in people's browsers in 24 hours.",
    },
  },
  "support.statWaiting": {
    what: {
      uz: "Javob kutayotgan savollar.",
      ru: "Вопросы, ждущие ответа.",
      en: "Questions waiting for an answer.",
    },
    act: {
      uz: "Suhbatni oching va javob bering.",
      ru: "Откройте диалог и ответьте.",
      en: "Open the chat and answer.",
    },
  },
  "support.statQuestions": {
    what: {
      uz: "Oxirgi 30 kundagi savollar soni.",
      ru: "Число вопросов за 30 дней.",
      en: "Questions in the last 30 days.",
    },
  },
  "support.statAnswered": {
    what: { uz: "Javob berilgan savollar.", ru: "Отвеченные вопросы.", en: "Questions answered." },
  },
  "support.statAvg": {
    what: {
      uz: "Birinchi javobgacha o'rtacha vaqt.",
      ru: "Среднее время до первого ответа.",
      en: "Average time to the first answer.",
    },
    calc: {
      uz: "Savol kelgan paytdan birinchi javobgacha o'tgan vaqtlar o'rtachasi.",
      ru: "Среднее от вопроса до первого ответа.",
      en: "The average from a question to its first answer.",
    },
  },
  "or.pending": {
    what: {
      uz: "Ko'rib chiqilmagan so'rovlar.",
      ru: "Нерассмотренные запросы.",
      en: "Requests not handled yet.",
    },
    act: {
      uz: "So'rovni tasdiqlang yoki rad eting.",
      ru: "Одобрите или отклоните.",
      en: "Approve or decline it.",
    },
  },
  "or.resolvedMonth": {
    what: {
      uz: "30 kunda hal qilingan so'rovlar.",
      ru: "Запросы, решённые за 30 дней.",
      en: "Requests handled in 30 days.",
    },
  },
  "or.newOrgs": {
    what: {
      uz: "Yangi qo'shilgan kompaniyalar.",
      ru: "Новые компании.",
      en: "Newly added companies.",
    },
  },
  "or.errors": {
    what: { uz: "Hal qilinmagan xatolar.", ru: "Нерешённые ошибки.", en: "Unresolved errors." },
  },
  "ann.statTotal": {
    what: { uz: "Barcha e'lonlar.", ru: "Все объявления.", en: "All announcements." },
  },
  "ann.statLive": {
    what: {
      uz: "Hozir ko'rinib turgan e'lonlar.",
      ru: "Объявления, которые сейчас показываются.",
      en: "Announcements showing now.",
    },
  },
  "ann.statTg": {
    what: {
      uz: "Telegram'ga ham yuborilgan e'lonlar.",
      ru: "Объявления, отправленные и в Telegram.",
      en: "Announcements also sent to Telegram.",
    },
  },
  "ann.statClosed": {
    what: {
      uz: "E'lonni yopgan odamlar soni.",
      ru: "Сколько людей закрыли объявление.",
      en: "How many people closed an announcement.",
    },
  },
  "pint.statCompanies": {
    what: {
      uz: "Kamida bitta integratsiyasi bor kompaniyalar.",
      ru: "Компании хотя бы с одной интеграцией.",
      en: "Companies with at least one integration.",
    },
  },
  "pint.statConnected": {
    what: {
      uz: "Ulangan integratsiyalar soni.",
      ru: "Число подключённых интеграций.",
      en: "Connected integrations.",
    },
  },
  "pint.statProblems": {
    what: {
      uz: "Xato berayotgan integratsiyalar.",
      ru: "Интеграции с ошибками.",
      en: "Integrations with errors.",
    },
    act: {
      uz: "Kompaniyani oching va integratsiyani qayta ulang yoki to'xtating.",
      ru: "Откройте компанию, переподключите или приостановите.",
      en: "Open the company and reconnect or pause it.",
    },
  },
  "pint.statPaused": {
    what: {
      uz: "To'xtatib turilgan integratsiyalar.",
      ru: "Приостановленные интеграции.",
      en: "Paused integrations.",
    },
  },
  "ops.statCompanies": {
    what: {
      uz: "Muammosiz ishlayotgan kompaniyalar / jami.",
      ru: "Компании без проблем / всего.",
      en: "Companies working without problems / all.",
    },
    calc: {
      uz: "Integratsiya, to'lov va AI navbatida muammosi yo'q kompaniyalar.",
      ru: "Без проблем с интеграциями, оплатой и очередью ИИ.",
      en: "No issues with integrations, payment or the AI queue.",
    },
  },
  "ops.statErrors": {
    what: {
      uz: "24 soatdagi server xatolari.",
      ru: "Ошибки сервера за 24 часа.",
      en: "Server errors in 24 hours.",
    },
  },
  "ops.statAi": {
    what: {
      uz: "AI tahlilini kutayotgan qo'ng'iroqlar.",
      ru: "Звонки в очереди на анализ ИИ.",
      en: "Calls waiting for AI analysis.",
    },
  },
  "obots.backup": {
    what: {
      uz: "Serverdagi tungi to'liq zaxira holati.",
      ru: "Состояние ночного полного бэкапа на сервере.",
      en: "The server's nightly full backup.",
    },
  },
  "an.newLeads": {
    what: {
      uz: "Tanlangan davrda yaratilgan lidlar.",
      ru: "Лиды, созданные за период.",
      en: "Leads created in the period.",
    },
    calc: {
      uz: "created_at davr ichida bo'lgan lidlar soni (voronka filtri bilan).",
      ru: "Число лидов с created_at в периоде (с учётом воронки).",
      en: "Leads whose created_at falls in the period (funnel filter applied).",
    },
  },
  "an.won": {
    what: {
      uz: "Davrda yutilgan (to'langan) bitimlar.",
      ru: "Выигранные (оплаченные) сделки за период.",
      en: "Deals won (paid) in the period.",
    },
    calc: {
      uz: "Yutuq bosqichiga o'tgan lidlar soni.",
      ru: "Лиды, перешедшие на этап «успех».",
      en: "Leads moved to a won stage.",
    },
  },
  "an.lost": {
    what: {
      uz: "Davrda yo'qotilgan lidlar.",
      ru: "Потерянные лиды за период.",
      en: "Leads lost in the period.",
    },
    calc: {
      uz: "«Yo'qotildi» bosqichiga o'tgan lidlar.",
      ru: "Лиды на этапе «потерян».",
      en: "Leads moved to a lost stage.",
    },
    act: {
      uz: "Yo'qotish sabablarini Lid tahlilida ko'ring.",
      ru: "Причины потерь — в Анализе лидов.",
      en: "See the reasons in Lead analysis.",
    },
  },
  "an.conversion": {
    what: {
      uz: "Lidlardan sotuvga o'tish foizi.",
      ru: "Процент лидов, ставших продажами.",
      en: "Share of leads that became sales.",
    },
    calc: {
      uz: "Yutilgan ÷ yangi lidlar × 100%.",
      ru: "Выигранные ÷ новые лиды × 100%.",
      en: "Won ÷ new leads × 100%.",
    },
  },
  "an.winRate": {
    what: {
      uz: "Yopilgan bitimlar ichida yutilganlar ulushi.",
      ru: "Доля выигранных среди закрытых сделок.",
      en: "Share of closed deals that were won.",
    },
    calc: {
      uz: "Yutilgan ÷ (yutilgan + yo'qotilgan) × 100%.",
      ru: "Выигранные ÷ (выигранные + потерянные) × 100%.",
      en: "Won ÷ (won + lost) × 100%.",
    },
  },
  "an.avgCheck": {
    what: {
      uz: "O'rtacha bitim summasi.",
      ru: "Средняя сумма сделки.",
      en: "The average deal amount.",
    },
    calc: {
      uz: "Yutilgan bitimlar summasi ÷ ularning soni.",
      ru: "Сумма выигранных ÷ их число.",
      en: "Won deals' total ÷ their count.",
    },
  },
  "an.cycle": {
    what: {
      uz: "Lid yaratilgandan sotuvgacha o'rtacha kunlar.",
      ru: "Среднее число дней от лида до продажи.",
      en: "Average days from a lead to a sale.",
    },
    calc: {
      uz: "Yutilgan lidlar bo'yicha (yutilgan sana − yaratilgan sana) o'rtachasi.",
      ru: "Среднее (дата выигрыша − дата создания).",
      en: "The average of (won date − created date).",
    },
  },
  "an.openLeads": {
    what: {
      uz: "Hali yopilmagan lidlar.",
      ru: "Ещё не закрытые лиды.",
      en: "Leads not closed yet.",
    },
  },
  "an.pipelineSum": {
    what: {
      uz: "Ochiq lidlar byudjetlari yig'indisi.",
      ru: "Сумма бюджетов открытых лидов.",
      en: "Open leads' budgets added up.",
    },
  },
  "an.expected": {
    what: {
      uz: "Kutilayotgan tushum (prognoz).",
      ru: "Ожидаемая выручка (прогноз).",
      en: "Expected income (forecast).",
    },
    calc: {
      uz: "Har bir ochiq lid byudjeti × uning bosqichi ehtimoli (Prognoz → Sozlash).",
      ru: "Бюджет каждого открытого лида × вероятность этапа (Прогноз → Настроить).",
      en: "Each open lead's budget × its stage's chance (Forecast → Settings).",
    },
    act: {
      uz: "Bosqich ehtimollarini o'z tajribangizga moslang.",
      ru: "Настройте вероятности этапов под свой опыт.",
      en: "Tune the stage chances to your own experience.",
    },
  },
  "fin.income": {
    what: {
      uz: "Davrdagi tushum (yutilgan bitimlar).",
      ru: "Доход за период (выигранные сделки).",
      en: "Income in the period (won deals).",
    },
  },
  "fin.expense": {
    what: {
      uz: "Davrdagi xarajatlar: reklama va qo'lda kiritilganlar.",
      ru: "Расходы за период: реклама и внесённые вручную.",
      en: "Expenses in the period: ads and those entered by hand.",
    },
    act: {
      uz: "Xarajatlarni Moliya tabida qo'shing.",
      ru: "Добавляйте расходы во вкладке Финансы.",
      en: "Add expenses in the Finance tab.",
    },
  },
  "fin.profit": {
    what: { uz: "Foyda.", ru: "Прибыль.", en: "Profit." },
    calc: { uz: "Tushum − xarajat.", ru: "Доход − расход.", en: "Income − expenses." },
  },
  "fin.margin": {
    what: {
      uz: "Rentabellik — tushumning qancha qismi foyda.",
      ru: "Маржа — какая часть дохода прибыль.",
      en: "Margin — how much of the income is profit.",
    },
    calc: {
      uz: "Foyda ÷ tushum × 100%.",
      ru: "Прибыль ÷ доход × 100%.",
      en: "Profit ÷ income × 100%.",
    },
  },
  "fin.cac": {
    what: {
      uz: "Bitta sotuvga ketgan xarajat.",
      ru: "Стоимость одной продажи.",
      en: "What one sale cost.",
    },
    calc: {
      uz: "Reklama xarajati ÷ sotuvlar soni.",
      ru: "Расход на рекламу ÷ продажи.",
      en: "Ad spend ÷ sales.",
    },
  },
  "fin.cpl": {
    what: {
      uz: "Lid narxi — bitta lidga ketgan reklama puli.",
      ru: "Цена лида — рекламные деньги на один лид.",
      en: "Cost per lead — ad money per lead.",
    },
    calc: {
      uz: "Reklama xarajati ÷ yangi lidlar.",
      ru: "Расход на рекламу ÷ новые лиды.",
      en: "Ad spend ÷ new leads.",
    },
    act: {
      uz: "⚙️ orqali chegara qo'ying: lid narxi oshib ketsa karta qizil bo'ladi.",
      ru: "Задайте порог в ⚙️: если цена лида выросла — карточка покраснеет.",
      en: "Set a limit in ⚙️ so the card turns red when leads get too expensive.",
    },
  },
  "fin.spend": {
    what: {
      uz: "Reklamaga sarflangan pul.",
      ru: "Потрачено на рекламу.",
      en: "Money spent on ads.",
    },
    calc: {
      uz: "Ulangan reklama kabinetlari + qo'lda kiritilgan xarajatlar.",
      ru: "Подключённые кабинеты + внесённые вручную.",
      en: "Connected ad accounts + spend entered by hand.",
    },
  },
  "fin.newLeads": {
    what: {
      uz: "Davrdagi yangi lidlar.",
      ru: "Новые лиды за период.",
      en: "New leads in the period.",
    },
  },
  "mkt.hotLeads": {
    what: {
      uz: "AI bahosi yuqori (issiq) lidlar.",
      ru: "Лиды с высокой оценкой ИИ (горячие).",
      en: "Leads with a high AI score (hot).",
    },
    calc: {
      uz: "AI bahosi ≥ 70 bo'lgan lidlar; izohda — ulush.",
      ru: "Лиды с оценкой ИИ ≥ 70; в подписи — доля.",
      en: "Leads scored 70 or more; the note shows their share.",
    },
    act: {
      uz: "Issiq lidlarga birinchi navbatda qo'ng'iroq qiling.",
      ru: "Звоните горячим в первую очередь.",
      en: "Call hot leads first.",
    },
  },
  "mkt.coldLeads": {
    what: {
      uz: "AI bahosi past (sovuq) lidlar.",
      ru: "Лиды с низкой оценкой ИИ (холодные).",
      en: "Leads with a low AI score (cold).",
    },
    calc: { uz: "AI bahosi < 40.", ru: "Оценка ИИ < 40.", en: "AI score below 40." },
  },
  "mkt.avgScore": {
    what: {
      uz: "Lidlarning o'rtacha AI bahosi (0–100).",
      ru: "Средняя оценка лидов ИИ (0–100).",
      en: "The leads' average AI score (0–100).",
    },
    calc: {
      uz: "Baholangan lidlar bahosi yig'indisi ÷ ularning soni.",
      ru: "Сумма оценок ÷ число оценённых.",
      en: "The scores added up ÷ scored leads.",
    },
  },
  "mkt.convTitle": {
    what: {
      uz: "Lidlardan sotuvga o'tish (marketing bo'yicha).",
      ru: "Переход лидов в продажи (по маркетингу).",
      en: "Leads turned into sales (marketing view).",
    },
  },
  "mkt.ch.count": {
    what: {
      uz: "Ulangan Telegram kanallar soni.",
      ru: "Число подключённых Telegram-каналов.",
      en: "Connected Telegram channels.",
    },
  },
  "mkt.ch.totalMembers": {
    what: {
      uz: "Barcha kanallardagi obunachilar yig'indisi.",
      ru: "Сумма подписчиков всех каналов.",
      en: "Subscribers of all channels added up.",
    },
  },
  "mkt.ch.members": {
    what: {
      uz: "Kanalning hozirgi obunachilari.",
      ru: "Текущие подписчики канала.",
      en: "The channel's subscribers now.",
    },
  },
  "mkt.ca.joined": {
    what: {
      uz: "Davrda kanalga qo'shilganlar.",
      ru: "Подписались за период.",
      en: "People who joined in the period.",
    },
    calc: {
      uz: "Telegram statistikasi (akkaunt ulangan bo'lsa) yoki bot ko'rgan qo'shilishlar.",
      ru: "Статистика Telegram (если аккаунт подключён) или события бота.",
      en: "Telegram's statistics (with the account connected) or the joins the bot saw.",
    },
  },
  "mkt.ca.left": {
    what: {
      uz: "Davrda kanaldan chiqib ketganlar.",
      ru: "Отписались за период.",
      en: "People who left in the period.",
    },
    act: {
      uz: "Ko'p chiqib ketgan kunlardagi postlarni tekshiring.",
      ru: "Проверьте посты в дни с большим оттоком.",
      en: "Check the posts on days with many leaves.",
    },
  },
  "mkt.ca.net": {
    what: { uz: "Sof o'sish.", ru: "Чистый прирост.", en: "Net growth." },
    calc: {
      uz: "Qo'shilganlar − chiqib ketganlar.",
      ru: "Пришедшие − ушедшие.",
      en: "Joined − left.",
    },
  },
  "mkt.ca.churn": {
    what: { uz: "Chiqib ketish darajasi.", ru: "Уровень оттока.", en: "Leaving rate." },
    calc: {
      uz: "Chiqib ketganlar ÷ qo'shilganlar × 100%.",
      ru: "Ушедшие ÷ пришедшие × 100%.",
      en: "Left ÷ joined × 100%.",
    },
  },
  "mkt.wb.registered": {
    what: {
      uz: "Vebinarlarga ro'yxatdan o'tganlar.",
      ru: "Зарегистрировались на вебинары.",
      en: "People registered for webinars.",
    },
  },
  "mkt.wb.bestPeak": {
    what: {
      uz: "Bitta efirdagi eng ko'p tomoshabin.",
      ru: "Пик зрителей в одном эфире.",
      en: "The most viewers in one stream.",
    },
  },
  "mkt.wb.status.live": {
    what: {
      uz: "Hozir efirda bo'lgan vebinarlar.",
      ru: "Вебинары в эфире сейчас.",
      en: "Webinars live right now.",
    },
  },
  "mkt.nav.webinars": {
    what: { uz: "Barcha vebinarlar soni.", ru: "Всего вебинаров.", en: "All webinars." },
  },
  "mkt.site.visits": {
    what: {
      uz: "Saytdagi sahifa ko'rishlar.",
      ru: "Просмотры страниц сайта.",
      en: "Page views on your site.",
    },
    calc: {
      uz: "siq.js hisoblagichi yuborgan har bir ko'rish.",
      ru: "Каждый просмотр от счётчика siq.js.",
      en: "Each view the siq.js counter sent.",
    },
  },
  "mkt.site.visitors": {
    what: {
      uz: "Saytga kirgan turli odamlar.",
      ru: "Разные посетители сайта.",
      en: "Different people who visited.",
    },
    calc: {
      uz: "Takrorlanmas tasodifiy tashrifchi ID'lari soni.",
      ru: "Число уникальных случайных ID.",
      en: "Unique random visitor ids.",
    },
  },
  "mkt.site.leads": {
    what: {
      uz: "Saytda telefon qoldirganlar (lid bo'lganlar).",
      ru: "Оставили телефон на сайте (стали лидами).",
      en: "People who left a phone on the site (became leads).",
    },
  },
  "mkt.site.conversion": {
    what: {
      uz: "Saytdan lidga o'tish.",
      ru: "Конверсия сайта в лиды.",
      en: "Site visitors who became leads.",
    },
    calc: {
      uz: "Telefon qoldirganlar ÷ tashrifchilar × 100%.",
      ru: "Оставившие телефон ÷ посетители × 100%.",
      en: "Left a phone ÷ visitors × 100%.",
    },
  },
  "refund.sumTotal": {
    what: {
      uz: "Davrdagi pul qaytarish so'rovlari.",
      ru: "Запросы на возврат за период.",
      en: "Refund requests in the period.",
    },
    calc: {
      uz: "Barcha so'rovlar; izohda — qabuldan oldin va keyin.",
      ru: "Все запросы; в подписи — до и после приёма.",
      en: "All requests; the note splits them before and after enrolment.",
    },
  },
  "refund.sumToPay": {
    what: {
      uz: "Hali qaytarilishi kerak bo'lgan pul.",
      ru: "Деньги, которые ещё нужно вернуть.",
      en: "Money still to be paid back.",
    },
    calc: {
      uz: "Kutilayotgan so'rovlar summalari yig'indisi.",
      ru: "Сумма ожидающих запросов.",
      en: "Pending requests' amounts added up.",
    },
    act: {
      uz: "Muddati yaqinlarini birinchi qaytaring.",
      ru: "Сначала возвращайте с близким сроком.",
      en: "Pay the ones nearest their deadline first.",
    },
  },
  "refund.sumPaidBack": {
    what: { uz: "Qaytarib berilgan pul.", ru: "Возвращённые деньги.", en: "Money paid back." },
  },
  "refund.progress": {
    what: {
      uz: "Qaytarilgan so'rovlar ulushi.",
      ru: "Доля выполненных возвратов.",
      en: "Share of requests paid back.",
    },
    calc: {
      uz: "Qaytarilgan ÷ jami (bekor qilinganlarsiz) × 100%.",
      ru: "Возвращённые ÷ все (без отменённых) × 100%.",
      en: "Paid back ÷ all (without cancelled) × 100%.",
    },
  },
  "refund.anAvgDays": {
    what: {
      uz: "So'rovdan qaytarishgacha o'rtacha kunlar.",
      ru: "Среднее число дней от запроса до возврата.",
      en: "Average days from request to refund.",
    },
    calc: {
      uz: "Qaytarilganlar bo'yicha (qaytarilgan sana − so'rov sanasi) o'rtachasi.",
      ru: "Среднее (дата возврата − дата запроса).",
      en: "The average of (paid date − request date).",
    },
  },
  "refund.anOnTime": {
    what: {
      uz: "Muddatida qaytarilganlar ulushi.",
      ru: "Доля возвратов в срок.",
      en: "Share paid back on time.",
    },
    calc: {
      uz: "Muddat ichida qaytarilgan ÷ qaytarilgan × 100%.",
      ru: "В срок ÷ возвращённые × 100%.",
      en: "On time ÷ paid back × 100%.",
    },
  },
  "refund.anOverdue": {
    what: {
      uz: "Muddati o'tib ketgan so'rovlar.",
      ru: "Просроченные запросы.",
      en: "Requests past their deadline.",
    },
    act: {
      uz: "Menejer va adminlarga eslatma avtomatik ketadi; tezroq qaytaring.",
      ru: "Напоминания уходят менеджеру и админам автоматически.",
      en: "Reminders go to the manager and admins automatically; pay these first.",
    },
  },
  "refund.anAvgAmount": {
    what: {
      uz: "O'rtacha qaytarish summasi.",
      ru: "Средняя сумма возврата.",
      en: "The average refund amount.",
    },
  },
  "missed.count": {
    what: {
      uz: "Javobsiz qolgan kiruvchi qo'ng'iroqlar.",
      ru: "Пропущенные входящие звонки.",
      en: "Incoming calls nobody answered.",
    },
    act: {
      uz: "Har biriga avtomatik «qayta qo'ng'iroq» vazifasi qo'yiladi.",
      ru: "На каждый ставится задача «перезвонить».",
      en: "Each gets a «call back» task automatically.",
    },
  },
  "missed.calledBack": {
    what: {
      uz: "Qayta qo'ng'iroq qilinganlar.",
      ru: "Перезвонили.",
      en: "Missed calls that were called back.",
    },
  },
  "missed.within15": {
    what: {
      uz: "15 daqiqa ichida qayta qo'ng'iroq qilinganlar ulushi.",
      ru: "Доля перезвонов в течение 15 минут.",
      en: "Share called back within 15 minutes.",
    },
  },
  "missed.avgWait": {
    what: {
      uz: "Qayta qo'ng'iroqqacha o'rtacha kutish.",
      ru: "Среднее ожидание до перезвона.",
      en: "Average wait before a call back.",
    },
  },
  "fu.statSent": {
    what: {
      uz: "30 kunda mijozlarga yuborilgan avtomatik eslatmalar.",
      ru: "Автонапоминания клиентам за 30 дней.",
      en: "Automatic reminders sent to clients in 30 days.",
    },
  },
  "fu.statReplied": {
    what: {
      uz: "Eslatmadan keyin javob bergan mijozlar.",
      ru: "Клиенты, ответившие после напоминания.",
      en: "Clients who replied after a reminder.",
    },
  },
  "fu.statRate": {
    what: {
      uz: "Eslatmalarning samaradorligi.",
      ru: "Эффективность напоминаний.",
      en: "How well the reminders work.",
    },
    calc: {
      uz: "Javob berganlar ÷ eslatma olganlar × 100%.",
      ru: "Ответившие ÷ получившие × 100%.",
      en: "Replied ÷ reminded × 100%.",
    },
  },
  "inv.statIssued": {
    what: {
      uz: "Chiqarilgan hisob-fakturalar.",
      ru: "Выставленные счета.",
      en: "Invoices issued.",
    },
  },
  "inv.statWaiting": {
    what: {
      uz: "To'lov kutilayotgan hisoblar.",
      ru: "Счета, ожидающие оплаты.",
      en: "Invoices waiting for payment.",
    },
    act: {
      uz: "Mijozga eslatma yuboring.",
      ru: "Отправьте клиенту напоминание.",
      en: "Send the client a reminder.",
    },
  },
  "inv.statPaid": {
    what: { uz: "To'langan hisoblar.", ru: "Оплаченные счета.", en: "Invoices paid." },
  },
  "lb.sales": {
    what: { uz: "Davrdagi sotuvlar soni.", ru: "Продажи за период.", en: "Sales in the period." },
  },
  "lb.totalRevenue": {
    what: {
      uz: "Davrdagi jami tushum.",
      ru: "Общая выручка за период.",
      en: "Total income in the period.",
    },
    calc: {
      uz: "Yutilgan bitimlar summasi.",
      ru: "Сумма выигранных сделок.",
      en: "Won deals added up.",
    },
  },
  "lb.todayRevenue": {
    what: { uz: "Bugungi tushum.", ru: "Выручка за сегодня.", en: "Today's income." },
  },
  "lb.totalLeadsCount": {
    what: {
      uz: "Davrdagi barcha lidlar.",
      ru: "Все лиды за период.",
      en: "All leads in the period.",
    },
  },
  "lb.avgConversion": {
    what: {
      uz: "Jamoaning umumiy konversiyasi.",
      ru: "Общая конверсия команды.",
      en: "The team's overall conversion.",
    },
    calc: {
      uz: "Sotuvlar ÷ lidlar × 100%.",
      ru: "Продажи ÷ лиды × 100%.",
      en: "Sales ÷ leads × 100%.",
    },
  },
  "normatives.onTrack": {
    what: {
      uz: "Normativni bajarayotgan xodimlar.",
      ru: "Сотрудники, выполняющие норматив.",
      en: "People meeting their target.",
    },
  },
  "normatives.atRisk": {
    what: {
      uz: "Normativdan biroz orqada qolganlar.",
      ru: "Немного отстающие от норматива.",
      en: "People slightly behind their target.",
    },
  },
  "normatives.behind": {
    what: {
      uz: "Normativdan jiddiy orqada qolganlar.",
      ru: "Сильно отстающие от норматива.",
      en: "People well behind their target.",
    },
    act: {
      uz: "Ular bilan gaplashing yoki rejani qayta ko'rib chiqing.",
      ru: "Поговорите с ними или пересмотрите план.",
      en: "Talk to them or review the plan.",
    },
  },
  "dash.card.potentialSales": {
    what: {
      uz: "Kutilayotgan sotuvlar soni va summasi.",
      ru: "Ожидаемое число и сумма продаж.",
      en: "Expected number and value of sales.",
    },
    calc: {
      uz: "Lidlar × kutilgan konversiya (standart 15%) × o'rtacha chek.",
      ru: "Лиды × ожидаемая конверсия (15% по умолчанию) × средний чек.",
      en: "Leads × expected conversion (15% by default) × average deal.",
    },
    act: {
      uz: "Konversiya foizini ⚙️ orqali o'zgartiring.",
      ru: "Измените процент конверсии в ⚙️.",
      en: "Change the conversion rate in ⚙️.",
    },
  },
  "dash.card.lostLeads": {
    what: { uz: "Yo'qotilgan lidlar soni.", ru: "Число потерянных лидов.", en: "Lost leads." },
    act: {
      uz: "⚙️ orqali chegara qo'ying — oshsa karta qizil bo'ladi.",
      ru: "Задайте предел в ⚙️ — при превышении карточка покраснеет.",
      en: "Set a limit in ⚙️ — past it the card turns red.",
    },
  },
  "amocrm.statLeads": {
    what: {
      uz: "amoCRM'dan olingan lidlar.",
      ru: "Лиды, полученные из amoCRM.",
      en: "Leads pulled from amoCRM.",
    },
  },
  "amocrm.statPipelines": {
    what: {
      uz: "Sinxronlangan voronkalar.",
      ru: "Синхронизированные воронки.",
      en: "Pipelines in sync.",
    },
  },
  "amocrm.statStages": {
    what: {
      uz: "Sinxronlangan bosqichlar.",
      ru: "Синхронизированные этапы.",
      en: "Stages in sync.",
    },
  },
  "amocrm.statCallsImported": {
    what: {
      uz: "amoCRM'dan olingan qo'ng'iroq yozuvlari.",
      ru: "Записи звонков из amoCRM.",
      en: "Call recordings pulled from amoCRM.",
    },
  },
  "amoWorkspace.statConnectionStatus": {
    what: {
      uz: "amoCRM bilan aloqa holati.",
      ru: "Статус связи с amoCRM.",
      en: "The amoCRM connection status.",
    },
  },
  "amoWorkspace.statSetupStatus": {
    what: {
      uz: "Sozlash bosqichlari holati.",
      ru: "Статус шагов настройки.",
      en: "Where the setup steps stand.",
    },
  },
  "amoWorkspace.statConfigured": {
    what: {
      uz: "Integratsiya sozlanganmi.",
      ru: "Настроена ли интеграция.",
      en: "Whether the integration is set up.",
    },
  },
  "amoWorkspace.statLastSync": {
    what: {
      uz: "Oxirgi sinxronizatsiya vaqti.",
      ru: "Время последней синхронизации.",
      en: "When it last synced.",
    },
  },
  "amoWorkspace.activeManagersLabel": {
    what: {
      uz: "Qo'ng'iroqlari tahlil qilinayotgan menejerlar.",
      ru: "Менеджеры, чьи звонки анализируются.",
      en: "Managers whose calls are analysed.",
    },
  },
  "amoWorkspace.analyzedCallsLabel": {
    what: {
      uz: "Tahlil uchun yaroqli qo'ng'iroqlar.",
      ru: "Звонки, пригодные для анализа.",
      en: "Calls usable for analysis.",
    },
  },
  "amoWorkspace.currentStageLabel": {
    what: {
      uz: "Hozirgi sozlash bosqichi.",
      ru: "Текущий шаг настройки.",
      en: "The current setup step.",
    },
  },
  "amoWorkspace.stepsProgress": {
    what: {
      uz: "Bajarilgan sozlash qadamlari.",
      ru: "Выполненные шаги настройки.",
      en: "Setup steps done.",
    },
  },
  "trial.statusLabel": {
    what: {
      uz: "Obuna holati: sinov, faol yoki tugagan.",
      ru: "Статус подписки: триал, активна или истекла.",
      en: "Subscription status: trial, active or ended.",
    },
  },
  "trial.planLabel": {
    what: { uz: "Joriy tarif.", ru: "Текущий тариф.", en: "Your current plan." },
    act: {
      uz: "Tarifni «Tariflar» sahifasida o'zgartiring.",
      ru: "Сменить тариф — на странице «Тарифы».",
      en: "Change it on the «Pricing» page.",
    },
  },
  "trial.seatsLabel": {
    what: {
      uz: "Band o'rinlar / tarif bo'yicha o'rinlar.",
      ru: "Занятые места / места по тарифу.",
      en: "Seats used / seats in the plan.",
    },
  },
  "trial.daysRemainingLabel": {
    what: {
      uz: "Obuna tugashiga qolgan kunlar.",
      ru: "Дней до окончания подписки.",
      en: "Days until the subscription ends.",
    },
  },
  "conv.overall": {
    what: {
      uz: "Barcha lidlardan sotuvga o'tganlar.",
      ru: "Доля всех лидов, ставших продажами.",
      en: "Share of all leads that became sales.",
    },
    calc: {
      uz: "Sotuvlar ÷ barcha lidlar × 100%.",
      ru: "Продажи ÷ все лиды × 100%.",
      en: "Sales ÷ all leads × 100%.",
    },
  },
  "conv.qualified": {
    what: {
      uz: "Sifatli lidlardan sotuvga o'tish.",
      ru: "Конверсия квалифицированных лидов.",
      en: "Conversion of qualified leads.",
    },
    calc: {
      uz: "Sotuvlar ÷ (noto'g'ri raqam va yo'qotilganlardan tashqari lidlar) × 100%.",
      ru: "Продажи ÷ (лиды без «неверный номер» и потерянных) × 100%.",
      en: "Sales ÷ (leads without wrong numbers and lost) × 100%.",
    },
  },
  "conv.connected": {
    what: {
      uz: "Gaplashilgan lidlardan sotuvga o'tish.",
      ru: "Конверсия лидов, с которыми поговорили.",
      en: "Conversion of leads you reached.",
    },
    calc: {
      uz: "Sotuvlar ÷ (yangi, noto'g'ri raqam, javob bermaganlardan tashqari) × 100%.",
      ru: "Продажи ÷ (без новых, неверных и недозвонов) × 100%.",
      en: "Sales ÷ (leads without new, wrong number, unreachable) × 100%.",
    },
  },
  "conv.partialToFull": {
    what: {
      uz: "Qisman to'lovdan to'liq to'lovga o'tish.",
      ru: "Переход от частичной к полной оплате.",
      en: "Partial payments that became full.",
    },
    calc: {
      uz: "To'liq to'langan ÷ (qisman + to'liq) × 100%.",
      ru: "Полная оплата ÷ (частичная + полная) × 100%.",
      en: "Full ÷ (partial + full) × 100%.",
    },
  },
  "rp.tCalls": {
    what: {
      uz: "Davrdagi barcha qo'ng'iroqlar.",
      ru: "Все звонки за период.",
      en: "All calls in the period.",
    },
  },
  "rp.tTalks": {
    what: {
      uz: "Haqiqiy suhbatlar — chegaradan uzun qo'ng'iroqlar.",
      ru: "Настоящие разговоры — звонки длиннее порога.",
      en: "Real conversations — calls longer than the threshold.",
    },
  },
  "audio.kpiConnectRate": {
    what: {
      uz: "Ulangan qo'ng'iroqlar ulushi.",
      ru: "Доля дозвонов.",
      en: "Share of calls that connected.",
    },
    calc: {
      uz: "Ulangan ÷ barcha qo'ng'iroqlar × 100%.",
      ru: "Дозвоны ÷ все звонки × 100%.",
      en: "Connected ÷ all calls × 100%.",
    },
  },
  "rp.tTalkTime": {
    what: { uz: "Jami suhbat vaqti.", ru: "Общее время разговоров.", en: "Total talk time." },
  },
  "rp.tAvgGrade": {
    what: {
      uz: "AI baholagan qo'ng'iroqlarning o'rtacha bahosi.",
      ru: "Средняя оценка звонков ИИ.",
      en: "The average AI grade of the calls.",
    },
    calc: {
      uz: "Baholar yig'indisi ÷ baholangan qo'ng'iroqlar; A ≥ 80, B 60–79, C 40–59, D < 40.",
      ru: "Сумма оценок ÷ оценённые звонки; A ≥ 80, B 60–79, C 40–59, D < 40.",
      en: "Scores added up ÷ graded calls; A ≥ 80, B 60–79, C 40–59, D < 40.",
    },
  },
  "rp.tSpread": {
    what: {
      uz: "Baholar taqsimoti: nechta qo'ng'iroq A, B, C, D oldi.",
      ru: "Распределение оценок A, B, C, D.",
      en: "How many calls got A, B, C and D.",
    },
    act: {
      uz: "D baholi qo'ng'iroqlarni ochib xatolarni o'rganing.",
      ru: "Откройте звонки с оценкой D и разберите ошибки.",
      en: "Open the D calls and go through the mistakes.",
    },
  },
  "funnels.day.tasksToday": {
    what: { uz: "Bugunga muddatli vazifalar.", ru: "Задачи на сегодня.", en: "Tasks due today." },
  },
  "funnels.day.noTasks": {
    what: {
      uz: "Vazifasi yo'q ochiq lidlar.",
      ru: "Открытые лиды без задач.",
      en: "Open leads without a task.",
    },
    act: {
      uz: "Har bir lidga keyingi qadam (vazifa) qo'ying.",
      ru: "Поставьте каждому лиду следующий шаг.",
      en: "Give every lead a next step (a task).",
    },
  },
  "funnels.day.overdue": {
    what: { uz: "Muddati o'tgan vazifalar.", ru: "Просроченные задачи.", en: "Overdue tasks." },
  },
  "funnels.day.newLeads": {
    what: { uz: "Bugun kelgan yangi lidlar.", ru: "Новые лиды сегодня.", en: "New leads today." },
  },
  "funnels.leadsInFunnel": {
    what: {
      uz: "Voronkadagi barcha ochiq lidlar.",
      ru: "Все открытые лиды воронки.",
      en: "Every open lead in the funnel.",
    },
  },
  "funnels.lateFunnelConversion": {
    what: {
      uz: "Voronka oxirgi bosqichlaridagi konversiya.",
      ru: "Конверсия на последних этапах воронки.",
      en: "Conversion in the funnel's last stages.",
    },
  },
  "funnels.lateFunnelRevenue": {
    what: {
      uz: "Oxirgi bosqichlardagi lidlar summasi.",
      ru: "Сумма лидов на последних этапах.",
      en: "Value of leads in the last stages.",
    },
  },
  "funnels.lostLeadsCount": {
    what: {
      uz: "Voronkada yo'qotilgan lidlar.",
      ru: "Потерянные лиды воронки.",
      en: "Leads lost in the funnel.",
    },
  },
  "funnels.fullPaymentCount": {
    what: {
      uz: "To'liq to'lagan lidlar.",
      ru: "Лиды с полной оплатой.",
      en: "Leads that paid in full.",
    },
  },
  "funnels.avgLateFunnelDeal": {
    what: {
      uz: "Oxirgi bosqichlardagi o'rtacha bitim.",
      ru: "Средняя сделка на последних этапах.",
      en: "The average deal in the last stages.",
    },
  },
  "desk.today": {
    what: {
      uz: "Bugun hozirgacha yutilgan bitimlar summasi.",
      ru: "Сумма сделок, выигранных сегодня до текущего момента.",
      en: "The amount of deals won today so far.",
    },
    calc: {
      uz: "Bugun «Sotildi» bosqichiga o'tgan lidlarning summasi (kutilgan daromad, bo'lmasa byudjet). Kechagi shu vaqtgacha bo'lgan sotuv bilan solishtiriladi.",
      ru: "Сумма лидов, перешедших сегодня в этап «Продано» (ожидаемый доход, иначе бюджет). Сравнивается со вчера до того же времени.",
      en: "Leads moved to a won stage today (expected revenue, else budget), against yesterday up to the same time.",
    },
  },
  "desk.revenue": {
    what: {
      uz: "Tanlangan davrdagi sotuvlar summasi.",
      ru: "Сумма продаж за выбранный период.",
      en: "The sales amount for the chosen period.",
    },
    calc: {
      uz: "Davr ichida yutilgan bitimlar summasi. «Oy»da o'tgan oyning ayni kunlari bilan, boshqalarida oldingi shunday davr bilan solishtiriladi.",
      ru: "Сумма сделок, выигранных за период. Для «Месяца» сравнивается с теми же днями прошлого месяца, иначе — с предыдущим таким же периодом.",
      en: "Deals won in the period. Month compares with the same days of last month; the others with the period just before.",
    },
  },
  "desk.count": {
    what: {
      uz: "Davrda nechta bitim yutildi.",
      ru: "Сколько сделок выиграно за период.",
      en: "How many deals were won in the period.",
    },
    calc: {
      uz: "«Sotildi» bosqichiga o'tgan lidlar soni.",
      ru: "Число лидов, перешедших в этап «Продано».",
      en: "The number of leads moved to a won stage.",
    },
  },
  "desk.avgCheck": {
    what: {
      uz: "Bir sotuvning o'rtacha summasi.",
      ru: "Средняя сумма одной продажи.",
      en: "The average amount of one sale.",
    },
    calc: {
      uz: "Sotuv summasi ÷ sotuvlar soni.",
      ru: "Сумма продаж ÷ количество продаж.",
      en: "Sales amount ÷ number of sales.",
    },
  },
  "desk.newClients": {
    what: {
      uz: "Birinchi marta xarid qilgan mijozlar.",
      ru: "Клиенты, купившие впервые.",
      en: "Clients buying for the first time.",
    },
    calc: {
      uz: "Davrdagi sotuv mijozning (kontakt) birinchi yutilgan bitimi bo'lsa — yangi mijoz.",
      ru: "Продажа считается новым клиентом, если это первая выигранная сделка контакта.",
      en: "A sale counts as a new client when it is the contact's first won deal.",
    },
  },
  "desk.repeat": {
    what: {
      uz: "Avval xarid qilgan mijozlarga qayta sotuvlar.",
      ru: "Повторные продажи клиентам, которые уже покупали.",
      en: "Sales to clients who bought before.",
    },
    calc: {
      uz: "Mijozning avvalroq yutilgan bitimi bo'lsa, bu sotuv qayta sotuv hisoblanadi.",
      ru: "Если у клиента уже была выигранная сделка, продажа — повторная.",
      en: "When the client already had a won deal, the sale is a repeat sale.",
    },
  },
  "desk.conversion": {
    what: {
      uz: "Davrda kelgan lidlardan qanchasi sotuvga aylandi.",
      ru: "Какая доля лидов периода стала продажей.",
      en: "How many of the period's leads became sales.",
    },
    calc: {
      uz: "Davrda yaratilgan lidlardan hozir «Sotildi» bosqichidagilar ÷ shu lidlar soni × 100.",
      ru: "Лиды периода, сейчас находящиеся в «Продано» ÷ все лиды периода × 100.",
      en: "The period's leads now in a won stage ÷ all the period's leads × 100.",
    },
  },
  "desk.plan": {
    what: {
      uz: "Oylik sotuv plani va uning bajarilishi.",
      ru: "Месячный план продаж и его выполнение.",
      en: "The monthly sales plan and how much is done.",
    },
    calc: {
      uz: "Davr tugaydigan oy uchun jamoa plani (yo'q bo'lsa menejerlar planlari yig'indisi) va shu oydagi sotuv. Prognoz — hozirgi sur'atda oy oxirida qancha bo'lishi.",
      ru: "План команды на месяц окончания периода (или сумма планов менеджеров) и продажи этого месяца. Прогноз — сколько будет к концу месяца при текущем темпе.",
      en: "The team plan of the month the period ends in (or the managers' plans added up) and that month's sales. Forecast: the month's end at the current pace.",
    },
  },
  "desk.channels": {
    what: {
      uz: "Sotuvlar qaysi kanaldan kelgani.",
      ru: "Из каких каналов пришли продажи.",
      en: "Which channels the sales came from.",
    },
    calc: {
      uz: "Davrdagi sotuvlar lidning manbasi bo'yicha guruhlanadi; foiz — umumiy sotuv summasidagi ulush.",
      ru: "Продажи периода по источнику лида; процент — доля от общей суммы.",
      en: "The period's sales grouped by the lead's source; the percent is the share of the total.",
    },
  },
  "desk.sources": {
    what: {
      uz: "Davrdagi lidlar qayerdan kelgani.",
      ru: "Откуда пришли лиды периода.",
      en: "Where the period's leads came from.",
    },
    calc: {
      uz: "Davrda yaratilgan lidlar manba bo'yicha; 6 tadan ko'p bo'lsa qolganlari «Boshqa».",
      ru: "Лиды периода по источнику; свыше 6 — в «Другое».",
      en: "The period's leads by source; beyond six they fold into Other.",
    },
  },
  "desk.dynamics": {
    what: {
      uz: "Sotuvlar davr ichida qanday taqsimlangani.",
      ru: "Как продажи распределились внутри периода.",
      en: "How the sales spread over the period.",
    },
    calc: {
      uz: "«Kun» — davrning har kuni oldingi davrning mos kuni bilan; «Soat» — kun soatlari bo'yicha yig'indi.",
      ru: "«День» — каждый день периода против соответствующего дня прошлого; «Час» — сумма по часам суток.",
      en: "Day: each day of the period against the matching day before; Hour: totals by hour of day.",
    },
  },
  "desk.funnel": {
    what: {
      uz: "Davrdagi lidlar voronka bo'ylab qayergacha yetgani.",
      ru: "Как далеко по воронке дошли лиды периода.",
      en: "How far the period's leads got in the funnel.",
    },
    calc: {
      uz: "Voronka tanlanganda har bosqichda — shu bosqichga yoki undan keyingisiga yetgan lidlar soni (bosqichlar tarixi bo'yicha).",
      ru: "При выбранной воронке у каждого этапа — число лидов, дошедших до него или дальше (по истории этапов).",
      en: "With a funnel picked, each stage shows the leads that reached it or a later one (from the stage history).",
    },
  },
  "desk.managers": {
    what: {
      uz: "Har bir menejerning davrdagi natijasi.",
      ru: "Результаты каждого менеджера за период.",
      en: "Each manager's results for the period.",
    },
    calc: {
      uz: "Lid — davrda kelgan lidlari; Ishlangan — birinchi bosqichdan siljiganlari; Suhbat — javob berilgan qo'ng'iroqlar; Eng uzun — eng uzun qo'ng'iroq. Kichik raqam — o'tgan davr («O'sish» yoqilsa — o'zgarish %).",
      ru: "Лиды — пришедшие за период; Обработано — сдвинутые с первого этапа; Разговоры — состоявшиеся звонки; Самый долгий — длительность самого долгого. Маленькая цифра — прошлый период (с «Рост» — изменение %).",
      en: "Leads: received in the period; Worked: moved past the first stage; Talks: answered calls; Longest: the longest call. The small figure is the previous period (with Growth on, the change %).",
    },
  },
  "nav:/phone": {
    what: {
      uz: "Telefon — qo'ng'iroqlar markazi: raqam terish, jurnal, barcha qo'ng'iroqlar, hisobotlar, operatorlar, avto-qo'ng'iroq, ovozli xabar va AI baholash.",
      ru: "Телефон — центр звонков: набор, журнал, все звонки, отчёты, операторы, автообзвон, голосовые и AI-оценка.",
      en: "Phone — the call centre: dialing, log, all calls, reports, operators, autodialer, voice messages and AI scoring.",
    },
    calc: {
      uz: "Qo'ng'iroqlar kompaniya ATS'idan (OnlinePBX, Sipuni, Moi Zvonki) olinadi; menejer faqat o'zinikini ko'radi.",
      ru: "Звонки берутся из АТС компании (OnlinePBX, Sipuni, Мои Звонки); менеджер видит только свои.",
      en: "Calls come from the company's PBX (OnlinePBX, Sipuni, Moi Zvonki); a rep sees only their own.",
    },
  },
  "ptel.k.total": {
    what: {
      uz: "Davrdagi barcha qo'ng'iroqlar.",
      ru: "Все звонки за период.",
      en: "All calls in the period.",
    },
    calc: {
      uz: "ATS'dagi kiruvchi va chiquvchi qo'ng'iroqlar soni.",
      ru: "Входящие и исходящие звонки из АТС.",
      en: "Incoming and outgoing calls from the PBX.",
    },
  },
  "ptel.k.missed": {
    what: {
      uz: "Hech kim javob bermagan kiruvchi qo'ng'iroqlar.",
      ru: "Входящие, на которые никто не ответил.",
      en: "Incoming calls nobody answered.",
    },
    calc: {
      uz: "Kiruvchi va javobsiz qo'ng'iroqlar; ular uchun avtomatik «qayta qo'ng'iroq» vazifasi qo'yiladi.",
      ru: "Входящие без ответа; на них автоматически ставится задача «перезвонить».",
      en: "Incoming calls without an answer; a call-back task is set for them automatically.",
    },
  },
  "ptel.k.rate": {
    what: {
      uz: "Qo'ng'iroqlarning qanchasida suhbat bo'ldi.",
      ru: "В какой доле звонков был разговор.",
      en: "How many calls had a conversation.",
    },
    calc: {
      uz: "Suhbat bo'lgan qo'ng'iroqlar ÷ jami × 100.",
      ru: "Звонки с разговором ÷ все × 100.",
      en: "Answered calls ÷ all calls × 100.",
    },
  },
  "ptel.k.talk": {
    what: {
      uz: "Suhbatlarning umumiy davomiyligi.",
      ru: "Общая длительность разговоров.",
      en: "The total length of the conversations.",
    },
    calc: {
      uz: "Suhbat bo'lgan qo'ng'iroqlar davomiyligi yig'indisi; o'rtachasi — bitta suhbatga.",
      ru: "Сумма длительностей разговоров; среднее — на один разговор.",
      en: "The answered calls' durations added up; the average is per conversation.",
    },
  },
  "ptel.b.quick": {
    what: {
      uz: "Raqamni yozib darhol qo'ng'iroq qilish.",
      ru: "Набрать номер и сразу позвонить.",
      en: "Type a number and call at once.",
    },
    calc: {
      uz: "Avval sizning telefoningiz jiringlaydi, keyin mijoz.",
      ru: "Сначала звонит ваш телефон, затем клиент.",
      en: "Your phone rings first, then the client.",
    },
  },
  "ptel.b.top": {
    what: {
      uz: "Davrda eng ko'p qo'ng'iroq qilgan operatorlar.",
      ru: "Операторы с наибольшим числом звонков.",
      en: "The operators with the most calls.",
    },
    calc: {
      uz: "Qo'ng'iroqlar soni va suhbat vaqti.",
      ru: "Число звонков и время разговоров.",
      en: "Number of calls and talk time.",
    },
  },
  "ptel.b.recent": {
    what: {
      uz: "Oxirgi qo'ng'iroq qilingan raqamlar.",
      ru: "Последние номера.",
      en: "The latest numbers.",
    },
    calc: {
      uz: "Bosing — raqam teriladi; telefon belgisi — darhol qo'ng'iroq.",
      ru: "Нажмите — номер наберётся; значок телефона — звонок сразу.",
      en: "Click to fill the number; the phone icon calls at once.",
    },
  },
  "ptel.b.operators": {
    what: {
      uz: "Har bir operatorning qo'ng'iroqlari.",
      ru: "Звонки каждого оператора.",
      en: "Each operator's calls.",
    },
    calc: {
      uz: "Jami, kiruvchi, chiquvchi, o'tkazilgan, javob foizi, suhbat vaqti, o'rtacha va eng uzun suhbat, AI ball.",
      ru: "Всего, входящие, исходящие, пропущенные, % ответа, время, среднее и самый долгий разговор, AI-балл.",
      en: "Total, in, out, missed, answer rate, talk time, average and longest call, AI score.",
    },
  },
  "ptel.b.rating": {
    what: {
      uz: "Operatorlarning o'rtacha AI bahosi.",
      ru: "Средняя AI-оценка операторов.",
      en: "The operators' average AI score.",
    },
    calc: {
      uz: "Audio tahlil qo'ng'iroqlarni skript bo'yicha 0–100 baholaydi; 80+ yaxshi, 60 dan past — e'tibor kerak.",
      ru: "Аудиоаналитика оценивает звонки по скрипту 0–100; 80+ хорошо, ниже 60 — нужно внимание.",
      en: "Audio analytics scores calls against the script 0–100; 80+ is good, under 60 needs attention.",
    },
  },
  "ptel.b.scored": {
    what: {
      uz: "AI baholagan so'nggi qo'ng'iroqlar.",
      ru: "Последние звонки с AI-оценкой.",
      en: "The latest AI-scored calls.",
    },
    calc: {
      uz: "Ball, operator, davomiylik va qisqa xulosa.",
      ru: "Балл, оператор, длительность и краткий вывод.",
      en: "Score, operator, duration and a short summary.",
    },
  },
  "ptel.b.auto": {
    what: {
      uz: "Tanlangan bosqichlardagi lidlarga navbat bilan qo'ng'iroq.",
      ru: "Обзвон лидов выбранных этапов по очереди.",
      en: "Calls the chosen stages' leads one after another.",
    },
    calc: {
      uz: "Keyingi qo'ng'iroq oldingisi tugagach, belgilangan soniyadan so'ng boshlanadi; har bir lid natijasi ko'rinadi.",
      ru: "Следующий звонок начинается через заданные секунды после окончания предыдущего; результат по каждому лиду виден.",
      en: "The next call starts the set seconds after the last one ends; each lead's result is shown.",
    },
  },
  "ptel.b.voice": {
    what: {
      uz: "Ovozli xabarni kimlarga yuborish.",
      ru: "Кому отправить голосовое.",
      en: "Who gets the voice message.",
    },
    calc: {
      uz: "Lidlarni qidirib tanlang yoki voronka bosqichlarini belgilang.",
      ru: "Выберите лидов поиском или отметьте этапы воронки.",
      en: "Pick leads by search or tick a funnel's stages.",
    },
  },
  "ptel.b.record": {
    what: {
      uz: "Ovozli xabarni yozib yuborish.",
      ru: "Записать и отправить голосовое.",
      en: "Record and send the voice message.",
    },
    calc: {
      uz: "Bir marta yoziladi va har bir mijozning Telegramiga ovozli xabar bo'lib boradi.",
      ru: "Записывается один раз и уходит каждому клиенту в Telegram голосовым.",
      en: "Recorded once, sent to every client's Telegram as a voice note.",
    },
  },
  "ptel.b.connect": {
    what: {
      uz: "Qaysi ATS ulangan.",
      ru: "Какая АТС подключена.",
      en: "Which PBX is connected.",
    },
    calc: {
      uz: "Ulangan provayder orqali qo'ng'iroqlar ketadi va tarix olinadi.",
      ru: "Через подключённого провайдера идут звонки и загружается история.",
      en: "Calls go and history comes through the connected provider.",
    },
  },
  "ptel.b.settings": {
    what: {
      uz: "Telefoniya sozlamalari bir joyda.",
      ru: "Настройки телефонии в одном месте.",
      en: "The telephony settings in one place.",
    },
    calc: {
      uz: "Ulanish, ichki raqamlar, raqam formati, bildirishnomalar va AI baholash.",
      ru: "Подключение, внутренние номера, формат номера, уведомления и AI-оценка.",
      en: "Connection, extensions, number format, notifications and AI scoring.",
    },
  },
  "ptel.b.desktop": {
    what: {
      uz: "Platformani ilova qilib o'rnatish.",
      ru: "Установка платформы как приложения.",
      en: "Installing the platform as an app.",
    },
    calc: {
      uz: "Brauzerning o'rnatish oynasi orqali; ilova alohida oynada ochiladi.",
      ru: "Через окно установки браузера; приложение открывается в отдельном окне.",
      en: "Through the browser's install prompt; the app opens in its own window.",
    },
  },
  "ptel.b.notify": {
    what: {
      uz: "Kiruvchi qo'ng'iroq haqida push xabarnoma.",
      ru: "Push-уведомление о входящем звонке.",
      en: "A push alert for incoming calls.",
    },
    calc: {
      uz: "Brauzer ruxsati kerak; xabarnomada mijoz ismi va lid.",
      ru: "Нужно разрешение браузера; в уведомлении имя клиента и лид.",
      en: "Needs the browser's permission; the alert shows the client and lead.",
    },
  },
};
