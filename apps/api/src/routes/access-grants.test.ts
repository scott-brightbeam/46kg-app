import assert from "node:assert/strict";
import test from "node:test";

import Fastify from "fastify";

import type { AppConfig } from "../config.js";
import { registerAccessGrantRoutes } from "./access-grants.js";

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

test("GET /access-grants requires authentication", async () => {
  const app = Fastify();
  await registerAccessGrantRoutes(app, testConfig, {
    getAuthenticatedUser: async () => null,
    listAccessGrantState: async () => [],
    updateAccessGrant: async () => {
      throw new Error("not expected");
    }
  });

  const response = await app.inject({
    method: "GET",
    url: "/access-grants"
  });

  assert.equal(response.statusCode, 401);
  await app.close();
});

test("POST /access-grants/grant grants access for the signed-in user", async () => {
  const app = Fastify();
  let granted: { practitionerRole?: string; category?: string; action?: string } | null = null;

  await registerAccessGrantRoutes(app, testConfig, {
    getAuthenticatedUser: async () => ({
      id: "user-1",
      email: "user@example.com",
      displayName: "Scott",
      role: "user",
      passwordHash: "plain:test",
      isActive: true
    }),
    listAccessGrantState: async () => [],
    updateAccessGrant: async (input) => {
      granted = input;
      return {
        changed: true,
        responseText: "Granted.",
        snapshots: [
          {
            practitionerUserId: "trainer-1",
            practitionerDisplayName: "Trainer",
            practitionerRole: "trainer",
            effectiveCategories: ["exercise", "nutrition"]
          }
        ]
      };
    }
  });

  const response = await app.inject({
    method: "POST",
    url: "/access-grants/grant",
    headers: {
      origin: testConfig.WEB_BASE_URL
    },
    payload: {
      practitionerRole: "trainer",
      category: "nutrition"
    }
  });

  assert.equal(response.statusCode, 200);
  assert.deepEqual(granted, {
    actorUserId: "user-1",
    practitionerRole: "trainer",
    category: "nutrition",
    action: "grant"
  });
  await app.close();
});

test("POST /access-grants/grant rejects untrusted origins", async () => {
  const app = Fastify();

  await registerAccessGrantRoutes(app, testConfig, {
    getAuthenticatedUser: async () => ({
      id: "user-1",
      email: "user@example.com",
      displayName: "Scott",
      role: "user",
      passwordHash: "plain:test",
      isActive: true
    }),
    listAccessGrantState: async () => [],
    updateAccessGrant: async () => {
      throw new Error("not expected");
    }
  });

  const response = await app.inject({
    method: "POST",
    url: "/access-grants/grant",
    headers: {
      origin: "https://evil.example"
    },
    payload: {
      practitionerRole: "trainer",
      category: "nutrition"
    }
  });

  assert.equal(response.statusCode, 403);
  assert.equal(response.json().error, "Untrusted request origin.");
  await app.close();
});

test("POST /access-grants/revoke blocks practitioner accounts", async () => {
  const app = Fastify();

  await registerAccessGrantRoutes(app, testConfig, {
    getAuthenticatedUser: async () => ({
      id: "trainer-1",
      email: "trainer@example.com",
      displayName: "Trainer",
      role: "trainer",
      passwordHash: "plain:test",
      isActive: true
    }),
    listAccessGrantState: async () => [],
    updateAccessGrant: async () => {
      throw new Error("not expected");
    }
  });

  const response = await app.inject({
    method: "POST",
    url: "/access-grants/revoke",
    headers: {
      origin: testConfig.WEB_BASE_URL
    },
    payload: {
      practitionerRole: "nutritionist",
      category: "weight"
    }
  });

  assert.equal(response.statusCode, 400);
  await app.close();
});
