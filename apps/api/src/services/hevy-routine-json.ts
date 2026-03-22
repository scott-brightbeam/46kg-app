import { readFile } from "node:fs/promises";

import { requireHevyConfig, type AppConfig } from "../config.js";
import { fetchHevyImportCatalog } from "./hevy-import.js";

type InputSet = {
  reps?: number;
  weightKg?: number;
  durationSeconds?: number;
  distanceMeters?: number;
  type?: "normal" | "warmup" | "failure" | "dropset";
};

type InputExercise = {
  name: string;
  equipment?: string | null;
  notes?: string | null;
  sets: InputSet[];
};

export type HevyJsonRoutineInput = {
  name: string;
  type: "routine";
  notes?: string;
  rounds?: number | null;
  restBetweenRoundsSeconds?: number | null;
  folderName?: string | null;
  exercises: InputExercise[];
};

type HevyExerciseTemplate = {
  id: string;
  title: string;
  type: string;
  is_custom: boolean;
};

type HevyRoutineFolder = {
  id: number;
  title: string;
};

type HevyRoutine = {
  id: string;
  title: string;
  folder_id?: number | null;
};

type HevyRoutineSet = {
  type: "normal" | "warmup" | "failure" | "dropset";
  reps?: number;
  weight_kg?: number;
  duration_seconds?: number;
  distance_meters?: number;
};

type HevyRoutineExerciseBody = {
  exercise_template_id: string;
  superset_id?: number | null;
  rest_seconds?: number | null;
  notes?: string | null;
  sets: HevyRoutineSet[];
};

type HevyCreateRoutineBody = {
  routine: {
    title: string;
    folder_id: number | null;
    notes: string;
    exercises: HevyRoutineExerciseBody[];
  };
};

type HevyCreateCustomExerciseBody = {
  exercise: {
    title: string;
    exercise_type:
      | "weight_reps"
      | "reps_only"
      | "bodyweight_reps"
      | "bodyweight_assisted_reps"
      | "duration"
      | "weight_duration"
      | "distance_duration"
      | "short_distance_weight";
    equipment_category:
      | "none"
      | "barbell"
      | "dumbbell"
      | "kettlebell"
      | "machine"
      | "plate"
      | "resistance_band"
      | "suspension"
      | "other";
    muscle_group:
      | "abdominals"
      | "shoulders"
      | "biceps"
      | "triceps"
      | "forearms"
      | "quadriceps"
      | "hamstrings"
      | "calves"
      | "glutes"
      | "abductors"
      | "adductors"
      | "lats"
      | "upper_back"
      | "traps"
      | "lower_back"
      | "chest"
      | "cardio"
      | "neck"
      | "full_body"
      | "other";
  };
};

type PlannedExercise = {
  sourceName: string;
  resolvedTitle: string;
  existingTemplateId: string | null;
  customDefinition: HevyCreateCustomExerciseBody["exercise"] | null;
  payload: HevyRoutineExerciseBody;
};

export type HevyJsonRoutinePlan = {
  title: string;
  folder: {
    title: string;
    existingFolderId: number | null;
  };
  routine: {
    existingRoutineId: string | null;
    notes: string;
    exercises: PlannedExercise[];
    payload: HevyCreateRoutineBody;
  };
  customExercises: Array<{
    title: string;
    existingTemplateId: string | null;
    definition: HevyCreateCustomExerciseBody["exercise"];
  }>;
};

export type HevyJsonRoutineExecutionResult = {
  folderId: number;
  routineId: string;
  routineAction: "created" | "updated";
  customExerciseResults: Array<{
    title: string;
    action: "reused" | "created";
    templateId: string;
  }>;
};

const HEVY_BASE_URL = "https://api.hevyapp.com";
const HEVY_WRITE_DELAY_MS = Number.parseInt(process.env.HEVY_WRITE_DELAY_MS ?? "1500", 10);
const HEVY_429_RETRY_BASE_DELAY_MS = Number.parseInt(process.env.HEVY_429_RETRY_BASE_DELAY_MS ?? "5000", 10);
const HEVY_MAX_RETRIES = 6;

