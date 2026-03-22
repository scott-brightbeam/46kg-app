import { loadConfig } from "../config.js";
import { runNightlyBackup } from "../services/backup.js";
import { runTrackedJob } from "../services/operations.js";

async function main() {
  const config = loadConfig();
  const result = await runTrackedJob(
    config,
    {
      jobName: "nightly-backup",
      trigger: "cron",
      failureAlertKey: "job:nightly-backup:failure",
      failureSummary: "Nightly backup failed.",
      failureCategory: "backup"
    },
    async () => {
      const backupResult = await runNightlyBackup(config);
      if (backupResult.skipped) {
        return {
          result: backupResult,
          status: "skipped",
          summary: "Backup skipped because S3 backup is not configured."
        };
      }

      return {
        result: backupResult,
        summary: `Backup uploaded to ${backupResult.bucket}/${backupResult.key}.`,
        metadata: {
          bucket: backupResult.bucket,
          key: backupResult.key,
          bytes: backupResult.bytes
        }
      };
    }
  );

  console.log(JSON.stringify(result, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
