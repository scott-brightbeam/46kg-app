import { loadConfig } from "../config.js";
import { runTrackedJob } from "../services/operations.js";
import { runCoachingRhythm } from "../services/rhythm.js";

type ParsedArgs = {
  now?: Date;
  timeZone?: string;
  dryRun: boolean;
};

function parseArgs(argv: string[]): ParsedArgs {
  const parsed: ParsedArgs = {
    now: undefined,
    timeZone: undefined,
    dryRun: false
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (!arg) {
      continue;
    }

    if (arg === "--now") {
      const value = argv[index + 1];
      if (value) {
        parsed.now = new Date(value);
      }
      index += 1;
      continue;
    }

    if (arg === "--time-zone") {
      parsed.timeZone = argv[index + 1] ?? parsed.timeZone;
      index += 1;
      continue;
    }

    if (arg === "--dry-run") {
      parsed.dryRun = true;
    }
  }

  if (parsed.now && Number.isNaN(parsed.now.getTime())) {
    throw new Error("Expected --now to be a valid ISO timestamp.");
  }

  return parsed;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const config = loadConfig();
  const result = await runTrackedJob(
    config,
    {
      jobName: "coaching-rhythm",
      trigger: args.dryRun ? "manual" : "cron",
      failureAlertKey: "job:coaching-rhythm:failure",
      failureSummary: "Coaching rhythm failed.",
      failureCategory: "coaching"
    },
    async () => {
      const rhythmResult = await runCoachingRhythm(config, args);
      return {
        result: rhythmResult,
        status: args.dryRun ? "skipped" : "succeeded",
        summary: Object.keys(rhythmResult.actions).length
          ? `Executed coaching rhythm actions: ${Object.keys(rhythmResult.actions).join(", ")}.`
          : "No coaching actions were due this hour.",
        metadata: {
          date: rhythmResult.date,
          localTime: rhythmResult.localTime,
          actions: Object.keys(rhythmResult.actions)
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
