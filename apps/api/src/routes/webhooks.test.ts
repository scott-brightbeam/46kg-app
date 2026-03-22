import assert from "node:assert/strict";
import test from "node:test";

import Fastify from "fastify";

import type { AppConfig } from "../config.js";
import { registerWebhookRoutes } from "./webhooks.js";

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
  TELEGRAM_WEBHOOK_SECRET: "telegram-secret",
  TELEGRAM_CHAT_ID: "123",
  TELEGRAM_ALERT_CHAT_ID: undefined,
  ENABLE_OPERATOR_ALERTS: true,
  HEALTH_AUTO_EXPORT_SHARED_SECRET: "health-secret",
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

const sampleTelegramUpdate = {
  update_id: 101,
  message: {
    message_id: 55,
    date: 1_710_000_000,
    text: "Morning"
  }
};

test("POST /webhooks/telegram accepts valid updates with the configured secret", async () => {
  const app = Fastify();
  let handledUpdateId: number | null = null;

  await registerWebhookRoutes(app, testConfig, {
    consumeHealthAutoExportRateLimit: () => ({
      allowed: true,
      remaining: 119,
      retryAfterSeconds: 60
    }),
    consumeTelegramRateLimit: () => ({
      allowed: true,
      remaining: 59,
      retryAfterSeconds: 60
    }),
    handleHealthAutoExportPayload: async () => {
      throw new Error("not expected");
    },
    handleTelegramUpdate: async (update) => {
      handledUpdateId = update.update_id;
      return {
        duplicate: false
      };
    }
  });

  const response = await app.inject({
    method: "POST",
    url: "/webhooks/telegram",
    headers: {
      "x-telegram-bot-api-secret-token": testConfig.TELEGRAM_WEBHOOK_SECRET
    },
    payload: sampleTelegramUpdate
  });

  assert.equal(response.statusCode, 200);
  assert.equal(response.json().duplicate, false);
  assert.equal(handledUpdateId, 101);
  await app.close();
});

test("POST /webhooks/telegram rejects invalid webhook secrets", async () => {
  const app = Fastify();
  let handled = false;

  await registerWebhookRoutes(app, testConfig, {
    consumeHealthAutoExportRateLimit: () => ({
      allowed: true,
      remaining: 119,
      retryAfterSeconds: 60
    }),
    consumeTelegramRateLimit: () => ({
      allowed: true,
      remaining: 59,
      retryAfterSeconds: 60
    }),
    handleHealthAutoExportPayload: async () => {
      throw new Error("not expected");
    },
    handleTelegramUpdate: async () => {
      handled = true;
      return {
        duplicate: false
      };
    }
  });

  const response = await app.inject({
    method: "POST",
    url: "/webhooks/telegram",
    headers: {
      "x-telegram-bot-api-secret-token": "wrong-secret"
    },
    payload: sampleTelegramUpdate
  });

  assert.equal(response.statusCode, 401);
  assert.equal(response.json().error, "Invalid Telegram webhook secret");
  assert.equal(handled, false);
  await app.close();
});

test("POST /webhooks/telegram rate limits bursts before dispatching handlers", async () => {
  const app = Fastify();
  let handled = false;

  await registerWebhookRoutes(app, testConfig, {
    consumeHealthAutoExportRateLimit: () => ({
      allowed: true,
      remaining: 119,
      retryAfterSeconds: 60
    }),
    consumeTelegramRateLimit: () => ({
      allowed: false,
      remaining: 0,
      retryAfterSeconds: 25
    }),
    handleHealthAutoExportPayload: async () => {
      throw new Error("not expected");
    },
    handleTelegramUpdate: async () => {
      handled = true;
      return {
        duplicate: false
      };
    }
  });

  const response = await app.inject({
    method: "POST",
    url: "/webhooks/telegram",
    headers: {
      "x-telegram-bot-api-secret-token": testConfig.TELEGRAM_WEBHOOK_SECRET
    },
    payload: sampleTelegramUpdate
  });

  assert.equal(response.statusCode, 429);
  assert.equal(response.headers["retry-after"], "25");
  assert.equal(response.json().error, "Telegram webhook rate limit exceeded");
  assert.equal(handled, false);
  await app.close();
});