const TITLE_ALIASES = new Map<string, string[]>([
  ["militarypress|barbell", ["Standing Military Press (Barbell)"]],
  ["deadlift|barbell", ["Deadlift (Barbell)"]],
  ["bentoverrow|barbell", ["Bent Over Row (Barbell)"]],
  ["preachercurl|barbell", ["Preacher Curl (Barbell)"]]
]);

function normalizeName(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function normalizeEquipment(value: string | null | undefined) {
  if (!value) {
    return null;
  }

  const normalized = normalizeName(value);
  if (normalized === "barbell") {
    return "Barbell";
  }
  if (normalized === "dumbbell") {
    return "Dumbbell";
  }
  if (normalized === "kettlebell") {
    return "Kettlebell";
  }
  if (normalized === "machine") {
    return "Machine";
  }
  if (normalized === "band" || normalized === "resistanceband") {
    return "Band";
  }
  return value.trim();
}

function inferExerciseType(exercise: InputExercise): HevyCreateCustomExerciseBody["exercise"]["exercise_type"] {
  const firstSet = exercise.sets[0] ?? {};
  if (typeof firstSet.distanceMeters === "number" && typeof firstSet.durationSeconds === "number") {
    return "distance_duration";
  }
  if (typeof firstSet.durationSeconds === "number" && typeof firstSet.weightKg === "number") {
    return "weight_duration";
  }
  if (typeof firstSet.durationSeconds === "number") {
    return "duration";
  }
  if (typeof firstSet.weightKg === "number") {
    return "weight_reps";
  }
  return "reps_only";
}

function inferEquipmentCategory(
  exercise: InputExercise
): HevyCreateCustomExerciseBody["exercise"]["equipment_category"] {
  const equipment = normalizeEquipment(exercise.equipment);
  switch (equipment) {
    case "Barbell":
      return "barbell";
    case "Dumbbell":
      return "dumbbell";
    case "Kettlebell":
      return "kettlebell";
    case "Machine":
      return "machine";
    case "Band":
      return "resistance_band";
    default:
      return "other";
  }
}

function inferMuscleGroup(exerciseName: string): HevyCreateCustomExerciseBody["exercise"]["muscle_group"] {
  const normalized = normalizeName(exerciseName);
  if (normalized.includes("curl")) {
    return "biceps";
  }
  if (normalized.includes("press")) {
    return "shoulders";
  }
  if (normalized.includes("row")) {
    return "upper_back";
  }
  if (normalized.includes("squat")) {
    return "quadriceps";
  }
  if (normalized.includes("deadlift")) {
    return "full_body";
  }
  return "other";
}

function candidateTitles(exercise: InputExercise) {
  const name = exercise.name.trim();
  const equipment = normalizeEquipment(exercise.equipment);
  const candidates = new Set<string>();

  if (equipment) {
    candidates.add(`${name} (${equipment})`);
  }

  const aliasKey = `${normalizeName(name)}|${normalizeName(equipment ?? "")}`;
  for (const alias of TITLE_ALIASES.get(aliasKey) ?? []) {
    candidates.add(alias);
  }

  candidates.add(name);
  return [...candidates];
}

function pickExistingTemplate(exercise: InputExercise, templates: HevyExerciseTemplate[]) {
  const candidates = candidateTitles(exercise);
  const normalizedCandidates = candidates.map((candidate) => normalizeName(candidate));

  for (const candidate of normalizedCandidates) {
    const exactBuiltIn = templates.find(
      (template) => !template.is_custom && normalizeName(template.title) === candidate
    );
    if (exactBuiltIn) {
      return exactBuiltIn;
    }
  }

  for (const candidate of normalizedCandidates) {
    const exactCustom = templates.find(
      (template) => template.is_custom && normalizeName(template.title) === candidate
    );
    if (exactCustom) {
      return exactCustom;
    }
  }

  return null;
}

function buildCustomDefinition(exercise: InputExercise): HevyCreateCustomExerciseBody["exercise"] {
  const equipment = normalizeEquipment(exercise.equipment);
  const title = equipment ? `${exercise.name.trim()} (${equipment})` : exercise.name.trim();

  return {
    title,
    exercise_type: inferExerciseType(exercise),
    equipment_category: inferEquipmentCategory(exercise),
    muscle_group: inferMuscleGroup(exercise.name)
  };
}

function buildSetPayload(set: InputSet): HevyRoutineSet {
  return {
    type: set.type ?? "normal",
    reps: set.reps,
    weight_kg: set.weightKg,
    duration_seconds: set.durationSeconds,
    distance_meters: set.distanceMeters
  };
}

function shouldUseCircuitGrouping(input: HevyJsonRoutineInput) {
  if (!input.rounds || input.rounds < 2) {
    return false;
  }

  return input.exercises.every((exercise) => exercise.sets.length === input.rounds);
}

export function buildHevyJsonRoutinePlan(
  input: HevyJsonRoutineInput,
  catalog: {
    templates: HevyExerciseTemplate[];
    folders: HevyRoutineFolder[];
    routines: HevyRoutine[];
  }
): HevyJsonRoutinePlan {
  const folderTitle = input.folderName?.trim() || "46KG";
  const existingFolder = catalog.folders.find(
    (folder) => normalizeName(folder.title) === normalizeName(folderTitle)
  );
  const existingRoutine = catalog.routines.find(
    (routine) =>
      normalizeName(routine.title) === normalizeName(input.name) &&
      ((existingFolder && routine.folder_id === existingFolder.id) ||
        (!existingFolder && (routine.folder_id == null || routine.folder_id === undefined)))
  );

  const useCircuitGrouping = shouldUseCircuitGrouping(input);
  const supersetId = useCircuitGrouping ? 1 : null;
  const customExercises: HevyJsonRoutinePlan["customExercises"] = [];

  const plannedExercises = input.exercises.map((exercise, index) => {
    const matchedTemplate = pickExistingTemplate(exercise, catalog.templates);
    const customDefinition = matchedTemplate ? null : buildCustomDefinition(exercise);
    if (customDefinition) {
      customExercises.push({
        title: customDefinition.title,
        existingTemplateId: null,
        definition: customDefinition
      });
    }

    const isLastExerciseInCircuit = useCircuitGrouping && index === input.exercises.length - 1;
    const restSeconds =
      useCircuitGrouping
        ? isLastExerciseInCircuit
          ? (input.restBetweenRoundsSeconds ?? null)
          : 0
        : null;

    return {
      sourceName: exercise.name,
      resolvedTitle: matchedTemplate?.title ?? customDefinition?.title ?? exercise.name,
      existingTemplateId: matchedTemplate?.id ?? null,
      customDefinition,
      payload: {
        exercise_template_id: matchedTemplate?.id ?? "",
        superset_id: supersetId,
        rest_seconds: restSeconds,
        notes: exercise.notes ?? null,
        sets: exercise.sets.map(buildSetPayload)
      }
    } satisfies PlannedExercise;
  });

  const notesParts = [input.notes?.trim()].filter(Boolean);
  if (useCircuitGrouping) {
    notesParts.push(
      `Encoded as a Hevy superset/circuit with ${input.exercises.length} exercises and ${input.rounds} rounds.`
    );
  }

  return {
    title: input.name,
    folder: {
      title: folderTitle,
      existingFolderId: existingFolder?.id ?? null
    },
    routine: {
      existingRoutineId: existingRoutine?.id ?? null,
      notes: notesParts.join("\n\n"),
      exercises: plannedExercises,
      payload: {
        routine: {
          title: input.name,
          folder_id: existingFolder?.id ?? null,
          notes: notesParts.join("\n\n"),
          exercises: plannedExercises.map((exercise) => exercise.payload)
        }
      }
    },
    customExercises
  };
}

async function hevyRequest<T>(
  config: AppConfig,
  endpoint: string,
  init: RequestInit = {}
): Promise<T> {
  const { apiKey } = requireHevyConfig(config);

  for (let attempt = 0; attempt < HEVY_MAX_RETRIES; attempt += 1) {
    const response = await fetch(`${HEVY_BASE_URL}${endpoint}`, {
      ...init,
      headers: {
        "api-key": apiKey,
        "content-type": "application/json",
        ...(init.headers ?? {})
      }
    });

    if (response.status === 429 && attempt < HEVY_MAX_RETRIES - 1) {
      const retryAfterHeader = response.headers.get("retry-after");
      const retryAfterSeconds = retryAfterHeader ? Number.parseFloat(retryAfterHeader) : Number.NaN;
      const delayMs = Number.isFinite(retryAfterSeconds)
        ? Math.max(1000, Math.ceil(retryAfterSeconds * 1000))
        : HEVY_429_RETRY_BASE_DELAY_MS * (attempt + 1);
      await new Promise((resolve) => setTimeout(resolve, delayMs));
      continue;
    }

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`Hevy request failed for ${endpoint}: ${response.status} ${response.statusText} ${body}`);
    }

    const text = (await response.text()).trim();
    if (text.length === 0) {
      return null as T;
    }

    try {
      return JSON.parse(text) as T;
    } catch {
      return text as T;
    }
  }

  throw new Error(`Hevy request exhausted retries for ${endpoint}`);
}

