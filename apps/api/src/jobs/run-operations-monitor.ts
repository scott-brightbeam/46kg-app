import { loadConfig } from "../config.js";
import { buildOperatorStatus, runOperationsMonitor, runTrackedJob } from "../services/operations.js";

type ParsedArgs = {
  dryRun: boolean;
};

function parseArgs(argv: string[]): ParsedArgs {
  return {
    dryRun: argv.includes("--dry-run")
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const config = loadConfig();
  const result = await runTrackedJob(
    config,
    {
      jobName: "operations-monitor",
      trigger: args.dryRun ? "manual" : "cron",
      failureAlertKey: "job:operations-monitor:failure",
      failureSummary: "Operations monitor failed.",
      failureCategory: "operations"
    },
    async () => {
      const monitorResult = args.dryRun
        ? {
            status: await buildOperatorStatus(config),
            openedAlerts: [],
            resolvedAlerts: []
          }
        : await runOperationsMonitor(config);

      return {
        result: monitorResult,
        status: args.dryRun ? "skipped" : "succeeded",
        summary: `Operations status is ${monitorResult.status.overallStatus}.`,
        metadata: {
          overallStatus: monitorResult.status.overallStatus,
          openedAlerts: monitorResult.openedAlerts.length,
          resolvedAlerts: monitorResult.resolvedAlerts.length
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