test("POST /webhooks/health-auto-export accepts valid payloads with the shared secret", async () => {
  const app = Fastify();
  let handledPayload: unknown = null;

  await registerWebhookRoutes(app, testConfig, {
    consumeHealthAutoExportRateLimit: () => ({
      allowed: true,
      remaining: 119,
      retryAfterSeconds: 60
    }),
    consumeTelegramRateLimit: () => ({
      allowed: true,
      remaining: 59,
      retryAfterSeconds: 60
    }),
    handleHealthAutoExportPayload: async (payload) => {
      handledPayload = payload;
      return {
        ingestEventId: "ingest-1",
        topLevelRecordCount: 1,
        normalizedMetricCount: 0,
        normalizedWorkoutCount: 0
      };
    },
    handleTelegramUpdate: async () => {
      throw new Error("not expected");
    }
  });

  const payload = {
    data: {
      metrics: []
    }
  };

  const response = await app.inject({
    method: "POST",
    url: "/webhooks/health-auto-export",
    headers: {
      "x-health-auto-export-secret": testConfig.HEALTH_AUTO_EXPORT_SHARED_SECRET
    },
    payload
  });

  assert.equal(response.statusCode, 200);
  assert.equal(response.json().ingestEventId, "ingest-1");
  assert.deepEqual(handledPayload, payload);
  await app.close();
});

test("POST /webhooks/health-auto-export rejects invalid shared secrets", async () => {
  const app = Fastify();
  let handled = false;

  await registerWebhookRoutes(app, testConfig, {
    consumeHealthAutoExportRateLimit: () => ({
      allowed: true,
      remaining: 119,
      retryAfterSeconds: 60
    }),
    consumeTelegramRateLimit: () => ({
      allowed: true,
      remaining: 59,
      retryAfterSeconds: 60
    }),
    handleHealthAutoExportPayload: async () => {
      handled = true;
      return {
        ingestEventId: "ingest-1",
        topLevelRecordCount: 1,
        normalizedMetricCount: 0,
        normalizedWorkoutCount: 0
      };
    },
    handleTelegramUpdate: async () => {
      throw new Error("not expected");
    }
  });

  const response = await app.inject({
    method: "POST",
    url: "/webhooks/health-auto-export",
    headers: {
      "x-health-auto-export-secret": "wrong-secret"
    },
    payload: {
      data: {
        metrics: []
      }
    }
  });

  assert.equal(response.statusCode, 401);
  assert.equal(response.json().error, "Invalid Health Auto Export secret");
  assert.equal(handled, false);
  await app.close();
});

test("POST /webhooks/health-auto-export rate limits bursts before ingest", async () => {
  const app = Fastify();
  let handled = false;

  await registerWebhookRoutes(app, testConfig, {
    consumeHealthAutoExportRateLimit: () => ({
      allowed: false,
      remaining: 0,
      retryAfterSeconds: 20
    }),
    consumeTelegramRateLimit: () => ({
      allowed: true,
      remaining: 59,
      retryAfterSeconds: 60
    }),
    handleHealthAutoExportPayload: async () => {
      handled = true;
      return {
        ingestEventId: "ingest-1",
        topLevelRecordCount: 1,
        normalizedMetricCount: 0,
        normalizedWorkoutCount: 0
      };
    },
    handleTelegramUpdate: async () => {
      throw new Error("not expected");
    }
  });

  const response = await app.inject({
    method: "POST",
    url: "/webhooks/health-auto-export",
    headers: {
      "x-health-auto-export-secret": testConfig.HEALTH_AUTO_EXPORT_SHARED_SECRET
    },
    payload: {
      data: {
        metrics: []
      }
    }
  });

  assert.equal(response.statusCode, 429);
  assert.equal(response.headers["retry-after"], "20");
  assert.equal(response.json().error, "Health Auto Export webhook rate limit exceeded");
  assert.equal(handled, false);
  await app.close();
});
