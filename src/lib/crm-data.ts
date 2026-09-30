export type CrmLead = {
  id: string;
  name: string;
  initials: string;
  company: string;
  companyId: string;
  position: string;
  phone: string;
  altPhone: string;
  email: string;
  telegram: string;
  whatsapp: string;
  source: string;
  campaign: string;
  utm: string;
  owner: string;
  manager: string;
  priority: "Urgent" | "High" | "Normal" | "Low";
  score: number;
  temperature: "Hot" | "Warm" | "Cold";
  budget: number;
  expectedRevenue: number;
  country: string;
  region: string;
  city: string;
  address: string;
  stage: string;
  funnel: string;
  nextFollowUp: string;
  lastContact: string;
  created: string;
  updated: string;
  tags: string[];
};

export const PIPELINE_STAGES = [
  { id: "new", name: "New Lead", color: "bg-primary", probability: 10, limit: 40 },
  { id: "qualified", name: "Qualified", color: "bg-info", probability: 25, limit: 30 },
  { id: "demo", name: "Demo", color: "bg-warning", probability: 45, limit: 20 },
  { id: "proposal", name: "Proposal", color: "bg-mint-border", probability: 65, limit: 15 },
  { id: "negotiation", name: "Negotiation", color: "bg-success", probability: 85, limit: 10 },
  { id: "won", name: "Won", color: "bg-success", probability: 100, limit: 0 },
] as const;

