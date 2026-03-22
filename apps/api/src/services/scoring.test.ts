import assert from "node:assert/strict";
import test from "node:test";

import type { DailySummary, WeeklySummary } from "./current-state.js";
import { refreshDailySignals } from "./scoring.js";

function buildDailySummary(date: string, overrides: Partial<DailySummary> = {}): DailySummary {
  return {
    date,
    timeZone: "Europe/London",
    range: {
      start: new Date(`${date}T00:00:00.000Z`),
      end: new Date(`${date}T23:59:59.999Z`)
    },
    dayOfWeek: "monday",
    calendar: {
      events: [],
      freeSlots: [],
      busySlots: []
    },
    workouts: [],
    meals: {
      entries: [],
      totals: {
        calories: 0,
        protein: 0,
        carbs: 0,
        fat: 0,
        fibre: 0
      }
    },
    checkins: [],
    scores: {},
    latestWeight: null,
    engagementStatus: null,
    dailyPlan: {
      id: `plan-${date}`,
      planDate: new Date(`${date}T00:00:00.000Z`),
      summary: "Planned session",
      workoutPlan: {
        status: "planned",
        activityType: "PT session",
        durationMinutes: 45,
        suggestedStart: `${date}T07:00:00.000Z`,
        suggestedEnd: `${date}T07:45:00.000Z`
      },
      mealPlan: null,
      recoveryContext: null,
      sourceSnapshot: null,
      updatedAt: new Date(`${date}T06:00:00.000Z`)
    },
    dayTemplate: {
      dayOfWeek: "monday",
      activityType: "PT session",
      intensity: "intense",
      preferredTime: "morning",
      notes: null,
      hevyRoutineId: null,
      hevyRoutineTitle: null
    },
    freshness: [],
    ...overrides
  };
}

function buildWeeklySummary(weekStart: string, overrides: Partial<WeeklySummary> = {}): WeeklySummary {
  return {
    weekStart,
    timeZone: "Europe/London",
    range: {
      start: new Date(`${weekStart}T00:00:00.000Z`),
      end: new Date(`${weekStart}T23:59:59.999Z`)
    },
    workoutCount: 0,
    workoutDurationSeconds: 0,
    workoutsBySource: {},
    workouts: [],
    meals: {
      totalEntries: 0,
      daysWithTwoMealsLogged: 0,
      totals: {
        calories: 0,
        protein: 0,
        carbs: 0,
        fat: 0,
        fibre: 0
      }
    },
    checkinCount: 0,
    latestWeight: null,
    previousWeight: null,
    weightDeltaKg: null,
    scores: {},
    engagementStatus: null,
    ...overrides
  };
}

