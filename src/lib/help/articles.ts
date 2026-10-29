// Qo'llanma: one step-by-step guide per section of the platform, in all
// three languages. Shown at /help and /help/<slug>, opened from the
// "Qo'llanma" button in every page header (see GUIDE_FOR_PATH), and fed to
// the AI assistant so it answers "how do I…" with the same steps.

export { guideForPath } from "./paths";

export type L = { uz: string; ru: string; en: string };

export type HelpGroup = "basics" | "crm" | "integrations" | "ai";

export type HelpArticle = {
  slug: string;
  group: HelpGroup;
  title: L;
  summary: L;
  need?: L;
  steps: L[];
  notes: L[];
  faq: { q: L; a: L }[];
  // The page "Panelda ochish" takes you to.
  open: string;
};

export const HELP_GROUPS: HelpGroup[] = ["basics", "crm", "integrations", "ai"];

export const HELP_ARTICLES: HelpArticle[] = [
  {
    slug: "start",
    group: "basics",
    open: "/admin",
    title: { uz: "Ishni boshlash", ru: "Начало работы", en: "Getting started" },
    summary: {
      uz: "Kompaniyani noldan birinchi natijagacha sozlashning qisqa yo'li.",
      ru: "Короткий путь от пустой компании до первых результатов.",
      en: "The short path from an empty company to the first results.",
    },
    need: {
      uz: "Kompaniya administratori (super admin) bo'lib kirgan bo'lishingiz kerak.",
      ru: "Нужно войти как администратор компании (super admin).",
      en: "You need to be signed in as the company admin (super admin).",
    },
    steps: [
      {
        uz: "Chap menyuning pastidagi **Admin**ni oching. Tepada sozlash foizi va keyingi qadam ko'rinadi.",
        ru: "Откройте **Админ** внизу левого меню. Сверху виден процент настройки и следующий шаг.",
        en: "Open **Admin** at the bottom of the left menu. The setup percentage and next step are at the top.",
      },
      {
        uz: "**Xodimlar** kartasidan jamoangizni qo'shing va har biriga rol bering.",
        ru: "Через карточку **Сотрудники** добавьте команду и дайте каждому роль.",
        en: "Add your team from the **Employees** card and give each person a role.",
      },
      {
        uz: "Lidlar qayerdan kelishini ulang: **amoCRM**, **Bitrix24** yoki **Telefoniya** kartasi.",
        ru: "Подключите источник лидов: карточка **amoCRM**, **Битрикс24** или **Телефония**.",
        en: "Connect where leads come from: the **amoCRM**, **Bitrix24** or **Telephony** card.",
      },
      {
        uz: "CRM'dan foydalansangiz, **Voronkalar va etaplar**ni sozlang.",
        ru: "Если работаете в CRM, настройте **Воронки и этапы**.",
        en: "If you use the CRM, set up **Funnels and stages**.",
      },
      {
        uz: "Admin panel tepasidagi **Kompaniya sozlanishi** ro'yxati keyingi qadamni ko'rsatadi (birinchisi — **AI bilan sozlash**). Undagi **Amalga oshirish rejasi** tugmasi qolgan ishlarni kunlar bo'yicha ochadi.",
        ru: "Список **Настройка компании** вверху Админ-панели показывает следующий шаг (первый — **Настройка с AI**). Кнопка **План внедрения** в нём открывает остальные шаги по дням.",
        en: "The **Company setup** checklist at the top of the Admin panel shows the next step (the first is **Set up with AI**). Its **Rollout plan** button opens the remaining steps by day.",
      },
    ],
    notes: [
      {
        uz: "Har bir sahifaning o'ng tepasida **Qo'llanma** tugmasi bor — shu sahifa haqidagi yo'riqnomani ochadi.",
        ru: "В правом верхнем углу каждой страницы есть кнопка **Руководство** — она открывает инструкцию к этой странице.",
        en: "Every page has a **Guide** button in its top right corner that opens the guide for that page.",
      },
    ],
    faq: [
      {
        q: {
          uz: "Qayerdan boshlashni bilmayapman",
          ru: "Не знаю, с чего начать",
          en: "I don't know where to start",
        },
        a: {
          uz: "Admin sahifasidagi **Sozlash** tugmasini bosing — u keyingi kerakli sahifani o'zi ochadi.",
          ru: "Нажмите **Настроить** на странице Админ — она сама откроет следующую нужную страницу.",
          en: "Press **Set it up** on the Admin page — it opens the next page you need.",
        },
      },
    ],
  },
  {
    slug: "home",
    group: "basics",
    open: "/",
    title: { uz: "Bosh sahifa va hisobot", ru: "Главная и отчёт", en: "Home and reports" },
    summary: {
      uz: "Savdo raqamlari, jamoa reytingi, qo'ng'iroqlar va hisobot yuklab olish.",
      ru: "Цифры продаж, рейтинг команды, звонки и выгрузка отчёта.",
      en: "Sales numbers, team ranking, calls and report downloads.",
    },
    steps: [
      {
        uz: "Eng tepadagi **Bugungi ish** paneli avval nima qilishni ko'rsatadi: muddati o'tgan va bugungi vazifalar, vazifasiz va mas'ulsiz lidlar, to'lov kutilayotgan (predoplata, yarim to'lov) lidlar. Kartani bossangiz, shu lidlar turgan voronka ochiladi.",
        ru: "Панель **Работа на сегодня** наверху показывает, что сделать в первую очередь: просроченные и сегодняшние задачи, лиды без задачи и без ответственного, лиды в ожидании оплаты (предоплата, половина). Карточка открывает воронку с этими лидами.",
        en: "The **Today's work** panel at the top shows what to do first: overdue and today's tasks, leads with no task or owner, and leads awaiting payment (prepayment, half payment). A tile opens the funnel with those leads.",
      },
      {
        uz: "Uning ostidagi **Qo'ng'iroq navbati** kimga birinchi qo'ng'iroq qilishni ko'rsatadi: hali hech kim bog'lanmagan yangi lid, javob kutayotgan mijoz, muddati o'tgan vazifa, bugungi to'lov, issiq lid, uzoq vaqt aloqasiz lid — eng shoshilinchi tepada, sababi bilan. **Qo'ng'iroq** tugmasi bir bosishda telefoniya orqali qo'ng'iroq qiladi.",
        ru: "Под ней **Очередь звонков** показывает, кому звонить первым: новый лид, с которым ещё никто не связался, клиент в ожидании ответа, просроченная задача, оплата сегодня, горячий лид, давно молчащий лид — самые срочные сверху, с причиной. Кнопка **Позвонить** звонит через телефонию в один клик.",
        en: "Below it the **Call queue** shows who to call first: a new lead nobody has reached yet, a client waiting for an answer, an overdue task, a payment due today, a hot lead, a lead gone quiet — the most urgent first, with the reason. **Call** dials through your telephony in one click.",
      },
      {
        uz: "Tepadagi tablardan keraklisini tanlang: **Umumiy** (oylik tushum dinamikasi ham shu yerda), **Reyting**, **Konversiya**, **Faoliyat**, **AI tahlil**. Qo'ng'iroqlar bo'yicha hamma raqamlar **Audio tahlil**da, yo'qotish sabablari **Lid tahlili → Yo'nalish**da.",
        ru: "Выберите вкладку сверху: **Обзор** (там же динамика выручки по месяцам), **Рейтинг**, **Конверсия**, **Активность**, **AI аналитика**. Все цифры по звонкам — в **Аудиоаналитике**, причины потерь — в **Аналитике лидов → Направление**.",
        en: "Pick a tab at the top: **Overview** (the monthly revenue trend is there too), **Ranking**, **Conversion**, **Activity**, **AI insights**. Every call figure is in **Audio analytics**, loss reasons in **Lead analytics → Direction**.",
      },
      {
        uz: "Filtrda voronka, jamoa, menejer yoki sanani tanlang. Har bir tab faqat o'z raqamlariga ta'sir qiladigan filtrlarni ko'rsatadi.",
        ru: "В фильтре выберите воронку, команду, менеджера или даты. Каждая вкладка показывает только те фильтры, которые влияют на её цифры.",
        en: "Use the filter for funnel, team, manager or dates. Each tab shows only the filters that change its numbers.",
      },
      {
        uz: "**AI tahlil** tabida qo'ng'iroqlarning AI bali sotuv bilan solishtiriladi: bali yuqori lidlar qanchalik ko'p sotilgani va skriptning qaysi bosqichi sotilgan bitimlarda bajarilib, yo'qotilganlarida tashlab ketilgani (**Sotuv qayerda yo'qoladi**).",
        ru: "Во вкладке **AI аналитика** AI-балл звонков сравнивается с продажами: насколько чаще продаются лиды с высоким баллом и какой этап скрипта выполнялся в проданных сделках, но пропускался в потерянных (**Где теряется продажа**).",
        en: "The **AI insights** tab compares the calls' AI score with sales: how much more often high-scored leads buy, and which script step was done in won deals but skipped in lost ones (**Where the sale is lost**).",
      },
      {
        uz: "Hisobot kerak bo'lsa, o'ng tepadagi **Hisobot** tugmasini bosing.",
        ru: "Для отчёта нажмите кнопку **Отчёт** в правом верхнем углу.",
        en: "For a report, press **Report** in the top right corner.",
      },
      {
        uz: "Oynada davrni (Bugun, Shu hafta, Shu oy yoki o'z sanangiz), jamoa va menejerni, hisobotga kiradigan bo'limlarni tanlang.",
        ru: "В окне выберите период (Сегодня, Эта неделя, Этот месяц или свои даты), команду и менеджера, нужные разделы.",
        en: "In the window pick the period (Today, This week, This month or your own dates), team and manager, and the parts to include.",
      },
      {
        uz: "Fayl turini (Excel yoki PDF) tanlab **Yuklab olish**ni bosing.",
        ru: "Выберите формат (Excel или PDF) и нажмите **Скачать**.",
        en: "Pick the file type (Excel or PDF) and press **Download**.",
      },
    ],
    notes: [
      {
        uz: "Hisobotda har bir raqam oldingi davr bilan yonma-yon va o'zgarish foizi bilan chiqadi.",
        ru: "В отчёте каждая цифра стоит рядом с предыдущим периодом и процентом изменения.",
        en: "In the report every number sits next to the previous period with the change in percent.",
      },
      {
        uz: "Menejerlar Bosh sahifada o'zining **Bugungi ish** paneli va **Reyting**ni ko'radi.",
        ru: "Менеджеры видят на Главной свою **Работу на сегодня** и **Рейтинг**.",
        en: "Sales reps see their own **Today's work** and the **Ranking** on Home.",
      },
    ],
    faq: [
      {
        q: {
          uz: "Hisobot har kuni o'zi kelsin desam-chi?",
          ru: "Можно получать отчёт автоматически каждый день?",
          en: "Can the report arrive by itself every day?",
        },
        a: {
          uz: "Ha. Hisobot oynasidagi **Har kuni Telegramga yuborish** havolasini oching va vaqtni belgilang.",
          ru: "Да. В окне отчёта откройте ссылку **Отправлять в Telegram каждый день** и задайте время.",
          en: "Yes. Open **Send to Telegram every day** in the report window and set the time.",
        },
      },
    ],
  },
  {
    slug: "employees",
    group: "basics",
    open: "/admin/employees",
    title: { uz: "Xodimlar va rollar", ru: "Сотрудники и роли", en: "Employees and roles" },
    summary: {
      uz: "Xodim qo'shish, rol, parol va ROP jamoasini belgilash.",
      ru: "Добавление сотрудников, роли, пароли и команда РОПа.",
      en: "Adding people, roles, passwords and each head's team.",
    },
    steps: [
      {
        uz: "**Admin → Xodimlar**ni oching.",
        ru: "Откройте **Админ → Сотрудники**.",
        en: "Open **Admin → Employees**.",
      },
      {
        uz: "**Xodim qo'shish** tugmasini bosing, ism, email, parol va rolni kiriting.",
        ru: "Нажмите **Добавить сотрудника**, укажите имя, email, пароль и роль.",
        en: "Press **Add employee**, enter name, email, password and role.",
      },
      {
        uz: "Sotuv menejeri uchun **Mas'ul rahbar** ustunidan uning ROPini tanlang.",
        ru: "Для менеджера по продажам выберите РОПа в столбце **Ответственный РОП**.",
        en: "For a sales rep, choose their head in the **Responsible ROP** column.",
      },
      {
        uz: "Rolni o'zgartirish uchun qalam belgisini, parol uchun kalit belgisini bosing.",
        ru: "Чтобы сменить роль, нажмите карандаш; чтобы задать пароль — ключ.",
        en: "Press the pencil to change a role, the key to set a password.",
      },
    ],
    notes: [
      {
        uz: "Rollar: **Admin** — hamma narsa; **ROP** — o'z jamoasi; **Sotuv menejeri** — o'z lidlari; **Amaliyotchi** — menejer va AI mentor.",
        ru: "Роли: **Админ** — всё; **РОП** — своя команда; **Менеджер** — свои лиды; **Стажёр** — менеджер с AI-ментором.",
        en: "Roles: **Admin** — everything; **ROP** — their team; **Sales rep** — their own leads; **Intern** — a rep with the AI mentor.",
      },
      {
        uz: "Tarifingizdagi o'rinlar soni tugasa, yangi xodim tizimga kira olmaydi.",
        ru: "Если места по тарифу закончились, новый сотрудник не сможет войти.",
        en: "When your plan's seats run out, a new employee can't sign in.",
      },
    ],
    faq: [
      {
        q: {
          uz: "Xodim parolini unutdi",
          ru: "Сотрудник забыл пароль",
          en: "An employee forgot their password",
        },
        a: {
          uz: "Xodimlar ro'yxatida uning qatoridagi kalit belgisini bosib, yangi parol bering.",
          ru: "В списке сотрудников нажмите ключ в его строке и задайте новый пароль.",
          en: "Press the key in their row of the employee list and set a new password.",
        },
      },
    ],
  },
  {
    slug: "permissions",
    group: "basics",
    open: "/admin/permissions",
    title: {
      uz: "Ruxsatlar va xavfsizlik",
      ru: "Права и безопасность",
      en: "Permissions and security",
    },
    summary: {
      uz: "Kim nimani ko'ra va o'zgartira oladi, parol qoidalari.",
      ru: "Кто что видит и меняет, правила паролей.",
      en: "Who can see and change what, password rules.",
    },
    steps: [
      {
        uz: "**Admin → Ruxsatlar**ni oching.",
        ru: "Откройте **Админ → Права доступа**.",
        en: "Open **Admin → Permissions**.",
      },
      {
        uz: "Jadvalda har bir amal uchun qaysi rollarga ruxsat borligini belgilang va saqlang.",
        ru: "В таблице отметьте, каким ролям разрешено каждое действие, и сохраните.",
        en: "In the table tick which roles may do each action and save.",
      },
      {
        uz: "Parol qoidalari uchun **Admin → Xavfsizlik**ni oching: minimal uzunlik, raqam, bosh harf, belgi, 2FA.",
        ru: "Правила паролей — в **Админ → Безопасность**: длина, цифры, заглавные, символы, 2FA.",
        en: "For password rules open **Admin → Security**: length, digits, capitals, symbols, 2FA.",
      },
    ],
    notes: [
      {
        uz: "O'zgarish darhol kuchga kiradi — xodim sahifani yangilaganda yangi ruxsat ishlaydi.",
        ru: "Изменения действуют сразу — после обновления страницы у сотрудника.",
        en: "Changes apply at once — as soon as the employee reloads the page.",
      },
    ],
    faq: [],
  },
  {
    slug: "audio",
    group: "basics",
    open: "/audio-analytics",
    title: {
      uz: "Qo'ng'iroqlar tahlili",
      ru: "Анализ звонков",
      en: "Call analysis",
    },
    summary: {
      uz: "AI har bir qo'ng'iroqni eshitib, ball qo'yadi va xatolarni ko'rsatadi.",
      ru: "AI слушает каждый звонок, ставит балл и показывает ошибки.",
      en: "The AI listens to every call, scores it and points out mistakes.",
    },
    need: {
      uz: "Qo'ng'iroq yozuvlari kelishi kerak: amoCRM, Bitrix24 yoki telefoniya ulangan bo'lsin.",
      ru: "Нужны записи звонков: подключите amoCRM, Битрикс24 или телефонию.",
      en: "Call recordings must come in: connect amoCRM, Bitrix24 or telephony.",
    },
    steps: [
      {
        uz: "Chap menyudan **Audio tahlil**ni oching.",
        ru: "Откройте **Аудиоаналитику** в левом меню.",
        en: "Open **Audio analytics** in the left menu.",
      },
      {
        uz: "Ro'yxatdan qo'ng'iroqni tanlang — ball, xulosa, xatolar va matn ochiladi.",
        ru: "Выберите звонок в списке — откроются балл, резюме, ошибки и текст.",
        en: "Pick a call in the list — its score, summary, mistakes and transcript open.",
      },
      {
        uz: "Pastda — har bir menejerning qo'ng'iroqlari, ulanish foizi, suhbat vaqti va o'rtacha bahosi, hamda mijozlar qaysi soatlarda telefon ko'tarishi. Hammasi yuqoridagi filtrlarga bo'ysunadi.",
        ru: "Ниже — звонки, дозвон, время разговора и средний балл каждого менеджера, а также часы, когда клиенты берут трубку. Всё следует фильтрам сверху.",
        en: "Below: each manager's calls, connect rate, talk time and average score, and the hours customers pick up. All of it follows the filters above.",
      },
      {
        uz: "Baholash mezonlarini o'zgartirish uchun **Sozlamalar → Audio tahlil → Baholash mezonlari**ga o'ting.",
        ru: "Чтобы изменить критерии оценки, откройте **Настройки → Аудиоаналитика → Критерии оценки**.",
        en: "To change the scoring rules, open **Settings → Call analysis → Scoring criteria**.",
      },
    ],
    notes: [
      {
        uz: "Yangi qo'ng'iroqlar bir necha daqiqada avtomatik tahlil qilinadi.",
        ru: "Новые звонки анализируются автоматически за несколько минут.",
        en: "New calls are analysed automatically within a few minutes.",
      },
    ],
    faq: [
      {
        q: {
          uz: "Qo'ng'iroq tahlil qilinmadi",
          ru: "Звонок не проанализирован",
          en: "A call wasn't analysed",
        },
        a: {
          uz: "Yozuv juda qisqa yoki bo'sh bo'lishi mumkin. Bir necha daqiqa kuting; bo'lmasa qo'ng'iroq sahifasida qayta tahlilni bosing.",
          ru: "Запись может быть слишком короткой или пустой. Подождите несколько минут; если нет — запустите анализ повторно на странице звонка.",
          en: "The recording may be too short or empty. Wait a few minutes; otherwise run the analysis again on the call's page.",
        },
      },
    ],
  },
  {
    slug: "lead-analytics",
    group: "basics",
    open: "/lead-analytics",
    title: { uz: "Lid tahlili", ru: "Анализ лидов", en: "Lead analytics" },
    summary: {
      uz: "Lidlar qayerdan keladi, qaysi etapda to'xtaydi, kim qanday ishlaydi.",
      ru: "Откуда приходят лиды, где застревают и кто как работает.",
      en: "Where leads come from, where they get stuck and how each person works.",
    },
    steps: [
      {
        uz: "Chap menyudan **Lid tahlili**ni oching.",
        ru: "Откройте **Анализ лидов** в левом меню.",
        en: "Open **Lead analytics** in the left menu.",
      },
      {
        uz: "Tepada jamoa, operator, voronka va oyni tanlang.",
        ru: "Сверху выберите команду, оператора, воронку и месяц.",
        en: "Pick the team, operator, funnel and month at the top.",
      },
      {
        uz: "Kartalarda konversiya, etaplar bo'yicha yo'qotish va menejerlar kesimini ko'ring.",
        ru: "На карточках — конверсия, потери по этапам и разрез по менеджерам.",
        en: "The cards show conversion, losses by stage and the per-manager view.",
      },
    ],
    notes: [],
    faq: [],
  },
  {
    slug: "attendance",
    group: "basics",
    open: "/attendance",
    title: { uz: "Davomat va kvotalar", ru: "Посещаемость и квоты", en: "Attendance and quotas" },
    summary: {
      uz: "Ish vaqti, qo'ng'iroqlar soni va oylik maqsadga qanchalik yaqinlik.",
      ru: "Рабочее время, число звонков и насколько близко месячная цель.",
      en: "Working hours, number of calls and how close the monthly target is.",
    },
    steps: [
      {
        uz: "Chap menyudan **Nazorat**ni oching.",
        ru: "Откройте **Контроль** в левом меню.",
        en: "Open **Control** in the left menu.",
      },
      {
        uz: "Menejer ish boshida **Ishni boshlash**, oxirida **Ishni tugatish**ni bosadi. amoCRM ulangan bo'lsa, qo'ng'iroqdan avtomatik aniqlanadi.",
        ru: "Менеджер нажимает **Начать работу** в начале дня и **Завершить** в конце. С amoCRM начало определяется по звонкам автоматически.",
        en: "A rep presses **Start work** at the start of the day and **Finish** at the end. With amoCRM it's detected from calls automatically.",
      },
      {
        uz: "Rahbar **Bugungi hisobot** jadvalida har bir xodimning ish vaqti va qo'ng'iroqlarini ko'radi.",
        ru: "Руководитель видит время и звонки каждого в таблице **Отчёт за сегодня**.",
        en: "The head sees everyone's hours and calls in the **Today's report** table.",
      },
      {
        uz: "**Normativlar** tabida oylik maqsad va kim orqada qolayotgani ko'rinadi.",
        ru: "Во вкладке **Нормативы** — месячная цель и кто отстаёт.",
        en: "The **Quotas** tab shows the monthly target and who is behind.",
      },
    ],
    notes: [],
    faq: [],
  },
  {
    slug: "classroom",
    group: "basics",
    open: "/content-library",
    title: { uz: "Sinfxona", ru: "Класс", en: "Classroom" },
    summary: {
      uz: "Jamoa uchun darslar, skriptlar va amaliyotchilar uchun AI mentor.",
      ru: "Уроки и скрипты для команды, AI-ментор для стажёров.",
      en: "Lessons and scripts for the team, an AI mentor for interns.",
    },
    steps: [
      {
        uz: "Chap menyudan **Sinfxona**ni oching.",
        ru: "Откройте **Класс** в левом меню.",
        en: "Open **Classroom** in the left menu.",
      },
      {
        uz: "Rahbar dars, video yoki faylni qo'shadi; xodimlar shu yerda o'qiydi.",
        ru: "Руководитель добавляет урок, видео или файл; сотрудники изучают их здесь.",
        en: "The head adds a lesson, video or file; the team studies it here.",
      },
      {
        uz: "Amaliyotchi uchun rejani **Admin → Xodimlar**da uning kun belgisini bosib sozlang.",
        ru: "План стажёра настраивается в **Админ → Сотрудники** по клику на его день.",
        en: "Set an intern's plan in **Admin → Employees** by clicking their day badge.",
      },
      {
        uz: "**E'tirozlar** tabida mijozlar qo'ng'iroqlarda nimaga e'tiroz bildirgani turlarga ajratilgan (narx, “o'ylab ko'raman”, ishonch, raqobatchi...), har biriga jamoangiz menejerlarining eng yaxshi javoblari (avval sotilgan bitimlardagilari) va AI maslahati beriladi.",
        ru: "Во вкладке **Возражения** возражения клиентов из звонков сгруппированы (цена, «подумаю», доверие, конкурент...), к каждому — лучшие ответы ваших менеджеров (сначала из проданных сделок) и совет AI.",
        en: "The **Objections** tab groups what clients object to in your calls (price, \"I'll think\", trust, competitor...), each with your managers' best answers (from sold deals first) and an AI tip.",
      },
      {
        uz: "**Mashqlar** tabida har bir menejerning eng zaif skript bosqichi ko'rinadi. ROP **Mashq berish**ni bosib topshiriq (kerak bo'lsa video dars bilan) beradi; menejerga xabar boradi. Kartada shu bosqich natijasi mashqdan **oldin** va keyingi qo'ng'iroqlarda (**keyin**) ko'rsatiladi.",
        ru: "Во вкладке **Тренировки** виден самый слабый этап скрипта каждого менеджера. РОП нажимает **Дать тренировку** и выдаёт задание (при необходимости с видеоуроком); менеджер получает уведомление. В карточке результат этапа **до** задания и в звонках **после**.",
        en: "The **Practice** tab shows each manager's weakest script step. The head of sales presses **Give practice** and sets a task (with a video lesson if wanted); the manager is notified. The card shows the step's result **before** the task and in the calls **after** it.",
      },
    ],
    notes: [],
    faq: [],
  },
  {
    slug: "settings",
    group: "basics",
    open: "/settings",
    title: { uz: "Sozlamalar", ru: "Настройки", en: "Settings" },
    summary: {
      uz: "Ikki bosqichli kirish, valyuta, bildirishnomalar, ish jadvali va tarif.",
      ru: "Двухэтапный вход, валюта, уведомления, график работы и тариф.",
      en: "Two-step sign-in, currency, notifications, work schedule and plan.",
    },
    steps: [
      {
        uz: "Chap menyuning pastidagi **Sozlamalar**ni oching.",
        ru: "Откройте **Настройки** внизу левого меню.",
        en: "Open **Settings** at the bottom of the left menu.",
      },
      {
        uz: "Chapdagi ro'yxatdan bo'limni tanlang: Ikki bosqichli kirish, Shaxsiylashtirish, Bildirishnomalar va boshqalar.",
        ru: "Слева выберите раздел: Двухэтапный вход, Персонализация, Уведомления и другие.",
        en: "Pick a section on the left: Two-step sign-in, Personalization, Notifications and more.",
      },
      {
        uz: "Ism, telefon, til va mavzu (Avto, Yorug', Qorong'i) bitta joyda — chap pastdagi **avataringizni** bosing. Chiqish ham shu yerda.",
        ru: "Имя, телефон, язык и тема (Авто, Светлая, Тёмная) — в одном месте: нажмите на **свой аватар** внизу слева. Выход тоже там.",
        en: "Name, phone, language and theme (Auto, Light, Dark) are in one place — click **your avatar** at the bottom left. Sign-out is there too.",
      },
      {
        uz: "Baholash mezonlari va Telegram hisoboti Super Admin uchun **Admin panel**da, ROP uchun shu yerda.",
        ru: "Критерии оценки и отчёт в Telegram у Супер-админа — в **Админ-панели**, у РОПа — здесь.",
        en: "Scoring criteria and the Telegram report are in the **Admin panel** for a super admin, here for a head of sales.",
      },
    ],
    notes: [
      {
        uz: "Kompaniyangizning o'z manzilini (masalan **niholl.salesiq.uz**) SalesIQ beradi. U Sozlamalar → Umumiy bo'limida holati bilan ko'rinadi. Yangi manzilda xodimlar bir marta qayta kiradi.",
        ru: "Собственный адрес компании (например, **niholl.salesiq.uz**) выдаёт SalesIQ. Он виден со статусом в Настройки → Общие. На новом адресе сотрудники входят один раз заново.",
        en: "Your company's own address (e.g. **niholl.salesiq.uz**) is assigned by SalesIQ. Settings → General shows it with its status. On the new address everyone signs in once more.",
      },
      {
        uz: "Biror lid, sahifa yoki sozlamani topish uchun logoning ostidagi 🔍 tugmasini bosing yoki ⌘K (Windows'da Ctrl+K) ni bosing.",
        ru: "Чтобы найти лид, страницу или настройку, нажмите 🔍 под логотипом или ⌘K (в Windows — Ctrl+K).",
        en: "To find a lead, page or setting, click 🔍 under the logo or press ⌘K (Ctrl+K on Windows).",
      },
    ],
    faq: [],
  },
  {
    slug: "telegram-report",
    group: "basics",
    open: "/daily-report-settings",
    title: {
      uz: "Telegramga avtomatik hisobot",
      ru: "Автоотчёт в Telegram",
      en: "Automatic Telegram report",
    },
    summary: {
      uz: "Har kuni belgilangan vaqtda jamoa natijalari Telegram guruhga keladi.",
      ru: "Каждый день в заданное время итоги команды приходят в Telegram-группу.",
      en: "Every day at a set time the team's results arrive in a Telegram group.",
    },
    need: {
      uz: "SalesIQ boti Telegram guruhingizga qo'shilgan bo'lishi kerak.",
      ru: "Бот SalesIQ должен быть добавлен в вашу Telegram-группу.",
      en: "The SalesIQ bot must be added to your Telegram group.",
    },
    steps: [
      {
        uz: "Bosh sahifada **Hisobot → Har kuni Telegramga yuborish**ni oching.",
        ru: "На Главной откройте **Отчёт → Отправлять в Telegram каждый день**.",
        en: "On Home open **Report → Send to Telegram every day**.",
      },
      {
        uz: "Sahifa tepasidagi **Telegram bot va hisobot** kartasida kim botni ulaganini ko'ring; ulanmagan xodim botni **Sozlamalar**dan ulaydi.",
        ru: "В карточке **Telegram-бот и отчёты** вверху страницы видно, кто подключил бота; сотрудник без бота подключает его в **Настройках**.",
        en: "The **Telegram bot & reports** card at the top shows who has linked the bot; anyone missing links it in **Settings**.",
      },
      {
        uz: "Yuborish vaqtini, tilni va hisobotga kiradigan bo'limlarni tanlang.",
        ru: "Выберите время отправки, язык и разделы отчёта.",
        en: "Choose the send time, language and the parts of the report.",
      },
      {
        uz: "**Hisobot namunasi** bilan qanday ko'rinishini tekshiring va saqlang.",
        ru: "Проверьте вид через **Пример отчёта** и сохраните.",
        en: "Check how it looks with **Report preview** and save.",
      },
    ],
    notes: [],
    faq: [],
  },
  {
    slug: "funnels",
    group: "crm",
    open: "/funnels",
    title: { uz: "Voronkalar va lidlar", ru: "Воронки и лиды", en: "Funnels and leads" },
    summary: {
      uz: "Lidlar bilan kundalik ish: kanban, lid kartasi, vazifa va izohlar.",
      ru: "Ежедневная работа с лидами: канбан, карточка, задачи и заметки.",
      en: "Daily work with leads: the board, the lead card, tasks and notes.",
    },
    steps: [
      {
        uz: "Chap menyudan **Voronkalar**ni oching va voronkani tanlang.",
        ru: "Откройте **Воронки** в левом меню и выберите воронку.",
        en: "Open **Funnels** in the left menu and pick a funnel.",
      },
      {
        uz: "Lid qo'shish uchun yangi lid tugmasini bosing, ism va telefonni kiriting.",
        ru: "Чтобы добавить лида, нажмите кнопку нового лида и укажите имя и телефон.",
        en: "To add a lead, press the new lead button and enter name and phone.",
      },
      {
        uz: "Lidni keyingi etapga sudrab o'tkazing yoki kartasini ochib etapni almashtiring.",
        ru: "Перетащите лида на следующий этап или смените этап в его карточке.",
        en: "Drag a lead to the next stage or change the stage in its card.",
      },
      {
        uz: "Kartada qo'ng'iroq qiling, izoh yozing va keyingi vazifani qo'ying.",
        ru: "В карточке звоните, пишите заметки и ставьте следующую задачу.",
        en: "From the card call, write notes and set the next task.",
      },
      {
        uz: "Lid ma'lumotlarini o'zgartirish uchun kartadagi **Lid haqida ma'lumot** yonidagi **Tahrirlash** tugmasini bosing.",
        ru: "Чтобы изменить данные лида, нажмите **Изменить** рядом с **Информацией о лиде** в карточке.",
        en: "To change a lead's details, press **Edit** next to **Lead info** in its card.",
      },
      {
        uz: "Kontaktlar va mijoz kompaniyalari ro'yxati **Voronkalar** sahifasining yuqorisidagi tugmalardan ochiladi.",
        ru: "Списки контактов и компаний клиентов открываются кнопками вверху страницы **Воронки**.",
        en: "The contact and client-company lists open from the buttons at the top of **Funnels**.",
      },
      {
        uz: "Voronka ichidagi qizil **Vazifalar** tugmasi ochiq vazifalarni uch ustunda ko'rsatadi: muddati o'tgan, bugungi va ertaga hamda keyingi kunlar. Kartani bossangiz lid ochiladi.",
        ru: "Красная кнопка **Задачи** внутри воронки показывает открытые задачи в трёх колонках: просроченные, на сегодня и на завтра и позже. Нажмите на карточку, чтобы открыть лида.",
        en: "The red **Tasks** button inside a funnel shows open tasks in three columns: overdue, today, and tomorrow and later. Click a card to open the lead.",
      },
      {
        uz: "Ko'p lidga xabar yuborish: lidlarni belgilang (yoki etaplarni tanlang), **Messenjerga yozish**ni bosing, kanalni tanlang, matn va fayl qo'shing, so'ng tasdiqlash so'zini yozib **Navbatga qo'shish**ni bosing.",
        ru: "Массовая рассылка: отметьте лидов (или выберите этапы), нажмите **Написать в мессенджеры**, выберите канал, добавьте текст и файл, введите слово подтверждения и нажмите **Поставить в очередь**.",
        en: "Bulk message: select leads (or pick stages), press **Write to messengers**, choose a channel, add text and a file, type the confirmation word and press **Add to queue**.",
      },
      {
        uz: "Lid kartasidagi **Sozlamalar** yorlig'ida (Super Admin) kartadagi hamma maydon, guruh va kontakt maydonlarini nomlash, yashirish, tartiblash va qo'shish mumkin.",
        ru: "На вкладке **Настроить** в карточке лида (Super Admin) все поля, группы и поля контакта можно переименовать, скрыть, упорядочить и добавить.",
        en: "The **Settings** tab in a lead card (Super Admin) renames, hides, reorders and adds every field, group and contact field of the card.",
      },
      {
        uz: "**...** → **Lid taqsimlash** (Super Admin, ROP): etapni, nechta lidni va shartni (boshidan, har 2 tadan biri, o'rtasidan, oxiridan va h.k.) tanlang, kerak bo'lsa teg va sana bo'yicha toraytiring, xodimlarni belgilang — lidlar ularga teng bo'linadi. O'ng tomonda qaysi lidlar kimga o'tishi oldindan ko'rinadi.",
        ru: "**...** → **Распределение лидов** (Super Admin, РОП): выберите этап, сколько лидов и условие (с начала, каждый второй, из середины, с конца и др.), при необходимости сузьте по тегу и дате, отметьте сотрудников — лиды делятся поровну. Справа заранее видно, какие лиды кому уйдут.",
        en: "**...** → **Distribute leads** (Super Admin, head of sales): pick the stage, how many leads and the rule (from the start, every second one, the middle, the end, ...), narrow by tag and date if needed and tick the people — the leads are split evenly. The right side shows in advance which leads go to whom.",
      },
      {
        uz: "**...** → **Lidlarga xabar yuborish**: birinchi etapni va lidlarni (dastlabki N ta yoki 1-, 2-, 3- yoki istalgan N talik guruh) tanlang, **Keyingi etapni tanlash** bilan boshqa etaplarni qo'shing, matn yozing, rasm, fayl, audio qo'shing yoki skrinshotni Cmd+V bilan qo'ying va **YUBORISH**ni bosing.",
        ru: "**...** → **Написать лидам**: выберите первый этап и лидов (первые N или 1-я, 2-я, 3-я либо любая группа по N), кнопкой **Выбрать следующий этап** добавьте другие этапы, напишите текст, прикрепите фото, файл, аудио или вставьте скриншот Cmd+V и нажмите **ОТПРАВИТЬ**.",
        en: "**...** → **Message leads**: pick the first stage and which leads (the first N, or the 1st, 2nd, 3rd or any group of N), add more stages with **Add the next stage**, write the text, attach photos, files, audio or paste a screenshot with Cmd+V, then press **SEND**.",
      },
      {
        uz: "Mijoz salesbot orqali ro'yxatdan o'tayotganda uning kartasi voronkada darhol paydo bo'ladi va yashil **Ro'yxatdan o'tmoqda** belgisi bilan ajralib turadi. O'ng tomonda chiqadigan oynada u nechta savolga javob bergani va oxirgi javobi ko'rinadi.",
        ru: "Когда клиент регистрируется через салесбот, его карточка сразу появляется в воронке с зелёной меткой **Регистрируется**, а окно справа показывает, на сколько вопросов он ответил и его последний ответ.",
        en: "While a client registers through a salesbot, their card appears in the funnel at once with a green **Registering now** badge, and a pop-up on the right shows how many questions they have answered and their last answer.",
      },
    ],
    notes: [
      {
        uz: "Ba'zi etaplarda vazifa yoki izohsiz lidni o'tkazib bo'lmaydi — buni admin **Vazifa nazorati**da yoqadi.",
        ru: "На некоторых этапах лида нельзя перенести без задачи или заметки — это включает админ в **Контроле задач**.",
        en: "Some stages don't let a lead move without a task or note — the admin turns this on in **Task control**.",
      },
      {
        uz: "Yangi lid kartasida taymer bor: hech kim qo'ng'iroq qilmagan yoki yozmagan bo'lsa, 5 daqiqadan keyin sariq bo'ladi va mas'ulga eslatma ketadi, 15 daqiqadan keyin qizil bo'ladi va ROPga ham xabar boradi.",
        ru: "На карточке нового лида есть таймер: если никто не позвонил и не написал, через 5 минут он жёлтый и ответственному приходит напоминание, через 15 — красный, и сообщение получает РОП.",
        en: "A new lead's card has a timer: if nobody has called or written, after 5 minutes it turns amber and the owner is reminded; after 15 it turns red and the head of sales is told too.",
      },
      {
        uz: "Kartada **Patok** (masalan 14.1), qarz summasi va keyingi to'lov sanasi ham ko'rinadi; filtrda Patok va Kampaniya bo'yicha tanlash mumkin.",
        ru: "На карточке видны **Поток** (например 14.1), сумма долга и дата следующей оплаты; в фильтре можно выбрать Поток и Кампанию.",
        en: "Cards also show the **Stream** (e.g. 14.1), what is still owed and the next payment date; the filter picks by Stream and Campaign.",
      },
      {
        uz: "Lidni yo'qotilgan etapga o'tkazishda sabab so'raladi (Qimmat, Raqobatchini tanladi, Javob bermayapti va boshqalar). Sabablar **Lid tahlili**da yig'iladi.",
        ru: "При переносе лида в проигранный этап спрашивается причина (Дорого, Выбрал конкурента, Не отвечает и др.). Причины собираются в **Аналитике лидов**.",
        en: "Moving a lead into a lost stage asks for the reason (Too expensive, Chose a competitor, Doesn't answer and more). The reasons add up in **Lead analysis**.",
      },
      {
        uz: "Saqlangan filtr: filtrni sozlab **Saqlash**ni bosing — sahifa keyingi safar shu filtr bilan ochiladi.",
        ru: "Сохранённый фильтр: настройте фильтр и нажмите **Сохранить** — страница в следующий раз откроется с ним.",
        en: "Saved filter: set the filter and press **Save** — the page opens with it next time.",
      },
    ],
    faq: [
      {
        q: {
          uz: "Lidni etapga o'tkazib bo'lmayapti",
          ru: "Не получается перенести лида",
          en: "I can't move a lead",
        },
        a: {
          uz: "Avval lidga vazifa yoki izoh qo'shing — shu etap buni talab qiladi.",
          ru: "Сначала добавьте лиду задачу или заметку — этого требует этап.",
          en: "Add a task or note to the lead first — that stage requires it.",
        },
      },
    ],
  },
  {
    slug: "inbox",
    group: "crm",
    open: "/inbox",
    title: { uz: "Inbox — barcha chatlar", ru: "Inbox — все чаты", en: "Inbox — every chat" },
    summary: {
      uz: "Telegram va Instagram'dagi mijoz suhbatlari bir ro'yxatda, amoCRM imBox'idagi kabi filtrlar bilan; chat to'liq lid kartasi bo'lib ochiladi.",
      ru: "Чаты клиентов из Telegram и Instagram в одном списке с фильтрами как в imBox amoCRM; чат открывается полной карточкой лида.",
      en: "Client chats from Telegram and Instagram in one list with filters like amoCRM's imBox; a chat opens as the full lead card.",
    },
    steps: [
      {
        uz: "Chap menyudan **Inbox**ni oching. Ko'k nuqta — o'qilmagan xabar, sariq **Javobsiz** — o'qilgan, lekin hali javob berilmagan.",
        ru: "Откройте **Inbox** в левом меню. Синяя точка — непрочитанное, жёлтое **Без ответа** — прочитано, но ответа ещё нет.",
        en: "Open **Inbox** in the left menu. A blue dot means unread; amber **No answer** means read but not answered yet.",
      },
      {
        uz: "Qidiruv ostida ikki tugma: **O'qilmagan** va **O'qilgan** (qayta bossangiz — o'chadi). Javob kutayotgan suhbatlar ro'yxatda ochiq rangda, javob berilgan yoki xabarsizlari to'qroq. Yulduzcha bilan suhbatni sevimlilarga qo'shing.",
        ru: "Под поиском две кнопки: **Непрочитанные** и **Прочитанные** (повторное нажатие снимает). Беседы, ждущие ответа, в списке светлее, отвеченные и без сообщений — темнее. Звёздочка добавляет беседу в избранное.",
        en: "Under the search there are two buttons: **Unread** and **Read** (press again to clear). Chats waiting for an answer are lighter in the list; answered or silent ones are darker. The star adds a chat to favourites.",
      },
      {
        uz: "**Filtrlar** ro'yxat ustunining o'zida ochiladi: tayyor ro'yxatlar (ochiq, javob kutayotgan, o'qilgan-javobsiz, men mas'ul, sevimlilar), raqam yoki ism, oxirgi xabar sanasi, voronka va bosqichlar, kanal, javob holati, mas'ul, oxirgi xabar muallifi. **Filtrni saqlash** bilan nom berib saqlang.",
        ru: "**Фильтры** открываются прямо в колонке списка: готовые списки (открытые, ждут ответа, прочитаны без ответа, мои, избранные), номер или имя, дата последнего сообщения, воронка и этапы, канал, статус ответа, ответственный, автор последнего сообщения. **Сохранить фильтр** — под своим названием.",
        en: "**Filters** open right in the list column: ready lists (open, awaiting an answer, read but unanswered, mine, favourites), number or name, last message date, funnel and stages, channel, answer state, owner, who wrote last. **Save filter** keeps it under a name.",
      },
      {
        uz: "Suhbatni bossangiz, o'ngda chat ochiladi. Chat tepasidagi lid nomini (yoki **Lid ma'lumotlari**ni) bossangiz, chap tomonda ro'yxat o'rnida lid kartasi chiqadi: mas'ul, byudjet, maydonlar, to'lovlar, kontakt. **Yopish** yoki ‹ bilan ro'yxatga qaytasiz.",
        ru: "Нажмите беседу — справа откроется чат. Нажмите имя лида над чатом (или **Данные сделки**) — слева вместо списка появится карточка: ответственный, бюджет, поля, оплаты, контакт. **Скрыть** или ‹ возвращают к списку.",
        en: "Click a chat and it opens on the right. Click the lead's name above the chat (or **Lead details**) and the lead card replaces the list on the left: owner, budget, fields, payments, contact. **Hide details** or ‹ brings the list back.",
      },
    ],
    notes: [],
    faq: [],
  },
  {
    slug: "pipelines",
    group: "crm",
    open: "/admin/pipelines",
    title: {
      uz: "Voronka va etaplarni sozlash",
      ru: "Настройка воронок и этапов",
      en: "Setting up funnels and stages",
    },
    summary: {
      uz: "Sotuv yo'lini etaplarga bo'lish: yangi, aloqa, uchrashuv, to'lov…",
      ru: "Разбить путь продажи на этапы: новый, контакт, встреча, оплата…",
      en: "Split the sales path into stages: new, contact, meeting, payment…",
    },
    steps: [
      {
        uz: "**Admin → Voronkalar va etaplar**ni oching.",
        ru: "Откройте **Админ → Воронки и этапы**.",
        en: "Open **Admin → Funnels and stages**.",
      },
      {
        uz: "Voronka nomini yozib **Voronka qo'shish**ni bosing.",
        ru: "Введите название и нажмите **Добавить воронку**.",
        en: "Type a name and press **Add funnel**.",
      },
      {
        uz: "Voronka ichida etaplarni qo'shing, nomini va rangini bering, tartibini o'zgartiring.",
        ru: "Внутри воронки добавьте этапы, задайте название, цвет и порядок.",
        en: "Inside the funnel add stages, give each a name and colour, set their order.",
      },
      {
        uz: "Sotuv bo'lgan etapni **yutilgan**, rad etilganni **yo'qotilgan** deb belgilang — hisobotlar shunga tayanadi.",
        ru: "Отметьте этап продажи как **выигран**, отказ — как **проигран**: на это опираются отчёты.",
        en: "Mark the sale stage as **won** and the refusal stage as **lost** — reports rely on this.",
      },
    ],
    notes: [
      {
        uz: "amoCRM yoki Bitrix24'dan kelgan voronkalar o'sha tizimdan sinxronlanadi — ularni shu yerda emas, o'sha tizimda o'zgartiring.",
        ru: "Воронки из amoCRM или Битрикс24 синхронизируются оттуда — меняйте их там.",
        en: "Funnels from amoCRM or Bitrix24 sync from there — change them there.",
      },
    ],
    faq: [],
  },
  {
    slug: "lead-fields",
    group: "crm",
    open: "/funnels",
    title: { uz: "Lid maydonlari", ru: "Поля лида", en: "Lead fields" },
    summary: {
      uz: "Lid kartasidagi hamma maydonni lid ichidagi **Sozlamalar** yorlig'idan sozlash.",
      ru: "Все поля карточки лида настраиваются на вкладке **Настроить** внутри лида.",
      en: "Every field on the lead card is set up from the **Settings** tab inside a lead.",
    },
    steps: [
      {
        uz: "**Voronkalar**dan istalgan lidni oching va chap paneldagi **Sozlamalar** yorlig'ini bosing (faqat Super Admin).",
        ru: "Откройте любого лида из **Воронок** и нажмите вкладку **Настроить** в левой панели (только Super Admin).",
        en: "Open any lead from **Funnels** and press the **Settings** tab in the left panel (Super Admin only).",
      },
      {
        uz: "Kartadagi har bir qator shu yerda o'sha tartibda turadi: nomini bosib o'zgartiring, ko'zcha bilan yashiring, strelkalar bilan tartiblang.",
        ru: "Каждая строка карточки здесь в том же порядке: нажмите на название, чтобы переименовать, глазок — скрыть, стрелки — изменить порядок.",
        en: "Every row of the card is here in the same order: click a name to rename it, the eye hides it, the arrows reorder it.",
      },
      {
        uz: "Guruh ichida **Maydon qo'shish**ni bosing va turini tanlang (matn, raqam, sana, ro'yxat va boshqalar); qalamcha bilan turi va variantlarini o'zgartiring.",
        ru: "Внутри группы нажмите **Добавить поле** и выберите тип (текст, число, дата, список и др.); карандаш меняет тип и варианты.",
        en: "Inside a group press **Add field** and pick its type (text, number, date, list and more); the pencil changes the type and options.",
      },
      {
        uz: "**Guruh qo'shish** bilan yangi guruh yarating; guruhni nomlash, yashirish, ko'chirish va o'chirish mumkin.",
        ru: "**Добавить группу** создаёт новую группу; группу можно переименовать, скрыть, переместить и удалить.",
        en: "**Add group** creates a new group; a group can be renamed, hidden, moved and deleted.",
      },
    ],
    notes: [
      {
        uz: "O'zgarishlar darhol saqlanadi va kompaniyaning barcha lid kartalarida ko'rinadi.",
        ru: "Изменения сохраняются сразу и видны во всех карточках лидов компании.",
        en: "Changes save at once and show on every lead card in the company.",
      },
    ],
    faq: [],
  },
  {
    slug: "lead-sources",
    group: "crm",
    open: "/admin/lead-sources",
    title: { uz: "Lid manbalari", ru: "Источники лидов", en: "Lead sources" },
    summary: {
      uz: "Reklama, sayt va boshqa xizmatlardan lidlarni avtomatik olish.",
      ru: "Автоматический приём лидов из рекламы, сайта и сервисов.",
      en: "Receive leads automatically from ads, your website and other services.",
    },
    steps: [
      {
        uz: "**Admin → Lid manbalari**ni oching.",
        ru: "Откройте **Админ → Источники лидов**.",
        en: "Open **Admin → Lead sources**.",
      },
      {
        uz: "Nomini yozing (masalan, Instagram reklama) va turini tanlang: oddiy vebhuk yoki Meta Lead Ads.",
        ru: "Введите название (например, Instagram реклама) и тип: простой вебхук или Meta Lead Ads.",
        en: "Name it (e.g. Instagram ads) and pick the type: plain webhook or Meta Lead Ads.",
      },
      {
        uz: "Mas'ul menejer va lid tushadigan etapni tanlab **Manba qo'shish**ni bosing.",
        ru: "Выберите ответственного и этап, куда падает лид, и нажмите **Добавить источник**.",
        en: "Pick the owner and the stage leads land in, then press **Add source**.",
      },
      {
        uz: "Hosil bo'lgan havolani reklama yoki sayt sozlamasiga qo'ying.",
        ru: "Вставьте полученную ссылку в настройки рекламы или сайта.",
        en: "Paste the generated link into your ads or website settings.",
      },
    ],
    notes: [
      {
        uz: "Havola ichida maxfiy kalit bor — uni begonalarga bermang.",
        ru: "В ссылке есть секретный ключ — не передавайте её посторонним.",
        en: "The link contains a secret key — don't share it.",
      },
    ],
    faq: [],
  },
  {
    slug: "web-forms",
    group: "crm",
    open: "/admin/web-forms",
    title: { uz: "Veb-formalar", ru: "Веб-формы", en: "Web forms" },
    summary: {
      uz: "Saytga qo'yiladigan forma — to'ldirilsa lid voronkaga tushadi.",
      ru: "Форма для сайта — после заполнения лид падает в воронку.",
      en: "A form for your website — when filled in, the lead lands in your funnel.",
    },
    steps: [
      {
        uz: "**Admin → Veb-formalar**ni oching.",
        ru: "Откройте **Админ → Веб-формы**.",
        en: "Open **Admin → Web forms**.",
      },
      {
        uz: "Nomini yozing va **Forma yaratish**ni bosing.",
        ru: "Введите название и нажмите **Создать форму**.",
        en: "Type a name and press **Create form**.",
      },
      {
        uz: "Maydonlarni qo'shing, majburiylarini belgilang, voronka va etapni tanlang.",
        ru: "Добавьте поля, отметьте обязательные, выберите воронку и этап.",
        en: "Add fields, mark the required ones, pick the funnel and stage.",
      },
      {
        uz: "Forma havolasini nusxalab saytga yoki ijtimoiy tarmoqqa joylang.",
        ru: "Скопируйте ссылку формы и разместите на сайте или в соцсетях.",
        en: "Copy the form link and put it on your website or social pages.",
      },
    ],
    notes: [],
    faq: [],
  },
  {
    slug: "task-control",
    group: "crm",
    open: "/admin/task-control",
    title: { uz: "Vazifa nazorati", ru: "Контроль задач", en: "Task control" },
    summary: {
      uz: "Menejer lidni vazifa yoki izohsiz qoldirmasligi uchun qoidalar.",
      ru: "Правила, чтобы менеджер не оставлял лида без задачи или заметки.",
      en: "Rules so reps never leave a lead without a task or note.",
    },
    steps: [
      {
        uz: "**Admin → Vazifa nazorati**ni oching.",
        ru: "Откройте **Админ → Контроль задач**.",
        en: "Open **Admin → Task control**.",
      },
      {
        uz: "Voronkani tanlang va vazifa majburiy bo'ladigan etaplarni yoqing.",
        ru: "Выберите воронку и включите этапы, где задача обязательна.",
        en: "Pick a funnel and switch on the stages where a task is required.",
      },
      {
        uz: "Pastdagi ro'yxatda qoidani buzganlarni ko'ring.",
        ru: "Ниже видно, кто нарушает правило.",
        en: "The list below shows who breaks the rule.",
      },
    ],
    notes: [
      {
        uz: "Qoida bazada ishlaydi: menejer uni chetlab o'ta olmaydi.",
        ru: "Правило работает в базе данных: обойти его нельзя.",
        en: "The rule runs in the database: reps can't get around it.",
      },
    ],
    faq: [],
  },
  {
    slug: "duplicates",
    group: "crm",
    open: "/admin/duplicates",
    title: { uz: "Dublikatlar", ru: "Дубликаты", en: "Duplicates" },
    summary: {
      uz: "Bitta mijoz uchun bitta voronkada faqat bitta lid bo'lishi.",
      ru: "Один клиент — один лид в воронке.",
      en: "One client, one lead per funnel.",
    },
    steps: [
      {
        uz: "**Admin → Dublikatlar**ni oching.",
        ru: "Откройте **Админ → Дубликаты**.",
        en: "Open **Admin → Duplicates**.",
      },
      {
        uz: "Qaysi maydon bo'yicha tekshirishni (telefon, email) va qaysi voronkalarda ishlashini tanlang.",
        ru: "Выберите, по каким полям проверять (телефон, email) и в каких воронках.",
        en: "Choose which fields to check (phone, email) and in which funnels.",
      },
      {
        uz: "Topilgan juftliklarni birlashtiring yoki **Dublikat emas** deb belgilang.",
        ru: "Найденные пары объедините или отметьте **Не дубликат**.",
        en: "Merge the pairs found or mark them **Not a duplicate**.",
      },
      {
        uz: "Avtomatik birlashtirishni yoqsangiz, har kecha dublikatlar o'zi birlashadi.",
        ru: "С автообъединением дубликаты объединяются сами каждую ночь.",
        en: "With auto-merge on, duplicates merge by themselves every night.",
      },
    ],
    notes: [],
    faq: [],
  },
  {
    slug: "automations",
    group: "crm",
    open: "/admin/automations",
    title: { uz: "Avtomatizatsiyalar", ru: "Автоматизации", en: "Automations" },
    summary: {
      uz: "Lid etapga kirganda xabar yuborish, vazifa qo'yish, teg qo'shish.",
      ru: "Сообщение, задача или тег, когда лид попадает на этап.",
      en: "Send a message, set a task or add a tag when a lead enters a stage.",
    },
    steps: [
      {
        uz: "**Admin → Avtomatizatsiyalar**ni oching.",
        ru: "Откройте **Админ → Автоматизации**.",
        en: "Open **Admin → Automations**.",
      },
      {
        uz: "Voronka va etapni tanlang, yangi qoida qo'shing.",
        ru: "Выберите воронку и этап, добавьте правило.",
        en: "Pick the funnel and stage, add a rule.",
      },
      {
        uz: "Qachon ishlashini tanlang: yangi lid, etapga kirish, etapda uzoq turish, teg qo'yilishi yoki mijoz yozishi.",
        ru: "Выберите, когда срабатывать: новый лид, вход на этап, долго на этапе, тег или сообщение клиента.",
        en: "Choose when it fires: new lead, entering a stage, stuck in a stage, a tag or a client message.",
      },
      {
        uz: "Amalni tanlang (xabar, vazifa, teg, etapni almashtirish) va saqlang.",
        ru: "Выберите действие (сообщение, задача, тег, смена этапа) и сохраните.",
        en: "Pick the action (message, task, tag, stage change) and save.",
      },
    ],
    notes: [],
    faq: [],
  },
  {
    slug: "salesbots",
    group: "crm",
    open: "/admin/salesbots",
    title: { uz: "Salesbotlar", ru: "Сейлзботы", en: "Salesbots" },
    summary: {
      uz: "Mijozni Telegram'da ro'yxatdan o'tkazadigan tayyor bot, murakkab sxemali bot yoki o'zingiz yozgan botni ulash.",
      ru: "Готовый бот регистрации клиентов в Telegram, бот со сложной схемой или подключение своего бота.",
      en: "A ready bot that registers clients in Telegram, a bot with a complex flow, or your own coded bot.",
    },
    steps: [
      {
        uz: "**Admin → Salesbotlar**ni oching, **Yangi salesbot** → **Tayyor bot: mijozni ro'yxatdan o'tkazish**ni tanlang.",
        ru: "Откройте **Админ → Сейлзботы**, **Новый салесбот** → **Готовый бот: регистрация клиента**.",
        en: "Open **Admin → Salesbots**, **New salesbot** → **Ready bot: register a client**.",
      },
      {
        uz: "**Oddiy sozlash**da salomlashish, savollar (javob qayerga yozilishi: ism, telefon, izoh...), yakuniy xabar va keyingi CRM amallarini (bosqich, teg, menejerga vazifa) moslang. O'ngda suhbat Telegram'da qanday ko'rinishi chiqadi.",
        ru: "В **Простой настройке** поправьте приветствие, вопросы (куда записать ответ: имя, телефон, примечание...), финальное сообщение и действия в CRM (этап, тег, задача менеджеру). Справа видно, как диалог выглядит в Telegram.",
        en: "In **Simple setup** adjust the greeting, the questions (where each answer goes: name, phone, note...), the final message and the CRM actions (stage, tag, task for the manager). The right side shows how the chat looks in Telegram.",
      },
      {
        uz: "**Saqlash**ni bosing — **Sinab ko'rish va ulashish** blokida botning Telegram havolasi chiqadi. **Telegram'da sinash**ni bosib, o'zingiz ro'yxatdan o'tib ko'ring.",
        ru: "Нажмите **Сохранить** — в блоке **Проверить и поделиться** появится ссылка на бота в Telegram. Нажмите **Проверить в Telegram** и пройдите регистрацию сами.",
        en: "Press **Save** — the bot's Telegram link appears under **Test and share**. Press **Test in Telegram** and register yourself.",
      },
      {
        uz: "Havolani reklama, Instagram bio yoki saytga qo'ying: ochgan har bir odam CRM'da «Telegram bot» manbali lid bo'ladi.",
        ru: "Разместите ссылку в рекламе, шапке Instagram или на сайте: каждый, кто её откроет, станет лидом из «Telegram bot».",
        en: "Put the link in ads, an Instagram bio or your website: everyone who opens it becomes a lead from “Telegram bot”.",
      },
    ],
    notes: [
      {
        uz: "Shartlar va tarmoqlar kerak bo'lsa — **Sxema (kengaytirilgan)** rejimida bloklarni o'zingiz bog'laysiz. Bunday botni avtomatizatsiyadan yoki lid kartasidan ham ishga tushirish mumkin.",
        ru: "Если нужны условия и ветки — в режиме **Схема (расширенная)** блоки соединяются вручную. Такого бота можно запускать и из автоматизации или карточки лида.",
        en: "Need conditions and branches? In **Flow (advanced)** you connect the blocks yourself. Such a bot can also be started from an automation or the lead card.",
      },
      {
        uz: "Botingiz Python, Node yoki boshqa tilda yozilgan bo'lsa — **O'z botim (kod)** rejimida maxfiy API manzil yarating va bot mijozni yig'ib bo'lgach unga `name`, `phone`, `message` bilan bitta POST so'rov yuborsin. Tayyor kod namunasi shu yerda.",
        ru: "Если ваш бот написан на Python, Node или другом языке — в режиме **Свой бот (код)** создайте закрытый API-адрес, и пусть бот отправит на него один POST-запрос с `name`, `phone`, `message`. Готовый пример кода там же.",
        en: "If your bot is written in Python, Node or another language, create a private API address in **Your own bot (code)** and have the bot send one POST request with `name`, `phone`, `message`. A ready code sample is right there.",
      },
    ],
    faq: [
      {
        q: {
          uz: "Havola ochildi, lekin bot javob bermayapti",
          ru: "Ссылка открылась, но бот не отвечает",
          en: "The link opens but the bot doesn't answer",
        },
        a: {
          uz: "Bot **yoqilgan** va **saqlangan**ligini, kanal «Avtomatik» yoki «Telegram» ekanini tekshiring. Pastdagi **So'nggi ishga tushirishlar**da xato sababi yoziladi.",
          ru: "Проверьте, что бот **включён** и **сохранён**, а канал — «Авто» или «Telegram». Причина ошибки видна ниже в **Последних запусках**.",
          en: "Check that the bot is **on** and **saved** and the channel is Auto or Telegram. **Recent runs** below shows the error.",
        },
      },
    ],
  },
  {
    slug: "auto-responders",
    group: "crm",
    open: "/admin/auto-responders",
    title: { uz: "Avto-javoblar", ru: "Автоответы", en: "Auto-replies" },
    summary: {
      uz: "Mijoz ma'lum savol bersa, avtomatik javob yuboriladi.",
      ru: "Автоматический ответ на типовой вопрос клиента.",
      en: "An automatic answer when a client asks a known question.",
    },
    steps: [
      {
        uz: "**Admin → Avto-javoblar**ni oching va yangi qoida qo'shing.",
        ru: "Откройте **Админ → Автоответы** и добавьте правило.",
        en: "Open **Admin → Auto-replies** and add a rule.",
      },
      {
        uz: "Savol matnini va yuboriladigan javobni yozing.",
        ru: "Введите текст вопроса и ответ.",
        en: "Type the question text and the reply.",
      },
      {
        uz: "Kanallarni belgilang va saqlang.",
        ru: "Отметьте каналы и сохраните.",
        en: "Tick the channels and save.",
      },
    ],
    notes: [],
    faq: [],
  },
  {
    slug: "contracts",
    group: "crm",
    open: "/admin/contract-templates",
    title: { uz: "Shartnoma shablonlari", ru: "Шаблоны договоров", en: "Contract templates" },
    summary: {
      uz: "Lid ma'lumotlari bilan avtomatik to'ldiriladigan shartnoma.",
      ru: "Договор, который заполняется данными лида.",
      en: "A contract filled in with the lead's data.",
    },
    steps: [
      {
        uz: "**Admin → Shartnoma shablonlari**ni oching va **Yangi shablon** yarating.",
        ru: "Откройте **Админ → Шаблоны договоров** и создайте **Новый шаблон**.",
        en: "Open **Admin → Contract templates** and create a **New template**.",
      },
      {
        uz: "Matnga lid maydonlarini qo'ying (ism, telefon, summa) — ular avtomatik to'ldiriladi.",
        ru: "Вставьте в текст поля лида (имя, телефон, сумма) — они заполнятся сами.",
        en: "Put lead fields into the text (name, phone, amount) — they fill in by themselves.",
      },
      {
        uz: "Lid kartasidan shartnomani yarating va mijozga yuboring.",
        ru: "Создайте договор из карточки лида и отправьте клиенту.",
        en: "Create the contract from the lead card and send it to the client.",
      },
    ],
    notes: [],
    faq: [],
  },
  {
    slug: "amocrm",
    group: "integrations",
    open: "/integrations/amocrm",
    title: { uz: "amoCRM", ru: "amoCRM", en: "amoCRM" },
    summary: {
      uz: "amoCRM'dan lidlar, qo'ng'iroqlar va izohlarni avtomatik olib kelish.",
      ru: "Автоматическая загрузка лидов, звонков и заметок из amoCRM.",
      en: "Bring leads, calls and notes in from amoCRM automatically.",
    },
    need: {
      uz: "amoCRM akkauntida administrator huquqi.",
      ru: "Права администратора в аккаунте amoCRM.",
      en: "Admin rights in your amoCRM account.",
    },
    steps: [
      {
        uz: "**Admin → amoCRM** kartasini oching.",
        ru: "Откройте карточку **Админ → amoCRM**.",
        en: "Open the **Admin → amoCRM** card.",
      },
      {
        uz: "**AmoCRM'ni ulash**ni bosing va amoCRM oynasida ruxsat bering.",
        ru: "Нажмите **Подключить AmoCRM** и разрешите доступ в окне amoCRM.",
        en: "Press **Connect AmoCRM** and allow access in the amoCRM window.",
      },
      {
        uz: "**Menejerlarni yangilash**ni bosing — amoCRM foydalanuvchilari xodimlarga bog'lanadi.",
        ru: "Нажмите **Обновить менеджеров** — пользователи amoCRM свяжутся с сотрудниками.",
        en: "Press **Refresh managers** — amoCRM users get linked to your employees.",
      },
      {
        uz: "Birinchi sinxronlash tarixni olib keladi; keyin har 5 daqiqada o'zi yangilanadi.",
        ru: "Первая синхронизация забирает историю; дальше обновление каждые 5 минут.",
        en: "The first sync brings in history; after that it updates every 5 minutes.",
      },
    ],
    notes: [
      {
        uz: "amoCRM'dan kelgan lidlar faqat tahlil uchun — voronka qoidalari ularga qo'llanmaydi.",
        ru: "Лиды из amoCRM только для аналитики — правила воронки к ним не применяются.",
        en: "Leads from amoCRM are for analytics only — funnel rules don't apply to them.",
      },
      {
        uz: "Katta akkauntda birinchi import bir necha soat davom etishi mumkin.",
        ru: "В большом аккаунте первый импорт может длиться несколько часов.",
        en: "On a large account the first import can take a few hours.",
      },
    ],
    faq: [
      {
        q: {
          uz: "Sinxronlash to'xtab qoldi",
          ru: "Синхронизация остановилась",
          en: "Syncing stopped",
        },
        a: {
          uz: "Kartadagi **Sinxronlash**ni bosing. Xato chiqsa, **Qayta ulash** bilan ruxsatni yangilang.",
          ru: "Нажмите **Синхронизировать** в карточке. При ошибке обновите доступ через **Переподключить**.",
          en: "Press **Sync** on the card. If there's an error, renew access with **Reconnect**.",
        },
      },
    ],
  },
  {
    slug: "bitrix24",
    group: "integrations",
    open: "/integrations/bitrix24",
    title: { uz: "Bitrix24", ru: "Битрикс24", en: "Bitrix24" },
    summary: {
      uz: "Bitrix24'dan bitimlar, kontaktlar va qo'ng'iroqlarni olib kelish.",
      ru: "Загрузка сделок, контактов и звонков из Битрикс24.",
      en: "Bring deals, contacts and calls in from Bitrix24.",
    },
    need: {
      uz: "Bitrix24 portalida kiruvchi webhook yaratish huquqi.",
      ru: "Право создавать входящий вебхук в портале Битрикс24.",
      en: "The right to create an inbound webhook in your Bitrix24 portal.",
    },
    steps: [
      {
        uz: "Bitrix24'da: **Dasturchilar uchun → Boshqa → Kiruvchi webhook** yarating.",
        ru: "В Битрикс24: **Разработчикам → Другое → Входящий вебхук**.",
        en: "In Bitrix24: **Developer resources → Other → Inbound webhook**.",
      },
      {
        uz: "Ruxsatlarni bering: `crm`, `user`, `telephony` — uchalasi ham kerak.",
        ru: "Выдайте права: `crm`, `user`, `telephony` — нужны все три.",
        en: "Grant the scopes `crm`, `user`, `telephony` — all three are needed.",
      },
      {
        uz: "Hosil bo'lgan manzilni **Admin → Bitrix24** sahifasidagi maydonga qo'yib, ulash tugmasini bosing.",
        ru: "Вставьте полученный адрес в поле на странице **Админ → Битрикс24** и нажмите подключить.",
        en: "Paste the URL into the field on **Admin → Bitrix24** and press connect.",
      },
    ],
    notes: [
      {
        uz: "Webhook manzili — maxfiy kalit. Uni skrinshot qilmang va hech kimga yubormang.",
        ru: "Адрес вебхука — секретный ключ. Не делайте скриншотов и никому не отправляйте.",
        en: "The webhook URL is a secret key. Don't screenshot it or send it to anyone.",
      },
      {
        uz: "`telephony` ruxsati bo'lmasa, qo'ng'iroq yozuvlari kelmaydi.",
        ru: "Без права `telephony` записи звонков не придут.",
        en: "Without the `telephony` scope, call recordings won't come in.",
      },
    ],
    faq: [],
  },
  {
    slug: "telephony",
    group: "integrations",
    open: "/admin/telephony",
    title: { uz: "Telefoniya", ru: "Телефония", en: "Telephony" },
    summary: {
      uz: "ATS'dan qo'ng'iroqlar va yozuvlar: OnlinePBX, Sipuni, MoiZvonki va boshqalar.",
      ru: "Звонки и записи из АТС: OnlinePBX, Sipuni, MoiZvonki и другие.",
      en: "Calls and recordings from your PBX: OnlinePBX, Sipuni, MoiZvonki and others.",
    },
    need: {
      uz: "ATS kabinetidagi API kalit (yoki ulash tokeni).",
      ru: "API-ключ из кабинета АТС (или токен подключения).",
      en: "The API key from your PBX account (or a connection token).",
    },
    steps: [
      {
        uz: "**Admin** panelining **Telefoniya** bo'limida ATS'ingiz kartasini oching (OnlinePBX, Sipuni, Мои Звонки…).",
        ru: "В разделе **Телефония** панели **Админ** откройте карточку своей АТС (OnlinePBX, Sipuni, Мои Звонки…).",
        en: "In the **Telephony** section of **Admin**, open your PBX's card (OnlinePBX, Sipuni, Moi Zvonki…).",
      },
      {
        uz: "Domen va API kalitlarini kiriting, **Tekshirish va ulash**ni bosing.",
        ru: "Введите домен и API-ключи, нажмите **Проверить и подключить**.",
        en: "Enter the domain and API keys, press **Test and connect**.",
      },
      {
        uz: "**Menejerlarni yangilash** bilan ATS ichki raqamlarini xodimlarga bog'lang.",
        ru: "Через **Обновить менеджеров** свяжите внутренние номера с сотрудниками.",
        en: "Link PBX extensions to employees with **Refresh managers**.",
      },
    ],
    notes: [
      {
        uz: "O'tkazib yuborilgan kiruvchi qo'ng'iroq avtomatik ravishda \"qayta qo'ng'iroq\" vazifasiga aylanadi.",
        ru: "Пропущенный входящий автоматически превращается в задачу «перезвонить».",
        en: 'A missed incoming call automatically becomes a "call back" task.',
      },
    ],
    faq: [],
  },
  {
    slug: "sms",
    group: "integrations",
    open: "/integrations/sms",
    title: { uz: "SMS", ru: "SMS", en: "SMS" },
    summary: {
      uz: "Eskiz.uz orqali mijozlarga SMS yuborish.",
      ru: "SMS клиентам через Eskiz.uz.",
      en: "Send SMS to clients through Eskiz.uz.",
    },
    need: {
      uz: "Eskiz.uz akkaunti: email, parol va tasdiqlangan jo'natuvchi nomi.",
      ru: "Аккаунт Eskiz.uz: email, пароль и одобренное имя отправителя.",
      en: "An Eskiz.uz account: email, password and an approved sender name.",
    },
    steps: [
      {
        uz: "**Admin → SMS**ni oching.",
        ru: "Откройте **Админ → SMS**.",
        en: "Open **Admin → SMS**.",
      },
      {
        uz: "Eskiz email va parolini, jo'natuvchi nomini kiriting va saqlang.",
        ru: "Введите email и пароль Eskiz, имя отправителя и сохраните.",
        en: "Enter the Eskiz email and password, the sender name, and save.",
      },
      {
        uz: "Ulanishni tekshirish tugmasi bilan sinov SMS yuboring.",
        ru: "Отправьте тестовое SMS кнопкой проверки.",
        en: "Send a test SMS with the test button.",
      },
    ],
    notes: [],
    faq: [],
  },
  {
    slug: "email",
    group: "integrations",
    open: "/integrations/email",
    title: { uz: "Email (SMTP)", ru: "Email (SMTP)", en: "Email (SMTP)" },
    summary: {
      uz: "Lid ichidan yuborilgan xatlar sizning pochtangizdan ketadi.",
      ru: "Письма из карточки лида уходят с вашей почты.",
      en: "Emails sent from a lead go out from your own mailbox.",
    },
    need: {
      uz: "SMTP ma'lumotlari. Gmail uchun — ilova paroli (App Password).",
      ru: "Данные SMTP. Для Gmail — пароль приложения (App Password).",
      en: "SMTP details. For Gmail — an App Password.",
    },
    steps: [
      {
        uz: "**Admin → Email**ni oching va **Pochta ulash**ni bosing.",
        ru: "Откройте **Админ → Email** и нажмите **Подключить почту**.",
        en: "Open **Admin → Email** and press **Connect mailbox**.",
      },
      {
        uz: "SMTP host, port, foydalanuvchi nomi va parolni kiriting.",
        ru: "Введите SMTP host, порт, имя пользователя и пароль.",
        en: "Enter the SMTP host, port, username and password.",
      },
      {
        uz: "Jo'natuvchi nomi va manzilini yozib saqlang.",
        ru: "Укажите имя и адрес отправителя и сохраните.",
        en: "Set the sender name and address and save.",
      },
    ],
    notes: [
      {
        uz: "Gmail'da oddiy parol ishlamaydi — Google akkauntida ilova paroli yarating.",
        ru: "В Gmail обычный пароль не подойдёт — создайте пароль приложения в аккаунте Google.",
        en: "Gmail won't accept your normal password — create an App Password in your Google account.",
      },
    ],
    faq: [],
  },
  {
    slug: "webhook",
    group: "integrations",
    open: "/integrations/webhook",
    title: { uz: "Sayt va API", ru: "Сайт и API", en: "Website and API" },
    summary: {
      uz: "Sayt, Zapier yoki Make'dan lidlarni bitta havola orqali qabul qilish.",
      ru: "Приём лидов с сайта, из Zapier или Make по одной ссылке.",
      en: "Receive leads from your website, Zapier or Make through one link.",
    },
    steps: [
      {
        uz: "**Admin → Sayt va API**ni oching.",
        ru: "Откройте **Админ → Сайт и API**.",
        en: "Open **Admin → Website and API**.",
      },
      {
        uz: "Nomini yozib **Vebhuk yaratish**ni bosing.",
        ru: "Введите название и нажмите **Создать вебхук**.",
        en: "Type a name and press **Create webhook**.",
      },
      {
        uz: "Havolani nusxalab sayt formasi yoki Zapier/Make sozlamasiga qo'ying.",
        ru: "Скопируйте ссылку в форму сайта или настройки Zapier/Make.",
        en: "Copy the link into your website form or Zapier/Make settings.",
      },
    ],
    notes: [
      {
        uz: "Mas'ul va etapni o'zgartirish uchun **Kengaytirilgan sozlamalar** havolasi Lid manbalari sahifasini ochadi.",
        ru: "Ответственный и этап меняются через ссылку **Расширенные настройки** на странице источников лидов.",
        en: "Change the owner and stage via **Advanced settings**, which opens Lead sources.",
      },
    ],
    faq: [],
  },
  {
    slug: "lead-payments",
    group: "integrations",
    open: "/integrations/payments",
    title: {
      uz: "Mijozlardan Payme/Click orqali to'lov",
      ru: "Оплата от клиентов через Payme/Click",
      en: "Client payments via Payme/Click",
    },
    summary: {
      uz: "Menejer lid kartasidan to'lov havolasini yuboradi, pul kompaniyangiz kassasiga tushadi, lid o'zi to'landi etapiga o'tadi.",
      ru: "Менеджер отправляет ссылку на оплату из карточки лида, деньги поступают в кассу компании, лид сам переходит в этап оплаты.",
      en: "A manager sends a payment link from the lead card, money lands in your own cashbox and the lead moves to the paid stage by itself.",
    },
    steps: [
      {
        uz: "**Admin → Mijozlardan to'lov** sahifasida Payme (Merchant ID va kalit) yoki Click (Service ID, Merchant ID, Secret key) ma'lumotlarini kiriting va saqlang.",
        ru: "На странице **Админ → Оплата от клиентов** введите данные Payme (Merchant ID и ключ) или Click (Service ID, Merchant ID, Secret key) и сохраните.",
        en: "On **Admin → Client payments** enter your Payme (Merchant ID and key) or Click (Service ID, Merchant ID, Secret key) details and save.",
      },
      {
        uz: "Sahifadagi Payme Endpoint manzilini Payme biznes kabinetiga, Click manzilini Click kabinetidagi Prepare va Complete maydonlariga qo'ying. Payme'da hisob maydoni nomi: **order_id**.",
        ru: "Скопируйте адрес Payme Endpoint в бизнес-кабинет Payme, адрес Click — в поля Prepare и Complete кабинета Click. Поле счёта в Payme: **order_id**.",
        en: "Put the Payme endpoint into your Payme business cabinet and the Click address into Click's Prepare and Complete fields. Payme's account field: **order_id**.",
      },
      {
        uz: "Har bir voronka uchun to'lovdan keyin lid qaysi etapga o'tishini tanlang (tanlanmasa — voronkaning “sotildi” etapi).",
        ru: "Для каждой воронки выберите этап после оплаты (если не выбрать — этап «продано» воронки).",
        en: "Pick the stage each funnel's lead moves to once paid (by default the funnel's won stage).",
      },
      {
        uz: "Lid kartasidagi **To'lovlar** bo'limi — to'lovlar daftari: **+ To'lov** bilan naqd, karta yoki o'tkazma to'lovini yozing; Payme/Click to'lovlari o'zi qo'shiladi. To'langan summa, qoldiq (qarz) va **Keyingi to'lov** sanasi ko'rinadi. Qisman to'langan lid “Yarim to'lov”/“Predoplata” etapiga, to'liq to'langani to'landi etapiga o'zi o'tadi.",
        ru: "Раздел **Оплаты** в карточке лида — журнал оплат: кнопкой **+ Оплата** запишите наличные, карту или перевод; оплаты Payme/Click добавляются сами. Видны оплаченная сумма, остаток (долг) и дата **Следующего платежа**. Частично оплаченный лид сам переходит в этап «Предоплата»/«Половина», полностью — в этап оплаты.",
        en: 'The lead card\'s **Payments** section is the payments ledger: **+ Payment** records cash, card or transfer; Payme/Click payments add themselves. It shows what is paid, what is still owed and the **Next payment** date. A partly paid lead moves to the "Prepayment"/"Half payment" stage by itself, a fully paid one to the paid stage.',
      },
      {
        uz: "Lid kartasida **⋯ → To'lov havolasi**: summa va maqsadni yozing, havolani Telegram, Instagram orqali yuboring yoki nusxalang.",
        ru: "В карточке лида **⋯ → Ссылка на оплату**: укажите сумму и назначение, отправьте ссылку в Telegram, Instagram или скопируйте.",
        en: "In the lead card **⋯ → Payment link**: enter the amount and purpose, send the link via Telegram, Instagram or copy it.",
      },
      {
        uz: "Har oy to'lov qiladigan mijoz uchun **Har oy avtomatik yuborish**ni yoqing va oyning kunini tanlang: keyingi oydan boshlab shu kuni yangi havola mijozning Telegram yoki Instagram chatiga o'zi boradi, 3 kunda to'lanmasa bitta eslatma ketadi. To'xtatish — lid kartasidagi **To'lovlar** bo'limida.",
        ru: "Для клиента с ежемесячной оплатой включите **Отправлять каждый месяц** и выберите день: со следующего месяца в этот день новая ссылка сама уходит в его Telegram или Instagram, если не оплачено за 3 дня — одно напоминание. Остановить — в разделе **Оплаты** карточки лида.",
        en: "For a client who pays monthly, turn on **Send every month** and pick the day: from next month a new link goes to their Telegram or Instagram chat on that day, with one reminder if unpaid after 3 days. Stop it in the lead card's **Payments** section.",
      },
    ],
    notes: [
      {
        uz: "Mijoz to'lagach lid kartasida “To'landi” belgisi, tarixda yozuv chiqadi, mas'ulga bildirishnoma keladi.",
        ru: "После оплаты в карточке появится отметка «Оплачено», запись в истории, а ответственный получит уведомление.",
        en: "Once paid, the lead card shows “Paid”, the history gets a note and the owner is notified.",
      },
      {
        uz: "Bosh sahifadagi **Yig'ilgan to'lovlar** kartasi davr bo'yicha haqiqatda tushgan pulni ko'rsatadi (Payme va Click alohida).",
        ru: "Карточка **Полученные оплаты** на главной показывает реально поступившие деньги за период (Payme и Click отдельно).",
        en: "The home page's **Collected payments** card shows the money actually received in the period (Payme and Click separately).",
      },
    ],
    faq: [],
  },
  {
    slug: "instagram",
    group: "integrations",
    open: "/integrations/instagram",
    title: { uz: "Instagram Direct", ru: "Instagram Direct", en: "Instagram Direct" },
    summary: {
      uz: "Instagram'dagi Direct xabarlar lidga aylanadi, javobni lid kartasidan yozasiz.",
      ru: "Сообщения Instagram Direct становятся лидами, ответ пишете из карточки лида.",
      en: "Instagram Direct messages become leads; you reply from the lead card.",
    },
    steps: [
      {
        uz: "Instagram akkauntingiz **professional** (Business yoki Creator) bo'lsin: Instagram → Sozlamalar → Akkaunt turi.",
        ru: "Аккаунт Instagram должен быть **профессиональным** (Business или Creator): Instagram → Настройки → Тип аккаунта.",
        en: "Your Instagram account must be **professional** (Business or Creator): Instagram → Settings → Account type.",
      },
      {
        uz: "**Admin → Instagram** sahifasida **Instagram'ni ulash**ni bosing, Instagram'ga kiring va ruxsat bering.",
        ru: "На странице **Админ → Instagram** нажмите **Подключить Instagram**, войдите и разрешите доступ.",
        en: "On **Admin → Instagram** click **Connect Instagram**, sign in and allow access.",
      },
      {
        uz: "Yangi mijoz Direct'ga yozsa — u **Instagram** manbali lid bo'lib voronkaga tushadi, xabarlar lid kartasidagi suhbatda ko'rinadi.",
        ru: "Когда новый клиент пишет в Direct, он попадает в воронку лидом с источником **Instagram**, сообщения видны в чате карточки.",
        en: "When a new client writes in Direct they land in the funnel as a lead with source **Instagram**; messages show in the lead card's chat.",
      },
      {
        uz: "Javob berish: lid kartasidagi yozish oynasida **Kimga** ro'yxatidan Instagram'ni tanlang (mijoz oxirgi Instagram'dan yozgan bo'lsa, o'zi tanlangan bo'ladi).",
        ru: "Ответ: в поле ввода карточки выберите Instagram в списке **Кому** (если клиент последним писал в Instagram, он уже выбран).",
        en: "To reply, pick Instagram in the composer's **To** list (it is preselected when the client last wrote on Instagram).",
      },
    ],
    notes: [
      {
        uz: "Instagram qoidasi: mijozning oxirgi xabaridan keyin **24 soat** ichida javob berish mumkin.",
        ru: "Правило Instagram: ответить можно в течение **24 часов** после последнего сообщения клиента.",
        en: "Instagram's rule: you can reply within **24 hours** of the client's last message.",
      },
      {
        uz: "Instagram'ga rasm, video, audio va PDF yuboriladi; ovozli xabar yozib yuborish faqat Telegram'da.",
        ru: "В Instagram отправляются фото, видео, аудио и PDF; запись голосового — только в Telegram.",
        en: "Photos, videos, audio and PDFs can be sent to Instagram; recording a voice message is Telegram-only.",
      },
    ],
    faq: [],
  },
  {
    slug: "telegram-app",
    group: "integrations",
    open: "/integrations/telegram-app",
    title: { uz: "Telegram Mini App", ru: "Telegram Mini App", en: "Telegram Mini App" },
    summary: {
      uz: "Telegram ichida mijoz uchun lid formasi va xodimlar uchun ilova.",
      ru: "Форма заявки для клиента и приложение для сотрудников в Telegram.",
      en: "A lead form for clients and an app for staff inside Telegram.",
    },
    steps: [
      {
        uz: "**Admin → Telegram Mini App**ni oching.",
        ru: "Откройте **Админ → Telegram Mini App**.",
        en: "Open **Admin → Telegram Mini App**.",
      },
      {
        uz: "Kerakli havolani nusxalang: lid formasi yoki xodimlar ilovasi.",
        ru: "Скопируйте нужную ссылку: форма заявки или приложение сотрудников.",
        en: "Copy the link you need: the lead form or the staff app.",
      },
      {
        uz: "@BotFather'da botingiz uchun menyu tugmasi yoki /newapp orqali shu havolani qo'ying.",
        ru: "В @BotFather поставьте ссылку на кнопку меню бота или через /newapp.",
        en: "In @BotFather set the link as your bot's menu button or via /newapp.",
      },
    ],
    notes: [],
    faq: [],
  },
  {
    slug: "ai-agents",
    group: "ai",
    open: "/admin/ai-agents",
    title: { uz: "AI agentlar", ru: "AI-агенты", en: "AI agents" },
    summary: {
      uz: "Qo'ng'iroq tahlili va chat uchun AI'ni yoqish va ko'rsatma berish.",
      ru: "Включение AI для анализа звонков и чата и его инструкции.",
      en: "Turn on the AI for call analysis and chat and give it instructions.",
    },
    steps: [
      {
        uz: "**Admin → AI agentlar**ni oching.",
        ru: "Откройте **Админ → AI-агенты**.",
        en: "Open **Admin → AI agents**.",
      },
      {
        uz: "Qo'ng'iroq yoki chat agentini tanlang, yoqing va modelni belgilang.",
        ru: "Выберите агента звонков или чата, включите и выберите модель.",
        en: "Pick the call or chat agent, turn it on and choose the model.",
      },
      {
        uz: "**Ko'rsatma** maydoniga kompaniyangiz uslubini yozing va saqlang.",
        ru: "В поле **Инструкция** опишите стиль компании и сохраните.",
        en: "Describe your company's style in the **Instructions** field and save.",
      },
    ],
    notes: [],
    faq: [],
  },
  {
    slug: "ai-assistant",
    group: "ai",
    open: "/ai-assistant",
    title: { uz: "AI yordamchi", ru: "AI-помощник", en: "AI assistant" },
    summary: {
      uz: "O'ng pastdagi tugma: savol bering — platformani tushuntiradi va ma'lumot topadi.",
      ru: "Кнопка внизу справа: спросите — объяснит платформу и найдёт данные.",
      en: "The button at the bottom right: ask, and it explains the platform and finds data.",
    },
    steps: [
      {
        uz: "Istalgan sahifada o'ng pastdagi yulduzcha tugmani bosing.",
        ru: "На любой странице нажмите кнопку со звёздочкой внизу справа.",
        en: "On any page press the sparkle button at the bottom right.",
      },
      {
        uz: 'Savolingizni yozing: "amoCRM\'ni qanday ulayman?" yoki "Bugun nechta lid keldi?"',
        ru: "Напишите вопрос: «Как подключить amoCRM?» или «Сколько лидов сегодня?»",
        en: 'Type your question: "How do I connect amoCRM?" or "How many leads came today?"',
      },
      {
        uz: "Javobdagi havolani bossangiz, kerakli sahifa ochiladi.",
        ru: "Нажмите на ссылку в ответе, чтобы открыть нужную страницу.",
        en: "Click a link in the answer to open the page it names.",
      },
    ],
    notes: [
      {
        uz: "Yordamchi siz turgan sahifani biladi va shu sahifaning yo'riqnomasidan javob beradi.",
        ru: "Помощник знает, на какой вы странице, и отвечает по её инструкции.",
        en: "The assistant knows which page you're on and answers from that page's guide.",
      },
      {
        uz: "Jonli odam bilan gaplashish kerak bo'lsa, yordamchi oynasida **Operator** bo'limini oching (yoki profil menyusida **Yordam (operator)** ni bosing) va savolingizni yozing. SalesIQ jamoasi shu yerda javob beradi; Telegram ulangan bo'lsa, javob botga ham keladi. Yangi javob kelganda tugmada qizil nuqta paydo bo'ladi.",
        ru: "Чтобы поговорить с живым человеком, откройте в окне помощника вкладку **Оператор** (или **Помощь (оператор)** в меню профиля) и напишите вопрос. Команда SalesIQ ответит там же; если Telegram привязан, ответ придёт и в бот. Когда приходит новый ответ, на кнопке появляется красная точка.",
        en: "To talk to a real person, open the **Operator** tab in the assistant window (or **Help (operator)** in the profile menu) and write your question. The SalesIQ team answers right there; if your Telegram is linked, the answer also comes to the bot. A red dot on the button means a new answer.",
      },
    ],
    faq: [],
  },
  {
    slug: "sidebar",
    group: "basics",
    open: "/admin/sidebar",
    title: { uz: "Yon menyu va modullar", ru: "Боковое меню и модули", en: "Sidebar and modules" },
    summary: {
      uz: "Kompaniyangizga kerakli bo'limlarni yon menyuga chiqarish, keraksizlarini yashirish va tartibini o'zgartirish.",
      ru: "Вывести нужные разделы в боковое меню, скрыть лишние и поменять порядок.",
      en: "Put the sections your company needs in the sidebar, hide the rest and reorder them.",
    },
    need: {
      uz: "Kompaniya administratori (super admin) bo'lishingiz kerak.",
      ru: "Нужно быть администратором компании (super admin).",
      en: "You need to be the company admin (super admin).",
    },
    steps: [
      {
        uz: "Admin panelda **Yon menyu** kartasini oching.",
        ru: "Откройте карточку **Боковое меню** в Админ-панели.",
        en: "Open the **Sidebar** card in the Admin panel.",
      },
      {
        uz: "Yuqorida kompaniya turini tanlang (savdo bo'limi, call-markaz, B2B, ko'chmas mulk va h.k.) — mos bo'limlar o'zi yoqiladi.",
        ru: "Вверху выберите тип компании (отдел продаж, колл-центр, B2B, недвижимость и т. д.) — подходящие разделы включатся сами.",
        en: "Pick your company type at the top (sales team, call centre, B2B, real estate…) — the matching sections switch on.",
      },
      {
        uz: "Har bir bo'lim yonidagi ko'z belgisi bilan yashiring yoki ko'rsating, strelkalar bilan tartibni o'zgartiring.",
        ru: "Значком глаза скрывайте или показывайте раздел, стрелками меняйте порядок.",
        en: "Hide or show a section with the eye icon and reorder with the arrows.",
      },
      {
        uz: "Admin paneldagi **Modullar** guruhida Didox, Hisob-fakturalar kabi qo'shimcha bo'limlar bor — kartadagi tugma bilan ularni yon menyuga chiqaring.",
        ru: "В группе **Модули** Админ-панели — дополнительные разделы (Didox, Счета-фактуры): кнопкой на карточке выведите их в меню.",
        en: "The **Modules** group in the Admin panel holds extra sections (Didox, Invoices): pin them to the sidebar with the card's button.",
      },
      {
        uz: "O'ngdagi ko'rinish menyu xodimlarga qanday chiqishini ko'rsatadi; **Saqlash**ni bosing.",
        ru: "Справа видно, как меню увидят сотрудники; нажмите **Сохранить**.",
        en: "The preview on the right shows what staff will see; press **Save**.",
      },
    ],
    notes: [
      {
        uz: "Bosh sahifa doim menyuda qoladi. Sozlama butun kompaniya uchun amal qiladi.",
        ru: "Главная всегда остаётся в меню. Настройка действует на всю компанию.",
        en: "Home always stays in the menu. The setting applies to the whole company.",
      },
    ],
    faq: [],
  },
  {
    slug: "invoices",
    group: "crm",
    open: "/invoices",
    title: { uz: "Hisob-faktura va Didox", ru: "Счета-фактуры и Didox", en: "Invoices and Didox" },
    summary: {
      uz: "Mijozga hisob-faktura chiqarish, chop etish va Didox orqali elektron yuborish.",
      ru: "Выставить клиенту счёт-фактуру, распечатать и отправить через Didox.",
      en: "Issue an invoice to a client, print it and send it electronically via Didox.",
    },
    need: {
      uz: "Kompaniya administratori (super admin) bo'lishingiz kerak.",
      ru: "Нужно быть администратором компании (super admin).",
      en: "You need to be the company admin (super admin).",
    },
    steps: [
      {
        uz: "Admin panel → **Hisob-faktura va Didox**: kompaniyangiz rekvizitlarini (STIR, hisob raqami, MFO, rahbar) kiriting.",
        ru: "Админ-панель → **Счета-фактуры и Didox**: введите реквизиты компании (ИНН, счёт, МФО, руководитель).",
        en: "Admin panel → **Invoices and Didox**: enter your company details (TIN, account, MFO, director).",
      },
      {
        uz: "Didox orqali yubormoqchi bo'lsangiz, shu sahifada Didox login (STIR) va parolini ulang.",
        ru: "Чтобы отправлять через Didox, подключите там же логин (ИНН) и пароль Didox.",
        en: "To send via Didox, connect your Didox login (TIN) and password on the same page.",
      },
      {
        uz: "Lid kartasidagi **…** menyusidan **Hisob-faktura** ni tanlang yoki **Hisob-fakturalar** sahifasida **Yangi** ni bosing.",
        ru: "В карточке лида выберите **Счёт-фактура** в меню **…** или нажмите **Новый** на странице **Счета-фактуры**.",
        en: "Choose **Invoice** in a lead card's **…** menu, or press **New** on the **Invoices** page.",
      },
      {
        uz: "Xaridor rekvizitlari va xizmat/mahsulot qatorlarini (MXIK kodi bilan) to'ldiring — QQS va jami o'zi hisoblanadi.",
        ru: "Заполните реквизиты покупателя и строки (с кодом ИКПУ) — НДС и итог считаются сами.",
        en: "Fill in the buyer's details and the lines (with the MXIK code) — VAT and totals are calculated.",
      },
      {
        uz: "Hisob-faktura sahifasida **Chop etish / PDF**, **Didox'ga yuborish** va **To'landi** tugmalari bor.",
        ru: "На странице счёта есть кнопки **Печать / PDF**, **Отправить в Didox** и **Оплачен**.",
        en: "The invoice page has **Print / PDF**, **Send to Didox** and **Paid** buttons.",
      },
    ],
    notes: [
      {
        uz: "Didox holati (yuborildi, imzolandi, rad etildi) **Yangilash** tugmasi bilan tekshiriladi.",
        ru: "Статус Didox (отправлен, подписан, отклонён) проверяется кнопкой **Обновить**.",
        en: "The Didox status (sent, signed, rejected) is checked with **Refresh**.",
      },
    ],
    faq: [],
  },
  {
    slug: "follow-ups",
    group: "crm",
    open: "/admin/follow-ups",
    title: {
      uz: "Avtomatik eslatma (follow-up)",
      ru: "Автонапоминание (follow-up)",
      en: "Automatic follow-up",
    },
    summary: {
      uz: "Mijoz javob bermasa, belgilangan vaqtdan keyin unga Telegram'da o'zi eslatma yuboriladi.",
      ru: "Если клиент не отвечает, через заданное время ему автоматически уходит напоминание в Telegram.",
      en: "When a client doesn't reply, a Telegram reminder goes out automatically after the set time.",
    },
    need: {
      uz: "Kompaniya administratori (super admin) bo'lishingiz kerak.",
      ru: "Нужно быть администратором компании (super admin).",
      en: "You need to be the company admin (super admin).",
    },
    steps: [
      {
        uz: "Admin panel → **Avtomatik eslatma** kartasini oching va funksiyani yoqing.",
        ru: "Откройте карточку **Автонапоминание** в Админ-панели и включите функцию.",
        en: "Open the **Automatic follow-up** card in the Admin panel and switch it on.",
      },
      {
        uz: "Necha soatdan keyin yozilishini va xabar matnini kiriting (bir nechta qadam qo'shish mumkin).",
        ru: "Укажите, через сколько часов писать, и текст сообщения (можно несколько шагов).",
        en: "Set after how many hours to write and the message text (several steps are possible).",
      },
      {
        uz: "Faqat ish vaqtida yuborish va qaysi etaplarda ishlashini tanlang; **Saqlash**ni bosing.",
        ru: "Выберите отправку только в рабочее время и этапы; нажмите **Сохранить**.",
        en: "Choose sending only in working hours and which stages; press **Save**.",
      },
    ],
    notes: [
      {
        uz: "Mijoz yozishi bilan navbatdagi eslatmalar to'xtaydi. Yutilgan/yo'qotilgan lidlarga yozilmaydi.",
        ru: "Как только клиент ответит, напоминания останавливаются. Выигранным/проигранным лидам не пишут.",
        en: "As soon as the client replies, the reminders stop. Won/lost leads are skipped.",
      },
    ],
    faq: [],
  },
  {
    slug: "sales-plan",
    group: "crm",
    open: "/attendance",
    title: { uz: "Reja va fakt", ru: "План и факт", en: "Plan vs fact" },
    summary: {
      uz: "Oylik savdo rejasi (jamoa va har bir menejer) va haqiqatda yopilgan bitimlar, oy oxiridagi prognoz bilan.",
      ru: "Месячный план продаж (команда и каждый менеджер) против закрытых сделок, с прогнозом на конец месяца.",
      en: "The month's sales target (team and each manager) against deals actually closed, with an end-of-month forecast.",
    },
    need: {
      uz: "Rejani admin yoki ROP qo'yadi; ko'rish hammaga ochiq.",
      ru: "План ставит админ или РОП; смотреть могут все.",
      en: "An admin or head of sales sets it; everyone can view.",
    },
    steps: [
      {
        uz: "Chap menyuda **Nazorat** → **Reja va fakt** bo'limini oching.",
        ru: "В левом меню откройте **Контроль** → **План и факт**.",
        en: "Open **Attendance** (Nazorat) → **Plan vs fact** in the left menu.",
      },
      {
        uz: "Yuqorida oyni tanlang va **Jamoa rejasi**ga summa va bitimlar sonini yozing.",
        ru: "Выберите месяц и впишите сумму и число сделок в **План команды**.",
        en: "Pick the month and enter the amount and number of deals in **Team plan**.",
      },
      {
        uz: "Pastda har bir menejerga alohida reja qo'ying.",
        ru: "Ниже задайте план каждому менеджеру.",
        en: "Below, set a plan for each manager.",
      },
      {
        uz: "Fakt — shu oyda yutilgan etapga o'tgan lidlar (summa lid byudjetidan). Prognoz hozirgi sur'at bo'yicha hisoblanadi.",
        ru: "Факт — лиды, перешедшие в выигранный этап в этом месяце (сумма из бюджета). Прогноз — по текущему темпу.",
        en: "Fact = leads moved to a won stage this month (amount from the budget). The forecast follows the current pace.",
      },
    ],
    notes: [],
    faq: [],
  },
  {
    slug: "notifications",
    group: "basics",
    open: "/settings",
    title: {
      uz: "Telefonga bildirishnoma va ilova",
      ru: "Уведомления на телефон и приложение",
      en: "Phone notifications and the app",
    },
    summary: {
      uz: "Yangi lid, mijoz xabari va kiruvchi qo'ng'iroq haqida SalesIQ yopiq bo'lsa ham bildirishnoma olish, SalesIQ'ni ilova sifatida o'rnatish.",
      ru: "Получать уведомления о новых лидах, сообщениях и звонках даже при закрытом SalesIQ и установить SalesIQ как приложение.",
      en: "Get notified about new leads, client messages and incoming calls even with SalesIQ closed, and install SalesIQ as an app.",
    },
    steps: [
      {
        uz: "Sozlamalar → **Bildirishnomalar** ni oching.",
        ru: "Откройте Настройки → **Уведомления**.",
        en: "Open Settings → **Notifications**.",
      },
      {
        uz: "**Yoqish** ni bosing va brauzer so'raganda **Ruxsat berish** ni tanlang. **Sinab ko'rish** bilan tekshiring.",
        ru: "Нажмите **Включить** и выберите **Разрешить** в запросе браузера. Проверьте кнопкой **Отправить тест**.",
        en: "Press **Turn on** and choose **Allow** when the browser asks. Check with **Send a test**.",
      },
      {
        uz: "**Nimalar haqida xabar beriladi** ro'yxatida keraksiz turlarni o'chiring.",
        ru: "В списке **О чём уведомлять** выключите ненужные типы.",
        en: "Switch off the types you don't need under **What sends a notification**.",
      },
      {
        uz: "**SalesIQ ilova sifatida** kartasida **O'rnatish** ni bosing (Chrome/Edge/Android). iPhone'da: Safari → Ulashish → Bosh ekranga qo'shish.",
        ru: "В карточке **SalesIQ как приложение** нажмите **Установить** (Chrome/Edge/Android). На iPhone: Safari → Поделиться → На экран «Домой».",
        en: "On the **SalesIQ as an app** card press **Install** (Chrome/Edge/Android). On iPhone: Safari → Share → Add to Home Screen.",
      },
    ],
    notes: [
      {
        uz: "Har bir qurilmada alohida yoqiladi. iPhone'da bildirishnoma faqat ilova o'rnatilgandan keyin ishlaydi (iOS 16.4+). Brauzer bloklagan bo'lsa, kartadagi 3 qadamni bajaring.",
        ru: "Включается на каждом устройстве отдельно. На iPhone уведомления работают только после установки приложения (iOS 16.4+). Если браузер заблокировал — выполните 3 шага на карточке.",
        en: "Turned on per device. On iPhone notifications work only after installing the app (iOS 16.4+). If the browser blocked them, follow the 3 steps on the card.",
      },
    ],
    faq: [],
  },
  {
    slug: "referrals",
    group: "basics",
    open: "/admin/referrals",
    title: { uz: "Taklif dasturi", ru: "Реферальная программа", en: "Referral program" },
    summary: {
      uz: "SalesIQ'ni boshqa kompaniyalarga tavsiya qilib bepul obuna kunlarini olish.",
      ru: "Рекомендуйте SalesIQ другим компаниям и получайте бесплатные дни подписки.",
      en: "Recommend SalesIQ to other companies and earn free subscription days.",
    },
    need: {
      uz: "Kompaniya administratori (super admin) bo'lishingiz kerak.",
      ru: "Нужно быть администратором компании (super admin).",
      en: "You need to be the company admin (super admin).",
    },
    steps: [
      {
        uz: "Admin panel → **Taklif dasturi** ni oching.",
        ru: "Откройте Админ-панель → **Реферальная программа**.",
        en: "Open Admin panel → **Referral program**.",
      },
      {
        uz: "Havolangizni **Nusxalash** yoki **Telegram'da ulashish** bilan yuboring.",
        ru: "Отправьте ссылку кнопкой **Копировать** или **Поделиться в Telegram**.",
        en: "Send your link with **Copy** or **Share in Telegram**.",
      },
      {
        uz: "Havola orqali ro'yxatdan o'tgan kompaniya +7 kun bepul sinov oladi.",
        ru: "Компания, зарегистрированная по ссылке, получает +7 дней пробного периода.",
        en: "A company that signs up through it gets +7 trial days.",
      },
      {
        uz: "U birinchi to'lovni qilganda obunangizga avtomatik +30 kun qo'shiladi va bildirishnoma keladi.",
        ru: "Когда она впервые оплатит, к вашей подписке автоматически добавится +30 дней и придёт уведомление.",
        en: "When it pays for the first time, +30 days are added to your subscription automatically and you're notified.",
      },
    ],
    notes: [
      {
        uz: "Taklif qilganlaringiz ro'yxati va yutilgan kunlar shu sahifada ko'rinadi.",
        ru: "Список приглашённых и заработанные дни видны на этой странице.",
        en: "Your invited companies and the days earned are on this page.",
      },
    ],
    faq: [],
  },
  {
    slug: "billing-docs",
    group: "basics",
    open: "/billing",
    title: { uz: "Obuna hujjatlari", ru: "Документы по подписке", en: "Subscription documents" },
    summary: {
      uz: "Obuna to'lovlari uchun hisob-faktura, dalolatnoma va bank orqali to'lash uchun hisob.",
      ru: "Счёт-фактура, акт по оплатам подписки и счёт для оплаты через банк.",
      en: "Invoice and act for subscription payments, and a bill to pay by bank transfer.",
    },
    need: {
      uz: "Kompaniya administratori (super admin) bo'lishingiz kerak.",
      ru: "Нужно быть администратором компании (super admin).",
      en: "You need to be the company admin (super admin).",
    },
    steps: [
      {
        uz: "Sozlamalar → **Obuna** ni oching.",
        ru: "Откройте Настройки → **Подписка**.",
        en: "Open Settings → **Subscription**.",
      },
      {
        uz: "**So'nggi tranzaksiyalar** jadvalida har bir to'langan to'lov yonida **Hisob-faktura** va **Dalolatnoma** tugmalari bor.",
        ru: "В таблице **Последние транзакции** у каждой оплаты есть кнопки **Счёт-фактура** и **Акт**.",
        en: "In **Latest transactions** every paid payment has **Invoice** and **Act** buttons.",
      },
      {
        uz: 'Hujjatda **Chop etish / PDF** ni bosing; PDF uchun printer o\'rniga "PDF sifatida saqlash"ni tanlang.',
        ru: "В документе нажмите **Печать / PDF**; для PDF выберите «Сохранить как PDF».",
        en: 'In the document press **Print / PDF**; choose "Save as PDF" for a PDF.',
      },
      {
        uz: "Hisob raqamidan to'lamoqchi bo'lsangiz, **Bank orqali to'lash** → **To'lov uchun hisob** ni chop eting va bankda to'lang.",
        ru: "Чтобы платить со счёта, распечатайте **Оплата через банк** → **Счёт на оплату** и оплатите в банке.",
        en: "To pay from your account, print **Pay by bank transfer** → **Bill for payment** and pay at your bank.",
      },
    ],
    notes: [
      {
        uz: "Xaridor sifatida kompaniyangiz rekvizitlari Admin → Hisob-faktura sozlamalaridan olinadi — ular to'ldirilmagan bo'lsa, hujjatda faqat nomingiz chiqadi.",
        ru: "Реквизиты покупателя берутся из Админ → Счета-фактуры; если они пусты, в документе будет только название.",
        en: "Your company's buyer details come from Admin → Invoices; if empty, only your name is printed.",
      },
    ],
    faq: [],
  },
  {
    slug: "platform-revenue",
    group: "basics",
    open: "/platform/revenue",
    title: { uz: "Platforma daromadi", ru: "Доход платформы", en: "Platform revenue" },
    summary: {
      uz: "MRR, churn, LTV, sinov konversiyasi, tushumlar va SalesIQ rekvizitlari.",
      ru: "MRR, отток, LTV, конверсия пробного периода, поступления и реквизиты SalesIQ.",
      en: "MRR, churn, LTV, trial conversion, collections and SalesIQ's company details.",
    },
    need: {
      uz: "Faqat platforma egasi uchun.",
      ru: "Только для владельца платформы.",
      en: "For the platform owner only.",
    },
    steps: [
      {
        uz: "Platforma menyusida **Daromad** ni oching.",
        ru: "Откройте **Доход** в меню платформы.",
        en: "Open **Revenue** in the platform menu.",
      },
      {
        uz: "Yuqoridagi kartalar: MRR (oylik daromad), pullik kompaniyalar, 30 kunlik churn, LTV, konversiya, tushum.",
        ru: "Карточки вверху: MRR, платящие компании, отток за 30 дней, LTV, конверсия, поступления.",
        en: "Top cards: MRR, paying companies, 30-day churn, LTV, conversion, collections.",
      },
      {
        uz: "**7 kun ichida yangilanadi** ro'yxatidagi kompaniyalarga obuna tugashidan oldin qo'ng'iroq qiling; **Oxirgi 30 kunda ketganlar**ni qaytarishga urining.",
        ru: "Звоните компаниям из списка **Продление в ближайшие 7 дней**; пытайтесь вернуть **Ушедших за 30 дней**.",
        en: "Call the companies under **Renewing within 7 days**; try to win back **Left in the last 30 days**.",
      },
      {
        uz: "**SalesIQ rekvizitlari** kartasini to'ldiring — ular barcha obuna hujjatlarida sotuvchi sifatida chiqadi.",
        ru: "Заполните карточку **Реквизиты SalesIQ** — они печатаются продавцом во всех документах.",
        en: "Fill in **SalesIQ company details** — they're printed as the seller on all subscription documents.",
      },
    ],
    notes: [],
    faq: [],
  },
  {
    slug: "partners",
    group: "basics",
    open: "/platform/partners",
    title: { uz: "Hamkorlar", ru: "Партнёры", en: "Partners" },
    summary: {
      uz: "Kompaniya olib keladigan agentlik va konsultantlar, ularning komissiyasi va barcha takliflar.",
      ru: "Агентства и консультанты, которые приводят компании, их комиссия и все приглашения.",
      en: "Agencies and consultants who bring companies, their commission and every invitation.",
    },
    need: {
      uz: "Faqat platforma egasi uchun.",
      ru: "Только для владельца платформы.",
      en: "For the platform owner only.",
    },
    steps: [
      {
        uz: "Platforma menyusida **Hamkorlar** ni oching.",
        ru: "Откройте **Партнёры** в меню платформы.",
        en: "Open **Partners** in the platform menu.",
      },
      {
        uz: "**Yangi hamkor**: nomi, telefoni, foizi (kod bo'sh qolsa avtomatik yaratiladi).",
        ru: "**Новый партнёр**: имя, телефон, процент (код создаётся сам, если пусто).",
        en: "**New partner**: name, phone, percentage (the code is generated if empty).",
      },
      {
        uz: "Hamkor kartasidagi havolani nusxalab unga bering. U olib kelgan kompaniyalarning har bir Payme/Click to'lovidan 12 oy davomida foiz hisoblanadi.",
        ru: "Скопируйте ссылку с карточки и отдайте партнёру. С каждой оплаты Payme/Click приведённых компаний 12 месяцев начисляется процент.",
        en: "Copy the link on the partner's card and give it to them. They earn their % on every Payme/Click payment of the companies they bring, for 12 months.",
      },
      {
        uz: "Pulni berganingizdan keyin **…to'landi deb belgilash** ni bosing. Qo'lda to'lagan kompaniya uchun **Barcha takliflar**da **Mukofot** ni bosing.",
        ru: "После выплаты нажмите **Отметить выплату**. Для компании, оплатившей вручную, нажмите **Наградить** в **Все приглашения**.",
        en: "After paying out press **Mark … as paid**. For a company that paid by hand press **Reward** under **All invitations**.",
      },
    ],
    notes: [],
    faq: [],
  },
];

const BY_SLUG = new Map(HELP_ARTICLES.map((a) => [a.slug, a]));

export function helpArticle(slug: string): HelpArticle | undefined {
  return BY_SLUG.get(slug);
}

export function pick(text: L, lang: string): string {
  return lang === "ru" ? text.ru : lang === "en" ? text.en : text.uz;
}

// Plain-text version of one guide, for the AI assistant's context.
export function articleAsText(a: HelpArticle, lang: string): string {
  const lines = [
    `# ${pick(a.title, lang)} (${a.open})`,
    pick(a.summary, lang),
    ...(a.need ? [`Need: ${pick(a.need, lang)}`] : []),
    ...a.steps.map((s, i) => `${i + 1}. ${pick(s, lang)}`),
    ...a.notes.map((n) => `- ${pick(n, lang)}`),
    ...a.faq.map((f) => `Q: ${pick(f.q, lang)} A: ${pick(f.a, lang)}`),
  ];
  return lines.join("\n").replace(/\*\*/g, "");
}
