import { loadConfig } from "../config.js";
import { sendWeightPrompt } from "../services/coaching.js";

type ParsedArgs = {
  date: string;
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

    if (arg === "--dry-run") {
      parsed.dryRun = true;
    }
  }

  return parsed;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const config = loadConfig();
  const result = await sendWeightPrompt(config, args);

  console.log(JSON.stringify(result, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