export const CRM_LEADS: CrmLead[] = [
  {
    id: "L-8842",
    name: "Sanzhar Abenov",
    initials: "SA",
    company: "Kazpost Digital",
    companyId: "C-101",
    position: "Head of Operations",
    phone: "+7 701 442 18 90",
    altPhone: "+7 727 355 10 22",
    email: "s.abenov@kazpost.kz",
    telegram: "@sanzhar_ab",
    whatsapp: "+7 701 442 18 90",
    source: "Inbound — Website",
    campaign: "Q3 Enterprise Push",
    utm: "utm_source=google&utm_medium=cpc&utm_campaign=q3-ent",
    owner: "Aizhan Serikova",
    manager: "Nurlan Tazhin",
    priority: "Urgent",
    score: 92,
    temperature: "Hot",
    budget: 120000,
    expectedRevenue: 84000,
    country: "Kazakhstan",
    region: "Almaty Region",
    city: "Almaty",
    address: "Al-Farabi Ave 77/8",
    stage: "Negotiation",
    funnel: "Enterprise Sales",
    nextFollowUp: "Today, 15:00",
    lastContact: "2h ago",
    created: "14 Jun 2026",
    updated: "2h ago",
    tags: ["Enterprise", "Renewal", "Decision maker"],
  },
  {
    id: "L-8839",
    name: "Zarina Mukhtarova",
    initials: "ZM",
    company: "Halyk Fintech",
    companyId: "C-102",
    position: "CTO",
    phone: "+7 705 118 42 03",
    altPhone: "—",
    email: "z.mukhtarova@halykfin.kz",
    telegram: "@zarina_m",
    whatsapp: "+7 705 118 42 03",
    source: "Outbound — LinkedIn",
    campaign: "Fintech ABM",
    utm: "utm_source=linkedin&utm_medium=social",
    owner: "Daniyar Omarov",
    manager: "Nurlan Tazhin",
    priority: "High",
    score: 78,
    temperature: "Warm",
    budget: 90000,
    expectedRevenue: 62500,
    country: "Kazakhstan",
    region: "Almaty Region",
    city: "Almaty",
    address: "Rozybakiev St 247",
    stage: "Proposal",
    funnel: "Enterprise Sales",
    nextFollowUp: "Tomorrow, 11:30",
    lastContact: "5h ago",
    created: "2 Jul 2026",
    updated: "5h ago",
    tags: ["Fintech", "Security review"],
  },
  {
    id: "L-8830",
    name: "Yerlan Tulegenov",
    initials: "YT",
    company: "Astana Logistics",
    companyId: "C-103",
    position: "COO",
    phone: "+7 702 900 71 15",
    altPhone: "+7 717 220 44 10",
    email: "y.tulegenov@astanalog.kz",
    telegram: "@yerlan_t",
    whatsapp: "+7 702 900 71 15",
    source: "Partner referral",
    campaign: "Logistics vertical",
    utm: "utm_source=partner",
    owner: "Madina Kaparova",
    manager: "Nurlan Tazhin",
    priority: "Normal",
    score: 64,
    temperature: "Warm",
    budget: 60000,
    expectedRevenue: 41000,
    country: "Kazakhstan",
    region: "Akmola Region",
    city: "Astana",
    address: "Turan Ave 18",
    stage: "Demo",
    funnel: "Mid-Market",
    nextFollowUp: "5 Aug, 10:00",
    lastContact: "Yesterday",
    created: "18 Jul 2026",
    updated: "Yesterday",
    tags: ["Logistics"],
  },
  {
    id: "L-8821",
    name: "Aigerim Sadvakasova",
    initials: "AS",
    company: "Tengri Retail",
    companyId: "C-104",
    position: "Retail Director",
    phone: "+7 708 331 25 76",
    altPhone: "—",
    email: "a.sadvakasova@tengri.kz",
    telegram: "@aigerim_s",
    whatsapp: "+7 708 331 25 76",
    source: "Event — SalesConf",
    campaign: "SalesConf 2026",
    utm: "utm_source=event",
    owner: "Timur Yesenov",
    manager: "Aizhan Serikova",
    priority: "Normal",
    score: 51,
    temperature: "Cold",
    budget: 40000,
    expectedRevenue: 28700,
    country: "Kazakhstan",
    region: "Almaty Region",
    city: "Almaty",
    address: "Dostyk Ave 310",
    stage: "Qualified",
    funnel: "SMB",
    nextFollowUp: "7 Aug, 16:00",
    lastContact: "Yesterday",
    created: "21 Jul 2026",
    updated: "Yesterday",
    tags: ["Retail", "Nurture"],
  },
  {
    id: "L-8814",
    name: "Nurlan Kassymov",
    initials: "NK",
    company: "Silk Road Cargo",
    companyId: "C-105",
    position: "CEO",
    phone: "+7 700 512 88 41",
    altPhone: "—",
    email: "n.kassymov@silkroad.kz",
    telegram: "@nurlan_k",
    whatsapp: "+7 700 512 88 41",
    source: "Inbound — Referral",
    campaign: "Referral program",
    utm: "utm_source=referral",
    owner: "Alina Bekova",
    manager: "Aizhan Serikova",
    priority: "High",
    score: 96,
    temperature: "Hot",
    budget: 140000,
    expectedRevenue: 96400,
    country: "Kazakhstan",
    region: "Almaty Region",
    city: "Almaty",
    address: "Seifullin Ave 502",
    stage: "Won",
    funnel: "Enterprise Sales",
    nextFollowUp: "Kickoff 8 Aug",
    lastContact: "2 days ago",
    created: "3 Jun 2026",
    updated: "2 days ago",
    tags: ["Closed won", "Expansion"],
  },
  {
    id: "L-8802",
    name: "Dana Bekturova",
    initials: "DB",
    company: "Almaty Medtech",
    companyId: "C-106",
    position: "Procurement Lead",
    phone: "+7 707 664 09 33",
    altPhone: "—",
    email: "d.bekturova@medtech.kz",
    telegram: "@dana_b",
    whatsapp: "+7 707 664 09 33",
    source: "Cold call",
    campaign: "Medtech outbound",
    utm: "utm_source=outbound",
    owner: "Ruslan Iskakov",
    manager: "Aizhan Serikova",
    priority: "Low",
    score: 34,
    temperature: "Cold",
    budget: 35000,
    expectedRevenue: 33200,
    country: "Kazakhstan",
    region: "Almaty Region",
    city: "Almaty",
    address: "Abay Ave 150",
    stage: "New Lead",
    funnel: "SMB",
    nextFollowUp: "12 Aug, 09:00",
    lastContact: "3 days ago",
    created: "26 Jul 2026",
    updated: "3 days ago",
    tags: ["Medtech"],
  },
];

export const LEAD_TIMELINE = [
  { at: "Today, 09:14", type: "File", text: "Proposal v2.pdf uploaded", who: "Aizhan Serikova" },
  {
    at: "Today, 08:02",
    type: "AI",
    text: "AI summary generated — close probability raised to 78%",
    who: "SalesIQ AI",
  },
  {
    at: "Yesterday, 16:40",
    type: "Call",
    text: "Outgoing call · 18:42 · positive sentiment",
    who: "Aizhan Serikova",
  },
  {
    at: "Yesterday, 12:10",
    type: "WhatsApp",
    text: "WhatsApp sent — pricing breakdown",
    who: "Aizhan Serikova",
  },
  {
    at: "Yesterday, 11:02",
    type: "Stage",
    text: "Stage changed Proposal → Negotiation",
    who: "Automation",
  },
  {
    at: "2 days ago",
    type: "Email",
    text: "Email sent — security questionnaire",
    who: "Daniyar Omarov",
  },
  {
    at: "3 days ago",
    type: "Task",
    text: "Task completed — discovery call",
    who: "Aizhan Serikova",
  },
  { at: "14 Jun 2026", type: "Created", text: "Lead created from website form", who: "Automation" },
];

