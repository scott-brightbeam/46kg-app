import assert from "node:assert/strict";
import test from "node:test";

import Fastify from "fastify";

import type { AppConfig } from "../config.js";
import { registerCurrentStateRoutes } from "./current-state.js";

const testConfig: AppConfig = {
  NODE_ENV: "test",
  APP_TIME_ZONE: "Europe/London",
  API_PORT: 3001,
  API_BASE_URL: "http://localhost:3001",
  WEB_BASE_URL: "http://localhost:3000",
  DATABASE_URL: "postgres://example",
  DAILY_CALORIE_TARGET: 2400,
  DAILY_PROTEIN_TARGET: 180,
  DAILY_FIBRE_TARGET: 30,
  OPENAI_API_KEY: "test",
  OPENAI_MODEL: "gpt-5",
  TELEGRAM_BOT_TOKEN: "token",
  TELEGRAM_WEBHOOK_SECRET: "secret",
  TELEGRAM_CHAT_ID: "123",
  TELEGRAM_ALERT_CHAT_ID: undefined,
  ENABLE_OPERATOR_ALERTS: true,
  HEALTH_AUTO_EXPORT_SHARED_SECRET: "health",
  HEVY_API_KEY: undefined,
  AUTH_SESSION_SECRET: "auth",
  STRAVA_CLIENT_ID: undefined,
  STRAVA_CLIENT_SECRET: undefined,
  STRAVA_REFRESH_TOKEN: undefined,
  GOOGLE_CLIENT_ID: undefined,
  GOOGLE_CLIENT_SECRET: undefined,
  GOOGLE_REFRESH_TOKEN: undefined,
  GOOGLE_CALENDAR_ID: "primary",
  BACKUP_PGDUMP_BIN: "pg_dump",
  BACKUP_S3_BUCKET: undefined,
  BACKUP_S3_REGION: undefined,
  BACKUP_S3_ENDPOINT: undefined,
  BACKUP_S3_ACCESS_KEY_ID: undefined,
  BACKUP_S3_SECRET_ACCESS_KEY: undefined,
  BACKUP_S3_PREFIX: "postgres",
  BACKUP_S3_FORCE_PATH_STYLE: false
};

test("GET /state/daily requires authentication", async () => {
  const app = Fastify();
  await registerCurrentStateRoutes(app, testConfig, {
    buildDailyNutritionBudget: () => null,
    getAuthenticatedUser: async () => null,
    getDailySummary: async () => {
      throw new Error("not expected");
    },
    getNutritionTargetState: async () => ({
      targets: {
        calories: null,
        protein: null,
        fibre: null
      },
      source: "default",
      notes: null,
      updatedAt: null
    }),
    getWeeklySummary: async () => {
      throw new Error("not expected");
    },
    logScopedAccess: async () => {},
    resolveViewerAccess: async () => {
      throw new Error("not expected");
    }
  });

  const response = await app.inject({
    method: "GET",
    url: "/state/daily?date=2026-03-16"
  });

  assert.equal(response.statusCode, 401);
  await app.close();
});

