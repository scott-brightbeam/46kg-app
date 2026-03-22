import { loadConfig } from "../config.js";
import { runTrackedJob, type TrackedJobOutcome } from "../services/operations.js";
import { syncGoogleCalendarEvents } from "../services/google-calendar.js";

async function main() {
  const config = loadConfig();
  const result = await runTrackedJob<
    { skipped: true; reason: string } | Awaited<ReturnType<typeof syncGoogleCalendarEvents>>
  >(
    config,
    {
      jobName: "google-calendar-sync",
      trigger: "cron",
      failureAlertKey: "job:google-calendar-sync:failure",
      failureSummary: "Google Calendar sync failed.",
      failureCategory: "integration"
    },
    async (): Promise<
      TrackedJobOutcome<
        { skipped: true; reason: string } | Awaited<ReturnType<typeof syncGoogleCalendarEvents>>
      >
    > => {
      if (!config.GOOGLE_CLIENT_ID || !config.GOOGLE_CLIENT_SECRET || !config.GOOGLE_REFRESH_TOKEN) {
        return {
          result: {
            skipped: true,
            reason: "google_calendar_not_configured"
          },
          status: "skipped",
          summary: "Google Calendar sync skipped because credentials are not configured."
        };
      }

      const syncResult = await syncGoogleCalendarEvents(config, {
        calendarId: config.GOOGLE_CALENDAR_ID
      });
      return {
        result: syncResult,
        summary: `Synced ${syncResult.itemCount} Google Calendar events.`,
        metadata: {
          calendarId: config.GOOGLE_CALENDAR_ID,
          itemCount: syncResult.itemCount,
          cursorReset: syncResult.cursorReset
        }
      };
    }
  );

  console.log(JSON.stringify(result, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
