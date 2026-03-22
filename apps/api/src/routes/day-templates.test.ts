import assert from "node:assert/strict";
import test from "node:test";

import Fastify from "fastify";

import type { AppConfig } from "../config.js";
import { registerDayTemplateRoutes } from "./day-templates.js";

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

test("GET /day-templates requires authentication", async () => {
  const app = Fastify();

  await registerDayTemplateRoutes(app, testConfig, {
    getAuthenticatedUser: async () => null,
    listDayTemplateState: async () => [],
    listHevyRoutineOptions: async () => [],
    resolveViewerAccess: async () => ({
      subjectUserId: "user-1",
      categories: new Set(["exercise"])
    }),
    updateDayTemplate: async () => {
      throw new Error("not expected");
    }
  });

  const response = await app.inject({
    method: "GET",
    url: "/day-templates"
  });

  assert.equal(response.statusCode, 401);
});

test("GET /day-templates returns templates for exercise-visible sessions", async () => {
  const app = Fastify();

  await registerDayTemplateRoutes(app, testConfig, {
    getAuthenticatedUser: async () => ({
      id: "trainer-1",
      email: "trainer@local.codex",
      displayName: "Trainer",
      role: "trainer",
      passwordHash: "hash",
      isActive: true
    }),
    listDayTemplateState: async () => [
      {
        dayOfWeek: "monday",
        activityType: "Rest / active recovery",
        intensity: "rest",
        preferredTime: null,
        notes: null,
        hevyRoutineId: null,
        hevyRoutineTitle: null
      }
    ],
    listHevyRoutineOptions: async () => [],
    resolveViewerAccess: async () => ({
      subjectUserId: "user-1",
      categories: new Set(["exercise"])
    }),
    updateDayTemplate: async () => {
      throw new Error("not expected");
    }
  });

  const response = await app.inject({
    method: "GET",
    url: "/day-templates"
  });

  assert.equal(response.statusCode, 200);
  assert.equal(response.json().templates[0].activityType, "Rest / active recovery");
});

test("POST /day-templates updates the weekly template for the primary user", async () => {
  const app = Fastify();

  await registerDayTemplateRoutes(app, testConfig, {
    getAuthenticatedUser: async () => ({
      id: "user-1",
      email: "scott@local.codex",
      displayName: "Scott",
      role: "user",
      passwordHash: "hash",
      isActive: true
    }),
    listDayTemplateState: async () => [],
    listHevyRoutineOptions: async () => [
      {
        id: "routine-123",
        title: "30kg Full-Body Barbell Circuit",
        folderId: 2533813
      }
    ],
    resolveViewerAccess: async () => ({
      subjectUserId: "user-1",
      categories: new Set(["exercise", "nutrition", "weight", "engagement_status"])
    }),
    updateDayTemplate: async (input) => ({
      changed: true,
      responseText: `Done. ${input.dayOfWeek}.`,
      templates: [
        {
          dayOfWeek: input.dayOfWeek,
          activityType: input.activityType,
          intensity: input.intensity ?? null,
          preferredTime: input.preferredTime ?? null,
          notes: input.notes ?? null,
          hevyRoutineId: input.hevyRoutineId ?? null,
          hevyRoutineTitle: input.hevyRoutineTitle ?? null
        }
      ]
    })
  });

  const response = await app.inject({
    method: "POST",
    url: "/day-templates",
    headers: {
      origin: testConfig.WEB_BASE_URL
    },
    payload: {
      dayOfWeek: "thursday",
      activityType: "Cardio intervals",
      intensity: "intense",
      preferredTime: "morning",
      hevyRoutineId: "routine-123",
      hevyRoutineTitle: "30kg Full-Body Barbell Circuit"
    }
  });

  assert.equal(response.statusCode, 200);
  assert.equal(response.json().templates[0].activityType, "Cardio intervals");
  assert.equal(response.json().templates[0].hevyRoutineTitle, "30kg Full-Body Barbell Circuit");
});

test("POST /day-templates rejects practitioner writes", async () => {
  const app = Fastify();

  await registerDayTemplateRoutes(app, testConfig, {
    getAuthenticatedUser: async () => ({
      id: "trainer-1",
      email: "trainer@local.codex",
      displayName: "Trainer",
      role: "trainer",
      passwordHash: "hash",
      isActive: true
    }),
    listDayTemplateState: async () => [],
    listHevyRoutineOptions: async () => [],
    resolveViewerAccess: async () => ({
      subjectUserId: "user-1",
      categories: new Set(["exercise"])
    }),
    updateDayTemplate: async () => {
      throw new Error("not expected");
    }
  });

  const response = await app.inject({
    method: "POST",
    url: "/day-templates",
    headers: {
      origin: testConfig.WEB_BASE_URL
    },
    payload: {
      dayOfWeek: "thursday",
      activityType: "Cardio intervals"
    }
  });

  assert.equal(response.statusCode, 403);
});
