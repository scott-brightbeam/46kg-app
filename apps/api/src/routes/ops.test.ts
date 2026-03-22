import assert from "node:assert/strict";
import test from "node:test";

import Fastify from "fastify";

import type { AppConfig } from "../config.js";
import { registerOpsRoutes } from "./ops.js";

const testConfig: AppConfig = {
  NODE_ENV: "test",
  APP_TIME_ZONE: "Europe/London",
  API_PORT: 3001,
  API_BASE_URL: "http://localhost:3001",
  WEB_BASE_URL: "http://localhost:3000",
  DATABASE_URL: "postgres://example",
  DAILY_CALORIE_TARGET: undefined,
  DAILY_PROTEIN_TARGET: undefined,
  DAILY_FIBRE_TARGET: undefined,
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

test("GET /ops/status requires authentication", async () => {
  const app = Fastify();
  await registerOpsRoutes(app, testConfig, {
    buildOperatorStatus: async () => {
      throw new Error("not expected");
    },
    getAuthenticatedUser: async () => null
  });

  const response = await app.inject({
    method: "GET",
    url: "/ops/status"
  });

  assert.equal(response.statusCode, 401);
  await app.close();
});

test("GET /ops/status rejects practitioner sessions", async () => {
  const app = Fastify();
  await registerOpsRoutes(app, testConfig, {
    buildOperatorStatus: async () => {
      throw new Error("not expected");
    },
    getAuthenticatedUser: async () => ({
      id: "trainer-1",
      email: "trainer@example.com",
      displayName: "Trainer",
      role: "trainer",
      passwordHash: "plain:test",
      isActive: true
    })
  });

  const response = await app.inject({
    method: "GET",
    url: "/ops/status"
  });

  assert.equal(response.statusCode, 403);
  await app.close();
});

test("GET /ops/status returns operator status for the primary user", async () => {
  const app = Fastify();
  await registerOpsRoutes(app, testConfig, {
    buildOperatorStatus: async () => ({
      generatedAt: "2026-03-16T09:00:00.000Z",
      overallStatus: "warning" as const,
      sources: [],
      jobs: [],
      alerts: []
    }),
    getAuthenticatedUser: async () => ({
      id: "user-1",
      email: "user@example.com",
      displayName: "Scott",
      role: "user",
      passwordHash: "plain:test",
      isActive: true
    })
  });

  const response = await app.inject({
    method: "GET",
    url: "/ops/status"
  });

  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.json(), {
    ok: true,
    status: {
      generatedAt: "2026-03-16T09:00:00.000Z",
      overallStatus: "warning",
      sources: [],
      jobs: [],
      alerts: []
    }
  });
  await app.close();
});
