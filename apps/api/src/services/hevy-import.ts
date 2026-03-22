import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { requireHevyConfig, type AppConfig } from "../config.js";

type StrongDadStep = {
  order: number;
  name: string;
  reps?: number;
  distance_meters?: number;
  duration_seconds?: number;
  notes?: string;
};

type StrongDadWorkout = {
  number: number;
  title: string;
  source_page: number;
  score_mode: "for_time" | "time_cap" | "fixed_duration" | "for_completion";
  rounds: number | null;
  rest_between_rounds_seconds: number | null;
  time_cap_seconds: number | null;
  notes: string;
  sequence: StrongDadStep[];
};

export type StrongDadCuratedBatch = {
  source_pdf: string;
  derived_from: string;
  generated_for: string;
  source_label?: string;
  workout_count: number;
  hevy_folder: string;
  workouts: StrongDadWorkout[];
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

type HevyPagedResponse<TCollectionKey extends string, TItem> = {
  page?: number;
  page_count?: number;
} & Record<TCollectionKey, TItem[]>;

type HevyCustomExerciseType =
  | "weight_reps"
  | "reps_only"
  | "bodyweight_reps"
  | "bodyweight_assisted_reps"
  | "duration"
  | "weight_duration"
  | "distance_duration"
  | "short_distance_weight";

type HevyEquipmentCategory =
  | "none"
  | "barbell"
  | "dumbbell"
  | "kettlebell"
  | "machine"
  | "plate"
  | "resistance_band"
  | "suspension"
  | "other";

type HevyMuscleGroup =
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

type HevyCreateCustomExerciseBody = {
  exercise: {
    title: string;
    exercise_type: HevyCustomExerciseType;
    equipment_category: HevyEquipmentCategory;
    muscle_group: HevyMuscleGroup;
    other_muscles?: HevyMuscleGroup[];
  };
};

type HevyCreateRoutineFolderBody = {
  routine_folder: {
    title: string;
  };
};

type HevyRoutineSet = {
  type: "normal";
  reps?: number;
  distance_meters?: number;
  duration_seconds?: number;
};

type HevyRoutineExerciseBody = {
  exercise_template_id: string;
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

type ExistingTemplateResolution = {
  kind: "existing";
  templateId: string;
  templateTitle: string;
  isCustom: boolean;
};

type CustomTemplateResolution = {
  kind: "custom";
  definition: HevyCreateCustomExerciseBody["exercise"];
};

type ExerciseResolution = ExistingTemplateResolution | CustomTemplateResolution;

type PlannedRoutineExercise = {
  order: number;
  sourceName: string;
  resolvedTitle: string;
  resolution: "existing" | "custom";
  existingTemplateId?: string;
  setPreview: string;
  notes?: string;
};

type PlannedRoutine = {
  number: number;
  title: string;
  action: "create" | "update";
  existingRoutineId: string | null;
  notes: string;
  exerciseCount: number;
  exercises: PlannedRoutineExercise[];
  payload: HevyCreateRoutineBody;
};

export type StrongDadHevyImportPlan = {
  generatedAt: string;
  inputPath: string;
  folder: {
    title: string;
    action: "reuse" | "create";
    existingFolderId: number | null;
  };
  stats: {
    workoutCount: number;
    routineCreates: number;
    routineUpdates: number;
    existingTemplateMatches: number;
    customTemplatesToCreate: number;
  };
  customExercises: Array<{
    title: string;
    action: "reuse_existing_custom" | "create";
    existingTemplateId: string | null;
    definition: HevyCreateCustomExerciseBody["exercise"];
  }>;
  routines: PlannedRoutine[];
};

type HevyImportCatalog = {
  templates: HevyExerciseTemplate[];
  folders: HevyRoutineFolder[];
  routines: HevyRoutine[];
};

export type StrongDadHevyImportExecutionResult = {
  folderId: number;
  customExerciseResults: Array<{
    title: string;
    action: "reused" | "created";
    templateId: string;
  }>;
  routineResults: Array<{
    title: string;
    action: "created" | "updated";
    routineId: string;
  }>;
};

const HEVY_BASE_URL = "https://api.hevyapp.com";
const HEVY_WRITE_DELAY_MS = Number.parseInt(process.env.HEVY_WRITE_DELAY_MS ?? "1500", 10);
const HEVY_429_RETRY_BASE_DELAY_MS = Number.parseInt(process.env.HEVY_429_RETRY_BASE_DELAY_MS ?? "5000", 10);
const HEVY_MAX_RETRIES = 6;

const EXISTING_TEMPLATE_ALIASES = new Map<string, string>([
  ["Press-Up", "Push Up"],
  ["Push-Up", "Push Up"],
  ["Push Ups", "Push Up"],
  ["Push-ups", "Push Up"],
  ["Press Ups", "Push Up"],
  ["Press-ups", "Push Up"],
  ["Prowler Push", "Sled Push"],
  ["Kettlebell Thruster", "Thruster (Kettlebell)"],
  ["Jump Squat", "Jump Squat"],
  ["Mountain Climber", "Mountain Climber"],
  ["Mountain Climbers", "Mountain Climber"],
  ["Kettlebell Swing", "Kettlebell Swing"],
  ["Kettlebell Swings", "Kettlebell Swing"],
  ["Burpees", "Burpee"],
  ["Burpee", "Burpee"],
  ["Crunches", "Crunch"],
  ["Sit Ups", "Sit Up"],
  ["Sit-Ups", "Sit Up"],
  ["Sit-ups", "Sit Up"],
  ["Lunges", "Lunge"],
  ["Squats", "Full Squat"],
  ["Squat", "Full Squat"],
  ["Star Jumps", "Jumping Jack"],
  ["Star Jump", "Jumping Jack"],
  ["Chin-ups", "Chin Up"],
  ["Chins", "Chin Up"],
  ["Pull ups", "Pull Up"],
  ["Pull-ups", "Pull Up"],
  ["Inverted pull ups", "Inverted Row"],
  ["Inverted Pull Ups", "Inverted Row"],
  ["Inverted rows", "Inverted Row"],
  ["Bicep curls", "Bicep Curl (Dumbbell)"],
  ["Bicep Curls", "Bicep Curl (Dumbbell)"],
  ["Tricep extensions", "Single Arm Tricep Extension (Dumbbell)"],
  ["Tricep Extensions", "Single Arm Tricep Extension (Dumbbell)"],
  ["Overhead press", "Overhead Press (Barbell)"],
  ["Overhead Press", "Overhead Press (Barbell)"],
  ["Bent-over row", "Bent Over Row (Barbell)"],
  ["Bent-over rows", "Bent Over Row (Barbell)"],
  ["Bent Over Row", "Bent Over Row (Barbell)"],
  ["Split squats", "Bulgarian Split Squat"],
  ["Split Squats", "Bulgarian Split Squat"],
  ["Straight leg deadlifts", "Straight Leg Deadlift"],
  ["Straight Leg Deadlifts", "Straight Leg Deadlift"],
  ["Bench press", "Bench Press (Barbell)"],
  ["Back squat", "Back Squat (Barbell)"],
  ["Deadlift", "Deadlift (Barbell)"],
  ["Rows", "Bent Over Row (Barbell)"],
  ["Row", "Bent Over Row"],
  ["Crunch", "Crunch"],
  ["Pushup Jacks", "Jumping Jack"],
  ["PushupJacks", "Jumping Jack"],
  ["Push-Up Jacks", "Jumping Jack"],
  ["Push-Up Jack", "Jumping Jack"],
  ["Push Up Jacks", "Jumping Jack"],
  ["Push Up Jack", "Jumping Jack"],
  ["Run", "Running"],
  ["Jog", "Running"],
  ["Walk Or Jog", "Running"],
  ["Mile Run", "Running"],
  ["Hill sprinting", "Running"],
  ["Hill Sprints", "Running"],
  ["Sprint", "Running"],
  ["Deep Squats", "Full Squat"],
  ["Weighted Squats", "Full Squat"],
  ["Deep Lunges Repeat", "Lunge"],
  ["Alternating Lunges", "Lunge"],
  ["Deadlifts", "Deadlift (Barbell)"],
  ["Bent Over Row", "Bent Over Row (Barbell)"],
  ["Bent Over Rows", "Bent Over Row (Barbell)"],
  ["Bodyweight Bulgarian Split Squats", "Bulgarian Split Squat"],
  ["Weighted Bulgarian Split Squats", "Bulgarian Split Squat"],
  ["Overhead Presses", "Overhead Press (Barbell)"],
  ["Reverse Curls", "Bicep Curl (Dumbbell)"],
  ["Strict Push Ups Keep Your Form", "Push Up"],
  ["Burpees For You", "Burpee"],
  ["Swings", "Kettlebell or Dumbbell Swing"],
  ["Dive-bombs", "Dive Bomber Push-Up"],
  ["Dive Bombs", "Dive Bomber Push-Up"],
  ["Hindu Push-up", "Dive Bomber Push-Up"],
  ["Hindu Push-ups", "Dive Bomber Push-Up"],
  ["Hindu Push Up", "Dive Bomber Push-Up"],
  ["Hindu Push Ups", "Dive Bomber Push-Up"],
  ["Hindu Push-ups (aka Dive Bombs)", "Dive Bomber Push-Up"],
  ["Hindu Push Ups Aka Dive Bombs", "Dive Bomber Push-Up"],
  ["Forwards Bear Crawls", "Bear Crawl"],
  ["Backwards Bear Crawls", "Bear Crawl"],
  ["Turkish Get-up", "Get-Up"],
  ["Turkish Get Up", "Get-Up"],
  ["Pushups", "Push Up"],
  ["Pull-up", "Pull Up"],
  ["Hand Release Push-ups", "Hand Release Push-Up"],
  ["Superman Push-up", "Superman Push-Up"],
  ["Feet Raised Push-ups", "Decline Push-Up"],
  ["Feet-on-bench Push-ups", "Decline Push-Up"],
  ["Feet On Bench Push Ups", "Decline Push-Up"],
  ["Plank Get-up", "Plank Get-Up"],
  ["Plank Get-ups", "Plank Get-Up"],
  ["Single-leg Walkouts To Push-ups", "Single-Leg Walkout to Push-Up"],
  ["Single-leg Walkout To Push-ups", "Single-Leg Walkout to Push-Up"],
  ["Single Leg Walkout To Push Ups", "Single-Leg Walkout to Push-Up"],
  ["Single Leg Walkouts To Push Ups", "Single-Leg Walkout to Push-Up"],
  ["Squat Thrusts", "Squat Thrust"],
  ["Burpee Tuck Jumps", "Burpee Tuck Jump"],
  ["Superman Push Up", "Superman Push-Up"],
  ["Superman Push Ups", "Superman Push-Up"],
  ["Spiderman Push-ups", "Spiderman Push-Up"],
  ["V-sits", "V-Sit"],
  ["V Sits", "V-Sit"],
  ["V-sit Leg Raises", "V-Sit"],
  ["V Sit Leg Raises", "V-Sit"],
  ["Bench Dips", "Bench Dip"],
  ["Walk-outs", "Walk-Out"],
  ["Walk Outs", "Walk-Out"],
  ["Bean Can Swimmers", "Bean Can Swimmer"],
  ["'bean Can' Swimmers", "Bean Can Swimmer"],
  ["Superman Push-ups", "Superman Push-Up"],
  ["Superman Push-ups", "Superman Push-Up"],
  ["Spiderman Push Ups", "Spiderman Push-Up"],
  ["Focused Plank", "Plank"],
  ["Push-up Jacks", "Jumping Jack"],
  ["Lizard Steps Forward", "Lizard Step"],
  ["Carry", "Rack Carry"],
  ["Presses", "Overhead Press (Barbell)"],
  ["Squat Jumps With Floor Touch", "Jump Squat"],
  ["Wall Sit For", "Wall Sit"],
  ["Wall-sit For", "Wall Sit"],
  ["Panther Push-ups", "Panther Push-Up"],
  ["Back Squat", "Back Squat (Barbell)"],
  ["Backward Bear Crawl", "Bear Crawl"],
  ["Banded Push Up", "Push Up"],
  ["Farmers Carry", "Farmers Walk"],
  ["Landmine Press", "Single Arm Landmine Press (Barbell)"],
  ["Landmine Thruster", "Landmine Squat and Press"],
  ["Narrow Push Up", "Push Up"],
  ["Overhead Sandbag Lunge Walk", "Lunge"],
  ["Weighted Lunge", "Lunge"],
  ["X Band Walk", "Lateral Band Walks"]
]);

const CUSTOM_TEMPLATE_DEFINITIONS = new Map<string, HevyCreateCustomExerciseBody["exercise"]>([
  [
    "Sledgehammer Slams",
    {
      title: "Sledgehammer Slams",
      exercise_type: "reps_only",
      equipment_category: "other",
      muscle_group: "full_body",
      other_muscles: ["shoulders", "upper_back"]
    }
  ],
  [
    "Tyre Flips",
    {
      title: "Tyre Flips",
      exercise_type: "reps_only",
      equipment_category: "other",
      muscle_group: "full_body",
      other_muscles: ["quadriceps", "upper_back"]
    }
  ],
  [
    "Ground to Shoulder",
    {
      title: "Ground to Shoulder",
      exercise_type: "weight_reps",
      equipment_category: "other",
      muscle_group: "full_body",
      other_muscles: ["upper_back", "shoulders"]
    }
  ],
  [
    "Kettlebell or Dumbbell Swing",
    {
      title: "Kettlebell or Dumbbell Swing",
      exercise_type: "weight_reps",
      equipment_category: "other",
      muscle_group: "full_body",
      other_muscles: ["glutes", "hamstrings"]
    }
  ],
  [
    "Bear Crawl",
    {
      title: "Bear Crawl",
      exercise_type: "distance_duration",
      equipment_category: "none",
      muscle_group: "full_body",
      other_muscles: ["abdominals", "shoulders"]
    }
  ],
  [
    "Rack Carry",
    {
      title: "Rack Carry",
      exercise_type: "short_distance_weight",
      equipment_category: "kettlebell",
      muscle_group: "full_body",
      other_muscles: ["shoulders", "abdominals"]
    }
  ],
  [
    "Dive Bomber Push-Up",
    {
      title: "Dive Bomber Push-Up",
      exercise_type: "bodyweight_reps",
      equipment_category: "none",
      muscle_group: "chest",
      other_muscles: ["shoulders", "triceps"]
    }
  ],
  [
    "Keg Shoulder and Carry",
    {
      title: "Keg Shoulder and Carry",
      exercise_type: "weight_reps",
      equipment_category: "other",
      muscle_group: "full_body",
      other_muscles: ["shoulders", "upper_back"]
    }
  ],
  [
    "Burpee Pull-Up",
    {
      title: "Burpee Pull-Up",
      exercise_type: "bodyweight_reps",
      equipment_category: "none",
      muscle_group: "full_body",
      other_muscles: ["cardio", "chest"]
    }
  ],
  [
    "Kettlebell or Dumbbell Snatch",
    {
      title: "Kettlebell or Dumbbell Snatch",
      exercise_type: "weight_reps",
      equipment_category: "other",
      muscle_group: "full_body",
      other_muscles: ["shoulders", "upper_back"]
    }
  ],
  [
    "Dip",
    {
      title: "Dip",
      exercise_type: "bodyweight_reps",
      equipment_category: "none",
      muscle_group: "chest",
      other_muscles: ["triceps", "shoulders"]
    }
  ],
  [
    "Dumbbell Press",
    {
      title: "Dumbbell Press",
      exercise_type: "weight_reps",
      equipment_category: "dumbbell",
      muscle_group: "chest",
      other_muscles: ["shoulders", "triceps"]
    }
  ],
  [
    "Shuttle Run",
    {
      title: "Shuttle Run",
      exercise_type: "distance_duration",
      equipment_category: "none",
      muscle_group: "cardio",
      other_muscles: ["quadriceps", "calves"]
    }
  ],
  [
    "Sandbag Run",
    {
      title: "Sandbag Run",
      exercise_type: "short_distance_weight",
      equipment_category: "other",
      muscle_group: "full_body",
      other_muscles: ["cardio", "abdominals"]
    }
  ],
  [
    "Get-Up",
    {
      title: "Get-Up",
      exercise_type: "weight_reps",
      equipment_category: "other",
      muscle_group: "full_body",
      other_muscles: ["abdominals", "shoulders"]
    }
  ],
  [
    "Plank Get-Up",
    {
      title: "Plank Get-Up",
      exercise_type: "bodyweight_reps",
      equipment_category: "none",
      muscle_group: "abdominals",
      other_muscles: ["chest", "shoulders"]
    }
  ],
  [
    "Single-Leg Walkout to Push-Up",
    {
      title: "Single-Leg Walkout to Push-Up",
      exercise_type: "bodyweight_reps",
      equipment_category: "none",
      muscle_group: "chest",
      other_muscles: ["abdominals", "shoulders"]
    }
  ],
  [
    "Squat Thrust",
    {
      title: "Squat Thrust",
      exercise_type: "bodyweight_reps",
      equipment_category: "none",
      muscle_group: "full_body",
      other_muscles: ["cardio", "abdominals"]
    }
  ],
  [
    "Burpee Tuck Jump",
    {
      title: "Burpee Tuck Jump",
      exercise_type: "bodyweight_reps",
      equipment_category: "none",
      muscle_group: "full_body",
      other_muscles: ["cardio", "quadriceps"]
    }
  ],
  [
    "V-Sit",
    {
      title: "V-Sit",
      exercise_type: "bodyweight_reps",
      equipment_category: "none",
      muscle_group: "abdominals",
      other_muscles: ["quadriceps"]
    }
  ],
  [
    "Bench Dip",
    {
      title: "Bench Dip",
      exercise_type: "bodyweight_reps",
      equipment_category: "none",
      muscle_group: "triceps",
      other_muscles: ["chest", "shoulders"]
    }
  ],
  [
    "Walk-Out",
    {
      title: "Walk-Out",
      exercise_type: "bodyweight_reps",
      equipment_category: "none",
      muscle_group: "abdominals",
      other_muscles: ["chest", "shoulders"]
    }
  ],
  [
    "Bean Can Swimmer",
    {
      title: "Bean Can Swimmer",
      exercise_type: "reps_only",
      equipment_category: "none",
      muscle_group: "upper_back",
      other_muscles: ["lower_back", "shoulders"]
    }
  ],
  [
    "Superman Push-Up",
    {
      title: "Superman Push-Up",
      exercise_type: "bodyweight_reps",
      equipment_category: "none",
      muscle_group: "chest",
      other_muscles: ["shoulders", "abdominals"]
    }
  ],
  [
    "Spiderman Push-Up",
    {
      title: "Spiderman Push-Up",
      exercise_type: "bodyweight_reps",
      equipment_category: "none",
      muscle_group: "chest",
      other_muscles: ["abdominals", "shoulders"]
    }
  ],
  [
    "Lizard Step",
    {
      title: "Lizard Step",
      exercise_type: "bodyweight_reps",
      equipment_category: "none",
      muscle_group: "full_body",
      other_muscles: ["abdominals", "glutes"]
    }
  ],
  [
    "Decline Push-Up",
    {
      title: "Decline Push-Up",
      exercise_type: "bodyweight_reps",
      equipment_category: "none",
      muscle_group: "chest",
      other_muscles: ["shoulders", "triceps"]
    }
  ],
  [
    "Hand Release Push-Up",
    {
      title: "Hand Release Push-Up",
      exercise_type: "bodyweight_reps",
      equipment_category: "none",
      muscle_group: "chest",
      other_muscles: ["shoulders", "triceps"]
    }
  ],
  [
    "Bent Over Row",
    {
      title: "Bent Over Row",
      exercise_type: "weight_reps",
      equipment_category: "barbell",
      muscle_group: "upper_back",
      other_muscles: ["shoulders"]
    }
  ],
  [
    "Bulgarian Split Squat",
    {
      title: "Bulgarian Split Squat",
      exercise_type: "weight_reps",
      equipment_category: "other",
      muscle_group: "full_body",
      other_muscles: ["quadriceps", "glutes"]
    }
  ],
  [
    "Wall Sit",
    {
      title: "Wall Sit",
      exercise_type: "duration",
      equipment_category: "none",
      muscle_group: "quadriceps",
      other_muscles: ["glutes", "abdominals"]
    }
  ],
  [
    "Panther Push-Up",
    {
      title: "Panther Push-Up",
      exercise_type: "bodyweight_reps",
      equipment_category: "none",
      muscle_group: "chest",
      other_muscles: ["abdominals", "shoulders"]
    }
  ]
]);

const NORMALIZED_EXISTING_TEMPLATE_ALIASES = new Map(
  [...EXISTING_TEMPLATE_ALIASES.entries()].map(([source, target]) => [normalizeName(source), target])
);

const NORMALIZED_CUSTOM_TEMPLATE_DEFINITIONS = new Map(
  [...CUSTOM_TEMPLATE_DEFINITIONS.entries()].map(([source, definition]) => [normalizeName(source), definition])
);

function normalizeName(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function titleCaseWords(value: string) {
  return value
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => word[0] ? `${word[0].toUpperCase()}${word.slice(1).toLowerCase()}` : word)
    .join(" ");
}

function buildCandidateExerciseNames(stepName: string) {
  const candidates = new Set<string>();
  const trimmed = stepName.trim();
  if (!trimmed) {
    return [];
  }

  candidates.add(trimmed);

  const aliased =
    EXISTING_TEMPLATE_ALIASES.get(trimmed) ??
    NORMALIZED_EXISTING_TEMPLATE_ALIASES.get(normalizeName(trimmed));
  if (aliased) {
    candidates.add(aliased);
  }

  const compact = trimmed
    .replace(/\bPush-?ups?\b/gi, "Push Up")
    .replace(/\bPress-?ups?\b/gi, "Push Up")
    .replace(/\bSit-?ups?\b/gi, "Sit Up")
    .replace(/\bChin-?ups?\b/gi, "Chin Up")
    .replace(/\bPull-?ups?\b/gi, "Pull Up")
    .replace(/\bBurpees\b/gi, "Burpee")
    .replace(/\bCrunches\b/gi, "Crunch")
    .replace(/\bMountain Climbers\b/gi, "Mountain Climber")
    .replace(/\bLunges\b/gi, "Lunge")
    .replace(/\bSquats\b/gi, "Squat");
  candidates.add(compact);

  const singularized = compact
    .replace(/\bRows\b/g, "Row")
    .replace(/\bCurls\b/g, "Curl")
    .replace(/\bExtensions\b/g, "Extension")
    .replace(/\bJumps\b/g, "Jump")
    .replace(/\bRuns\b/g, "Run")
    .replace(/\bFlips\b/g, "Flip")
    .replace(/\bSlams\b/g, "Slam")
    .replace(/\bSwings\b/g, "Swing");
  candidates.add(singularized);

  candidates.add(titleCaseWords(normalizeName(trimmed)));
  candidates.add(titleCaseWords(normalizeName(compact)));
  candidates.add(titleCaseWords(normalizeName(singularized)));

  return [...candidates].filter(Boolean);
}

function dedupeOrdered(values: string[]) {
  return [...new Set(values)];
}

function secondsToHuman(value: number) {
  const minutes = Math.floor(value / 60);
  const seconds = value % 60;

  if (minutes > 0 && seconds > 0) {
    return `${minutes}m ${seconds}s`;
  }

  if (minutes > 0) {
    return `${minutes}m`;
  }

  return `${seconds}s`;
}

function formatStepMetric(step: StrongDadStep) {
  if (typeof step.reps === "number" && typeof step.distance_meters === "number") {
    return `x${step.reps} + ${step.distance_meters}m`;
  }

  if (typeof step.reps === "number") {
    return `x${step.reps}`;
  }

  if (typeof step.distance_meters === "number") {
    return `${step.distance_meters}m`;
  }

  if (typeof step.duration_seconds === "number") {
    return secondsToHuman(step.duration_seconds);
  }

  return "untracked";
}

function buildRoutineNotes(workout: StrongDadWorkout, sourceLabel = "StrongDad 50") {
  const lines = [workout.notes];

  switch (workout.score_mode) {
    case "for_time":
      lines.push("Score as: for time.");
      break;
    case "time_cap":
      if (typeof workout.time_cap_seconds === "number") {
        lines.push(`Score as: time cap (${secondsToHuman(workout.time_cap_seconds)}).`);
      } else {
        lines.push("Score as: time cap.");
      }
      break;
    case "fixed_duration":
      if (typeof workout.time_cap_seconds === "number") {
        lines.push(`Score as: fixed duration (${secondsToHuman(workout.time_cap_seconds)} total).`);
      } else {
        lines.push("Score as: fixed duration.");
      }
      break;
    case "for_completion":
      lines.push("Score as: complete the prescribed work.");
      break;
  }

  if (typeof workout.rounds === "number") {
    lines.push(`Rounds: ${workout.rounds}.`);
  }

  if (typeof workout.rest_between_rounds_seconds === "number") {
    lines.push(`Rest between rounds: ${secondsToHuman(workout.rest_between_rounds_seconds)}.`);
  }

  lines.push(`Source: ${sourceLabel} #${workout.number} (page ${workout.source_page}).`);

  return lines.join("\n");
}

function inferCustomExerciseDefinition(step: StrongDadStep): HevyCreateCustomExerciseBody["exercise"] {
  const normalized = normalizeName(step.name);

  let exerciseType: HevyCustomExerciseType = "reps_only";
  if (typeof step.distance_meters === "number" && typeof step.reps === "number") {
    exerciseType = "short_distance_weight";
  } else if (typeof step.distance_meters === "number") {
    exerciseType = "distance_duration";
  } else if (typeof step.duration_seconds === "number") {
    exerciseType = "duration";
  } else if (typeof step.reps === "number") {
    if (
      /\b(kettlebell|dumbbell|barbell|deadlift|press|row|snatch|swing|curl|extension|carry|yoke|zercher|sandbag|keg|ground to|clean|squat|lunge)\b/.test(
        normalized
      )
    ) {
      exerciseType = "weight_reps";
    } else if (/\b(push up|pull up|chin up|dip|get up|burpee pull up)\b/.test(normalized)) {
      exerciseType = "bodyweight_reps";
    }
  }

  let equipment: HevyEquipmentCategory = "other";
  if (/\bnone|bodyweight|run|crawl|burpee|push up|pull up|chin up|sit up|crunch|climber|jump\b/.test(normalized)) {
    equipment = "none";
  } else if (/\bdumbbell\b/.test(normalized)) {
    equipment = "dumbbell";
  } else if (/\bkettlebell|kb\b/.test(normalized)) {
    equipment = "kettlebell";
  } else if (/\bbarbell|bench press|deadlift|overhead press|squat\b/.test(normalized)) {
    equipment = "barbell";
  } else if (/\bband\b/.test(normalized)) {
    equipment = "resistance_band";
  }

  let muscleGroup: HevyMuscleGroup = "full_body";
  if (/\brun|sprint|shuttle|jog|cardio\b/.test(normalized)) {
    muscleGroup = "cardio";
  } else if (/\bpush up|press|dip|tricep|chest\b/.test(normalized)) {
    muscleGroup = "chest";
  } else if (/\bcurl|pull up|chin up|row|back|lats\b/.test(normalized)) {
    muscleGroup = "upper_back";
  } else if (/\bsquat|lunge|deadlift|leg|carry|yoke|crawl\b/.test(normalized)) {
    muscleGroup = "full_body";
  } else if (/\bcrunch|sit up|plank|get up|ab\b/.test(normalized)) {
    muscleGroup = "abdominals";
  }

  const otherMuscles = new Set<HevyMuscleGroup>();
  if (muscleGroup !== "full_body" && /\bcarry|crawl|run|burpee\b/.test(normalized)) {
    otherMuscles.add("full_body");
  }
  if (/\bshoulder|press|thruster|get up|snatch\b/.test(normalized)) {
    otherMuscles.add("shoulders");
  }
  if (/\brow|pull up|chin up|deadlift\b/.test(normalized)) {
    otherMuscles.add("upper_back");
  }
  if (/\bsquat|lunge|run|crawl|sprint|jump\b/.test(normalized)) {
    otherMuscles.add("quadriceps");
  }
  if (/\bcrunch|sit up|plank|get up|carry\b/.test(normalized)) {
    otherMuscles.add("abdominals");
  }

  return {
    title: titleCaseWords(normalized),
    exercise_type: exerciseType,
    equipment_category: equipment,
    muscle_group: muscleGroup,
    other_muscles: otherMuscles.size > 0 ? [...otherMuscles] : undefined
  };
}

function buildHevyExerciseNotes(step: StrongDadStep) {
  const notes: string[] = [];

  if (step.notes) {
    notes.push(step.notes);
  }

  if (typeof step.reps === "number" && typeof step.distance_meters === "number") {
    notes.push(`Carry or move ${step.distance_meters} meters each rep.`);
  }

  return notes.length > 0 ? notes.join(" ") : null;
}

function buildHevyRoutineSet(step: StrongDadStep): HevyRoutineSet {
  if (typeof step.reps === "number") {
    return {
      type: "normal",
      reps: step.reps
    };
  }

  if (typeof step.distance_meters === "number") {
    return {
      type: "normal",
      distance_meters: step.distance_meters
    };
  }

  if (typeof step.duration_seconds === "number") {
    return {
      type: "normal",
      duration_seconds: step.duration_seconds
    };
  }

  throw new Error(`Step "${step.name}" is missing reps, distance, and duration.`);
}

function resolveExerciseTemplate(step: StrongDadStep, templates: HevyExerciseTemplate[]): ExerciseResolution {
  const normalizedTemplates = new Map(templates.map((template) => [normalizeName(template.title), template]));
  let matchedCustomDefinition: HevyCreateCustomExerciseBody["exercise"] | null = null;
  for (const candidate of buildCandidateExerciseNames(step.name)) {
    const directMatch = normalizedTemplates.get(normalizeName(candidate));
    if (directMatch) {
      return {
        kind: "existing",
        templateId: directMatch.id,
        templateTitle: directMatch.title,
        isCustom: directMatch.is_custom
      };
    }

    if (!matchedCustomDefinition) {
      matchedCustomDefinition =
        CUSTOM_TEMPLATE_DEFINITIONS.get(candidate) ??
        NORMALIZED_CUSTOM_TEMPLATE_DEFINITIONS.get(normalizeName(candidate)) ??
        null;
    }
  }

  const customDefinition =
    matchedCustomDefinition ??
    CUSTOM_TEMPLATE_DEFINITIONS.get(step.name) ??
    NORMALIZED_CUSTOM_TEMPLATE_DEFINITIONS.get(normalizeName(step.name)) ??
    inferCustomExerciseDefinition(step);

  const existingCustom = normalizedTemplates.get(normalizeName(customDefinition.title));
  if (existingCustom) {
    return {
      kind: "existing",
      templateId: existingCustom.id,
      templateTitle: existingCustom.title,
      isCustom: existingCustom.is_custom
    };
  }

  return {
    kind: "custom",
    definition: customDefinition
  };
}

function buildRoutinePayload(
  workout: StrongDadWorkout,
  folderId: number | null,
  exerciseResolutions: Array<{ step: StrongDadStep; resolution: ExerciseResolution }>,
  sourceLabel?: string
): HevyCreateRoutineBody {
  return {
    routine: {
      title: `${workout.number}. ${workout.title}`,
      folder_id: folderId,
      notes: buildRoutineNotes(workout, sourceLabel),
      exercises: exerciseResolutions.map(({ step, resolution }) => ({
        exercise_template_id:
          resolution.kind === "existing"
            ? resolution.templateId
            : `custom:${resolution.definition.title}`,
        notes: buildHevyExerciseNotes(step),
        sets: [buildHevyRoutineSet(step)]
      }))
    }
  };
}

export function buildStrongDadHevyImportPlan(
  inputPath: string,
  batch: StrongDadCuratedBatch,
  catalog: HevyImportCatalog
): StrongDadHevyImportPlan {
  const existingFolder = catalog.folders.find(
    (folder) => normalizeName(folder.title) === normalizeName(batch.hevy_folder)
  );

  const pendingCustomExercises = new Map<string, HevyCreateCustomExerciseBody["exercise"]>();
  const routines: PlannedRoutine[] = [];
  let existingTemplateMatches = 0;
  let routineCreates = 0;
  let routineUpdates = 0;

  const sourceLabel = batch.source_label ?? path.basename(batch.source_pdf, path.extname(batch.source_pdf));

  for (const workout of batch.workouts) {
    const routineTitle = `${workout.number}. ${workout.title}`;
    const existingRoutine =
      catalog.routines.find(
        (routine) =>
          normalizeName(routine.title) === normalizeName(routineTitle) &&
          (existingFolder ? routine.folder_id === existingFolder.id : routine.folder_id == null)
      ) ?? null;

    const exerciseResolutions = workout.sequence.map((step) => ({
      step,
      resolution: resolveExerciseTemplate(step, catalog.templates)
    }));

    const plannedExercises: PlannedRoutineExercise[] = exerciseResolutions.map(({ step, resolution }) => {
      if (resolution.kind === "custom") {
        pendingCustomExercises.set(resolution.definition.title, resolution.definition);

        return {
          order: step.order,
          sourceName: step.name,
          resolvedTitle: resolution.definition.title,
          resolution: "custom",
          setPreview: formatStepMetric(step),
          notes: buildHevyExerciseNotes(step) ?? undefined
        };
      }

      existingTemplateMatches += 1;

      return {
        order: step.order,
        sourceName: step.name,
        resolvedTitle: resolution.templateTitle,
        resolution: "existing",
        existingTemplateId: resolution.templateId,
        setPreview: formatStepMetric(step),
        notes: buildHevyExerciseNotes(step) ?? undefined
      };
    });

    if (existingRoutine) {
      routineUpdates += 1;
    } else {
      routineCreates += 1;
    }

    routines.push({
      number: workout.number,
      title: routineTitle,
      action: existingRoutine ? "update" : "create",
      existingRoutineId: existingRoutine?.id ?? null,
      notes: buildRoutineNotes(workout, sourceLabel),
      exerciseCount: plannedExercises.length,
      exercises: plannedExercises,
      payload: buildRoutinePayload(workout, existingFolder?.id ?? null, exerciseResolutions, sourceLabel)
    });
  }

  const customExercises = [...pendingCustomExercises.values()]
    .sort((left, right) => left.title.localeCompare(right.title))
    .map((definition) => {
      const existingCustom = catalog.templates.find(
        (template) =>
          template.is_custom && normalizeName(template.title) === normalizeName(definition.title)
      );

      return {
        title: definition.title,
        action: existingCustom ? ("reuse_existing_custom" as const) : ("create" as const),
        existingTemplateId: existingCustom?.id ?? null,
        definition
      };
    });

  return {
    generatedAt: new Date().toISOString(),
    inputPath,
    folder: {
      title: batch.hevy_folder,
      action: existingFolder ? "reuse" : "create",
      existingFolderId: existingFolder?.id ?? null
    },
    stats: {
      workoutCount: batch.workout_count,
      routineCreates,
      routineUpdates,
      existingTemplateMatches,
      customTemplatesToCreate: customExercises.filter((exercise) => exercise.action === "create").length
    },
    customExercises,
    routines
  };
}

export function renderStrongDadHevyImportPlanMarkdown(plan: StrongDadHevyImportPlan) {
  const lines = [
    "# StrongDad Hevy Import Plan",
    "",
    `- Generated at: \`${plan.generatedAt}\``,
    `- Input: \`${plan.inputPath}\``,
    `- Folder: \`${plan.folder.title}\``,
    `- Folder action: \`${plan.folder.action}\``,
    `- Workout count: \`${plan.stats.workoutCount}\``,
    `- Routine creates: \`${plan.stats.routineCreates}\``,
    `- Routine updates: \`${plan.stats.routineUpdates}\``,
    `- Existing template matches: \`${plan.stats.existingTemplateMatches}\``,
    `- Custom templates to create: \`${plan.stats.customTemplatesToCreate}\``,
    ""
  ];

  lines.push("## Custom Exercises", "");
  if (plan.customExercises.length === 0) {
    lines.push("- None", "");
  } else {
    for (const exercise of plan.customExercises) {
      lines.push(
        `- ${exercise.title}: \`${exercise.action}\` (${exercise.definition.exercise_type}, ${exercise.definition.equipment_category}, ${exercise.definition.muscle_group})`
      );
    }
    lines.push("");
  }

  for (const routine of plan.routines) {
    lines.push(`## ${routine.title}`, "");
    lines.push(`- Action: \`${routine.action}\``);
    if (routine.existingRoutineId) {
      lines.push(`- Existing routine id: \`${routine.existingRoutineId}\``);
    }
    lines.push(`- Notes: ${routine.notes.replace(/\n/g, " ")}`);
    lines.push("- Exercises:");
    for (const exercise of routine.exercises) {
      const details = [
        `\`${exercise.order}\` ${exercise.resolvedTitle} ${exercise.setPreview}`,
        `[${exercise.resolution}]`
      ];
      if (exercise.notes) {
        details.push(`(${exercise.notes})`);
      }
      lines.push(`  - ${details.join(" ")}`);
    }
    lines.push("");
  }

  return lines.join("\n");
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

async function fetchAllHevyPages<TCollectionKey extends string, TItem>(
  config: AppConfig,
  endpoint: string,
  collectionKey: TCollectionKey,
  pageSize: number
) {
  const items: TItem[] = [];
  let page = 1;
  let pageCount = 1;

  while (page <= pageCount) {
    const payload = await hevyRequest<HevyPagedResponse<TCollectionKey, TItem>>(
      config,
      `${endpoint}?page=${page}&pageSize=${pageSize}`
    );
    items.push(...(payload[collectionKey] ?? []));
    pageCount = payload.page_count ?? 1;
    page += 1;
  }

  return items;
}

export async function fetchHevyImportCatalog(config: AppConfig): Promise<HevyImportCatalog> {
  const [templates, folders, routines] = await Promise.all([
    fetchAllHevyPages<"exercise_templates", HevyExerciseTemplate>(
      config,
      "/v1/exercise_templates",
      "exercise_templates",
      100
    ),
    fetchAllHevyPages<"routine_folders", HevyRoutineFolder>(
      config,
      "/v1/routine_folders",
      "routine_folders",
      10
    ),
    fetchAllHevyPages<"routines", HevyRoutine>(config, "/v1/routines", "routines", 10)
  ]);

  return { templates, folders, routines };
}

async function ensureFolder(
  config: AppConfig,
  plan: StrongDadHevyImportPlan
) {
  if (plan.folder.existingFolderId !== null) {
    return plan.folder.existingFolderId;
  }

  const response = await hevyRequest<unknown>(
    config,
    "/v1/routine_folders",
    {
      method: "POST",
      body: JSON.stringify({
        routine_folder: {
          title: plan.folder.title
        }
      } satisfies HevyCreateRoutineFolderBody)
    }
  );

  const folderId = extractRoutineFolderId(response);
  await new Promise((resolve) => setTimeout(resolve, HEVY_WRITE_DELAY_MS));
  return folderId;
}

async function ensureCustomExerciseTemplates(
  config: AppConfig,
  plan: StrongDadHevyImportPlan
) {
  const templateIds = new Map<string, string>();
  const results: StrongDadHevyImportExecutionResult["customExerciseResults"] = [];

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

function resolveRoutineTemplateId(
  routineExercise: PlannedRoutineExercise,
  customTemplateIds: Map<string, string>
) {
  if (routineExercise.existingTemplateId) {
    return routineExercise.existingTemplateId;
  }

  const createdTemplateId = customTemplateIds.get(routineExercise.resolvedTitle);
  if (!createdTemplateId) {
    throw new Error(`Missing custom template id for ${routineExercise.resolvedTitle}`);
  }

  return createdTemplateId;
}

export async function executeStrongDadHevyImportPlan(
  config: AppConfig,
  plan: StrongDadHevyImportPlan
): Promise<StrongDadHevyImportExecutionResult> {
  const folderId = await ensureFolder(config, plan);
  const { templateIds, results: customExerciseResults } = await ensureCustomExerciseTemplates(config, plan);
  const routineResults: StrongDadHevyImportExecutionResult["routineResults"] = [];

  for (const routine of plan.routines) {
    const payload: HevyCreateRoutineBody = {
      routine: {
        ...routine.payload.routine,
        folder_id: folderId,
        exercises: routine.payload.routine.exercises.map((exercise, index) => ({
          ...exercise,
          exercise_template_id: resolveRoutineTemplateId(routine.exercises[index]!, templateIds)
        }))
      }
    };

    if (routine.action === "update" && routine.existingRoutineId) {
      const response = await hevyRequest<unknown>(
        config,
        `/v1/routines/${routine.existingRoutineId}`,
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

      routineResults.push({
        title: routine.title,
        action: "updated",
        routineId: extractRoutineId(response)
      });
      await new Promise((resolve) => setTimeout(resolve, HEVY_WRITE_DELAY_MS));
      continue;
    }

    const response = await hevyRequest<unknown>(config, "/v1/routines", {
      method: "POST",
      body: JSON.stringify(payload)
    });

    routineResults.push({
      title: routine.title,
      action: "created",
      routineId: extractRoutineId(response)
    });
    await new Promise((resolve) => setTimeout(resolve, HEVY_WRITE_DELAY_MS));
  }

  return {
    folderId,
    customExerciseResults,
    routineResults
  };
}

function getRepoRoot() {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../../");
}

export function getDefaultStrongDadPaths() {
  const repoRoot = getRepoRoot();
  return {
    inputPath: path.join(repoRoot, "data/strongdad/strongdad-first-batch.curated.json"),
    planJsonPath: path.join(repoRoot, "data/strongdad/strongdad-first-batch.hevy-plan.json"),
    planMarkdownPath: path.join(repoRoot, "data/strongdad/strongdad-first-batch.hevy-plan.md"),
    executionJsonPath: path.join(repoRoot, "data/strongdad/strongdad-first-batch.hevy-execution.json")
  };
}

export async function loadStrongDadCuratedBatch(inputPath: string): Promise<StrongDadCuratedBatch> {
  const raw = await readFile(inputPath, "utf8");
  return JSON.parse(raw) as StrongDadCuratedBatch;
}

export async function writeStrongDadHevyPlanArtifacts(
  plan: StrongDadHevyImportPlan,
  planJsonPath: string,
  planMarkdownPath: string
) {
  await writeFile(planJsonPath, `${JSON.stringify(plan, null, 2)}\n`, "utf8");
  await writeFile(planMarkdownPath, `${renderStrongDadHevyImportPlanMarkdown(plan)}\n`, "utf8");
}

export async function writeStrongDadHevyExecutionArtifact(
  execution: StrongDadHevyImportExecutionResult,
  executionJsonPath: string
) {
  await writeFile(executionJsonPath, `${JSON.stringify(execution, null, 2)}\n`, "utf8");
}

export function summarizeStrongDadHevyPlan(plan: StrongDadHevyImportPlan) {
  return {
    folderAction: plan.folder.action,
    workoutCount: plan.stats.workoutCount,
    routineCreates: plan.stats.routineCreates,
    routineUpdates: plan.stats.routineUpdates,
    existingTemplateMatches: plan.stats.existingTemplateMatches,
    customTemplatesToCreate: plan.stats.customTemplatesToCreate,
    customTemplateTitles: dedupeOrdered(plan.customExercises.map((exercise) => exercise.title))
  };
}