test("refreshDailySignals stores explainable scores and a green engagement state for a healthy day", async () => {
  const storedScores: string[] = [];
  const metricDefinitions: string[] = [];
  const storedStatuses: string[] = [];
  const date = "2026-03-17";
  const days = new Map<string, DailySummary>([
    [
      "2026-03-11",
      buildDailySummary("2026-03-11", {
        dailyPlan: null,
        dayTemplate: null
      })
    ],
    [
      "2026-03-12",
      buildDailySummary("2026-03-12", {
        workouts: [
          {
            id: "w-12",
            source: "hevy",
            title: "Strength",
            startedAt: new Date("2026-03-12T07:00:00.000Z"),
            endedAt: new Date("2026-03-12T07:45:00.000Z"),
            durationSeconds: 2700,
            details: {}
          }
        ],
        meals: {
          entries: [{ id: "m1" }] as never,
          totals: { calories: 1800, protein: 140, carbs: 120, fat: 50, fibre: 24 }
        },
        checkins: [{ respondedAt: new Date("2026-03-12T08:00:00.000Z"), field: "sleep_quality", valueText: "good" }]
      })
    ],
    [
      "2026-03-13",
      buildDailySummary("2026-03-13", {
        dailyPlan: null,
        dayTemplate: {
          dayOfWeek: "friday",
          activityType: "Rest / active recovery",
          intensity: "rest",
          preferredTime: null,
          notes: null,
          hevyRoutineId: null,
          hevyRoutineTitle: null
        },
        meals: {
          entries: [{ id: "m2" }, { id: "m3" }] as never,
          totals: { calories: 2100, protein: 150, carbs: 180, fat: 60, fibre: 30 }
        }
      })
    ],
    [
      "2026-03-14",
      buildDailySummary("2026-03-14", {
        workouts: [
          {
            id: "w-14",
            source: "strava",
            title: "Ride",
            startedAt: new Date("2026-03-14T08:00:00.000Z"),
            endedAt: new Date("2026-03-14T08:30:00.000Z"),
            durationSeconds: 1800,
            details: {}
          }
        ],
        meals: {
          entries: [{ id: "m4" }, { id: "m5" }] as never,
          totals: { calories: 2200, protein: 155, carbs: 190, fat: 62, fibre: 32 }
        },
        checkins: [{ respondedAt: new Date("2026-03-14T09:00:00.000Z"), field: "stress", valueText: "low" }]
      })
    ],
    [
      "2026-03-15",
      buildDailySummary("2026-03-15", {
        dailyPlan: null,
        dayTemplate: {
          dayOfWeek: "sunday",
          activityType: "Rest / active recovery",
          intensity: "rest",
          preferredTime: null,
          notes: null,
          hevyRoutineId: null,
          hevyRoutineTitle: null
        },
        meals: {
          entries: [{ id: "m6" }, { id: "m7" }] as never,
          totals: { calories: 2000, protein: 145, carbs: 160, fat: 55, fibre: 28 }
        }
      })
    ],
    [
      "2026-03-16",
      buildDailySummary("2026-03-16", {
        workouts: [
          {
            id: "w-16",
            source: "hevy",
            title: "PT session",
            startedAt: new Date("2026-03-16T07:00:00.000Z"),
            endedAt: new Date("2026-03-16T07:42:00.000Z"),
            durationSeconds: 2520,
            details: {}
          }
        ],
        meals: {
          entries: [{ id: "m8" }, { id: "m9" }] as never,
          totals: { calories: 2100, protein: 150, carbs: 170, fat: 58, fibre: 29 }
        },
        checkins: [{ respondedAt: new Date("2026-03-16T09:00:00.000Z"), field: "mood", valueText: "good" }]
      })
    ],
    [
      date,
      buildDailySummary(date, {
        workouts: [
          {
            id: "w-today",
            source: "hevy",
            title: "PT session",
            startedAt: new Date("2026-03-17T07:00:00.000Z"),
            endedAt: new Date("2026-03-17T07:46:00.000Z"),
            durationSeconds: 2760,
            details: {}
          }
        ],
        meals: {
          entries: [{ id: "m10" }, { id: "m11" }] as never,
          totals: { calories: 1900, protein: 152, carbs: 150, fat: 52, fibre: 31 }
        },
        checkins: [
          { respondedAt: new Date("2026-03-17T08:00:00.000Z"), field: "sleep_quality", valueText: "great" },
          { respondedAt: new Date("2026-03-17T08:05:00.000Z"), field: "stress", valueText: "low" }
        ],
        latestWeight: {
          observedAt: new Date("2026-03-17T07:55:00.000Z"),
          kilograms: 119.2,
          source: "telegram",
          flagged: false
        }
      })
    ]
  ]);

  const result = await refreshDailySignals(
    {
      date,
      timeZone: "Europe/London"
    },
    {
      ensureMetricDefinition: async (input) => {
        metricDefinitions.push(`${input.scoreType}:${input.version}`);
        return { id: `${input.scoreType}-definition` };
      },
      getDailySummary: async ({ date: requestedDate }) => {
        const summary = days.get(requestedDate);
        assert.ok(summary);
        return summary;
      },
      getWeeklySummary: async () =>
        buildWeeklySummary("2026-03-16", {
          workoutCount: 3,
          workoutDurationSeconds: 7980,
          meals: {
            totalEntries: 14,
            daysWithTwoMealsLogged: 6,
            totals: { calories: 14100, protein: 1040, carbs: 970, fat: 337, fibre: 203 }
          },
          checkinCount: 4,
          latestWeight: {
            observedAt: new Date("2026-03-17T07:55:00.000Z"),
            kilograms: 119.2,
            source: "telegram",
            flagged: false
          },
          previousWeight: {
            observedAt: new Date("2026-03-10T07:55:00.000Z"),
            kilograms: 120.0,
            source: "telegram",
            flagged: false
          },
          weightDeltaKg: -0.8
        }),
      listConversationMessages: async () => [
        {
          actor: "assistant",
          content: "Morning. Send your weight in kg.",
          messageAt: new Date("2026-03-16T07:00:00.000Z"),
          metadata: { kind: "prompt", promptKind: "weight", promptDate: "2026-03-16" }
        },
        {
          actor: "user",
          content: "119.2",
          messageAt: new Date("2026-03-16T07:05:00.000Z"),
          metadata: null
        },
        {
          actor: "assistant",
          content: "Quick one. How was your sleep last night?",
          messageAt: new Date("2026-03-17T08:00:00.000Z"),
          metadata: { kind: "prompt", promptKind: "checkin", promptDate: date }
        },
        {
          actor: "user",
          content: "great",
          messageAt: new Date("2026-03-17T08:01:00.000Z"),
          metadata: null
        }
      ],
      listHealthMetrics: async () => [
        { metricType: "Sleep", observedAt: new Date("2026-03-17T06:00:00.000Z"), valueNumeric: 8.1, unit: "hours" },
        { metricType: "HRV", observedAt: new Date("2026-03-17T06:05:00.000Z"), valueNumeric: 55, unit: "ms" },
        {
          metricType: "Resting Heart Rate",
          observedAt: new Date("2026-03-17T06:10:00.000Z"),
          valueNumeric: 58,
          unit: "count/min"
        }
      ],
      replaceDailyScore: async (input) => {
        storedScores.push(input.scoreType);
        return {
          id: `score-${input.scoreType}`,
          scoreDate: input.scoreDate,
          scoreType: input.scoreType,
          value: String(input.value)
        };
      },
      replaceEngagementStatus: async (input) => {
        storedStatuses.push(input.status);
        return { id: "engagement-1", effectiveAt: input.effectiveAt, status: input.status };
      }
    }
  );

  assert.equal(result.engagementStatus.status, "green");
  assert.deepEqual(result.engagementStatus.reasons, []);
  assert.equal(result.scores.workout_adherence.value, 100);
  assert.equal(result.scores.effort.value, 100);
  assert.ok(result.scores.recovery.value >= 75);
  assert.ok(result.scores.consistency.value >= 80);
  assert.deepEqual(storedScores.sort(), ["consistency", "effort", "recovery", "workout_adherence"]);
  assert.equal(storedStatuses[0], "green");
  assert.equal(metricDefinitions.length, 4);
});

