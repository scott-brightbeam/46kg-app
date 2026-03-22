import assert from "node:assert/strict";
import test from "node:test";

import { buildHevyJsonRoutinePlan, type HevyJsonRoutineInput } from "./hevy-routine-json.js";

const input: HevyJsonRoutineInput = {
  name: "30kg Full-Body Barbell Circuit",
  type: "routine",
  notes:
    "Complete as a circuit: Deadlift -> Bent Over Row -> Preacher Curl -> Military Press -> Squat. 10 reps each at 30kg. Rest 120 seconds between rounds.",
  rounds: 5,
  restBetweenRoundsSeconds: 120,
  folderName: "46KG",
  exercises: [
    {
      name: "Deadlift",
      equipment: "Barbell",
      sets: Array.from({ length: 5 }, () => ({ reps: 10, weightKg: 30 }))
    },
    {
      name: "Bent Over Row",
      equipment: "Barbell",
      sets: Array.from({ length: 5 }, () => ({ reps: 10, weightKg: 30 }))
    },
    {
      name: "Preacher Curl",
      equipment: "Barbell",
      sets: Array.from({ length: 5 }, () => ({ reps: 10, weightKg: 30 }))
    },
    {
      name: "Military Press",
      equipment: "Barbell",
      sets: Array.from({ length: 5 }, () => ({ reps: 10, weightKg: 30 }))
    },
    {
      name: "Squat",
      equipment: "Barbell",
      sets: Array.from({ length: 5 }, () => ({ reps: 10, weightKg: 30 }))
    }
  ]
};

test("buildHevyJsonRoutinePlan encodes a round-based circuit as a single Hevy superset", () => {
  const plan = buildHevyJsonRoutinePlan(input, {
    templates: [
      { id: "deadlift", title: "Deadlift (Barbell)", is_custom: false, type: "weight_reps" },
      { id: "row", title: "Bent Over Row (Barbell)", is_custom: false, type: "weight_reps" },
      { id: "curl", title: "Preacher Curl (Barbell)", is_custom: false, type: "weight_reps" },
      {
        id: "press",
        title: "Standing Military Press (Barbell)",
        is_custom: false,
        type: "weight_reps"
      }
    ],
    folders: [{ id: 46, title: "46KG" }],
    routines: []
  });

  assert.equal(plan.folder.existingFolderId, 46);
  assert.equal(plan.customExercises.length, 1);
  assert.equal(plan.customExercises[0]?.definition.title, "Squat (Barbell)");

  const payloadExercises = plan.routine.payload.routine.exercises;
  assert.equal(payloadExercises.length, 5);
  assert.ok(payloadExercises.every((exercise) => exercise.superset_id === 1));
  assert.equal(payloadExercises[0]?.rest_seconds, 0);
  assert.equal(payloadExercises[4]?.rest_seconds, 120);
  assert.equal(payloadExercises[0]?.sets[0]?.weight_kg, 30);
  assert.equal(payloadExercises[0]?.sets[0]?.reps, 10);
});

test("buildHevyJsonRoutinePlan reuses an existing matching routine in the same folder", () => {
  const plan = buildHevyJsonRoutinePlan(input, {
    templates: [
      { id: "deadlift", title: "Deadlift (Barbell)", is_custom: false, type: "weight_reps" },
      { id: "row", title: "Bent Over Row (Barbell)", is_custom: false, type: "weight_reps" },
      { id: "curl", title: "Preacher Curl (Barbell)", is_custom: false, type: "weight_reps" },
      {
        id: "press",
        title: "Standing Military Press (Barbell)",
        is_custom: false,
        type: "weight_reps"
      }
    ],
    folders: [{ id: 46, title: "46KG" }],
    routines: [{ id: "routine-1", title: "30kg Full-Body Barbell Circuit", folder_id: 46 }]
  });

  assert.equal(plan.routine.existingRoutineId, "routine-1");
});
