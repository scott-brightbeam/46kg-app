import path from "node:path";

import { loadConfig } from "../config.js";
import {
  buildStrongDadHevyImportPlan,
  executeStrongDadHevyImportPlan,
  fetchHevyImportCatalog,
  getDefaultStrongDadPaths,
  loadStrongDadCuratedBatch,
  summarizeStrongDadHevyPlan,
  writeStrongDadHevyExecutionArtifact,
  writeStrongDadHevyPlanArtifacts
} from "../services/hevy-import.js";

type ParsedArgs = {
  execute: boolean;
  inputPath: string;
  planJsonPath: string;
  planMarkdownPath: string;
  executionJsonPath: string;
};

function resolvePath(value: string) {
  if (path.isAbsolute(value)) {
    return value;
  }

  return path.resolve(process.cwd(), value);
}

function parseArgs(argv: string[]): ParsedArgs {
  const defaults = getDefaultStrongDadPaths();
  const parsed: ParsedArgs = {
    execute: false,
    inputPath: defaults.inputPath,
    planJsonPath: defaults.planJsonPath,
    planMarkdownPath: defaults.planMarkdownPath,
    executionJsonPath: defaults.executionJsonPath
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (!arg) {
      continue;
    }

    if (arg === "--execute") {
      parsed.execute = true;
      continue;
    }

    if (arg === "--input") {
      parsed.inputPath = resolvePath(argv[index + 1] ?? parsed.inputPath);
      index += 1;
      continue;
    }

    if (arg === "--plan-json") {
      parsed.planJsonPath = resolvePath(argv[index + 1] ?? parsed.planJsonPath);
      index += 1;
      continue;
    }

    if (arg === "--plan-md") {
      parsed.planMarkdownPath = resolvePath(argv[index + 1] ?? parsed.planMarkdownPath);
      index += 1;
      continue;
    }

    if (arg === "--execution-json") {
      parsed.executionJsonPath = resolvePath(argv[index + 1] ?? parsed.executionJsonPath);
      index += 1;
    }
  }

  return parsed;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const config = loadConfig();
  const batch = await loadStrongDadCuratedBatch(args.inputPath);
  const catalog = await fetchHevyImportCatalog(config);
  const plan = buildStrongDadHevyImportPlan(args.inputPath, batch, catalog);

  await writeStrongDadHevyPlanArtifacts(plan, args.planJsonPath, args.planMarkdownPath);

  const summary = summarizeStrongDadHevyPlan(plan);
  console.log(
    JSON.stringify(
      {
        mode: args.execute ? "execute" : "dry_run",
        planJsonPath: args.planJsonPath,
        planMarkdownPath: args.planMarkdownPath,
        ...summary
      },
      null,
      2
    )
  );

  if (!args.execute) {
    return;
  }

  const execution = await executeStrongDadHevyImportPlan(config, plan);
  await writeStrongDadHevyExecutionArtifact(execution, args.executionJsonPath);

  console.log(
    JSON.stringify(
      {
        executionJsonPath: args.executionJsonPath,
        ...execution
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
