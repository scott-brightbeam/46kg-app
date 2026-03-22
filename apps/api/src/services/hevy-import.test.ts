import assert from "node:assert/strict";
import test from "node:test";

import {
  buildStrongDadHevyImportPlan,
  renderStrongDadHevyImportPlanMarkdown,
  type StrongDadCuratedBatch
} from "./hevy-import.js";

const sampleBatch: StrongDadCuratedBatch = {
  source_pdf: "/tmp/strongdad.pdf",
  derived_from: "/tmp/strongdad.json",
  generated_for: "test",
  workout_count: 2,
  hevy_folder: "StrongDad 50",
  workouts: [
    {
      number: 11,
      title: "Prowler Time",
      source_page: 12,
      score_mode: "for_time",
      rounds: 5,
      rest_between_rounds_seconds: null,
      time_cap_seconds: null,
      notes: "With a 50kg prowler, cover 25 meters then perform 10 press-ups. Repeat for 5 rounds.",
      sequence: [
        {
          order: 1,
          name: "Prowler Push",
          distance_meters: 25,
          notes: "Use 50kg load."
        },
        {
          order: 2,
          name: "Press-Up",
          reps: 10
        }
      ]
    },
    {
      number: 19,
      title: "Dad-Makers",
      source_page: 20,
      score_mode: "for_time",
      rounds: 5,
      rest_between_rounds_seconds: null,
      time_cap_seconds: null,
      notes: "Complete 5 rounds for time.",
      sequence: [
        {
          order: 1,
          name: "Dive Bomber Push-Up",
          reps: 5
        },
        {
          order: 2,
          name: "Push-Up",
          reps: 5
        },
        {
          order: 3,
          name: "Jump Squat",
          reps: 5
        },
        {
          order: 4,
          name: "Mountain Climber",
          reps: 10
        }
      ]
    }
  ]
};

test("buildStrongDadHevyImportPlan reuses built-ins, stages customs, and detects updates", () => {
  const plan = buildStrongDadHevyImportPlan("/tmp/input.json", sampleBatch, {
    templates: [
      { id: "sled-1", title: "Sled Push", type: "distance_duration", is_custom: false },
      { id: "push-1", title: "Push Up", type: "reps_only", is_custom: false },
      { id: "jump-1", title: "Jump Squat", type: "reps_only", is_custom: false },
      { id: "mountain-1", title: "Mountain Climber", type: "reps_only", is_custom: false }
    ],
    folders: [{ id: 42, title: "StrongDad 50" }],
    routines: [{ id: "routine-19", title: "19. Dad-Makers", folder_id: 42 }]
  });

  assert.equal(plan.folder.action, "reuse");
  assert.equal(plan.folder.existingFolderId, 42);
  assert.equal(plan.stats.routineCreates, 1);
  assert.equal(plan.stats.routineUpdates, 1);
  assert.equal(plan.stats.customTemplatesToCreate, 1);

  const prowlerTime = plan.routines.find((routine) => routine.number === 11);
  assert.ok(prowlerTime);
  assert.equal(prowlerTime.action, "create");
  assert.equal(prowlerTime.exercises[0]?.resolvedTitle, "Sled Push");
  assert.equal(prowlerTime.exercises[1]?.resolvedTitle, "Push Up");

  const dadMakers = plan.routines.find((routine) => routine.number === 19);
  assert.ok(dadMakers);
  assert.equal(dadMakers.action, "update");
  assert.equal(dadMakers.exercises[0]?.resolution, "custom");
  assert.equal(dadMakers.exercises[0]?.resolvedTitle, "Dive Bomber Push-Up");

  assert.deepEqual(
    plan.customExercises.map((exercise) => exercise.title),
    ["Dive Bomber Push-Up"]
  );
});

test("renderStrongDadHevyImportPlanMarkdown includes the key dry-run details", () => {
  const plan = buildStrongDadHevyImportPlan("/tmp/input.json", sampleBatch, {
    templates: [
      { id: "sled-1", title: "Sled Push", type: "distance_duration", is_custom: false },
      { id: "push-1", title: "Push Up", type: "reps_only", is_custom: false },
      { id: "jump-1", title: "Jump Squat", type: "reps_only", is_custom: false },
      { id: "mountain-1", title: "Mountain Climber", type: "reps_only", is_custom: false }
    ],
    folders: [],
    routines: []
  });

  const markdown = renderStrongDadHevyImportPlanMarkdown(plan);

  assert.match(markdown, /# StrongDad Hevy Import Plan/);
  assert.match(markdown, /Custom templates to create: `1`/);
  assert.match(markdown, /Dive Bomber Push-Up/);
  assert.match(markdown, /11\. Prowler Time/);
});