function extractRoutineFolderId(payload: unknown) {
  if (
    payload &&
    typeof payload === "object" &&
    "routine_folder" in payload &&
    payload.routine_folder &&
    typeof payload.routine_folder === "object" &&
    "id" in payload.routine_folder &&
    typeof payload.routine_folder.id === "number"
  ) {
    return payload.routine_folder.id;
  }

  if (payload && typeof payload === "object" && "id" in payload && typeof payload.id === "number") {
    return payload.id;
  }

  throw new Error(`Unable to extract routine folder id from Hevy response: ${JSON.stringify(payload)}`);
}

function extractCreatedExerciseTemplateId(payload: unknown) {
  if (typeof payload === "string" && payload.length > 0) {
    return payload;
  }

  if (payload && typeof payload === "object" && "id" in payload && payload.id !== null) {
    return String(payload.id);
  }

  throw new Error(`Unable to extract exercise template id from Hevy response: ${JSON.stringify(payload)}`);
}

function extractRoutineId(payload: unknown) {
  if (
    payload &&
    typeof payload === "object" &&
    "routine" in payload &&
    Array.isArray(payload.routine) &&
    payload.routine[0] &&
    typeof payload.routine[0] === "object" &&
    "id" in payload.routine[0] &&
    payload.routine[0].id !== null
  ) {
    return String(payload.routine[0].id);
  }

  if (
    payload &&
    typeof payload === "object" &&
    "routine" in payload &&
    payload.routine &&
    typeof payload.routine === "object" &&
    !Array.isArray(payload.routine) &&
    "id" in payload.routine &&
    payload.routine.id !== null
  ) {
    return String(payload.routine.id);
  }

  if (payload && typeof payload === "object" && "id" in payload && payload.id !== null) {
    return String(payload.id);
  }

  if (typeof payload === "string" && payload.length > 0) {
    return payload;
  }

  throw new Error(`Unable to extract routine id from Hevy response: ${JSON.stringify(payload)}`);
}

