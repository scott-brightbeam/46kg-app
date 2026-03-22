import assert from "node:assert/strict";
import test from "node:test";

import Fastify from "fastify";

import type { AppConfig } from "../config.js";
import { registerNutritionTargetRoutes } from "./nutrition-targets.js";

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

test("GET /nutrition-targets requires authentication", async () => {
  const app = Fastify();

  await registerNutritionTargetRoutes(app, testConfig, {
    getAuthenticatedUser: async () => null,
    getNutritionTargetState: async () => ({
      targets: { calories: 2400, protein: 180, fibre: 30 },
      source: "default",
      notes: null,
      updatedAt: null
    }),
    resolveViewerAccess: async () => ({
      subjectUserId: "user-1",
      categories: new Set(["nutrition"])
    }),
    updateNutritionTargets: async () => {
      throw new Error("not expected");
    }
  });

  const response = await app.inject({
    method: "GET",
    url: "/nutrition-targets"
  });

  assert.equal(response.statusCode, 401);
});

test("GET /nutrition-targets returns targets for nutrition-visible sessions", async () => {
  const app = Fastify();

  await registerNutritionTargetRoutes(app, testConfig, {
    getAuthenticatedUser: async () => ({
      id: "nutritionist-1",
      email: "nutritionist@local.codex",
      displayName: "Nutritionist",
      role: "nutritionist",
      passwordHash: "hash",
      isActive: true
    }),
    getNutritionTargetState: async () => ({
      targets: { calories: 2200, protein: 190, fibre: 35 },
      source: "stored",
      notes: null,
      updatedAt: new Date("2026-03-15T12:00:00Z")
    }),
    resolveViewerAccess: async () => ({
      subjectUserId: "user-1",
      categories: new Set(["nutrition", "weight"])
    }),
    updateNutritionTargets: async () => {
      throw new Error("not expected");
    }
  });

  const response = await app.inject({
    method: "GET",
    url: "/nutrition-targets"
  });

  assert.equal(response.statusCode, 200);
  assert.equal(response.json().targets.calories, 2200);
});

test("POST /nutrition-targets updates targets for the primary user", async () => {
  const app = Fastify();

  await registerNutritionTargetRoutes(app, testConfig, {
    getAuthenticatedUser: async () => ({
      id: "user-1",
      email: "scott@local.codex",
      displayName: "Scott",
      role: "user",
      passwordHash: "hash",
      isActive: true
    }),
    getNutritionTargetState: async () => ({
      targets: { calories: 2200, protein: 190, fibre: 35 },
      source: "stored",
      notes: null,
      updatedAt: new Date("2026-03-15T12:00:00Z")
    }),
    resolveViewerAccess: async () => ({
      subjectUserId: "user-1",
      categories: new Set(["exercise", "nutrition", "weight", "engagement_status"])
    }),
    updateNutritionTargets: async (_config, input) => ({
      changed: true,
      responseText: "Done. Targets updated.",
      targets: {
        calories: input.calories ?? null,
        protein: input.protein ?? null,
        fibre: input.fibre ?? null
      },
      source: "stored" as const,
      notes: input.notes ?? null,
      updatedAt: new Date("2026-03-15T12:00:00Z")
    })
  });

  const response = await app.inject({
    method: "POST",
    url: "/nutrition-targets",
    headers: {
      origin: testConfig.WEB_BASE_URL
    },
    payload: {
      calories: 2200,
      protein: 190,
      fibre: 35
    }
  });

  assert.equal(response.statusCode, 200);
  assert.equal(response.json().targets.protein, 190);
});

test("POST /nutrition-targets rejects practitioner writes", async () => {
  const app = Fastify();

  await registerNutritionTargetRoutes(app, testConfig, {
    getAuthenticatedUser: async () => ({
      id: "nutritionist-1",
      email: "nutritionist@local.codex",
      displayName: "Nutritionist",
      role: "nutritionist",
      passwordHash: "hash",
      isActive: true
    }),
    getNutritionTargetState: async () => ({
      targets: { calories: 2400, protein: 180, fibre: 30 },
      source: "default",
      notes: null,
      updatedAt: null
    }),
    resolveViewerAccess: async () => ({
      subjectUserId: "user-1",
      categories: new Set(["nutrition", "weight"])
    }),
    updateNutritionTargets: async () => {
      throw new Error("not expected");
    }
  });

  const response = await app.inject({
    method: "POST",
    url: "/nutrition-targets",
    headers: {
      origin: testConfig.WEB_BASE_URL
    },
    payload: {
      calories: 2200
    }
  });

  assert.equal(response.statusCode, 403);
});