export const LEAD_TASKS_DETAIL = [
  {
    id: "T-1",
    title: "Send revised proposal",
    type: "Proposal",
    priority: "Urgent",
    due: "Overdue 1d",
    status: "In progress",
    assignee: "Aizhan Serikova",
    checklist: "3/5",
  },
  {
    id: "T-2",
    title: "Book technical deep dive",
    type: "Meeting",
    priority: "High",
    due: "Due in 2d",
    status: "Todo",
    assignee: "Daniyar Omarov",
    checklist: "0/3",
  },
  {
    id: "T-3",
    title: "Confirm procurement contact",
    type: "Call",
    priority: "Normal",
    due: "Due in 4d",
    status: "Todo",
    assignee: "Aizhan Serikova",
    checklist: "1/2",
  },
  {
    id: "T-4",
    title: "Share SOC2 documentation",
    type: "Document",
    priority: "High",
    due: "Due in 1d",
    status: "Review",
    assignee: "Madina Kaparova",
    checklist: "2/2",
  },
];

export const LEAD_CALLS = [
  {
    id: "C-1",
    direction: "Outgoing",
    at: "Yesterday 16:40",
    duration: "18:42",
    sentiment: "Positive",
    score: 92,
    keywords: ["pricing", "rollout", "SOC2"],
    summary: "Clear next step booked for contract review.",
  },
  {
    id: "C-2",
    direction: "Incoming",
    at: "3 days ago",
    duration: "07:12",
    sentiment: "Neutral",
    score: 71,
    keywords: ["timeline"],
    summary: "Buyer asked about onboarding timeline.",
  },
  {
    id: "C-3",
    direction: "Missed",
    at: "5 days ago",
    duration: "—",
    sentiment: "—",
    score: 0,
    keywords: [],
    summary: "Callback scheduled automatically.",
  },
];

export const LEAD_MESSAGES = {
  whatsapp: [
    { from: "them", text: "Can you resend the pricing breakdown?", at: "12:02" },
    { from: "us", text: "Sure — sending the updated table now.", at: "12:06" },
    { from: "them", text: "Perfect, I'll review with finance today.", at: "12:11" },
  ],
  telegram: [
    { from: "us", text: "Hi Sanzhar, sharing the deployment plan.", at: "09:40" },
    { from: "them", text: "Received. Let's align Thursday.", at: "10:05" },
  ],
  email: [
    { from: "us", subject: "Security questionnaire", at: "2 days ago", status: "Opened 3×" },
    { from: "them", subject: "RE: Security questionnaire", at: "2 days ago", status: "Replied" },
    { from: "us", subject: "Proposal v2 — SalesIQ", at: "Today", status: "Sent" },
  ],
};

export const LEAD_FILES = [
  { name: "Proposal_v2.pdf", size: "1.8 MB", type: "PDF", version: "v2", at: "Today" },
  {
    name: "Security_Questionnaire.docx",
    size: "420 KB",
    type: "Word",
    version: "v1",
    at: "2 days ago",
  },
  { name: "Pricing_Model.xlsx", size: "96 KB", type: "Excel", version: "v3", at: "4 days ago" },
  { name: "Discovery_Call.mp3", size: "12.4 MB", type: "Audio", version: "v1", at: "Yesterday" },
];

export const LEAD_NOTES = [
  {
    author: "Aizhan Serikova",
    at: "Today, 09:20",
    text: "Finance wants a 3-year term with annual uplift capped at 5%. @Daniyar please prepare the alternative model.",
  },
  {
    author: "Daniyar Omarov",
    at: "Yesterday",
    text: "Security review is the only blocker. SOC2 report shared, waiting on infosec sign-off.",
  },
];

export const AI_SUGGESTIONS = [
  "Summarize this lead",
  "Generate follow-up email",
  "Predict close probability",
  "Suggest next best action",
  "Draft WhatsApp message",
  "Draft Telegram message",
  "Generate proposal outline",
  "Analyze last call recording",
];

export type Contact = {
  id: string;
  name: string;
  initials: string;
  position: string;
  company: string;
  phone: string;
  email: string;
  telegram: string;
  whatsapp: string;
  birthday: string;
  deals: number;
  tasks: number;
};

