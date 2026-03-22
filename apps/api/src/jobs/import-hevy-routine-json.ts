import path from "node:path";

import { loadConfig } from "../config.js";
import {
  executeHevyJsonRoutinePlan,
  loadHevyJsonRoutineInput,
  planHevyJsonRoutineImport
} from "../services/hevy-routine-json.js";

function getArgValue(flag: string) {
  const index = process.argv.indexOf(flag);
  if (index === -1) {
    return null;
  }

  return process.argv[index + 1] ?? null;
}

function hasFlag(flag: string) {
  return process.argv.includes(flag);
}

async function main() {
  const config = loadConfig();
  const inputArg = getArgValue("--input");
  if (!inputArg) {
    throw new Error("Pass --input /absolute/or/relative/path/to/routine.json");
  }

  const inputPath = path.resolve(process.cwd(), inputArg);
  const input = await loadHevyJsonRoutineInput(inputPath);
  const plan = await planHevyJsonRoutineImport(config, input);

  if (hasFlag("--dry-run")) {
    console.log(
      JSON.stringify(
        {
          inputPath,
          folder: plan.folder,
          existingRoutineId: plan.routine.existingRoutineId,
          customExercises: plan.customExercises.map((exercise) => ({
            title: exercise.title,
            existingTemplateId: exercise.existingTemplateId
          })),
          payload: plan.routine.payload
        },
        null,
        2
      )
    );
    return;
  }

  const result = await executeHevyJsonRoutinePlan(config, plan);
  console.log(
    JSON.stringify(
      {
        inputPath,
        title: input.name,
        folderTitle: plan.folder.title,
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
