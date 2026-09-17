export type Rep = {
  id: string;
  name: string;
  role: string;
  department: string;
  revenue: number;
  target: number;
  deals: number;
  calls: number;
  winRate: number;
  trend: number;
};

export const REPS: Rep[] = [
  { id: "1", name: "Aizhan Serikova", role: "Senior AE", department: "Enterprise", revenue: 184500, target: 160000, deals: 23, calls: 412, winRate: 41, trend: 12.4 },
  { id: "2", name: "Daniyar Omarov", role: "Account Executive", department: "Mid-Market", revenue: 152300, target: 150000, deals: 19, calls: 388, winRate: 37, trend: 6.1 },
  { id: "3", name: "Madina Kaparova", role: "Account Executive", department: "Enterprise", revenue: 141900, target: 150000, deals: 17, calls: 356, winRate: 35, trend: -2.3 },
  { id: "4", name: "Timur Yesenov", role: "SDR Lead", department: "SMB", revenue: 118400, target: 120000, deals: 28, calls: 501, winRate: 29, trend: 9.7 },
  { id: "5", name: "Alina Bekova", role: "Account Executive", department: "Mid-Market", revenue: 96750, target: 120000, deals: 14, calls: 297, winRate: 26, trend: 3.2 },
  { id: "6", name: "Ruslan Iskakov", role: "SDR", department: "SMB", revenue: 74200, target: 100000, deals: 21, calls: 468, winRate: 22, trend: -5.8 },
];

export const REVENUE_SERIES = [
  { month: "Jan", revenue: 412000, pipeline: 680000 },
  { month: "Feb", revenue: 468000, pipeline: 712000 },
  { month: "Mar", revenue: 521000, pipeline: 790000 },
  { month: "Apr", revenue: 498000, pipeline: 764000 },
  { month: "May", revenue: 587000, pipeline: 851000 },
  { month: "Jun", revenue: 641000, pipeline: 902000 },
  { month: "Jul", revenue: 703000, pipeline: 968000 },
  { month: "Aug", revenue: 768050, pipeline: 1042000 },
];

export const FUNNEL_STAGES = [
  { stage: "New Lead", count: 1240, value: 3120000, avgDays: 1.2, conversion: 100 },
  { stage: "Qualified", count: 742, value: 2260000, avgDays: 3.4, conversion: 59.8 },
  { stage: "Demo", count: 418, value: 1580000, avgDays: 5.1, conversion: 33.7 },
  { stage: "Proposal", count: 236, value: 1041000, avgDays: 7.8, conversion: 19.0 },
  { stage: "Negotiation", count: 128, value: 684000, avgDays: 6.2, conversion: 10.3 },
  { stage: "Won", count: 71, value: 402500, avgDays: 2.0, conversion: 5.7 },
];

export type Task = {
  id: string;
  title: string;
  assignee: string;
  priority: "Urgent" | "High" | "Normal" | "Low";
  status: "Todo" | "In progress" | "Review" | "Done";
  due: string;
  progress: number;
};

export const TASKS: Task[] = [
  { id: "T-1041", title: "Prepare Q3 enterprise renewal pack", assignee: "Aizhan Serikova", priority: "Urgent", status: "In progress", due: "Today", progress: 65 },
  { id: "T-1042", title: "Rework pricing objection script", assignee: "Daniyar Omarov", priority: "High", status: "Review", due: "Tomorrow", progress: 80 },
  { id: "T-1043", title: "Migrate legacy leads into new funnel", assignee: "Madina Kaparova", priority: "Normal", status: "Todo", due: "12 Aug", progress: 10 },
  { id: "T-1044", title: "Call quality audit — SMB team", assignee: "Timur Yesenov", priority: "High", status: "In progress", due: "14 Aug", progress: 45 },
  { id: "T-1045", title: "Onboard 3 new SDRs to SalesIQ", assignee: "Alina Bekova", priority: "Low", status: "Done", due: "1 Aug", progress: 100 },
];

export type Lead = {
  id: string;
  company: string;
  contact: string;
  stage: string;
  previousStage: string;
  owner: string;
  value: number;
  updated: string;
};

export const LEADS: Lead[] = [
  { id: "L-8842", company: "Kazpost Digital", contact: "Sanzhar A.", stage: "Negotiation", previousStage: "Proposal", owner: "Aizhan Serikova", value: 84000, updated: "2h ago" },
  { id: "L-8839", company: "Halyk Fintech", contact: "Zarina M.", stage: "Proposal", previousStage: "Demo", owner: "Daniyar Omarov", value: 62500, updated: "5h ago" },
  { id: "L-8830", company: "Astana Logistics", contact: "Yerlan T.", stage: "Demo", previousStage: "Qualified", owner: "Madina Kaparova", value: 41000, updated: "Yesterday" },
  { id: "L-8821", company: "Tengri Retail", contact: "Aigerim S.", stage: "Qualified", previousStage: "New Lead", owner: "Timur Yesenov", value: 28700, updated: "Yesterday" },
  { id: "L-8814", company: "Silk Road Cargo", contact: "Nurlan K.", stage: "Won", previousStage: "Negotiation", owner: "Alina Bekova", value: 96400, updated: "2 days ago" },
  { id: "L-8802", company: "Almaty Medtech", contact: "Dana B.", stage: "Lost", previousStage: "Proposal", owner: "Ruslan Iskakov", value: 33200, updated: "3 days ago" },
];

export const CALLS = [
  { id: "C-2201", rep: "Aizhan Serikova", company: "Kazpost Digital", duration: "18:42", sentiment: "Positive", score: 92, objection: "Budget timing", summary: "Strong discovery, clear next step booked for contract review." },
  { id: "C-2198", rep: "Daniyar Omarov", company: "Halyk Fintech", duration: "24:07", sentiment: "Neutral", score: 78, objection: "Security review", summary: "Buyer requested SOC2 documentation before proposal sign-off." },
  { id: "C-2193", rep: "Timur Yesenov", company: "Tengri Retail", duration: "09:15", sentiment: "Negative", score: 54, objection: "Price too high", summary: "Rep skipped value framing; discount offered too early in the call." },
  { id: "C-2187", rep: "Madina Kaparova", company: "Astana Logistics", duration: "31:56", sentiment: "Positive", score: 88, objection: "Integration effort", summary: "Technical stakeholder aligned; implementation plan shared on call." },
];

export const NOTIFICATIONS = [
  { id: "N-1", type: "Assignment", title: "You were assigned to “Q3 enterprise renewal pack”", meta: "by Aizhan Serikova · 12 min ago", unread: true },
  { id: "N-2", type: "Overdue", title: "Lead task “Send revised proposal” is overdue", meta: "Halyk Fintech · 1h ago", unread: true },
  { id: "N-3", type: "AI", title: "AI flagged 3 calls with unresolved pricing objections", meta: "Audio Analytics · 3h ago", unread: true },
  { id: "N-4", type: "Automation", title: "12 leads auto-moved from Demo to Proposal", meta: "Automation log · 6h ago", unread: false },
  { id: "N-5", type: "Completed", title: "Alina Bekova completed “Onboard 3 new SDRs”", meta: "Yesterday", unread: false },
];

export const currency = (n: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n);
