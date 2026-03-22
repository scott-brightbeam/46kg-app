import assert from "node:assert/strict";
import test from "node:test";

import { getCalendarSlots, getDailySummary, getWeeklySummary } from "./current-state.js";

function createRepository(overrides: Record<string, unknown> = {}) {
  return {
    listCalendarEvents: async () => [],
    listCheckins: async () => [],
    listDailyPlans: async () => [],
    listDayTemplates: async () => [],
    listEngagementStatuses: async () => [],
    listFreshness: async () => [],
    listHealthkitWorkouts: async () => [],
    listHevyWorkouts: async () => [],
    listMealLogs: async () => [],
    listScores: async () => [],
    listStravaActivities: async () => [],
    listWeightEntries: async () => [],
    listWeightEntriesBefore: async () => [],
    ...overrides
  };
}

test("getCalendarSlots merges busy periods and returns free slots", () => {
  const slots = getCalendarSlots({
    date: "2026-03-16",
    timeZone: "Europe/London",
    calendarEvents: [
      {
        title: "Standup",
        startsAt: new Date("2026-03-16T08:30:00Z"),
        endsAt: new Date("2026-03-16T10:00:00Z")
      },
      {
        title: "Lunch",
        startsAt: new Date("2026-03-16T12:00:00Z"),
        endsAt: new Date("2026-03-16T12:30:00Z")
      }
    ],
    protectedBlocks: [
      {
        startTime: "08:00",
        endTime: "09:00",
        label: "School run"
      }
    ],
    minimumFreeSlotMinutes: 30
  });

  assert.equal(slots.busySlots.length, 2);
  assert.equal(slots.busySlots[0]?.start.toISOString(), "2026-03-16T08:00:00.000Z");
  assert.equal(slots.busySlots[0]?.end.toISOString(), "2026-03-16T10:00:00.000Z");
  assert.equal(slots.freeSlots[1]?.start.toISOString(), "2026-03-16T10:00:00.000Z");
  assert.equal(slots.freeSlots[1]?.end.toISOString(), "2026-03-16T12:00:00.000Z");
});

test("getDailySummary aggregates workouts, meals, scores, and latest status", async () => {
  const summary = await getDailySummary(
    {
      date: "2026-03-16",
      timeZone: "Europe/London",
      minimumFreeSlotMinutes: 30
    },
    createRepository({
      listCalendarEvents: async () => [
        {
          id: "event-1",
          title: "Client call",
          startsAt: new Date("2026-03-16T09:00:00Z"),
          endsAt: new Date("2026-03-16T10:00:00Z"),
          isAllDay: false,
          status: "confirmed",
          eventType: "default",
          externalCalendarId: "primary"
        }
      ],
      listCheckins: async () => [
        {
          respondedAt: new Date("2026-03-16T07:10:00Z"),
          field: "mood",
          valueText: "steady"
        }
      ],
      listDailyPlans: async () => [
        {
          id: "plan-1",
          planDate: new Date("2026-03-16T00:00:00Z"),
          summary: "Morning lift and 2200 kcal target",
          workoutPlan: { slot: "07:00" },
          mealPlan: { dinner: "Chicken tacos" },
          recoveryContext: { score: 72 },
          sourceSnapshot: { stale: false },
          updatedAt: new Date("2026-03-16T06:00:00Z")
        }
      ],
      listDayTemplates: async () => [
        {
          dayOfWeek: "monday",
          activityType: "strength",
          intensity: "intense",
          preferredTime: "morning",
          notes: "Lower body",
          hevyRoutineId: "routine-123",
          hevyRoutineTitle: "30kg Full-Body Barbell Circuit"
        }
      ],
      listEngagementStatuses: async () => [
        {
          effectiveAt: new Date("2026-03-15T20:00:00Z"),
          status: "green",
          reasons: ["normal"]
        }
      ],
      listFreshness: async () => [
        {
          source: "hevy",
          lastSuccessfulIngestAt: new Date("2026-03-16T08:00:00Z"),
          lastAttemptedIngestAt: new Date("2026-03-16T08:00:00Z"),
          lastStatus: "success",
          lastError: null,
          metadata: null
        }
      ],
      listHealthkitWorkouts: async () => [
        {
          id: "hk-1",
          source: "health_auto_export",
          title: "Walk",
          startedAt: new Date("2026-03-16T18:00:00Z"),
          endedAt: new Date("2026-03-16T18:30:00Z"),
          durationSeconds: 1800,
          details: {}
        }
      ],
      listHevyWorkouts: async () => [
        {
          id: "hevy-1",
          source: "hevy",
          title: "Leg Day",
          startedAt: new Date("2026-03-16T07:00:00Z"),
          endedAt: new Date("2026-03-16T08:00:00Z"),
          durationSeconds: 3600,
          details: { exerciseCount: 6 }
        }
      ],
      listMealLogs: async () => [
        {
          id: "meal-1",
          loggedAt: new Date("2026-03-16T12:15:00Z"),
          description: "Chicken wrap",
          calories: 550,
          protein: 42,
          carbs: 38,
          fat: 20,
          fibre: 8,
          confidence: 0.8,
          method: "text"
        },
        {
          id: "meal-2",
          loggedAt: new Date("2026-03-16T19:00:00Z"),
          description: "Salmon and potatoes",
          calories: 700,
          protein: 48,
          carbs: 50,
          fat: 28,
          fibre: 6,
          confidence: 0.9,
          method: "photo"
        }
      ],
      listScores: async () => [
        {
          scoreType: "recovery",
          value: 72,
          confidence: 0.88,
          formulaVersion: "v1",
          scoreDate: new Date("2026-03-16T05:00:00Z"),
          provenance: { hrv: true }
        }
      ],
      listStravaActivities: async () => [
        {
          id: "strava-1",
          source: "strava",
          title: "Morning Run",
          startedAt: new Date("2026-03-16T06:00:00Z"),
          endedAt: new Date("2026-03-16T06:30:00Z"),
          durationSeconds: 1800,
          details: { distanceMeters: 5000 }
        }
      ],
      listWeightEntries: async () => [
        {
          observedAt: new Date("2026-03-16T06:45:00Z"),
          kilograms: 118.4,
          source: "manual",
          flagged: false
        }
      ]
    }) as never
  );

  assert.equal(summary.dayOfWeek, "monday");
  assert.equal(summary.workouts.length, 3);
  assert.equal(summary.workouts[0]?.title, "Morning Run");
  assert.equal(summary.workouts[1]?.title, "Leg Day");
  assert.equal(summary.meals.totals.calories, 1250);
  assert.equal(summary.meals.totals.protein, 90);
  assert.equal(summary.latestWeight?.kilograms, 118.4);
  assert.equal(summary.engagementStatus?.status, "green");
  assert.equal(summary.scores.recovery?.value, 72);
  assert.equal(summary.dailyPlan?.summary, "Morning lift and 2200 kcal target");
});