export const CONTACTS: Contact[] = [
  {
    id: "P-201",
    name: "Sanzhar Abenov",
    initials: "SA",
    position: "Head of Operations",
    company: "Kazpost Digital",
    phone: "+7 701 442 18 90",
    email: "s.abenov@kazpost.kz",
    telegram: "@sanzhar_ab",
    whatsapp: "+7 701 442 18 90",
    birthday: "12 Mar",
    deals: 2,
    tasks: 4,
  },
  {
    id: "P-202",
    name: "Zarina Mukhtarova",
    initials: "ZM",
    position: "CTO",
    company: "Halyk Fintech",
    phone: "+7 705 118 42 03",
    email: "z.mukhtarova@halykfin.kz",
    telegram: "@zarina_m",
    whatsapp: "+7 705 118 42 03",
    birthday: "4 Sep",
    deals: 1,
    tasks: 3,
  },
  {
    id: "P-203",
    name: "Yerlan Tulegenov",
    initials: "YT",
    position: "COO",
    company: "Astana Logistics",
    phone: "+7 702 900 71 15",
    email: "y.tulegenov@astanalog.kz",
    telegram: "@yerlan_t",
    whatsapp: "+7 702 900 71 15",
    birthday: "27 Jan",
    deals: 1,
    tasks: 2,
  },
  {
    id: "P-204",
    name: "Aigerim Sadvakasova",
    initials: "AS",
    position: "Retail Director",
    company: "Tengri Retail",
    phone: "+7 708 331 25 76",
    email: "a.sadvakasova@tengri.kz",
    telegram: "@aigerim_s",
    whatsapp: "+7 708 331 25 76",
    birthday: "19 Nov",
    deals: 1,
    tasks: 1,
  },
  {
    id: "P-205",
    name: "Nurlan Kassymov",
    initials: "NK",
    position: "CEO",
    company: "Silk Road Cargo",
    phone: "+7 700 512 88 41",
    email: "n.kassymov@silkroad.kz",
    telegram: "@nurlan_k",
    whatsapp: "+7 700 512 88 41",
    birthday: "2 Jun",
    deals: 3,
    tasks: 5,
  },
];

export type Company = {
  id: string;
  name: string;
  initials: string;
  industry: string;
  employees: string;
  revenue: number;
  website: string;
  city: string;
  owner: string;
  contacts: number;
  deals: number;
  openValue: number;
};

export const COMPANIES: Company[] = [
  {
    id: "C-101",
    name: "Kazpost Digital",
    initials: "KD",
    industry: "Government / Logistics",
    employees: "5,000+",
    revenue: 240000000,
    website: "kazpost.kz",
    city: "Almaty",
    owner: "Aizhan Serikova",
    contacts: 4,
    deals: 2,
    openValue: 84000,
  },
  {
    id: "C-102",
    name: "Halyk Fintech",
    initials: "HF",
    industry: "Financial services",
    employees: "1,200",
    revenue: 98000000,
    website: "halykfin.kz",
    city: "Almaty",
    owner: "Daniyar Omarov",
    contacts: 3,
    deals: 1,
    openValue: 62500,
  },
  {
    id: "C-103",
    name: "Astana Logistics",
    initials: "AL",
    industry: "Transport",
    employees: "800",
    revenue: 46000000,
    website: "astanalog.kz",
    city: "Astana",
    owner: "Madina Kaparova",
    contacts: 2,
    deals: 1,
    openValue: 41000,
  },
  {
    id: "C-104",
    name: "Tengri Retail",
    initials: "TR",
    industry: "Retail",
    employees: "2,400",
    revenue: 72000000,
    website: "tengri.kz",
    city: "Almaty",
    owner: "Timur Yesenov",
    contacts: 5,
    deals: 1,
    openValue: 28700,
  },
  {
    id: "C-105",
    name: "Silk Road Cargo",
    initials: "SC",
    industry: "Freight",
    employees: "600",
    revenue: 31000000,
    website: "silkroad.kz",
    city: "Almaty",
    owner: "Alina Bekova",
    contacts: 3,
    deals: 3,
    openValue: 96400,
  },
  {
    id: "C-106",
    name: "Almaty Medtech",
    initials: "AM",
    industry: "Healthcare",
    employees: "310",
    revenue: 18000000,
    website: "medtech.kz",
    city: "Almaty",
    owner: "Ruslan Iskakov",
    contacts: 2,
    deals: 1,
    openValue: 33200,
  },
];

export const LEAD_PERMISSIONS = [
  { action: "View leads", admin: true, manager: true, rep: true },
  { action: "Edit leads", admin: true, manager: true, rep: true },
  { action: "Delete leads", admin: true, manager: false, rep: false },
  { action: "Export leads", admin: true, manager: true, rep: false },
  { action: "Assign leads", admin: true, manager: true, rep: false },
  { action: "Merge leads", admin: true, manager: false, rep: false },
  { action: "Restore leads", admin: true, manager: false, rep: false },
];