test("GET /state/daily redacts nutrition and engagement for trainer scope", async () => {
  const app = Fastify();
  const loggedCategories: string[][] = [];

  await registerCurrentStateRoutes(app, testConfig, {
    buildDailyNutritionBudget: () => null,
    getAuthenticatedUser: async () => ({
      id: "trainer-1",
      email: "trainer@example.com",
      displayName: "Trainer",
      role: "trainer",
      passwordHash: "plain:test",
      isActive: true
    }),
    getDailySummary: async () => ({
      date: "2026-03-16",
      timeZone: "Europe/London",
      range: {
        start: new Date("2026-03-16T00:00:00Z"),
        end: new Date("2026-03-17T00:00:00Z")
      },
      dayOfWeek: "monday",
      calendar: {
        events: [{ id: "event-1", title: "Meeting", startsAt: new Date(), endsAt: new Date(), isAllDay: false, status: "confirmed", eventType: "default", externalCalendarId: "primary" }],
        busySlots: [{ start: new Date(), end: new Date(), label: "Meeting", kind: "calendar" as const }],
        freeSlots: [{ start: new Date(), end: new Date(), durationMinutes: 60 }]
      },
      workouts: [{ id: "workout-1", source: "hevy", title: "Strength", startedAt: new Date(), endedAt: new Date(), durationSeconds: 3600, details: {} }],
      meals: {
        entries: [{ id: "meal-1", loggedAt: new Date(), description: "Lunch", calories: 600, protein: 40, carbs: 50, fat: 20, fibre: 10, confidence: 0.8, method: "text" as const }],
        totals: {
          calories: 600,
          protein: 40,
          carbs: 50,
          fat: 20,
          fibre: 10
        }
      },
      checkins: [],
      scores: {
        recovery: {
          scoreType: "recovery",
          value: 70,
          confidence: 0.8,
          formulaVersion: "v1",
          scoreDate: new Date(),
          provenance: {}
        }
      },
      latestWeight: {
        observedAt: new Date(),
        kilograms: 118.4,
        source: "telegram",
        flagged: false
      },
      engagementStatus: {
        effectiveAt: new Date(),
        status: "amber",
        reasons: ["missed workout"]
      },
      dailyPlan: {
        id: "plan-1",
        planDate: new Date("2026-03-16T00:00:00Z"),
        summary: "Plan",
        workoutPlan: { activityType: "Strength" },
        mealPlan: { dinner: "Fish" },
        recoveryContext: {},
        sourceSnapshot: {},
        updatedAt: new Date()
      },
      dayTemplate: {
        dayOfWeek: "monday",
        activityType: "Strength",
        intensity: "intense",
        preferredTime: "morning",
        notes: null,
        hevyRoutineId: null,
        hevyRoutineTitle: null
      },
      freshness: []
    }),
    getNutritionTargetState: async () => ({
      targets: {
        calories: null,
        protein: null,
        fibre: null
      },
      source: "default",
      notes: null,
      updatedAt: null
    }),
    getWeeklySummary: async () => {
      throw new Error("not expected");
    },
    logScopedAccess: async (_viewer, _subjectUserId, categories) => {
      loggedCategories.push([...categories]);
    },
    resolveViewerAccess: async () => ({
      subjectUserId: "user-1",
      categories: new Set(["exercise"])
    })
  });

  const response = await app.inject({
    method: "GET",
    url: "/state/daily?date=2026-03-16"
  });

  assert.equal(response.statusCode, 200);
  const payload = response.json() as { ok: boolean; summary: Record<string, unknown> };
  const meals = payload.summary.meals as { entries: unknown[]; totals: { calories: number } };
  const calendar = payload.summary.calendar as { events: unknown[] };
  const dailyPlan = payload.summary.dailyPlan as { workoutPlan: unknown; mealPlan: unknown } | null;

  assert.equal(payload.ok, true);
  assert.equal((payload.summary.workouts as unknown[]).length, 1);
  assert.equal(meals.entries.length, 0);
  assert.equal(meals.totals.calories, 0);
  assert.equal(payload.summary.latestWeight, null);
  assert.equal(payload.summary.engagementStatus, null);
  assert.equal(calendar.events.length, 1);
  assert.ok(dailyPlan);
  assert.notEqual(dailyPlan?.workoutPlan, null);
  assert.equal(dailyPlan?.mealPlan, null);
  assert.deepEqual(loggedCategories, [["exercise"]]);
  await app.close();
});

test("GET /state/daily includes nutrition budget when nutrition scope is visible", async () => {
  const app = Fastify();

  await registerCurrentStateRoutes(app, testConfig, {
    buildDailyNutritionBudget: (targets, consumed) => ({
      targets: {
        calories: targets.calories,
        protein: targets.protein,
        fibre: targets.fibre
      },
      consumed: {
        calories: consumed.calories,
        protein: consumed.protein,
        fibre: consumed.fibre
      },
      remaining: {
        calories: 1800,
        protein: 140,
        fibre: 20
      }
    }),
    getAuthenticatedUser: async () => ({
      id: "nutritionist-1",
      email: "nutritionist@example.com",
      displayName: "Nutritionist",
      role: "nutritionist",
      passwordHash: "plain:test",
      isActive: true
    }),
    getDailySummary: async () => ({
      date: "2026-03-16",
      timeZone: "Europe/London",
      range: {
        start: new Date("2026-03-16T00:00:00Z"),
        end: new Date("2026-03-17T00:00:00Z")
      },
      dayOfWeek: "monday",
      calendar: {
        events: [],
        busySlots: [],
        freeSlots: []
      },
      workouts: [],
      meals: {
        entries: [{ id: "meal-1", loggedAt: new Date(), description: "Lunch", calories: 600, protein: 40, carbs: 50, fat: 20, fibre: 10, confidence: 0.8, method: "text" as const }],
        totals: {
          calories: 600,
          protein: 40,
          carbs: 50,
          fat: 20,
          fibre: 10
        }
      },
      checkins: [],
      scores: {},
      latestWeight: null,
      engagementStatus: null,
      dailyPlan: null,
      dayTemplate: null,
      freshness: []
    }),
    getNutritionTargetState: async () => ({
      targets: {
        calories: 2400,
        protein: 180,
        fibre: 30
      },
      source: "stored",
      notes: null,
      updatedAt: new Date("2026-03-16T08:00:00Z")
    }),
    getWeeklySummary: async () => {
      throw new Error("not expected");
    },
    logScopedAccess: async () => {},
    resolveViewerAccess: async () => ({
      subjectUserId: "user-1",
      categories: new Set(["nutrition", "weight"])
    })
  });

  const response = await app.inject({
    method: "GET",
    url: "/state/daily?date=2026-03-16"
  });

  assert.equal(response.statusCode, 200);
  const payload = response.json() as {
    ok: boolean;
    summary: {
      nutritionBudget: {
        targets: { calories: number };
        remaining: { calories: number };
      } | null;
    };
  };

  assert.equal(payload.ok, true);
  assert.equal(payload.summary.nutritionBudget?.targets.calories, 2400);
  assert.equal(payload.summary.nutritionBudget?.remaining.calories, 1800);
  await app.close();
});