test("refreshDailySignals escalates to red when multiple disengagement warnings stack up", async () => {
  const date = "2026-03-17";
  const days = new Map<string, DailySummary>([
    ["2026-03-11", buildDailySummary("2026-03-11", { meals: { entries: [], totals: { calories: 0, protein: 0, carbs: 0, fat: 0, fibre: 0 } } })],
    ["2026-03-12", buildDailySummary("2026-03-12", { meals: { entries: [], totals: { calories: 0, protein: 0, carbs: 0, fat: 0, fibre: 0 } } })],
    ["2026-03-13", buildDailySummary("2026-03-13", { meals: { entries: [], totals: { calories: 0, protein: 0, carbs: 0, fat: 0, fibre: 0 } } })],
    ["2026-03-14", buildDailySummary("2026-03-14", { meals: { entries: [], totals: { calories: 0, protein: 0, carbs: 0, fat: 0, fibre: 0 } } })],
    ["2026-03-15", buildDailySummary("2026-03-15", { meals: { entries: [], totals: { calories: 0, protein: 0, carbs: 0, fat: 0, fibre: 0 } } })],
    [
      "2026-03-16",
      buildDailySummary("2026-03-16", {
        meals: { entries: [{ id: "m1" }] as never, totals: { calories: 500, protein: 20, carbs: 40, fat: 18, fibre: 3 } },
        workouts: []
      })
    ],
    [
      date,
      buildDailySummary(date, {
        meals: { entries: [{ id: "m2" }] as never, totals: { calories: 600, protein: 25, carbs: 55, fat: 20, fibre: 4 } },
        workouts: []
      })
    ]
  ]);

  const result = await refreshDailySignals(
    {
      date,
      timeZone: "Europe/London",
      dryRun: true
    },
    {
      ensureMetricDefinition: async () => ({ id: "skip" }),
      getDailySummary: async ({ date: requestedDate }) => {
        const summary = days.get(requestedDate);
        assert.ok(summary);
        return summary;
      },
      getWeeklySummary: async () =>
        buildWeeklySummary("2026-03-16", {
          workoutCount: 0,
          meals: {
            totalEntries: 2,
            daysWithTwoMealsLogged: 0,
            totals: { calories: 1100, protein: 45, carbs: 95, fat: 38, fibre: 7 }
          },
          checkinCount: 0,
          latestWeight: null
        }),
      listConversationMessages: async () => [
        {
          actor: "assistant",
          content: "Morning. Send your weight in kg.",
          messageAt: new Date("2026-03-11T07:00:00.000Z"),
          metadata: { kind: "prompt", promptKind: "weight", promptDate: "2026-03-11" }
        },
        {
          actor: "assistant",
          content: "Quick one. How was your sleep last night?",
          messageAt: new Date("2026-03-15T08:00:00.000Z"),
          metadata: { kind: "prompt", promptKind: "checkin", promptDate: "2026-03-15" }
        },
        {
          actor: "assistant",
          content: "The planned slot has gone.",
          messageAt: new Date("2026-03-16T12:00:00.000Z"),
          metadata: { kind: "prompt", promptKind: "missed_workout", promptDate: "2026-03-16" }
        }
      ],
      listHealthMetrics: async () => [],
      replaceDailyScore: async () => {
        throw new Error("should not persist on dry run");
      },
      replaceEngagementStatus: async () => {
        throw new Error("should not persist on dry run");
      }
    }
  );

  assert.equal(result.engagementStatus.status, "red");
  assert.ok(result.engagementStatus.reasons.some((reason) => reason.code === "missed_workouts_3d"));
  assert.ok(result.engagementStatus.reasons.some((reason) => reason.code === "low_meal_logging"));
  assert.ok(result.engagementStatus.reasons.some((reason) => reason.code === "missed_weigh_in"));
});

test("refreshDailySignals uses neutral fallbacks when there is no recent history", async () => {
  const date = "2026-03-17";

  const result = await refreshDailySignals(
    {
      date,
      timeZone: "Europe/London",
      dryRun: true
    },
    {
      ensureMetricDefinition: async () => ({ id: "skip" }),
      getDailySummary: async ({ date: requestedDate }) =>
        buildDailySummary(requestedDate, {
          dailyPlan: null,
          dayTemplate: null
        }),
      getWeeklySummary: async () => buildWeeklySummary("2026-03-16"),
      listConversationMessages: async () => [],
      listHealthMetrics: async () => [],
      replaceDailyScore: async () => {
        throw new Error("should not persist on dry run");
      },
      replaceEngagementStatus: async () => {
        throw new Error("should not persist on dry run");
      }
    }
  );

  assert.equal(result.engagementStatus.status, "green");
  assert.equal(result.scores.consistency.value, 60);
  assert.equal(result.scores.recovery.value, 65);
  assert.equal(result.scores.workout_adherence.value, 100);
  assert.equal(result.scores.effort.value, 100);
});