async function ensureFolder(config: AppConfig, plan: HevyJsonRoutinePlan) {
  if (plan.folder.existingFolderId !== null) {
    return plan.folder.existingFolderId;
  }

  const response = await hevyRequest<unknown>(config, "/v1/routine_folders", {
    method: "POST",
    body: JSON.stringify({
      routine_folder: {
        title: plan.folder.title
      }
    })
  });

  const folderId = extractRoutineFolderId(response);
  await new Promise((resolve) => setTimeout(resolve, HEVY_WRITE_DELAY_MS));
  return folderId;
}

async function ensureCustomTemplates(config: AppConfig, plan: HevyJsonRoutinePlan) {
  const templateIds = new Map<string, string>();
  const results: HevyJsonRoutineExecutionResult["customExerciseResults"] = [];

  for (const customExercise of plan.customExercises) {
    if (customExercise.existingTemplateId) {
      templateIds.set(customExercise.title, customExercise.existingTemplateId);
      results.push({
        title: customExercise.title,
        action: "reused",
        templateId: customExercise.existingTemplateId
      });
      continue;
    }

    const response = await hevyRequest<unknown>(config, "/v1/exercise_templates", {
      method: "POST",
      body: JSON.stringify({
        exercise: customExercise.definition
      } satisfies HevyCreateCustomExerciseBody)
    });

    const templateId = extractCreatedExerciseTemplateId(response);
    templateIds.set(customExercise.title, templateId);
    results.push({
      title: customExercise.title,
      action: "created",
      templateId
    });
    await new Promise((resolve) => setTimeout(resolve, HEVY_WRITE_DELAY_MS));
  }

  return {
    templateIds,
    results
  };
}

