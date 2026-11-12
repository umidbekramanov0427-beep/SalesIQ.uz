import { createFileRoute } from "@tanstack/react-router";
import { runFileHousekeeping } from "@/lib/files-housekeeping.server";
import { runLeadsTrashPurge } from "@/lib/leads-trash.server";
import {
  ensureChatMemberUpdates,
  ensureTelegramWebhookSecret,
  sendDailyReportToLinkedManagers,
} from "@/lib/telegram-report.server";
import { sendOwnerDigestIfDue } from "@/lib/platform-insights.server";
import { appUrl, ensureOpsBot } from "@/lib/ops/bot.server";
import { runOpsTick } from "@/lib/ops/health.server";
import { runFollowUps } from "@/lib/followups.server";
import { runLeadScoring } from "@/lib/lead-scoring.server";
import { runRecurringPayments } from "@/lib/lead-payments/recurring.server";
import { sendWeeklyOwnerReports } from "@/lib/weekly-report.server";
import { runTrialNudges } from "@/lib/trial-nudges.server";
import { sendAttendanceReports } from "@/lib/attendance.server";
import { refreshChannels } from "@/lib/marketing-live.server";
import { runRefundReminders } from "@/lib/refunds.server";
import { runTelegramBackupIfDue } from "@/lib/telegram-backup.server";
import { metaSyncDue } from "@/lib/meta-ads.server";

export const Route = createFileRoute("/telegram/send-daily-report")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const expected = process.env["CRON_SECRET"];
        const got = request.headers.get("x-cron-secret");
        if (!expected || got !== expected) {
          return Response.json({ error: "Unauthorized" }, { status: 401 });
        }

        // Piggybacks on this 5-minute cron to keep the bot's webhook
        // registered with its secret (best effort, once per instance).
        await ensureTelegramWebhookSecret(new URL(request.url).origin).catch((err) =>
          console.error("[telegram] could not register webhook secret", err),
        );
        // Channel analytics: joins and leaves of channels the bot is an admin of.
        await ensureChatMemberUpdates().catch((err) =>
          console.error("[telegram] could not turn on chat_member updates", err),
        );

        // The platform owner's morning digest of trial companies rides on
        // the same tick (sent once, at 09:00 Tashkent time).
        await sendOwnerDigestIfDue(new URL(request.url).origin).catch((err) =>
          console.error("[insights] owner digest failed", err),
        );

        // The monitoring bot: its webhook and command menu, the 09:00
        // platform health report and alerts checked every 15 minutes.
        await ensureOpsBot().catch((err) => console.error("[ops] bot setup failed", err));
        await runOpsTick(appUrl()).catch((err) => console.error("[ops] tick failed", err));
        // Companies' automatic follow-ups to silent clients.
        await runFollowUps().catch((err) => console.error("[followups] tick failed", err));
        // AI lead score for leads whose client wrote something new.
        await runLeadScoring().catch((err) => console.error("[lead-score] tick failed", err));
        // Monthly payment links for clients (lead_payment_schedules).
        await runRecurringPayments().catch((err) =>
          console.error("[lead-payments] recurring tick failed", err),
        );
        // Monday 09:00: last week's numbers to each company's owners.
        await sendWeeklyOwnerReports().catch((err) =>
          console.error("[weekly-report] tick failed", err),
        );
        // Davomat: each company's evening attendance report (Admin -> Davomat qoidalari).
        await sendAttendanceReports().catch((err) =>
          console.error("[attendance] report tick failed", err),
        );
        // Pul qaytarish: deadline reminders to the manager and the admins.
        await runRefundReminders().catch((err) => console.error("[refunds] reminders failed", err));
        // Platforma -> Zaxira: every company's data to the bound Telegram
        // channel once a day at the owner's time.
        await runTelegramBackupIfDue().catch((err) =>
          console.error("[backup] telegram backup check failed", err),
        );
        // Marketing paneli: Meta ad spend per campaign (hourly each company).
        await metaSyncDue().catch((err) => console.error("[meta] sync failed", err));
        // Marketing paneli: Telegram channels' subscriber counts (hourly each).
        await refreshChannels().catch((err) => console.error("[marketing] channels failed", err));
        // Trial companies: first-day / idle / trial-ending nudges.
        await runTrialNudges().catch((err) => console.error("[trial-nudges] tick failed", err));
        // Admin → Fayllar: the companies' file rules and the 30-day trash.
        await runFileHousekeeping().catch((err) => console.error("[files] tick failed", err));
        // Lidlar savati: deleted leads leave for good after 30 days.
        await runLeadsTrashPurge().catch((err) => console.error("[leads-trash] tick failed", err));

        try {
          const result = await sendDailyReportToLinkedManagers();
          return Response.json(result);
        } catch (err) {
          return Response.json(
            { error: err instanceof Error ? err.message : "Failed to send report" },
            { status: 500 },
          );
        }
      },
    },
  },
});