test("getWeeklySummary calculates meal coverage and weight delta", async () => {
  const summary = await getWeeklySummary(
    {
      weekStart: "2026-03-16",
      timeZone: "Europe/London"
    },
    createRepository({
      listCheckins: async () => [
        {
          respondedAt: new Date("2026-03-17T08:00:00Z"),
          field: "stress",
          valueText: "2"
        }
      ],
      listHealthkitWorkouts: async () => [],
      listHevyWorkouts: async () => [
        {
          id: "hevy-1",
          source: "hevy",
          title: "Upper Body",
          startedAt: new Date("2026-03-18T07:00:00Z"),
          endedAt: new Date("2026-03-18T08:00:00Z"),
          durationSeconds: 3600,
          details: {}
        }
      ],
      listMealLogs: async () => [
        {
          id: "meal-1",
          loggedAt: new Date("2026-03-16T12:00:00Z"),
          description: "Lunch",
          calories: 500,
          protein: 35,
          carbs: 40,
          fat: 18,
          fibre: 6,
          confidence: 0.8,
          method: "text"
        },
        {
          id: "meal-2",
          loggedAt: new Date("2026-03-16T19:00:00Z"),
          description: "Dinner",
          calories: 800,
          protein: 45,
          carbs: 60,
          fat: 30,
          fibre: 8,
          confidence: 0.8,
          method: "text"
        },
        {
          id: "meal-3",
          loggedAt: new Date("2026-03-17T19:00:00Z"),
          description: "Dinner",
          calories: 700,
          protein: 40,
          carbs: 55,
          fat: 24,
          fibre: 7,
          confidence: 0.8,
          method: "photo"
        }
      ],
      listScores: async () => [
        {
          scoreType: "consistency",
          value: 81,
          confidence: 0.91,
          formulaVersion: "v1",
          scoreDate: new Date("2026-03-21T08:00:00Z"),
          provenance: { logging: true }
        }
      ],
      listStravaActivities: async () => [
        {
          id: "strava-1",
          source: "strava",
          title: "Cycle",
          startedAt: new Date("2026-03-20T09:00:00Z"),
          endedAt: new Date("2026-03-20T10:00:00Z"),
          durationSeconds: 3600,
          details: {}
        }
      ],
      listWeightEntries: async () => [
        {
          observedAt: new Date("2026-03-22T07:00:00Z"),
          kilograms: 117.5,
          source: "manual",
          flagged: false
        }
      ],
      listWeightEntriesBefore: async () => [
        {
          observedAt: new Date("2026-03-15T07:00:00Z"),
          kilograms: 118.9,
          source: "manual",
          flagged: false
        }
      ],
      listEngagementStatuses: async () => [
        {
          effectiveAt: new Date("2026-03-22T08:00:00Z"),
          status: "amber",
          reasons: ["missed weigh-in recovered late"]
        }
      ]
    }) as never
  );

  assert.equal(summary.workoutCount, 2);
  assert.equal(summary.workoutDurationSeconds, 7200);
  assert.equal(summary.workoutsBySource.hevy, 1);
  assert.equal(summary.workoutsBySource.strava, 1);
  assert.equal(summary.meals.totalEntries, 3);
  assert.equal(summary.meals.daysWithTwoMealsLogged, 1);
  assert.equal(summary.meals.totals.calories, 2000);
  assert.equal(summary.latestWeight?.kilograms, 117.5);
  assert.equal(summary.previousWeight?.kilograms, 118.9);
  assert.equal(summary.weightDeltaKg, -1.4);
  assert.equal(summary.scores.consistency?.value, 81);
  assert.equal(summary.engagementStatus?.status, "amber");
});