function resolveTemplateId(plannedExercise: PlannedExercise, createdTemplateIds: Map<string, string>) {
  if (plannedExercise.existingTemplateId) {
    return plannedExercise.existingTemplateId;
  }

  const title = plannedExercise.customDefinition?.title ?? plannedExercise.resolvedTitle;
  const createdTemplateId = createdTemplateIds.get(title);
  if (!createdTemplateId) {
    throw new Error(`Missing template id for ${title}`);
  }

  return createdTemplateId;
}

export async function executeHevyJsonRoutinePlan(
  config: AppConfig,
  plan: HevyJsonRoutinePlan
): Promise<HevyJsonRoutineExecutionResult> {
  const folderId = await ensureFolder(config, plan);
  const { templateIds, results: customExerciseResults } = await ensureCustomTemplates(config, plan);

  const payload: HevyCreateRoutineBody = {
    routine: {
      ...plan.routine.payload.routine,
      folder_id: folderId,
      exercises: plan.routine.exercises.map((exercise) => ({
        ...exercise.payload,
        exercise_template_id: resolveTemplateId(exercise, templateIds)
      }))
    }
  };

  if (plan.routine.existingRoutineId) {
    const response = await hevyRequest<unknown>(
      config,
      `/v1/routines/${plan.routine.existingRoutineId}`,
      {
        method: "PUT",
        body: JSON.stringify({
          routine: {
            title: payload.routine.title,
            notes: payload.routine.notes,
            exercises: payload.routine.exercises
          }
        })
      }
    );

    return {
      folderId,
      routineId: extractRoutineId(response),
      routineAction: "updated",
      customExerciseResults
    };
  }

  const response = await hevyRequest<unknown>(config, "/v1/routines", {
    method: "POST",
    body: JSON.stringify(payload)
  });

  return {
    folderId,
    routineId: extractRoutineId(response),
    routineAction: "created",
    customExerciseResults
  };
}

export async function loadHevyJsonRoutineInput(inputPath: string): Promise<HevyJsonRoutineInput> {
  return JSON.parse(await readFile(inputPath, "utf8")) as HevyJsonRoutineInput;
}

export async function planHevyJsonRoutineImport(config: AppConfig, input: HevyJsonRoutineInput) {
  const catalog = await fetchHevyImportCatalog(config);
  return buildHevyJsonRoutinePlan(input, catalog);
}
