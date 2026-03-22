import { loadConfig } from "../config.js";
import { sendMorningBrief } from "../services/planning.js";

type ParsedArgs = {
  date: string;
  timeZone?: string;
  dryRun: boolean;
};

function getDefaultDate(timeZone = "Europe/London") {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(new Date());
}

function parseArgs(argv: string[]): ParsedArgs {
  const parsed: ParsedArgs = {
    date: getDefaultDate(),
    timeZone: undefined,
    dryRun: false
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (!arg) {
      continue;
    }

    if (arg === "--date") {
      parsed.date = argv[index + 1] ?? parsed.date;
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

  return parsed;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const config = loadConfig();
  const result = await sendMorningBrief(config, args);

  console.log(
    JSON.stringify(
      {
        dryRun: args.dryRun,
        date: args.date,
        timeZone: args.timeZone ?? "Europe/London",
        summary: result.plan.summary,
        message: result.text
      },
      null,
      2
    )
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
