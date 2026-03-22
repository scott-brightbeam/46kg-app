import { loadConfig } from "../config.js";
import { runTrackedJob, type TrackedJobOutcome } from "../services/operations.js";
import { syncHevyData } from "../services/hevy.js";

async function main() {
  const config = loadConfig();
  const result = await runTrackedJob<
    { skipped: true; reason: string } | Awaited<ReturnType<typeof syncHevyData>>
  >(
    config,
    {
      jobName: "hevy-sync",
      trigger: "cron",
      failureAlertKey: "job:hevy-sync:failure",
      failureSummary: "Hevy sync failed.",
      failureCategory: "integration"
    },
    async (): Promise<
      TrackedJobOutcome<
        { skipped: true; reason: string } | Awaited<ReturnType<typeof syncHevyData>>
      >
    > => {
      if (!config.HEVY_API_KEY) {
        return {
          result: {
            skipped: true,
            reason: "hevy_not_configured"
          },
          status: "skipped",
          summary: "Hevy sync skipped because HEVY_API_KEY is not configured."
        };
      }

      const syncResult = await syncHevyData(config);
      return {
        result: syncResult,
        summary: `Synced ${syncResult.eventCount} Hevy workout events and ${syncResult.routineCount} routines.`,
        metadata: {
          eventCount: syncResult.eventCount,
          routineCount: syncResult.routineCount,
          updatedWorkoutCount: syncResult.updatedWorkoutCount,
          deletedWorkoutCount: syncResult.deletedWorkoutCount
        }
      };
    }
  );
  console.log(
    JSON.stringify(
      {
        source: "hevy",
        syncedAt: new Date().toISOString(),
        ...result
      },
      null,
      2
    )
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
