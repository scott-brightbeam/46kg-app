import assert from "node:assert/strict";
import test from "node:test";

import cookie from "@fastify/cookie";
import Fastify from "fastify";

import type { AppConfig } from "../config.js";
import { registerAuthRoutes } from "./auth.js";

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

const allowAllRateLimit = () => ({
  allowed: true,
  remaining: 9,
  retryAfterSeconds: 60
});

test("POST /auth/login sets a signed session cookie on successful login", async () => {
  const app = Fastify();
  await app.register(cookie, {
    secret: "test-secret"
  });
  await registerAuthRoutes(app, testConfig, {
    authenticateWithPassword: async (email, password) =>
      email === "user@example.com" && password === "correct-horse"
        ? {
            id: "user-1",
            email,
            displayName: "Scott",
            role: "user",
            passwordHash: "plain:correct-horse",
            isActive: true
          }
        : null,
    consumeLoginRateLimit: allowAllRateLimit,
    getAuthenticatedUser: async () => null,
    resolveViewerAccess: async () => ({
      subjectUserId: "user-1",
      categories: new Set(["exercise", "nutrition", "weight", "engagement_status"])
    })
  });

  const response = await app.inject({
    method: "POST",
    url: "/auth/login",
    payload: {
      email: "user@example.com",
      password: "correct-horse"
    }
  });
  const setCookie = Array.isArray(response.headers["set-cookie"])
    ? response.headers["set-cookie"].join("; ")
    : (response.headers["set-cookie"] ?? "");

  assert.equal(response.statusCode, 200);
  assert.match(setCookie, /codex_health_session=/i);
  await app.close();
});

test("POST /auth/login rate limits repeated attempts", async () => {
  const app = Fastify();
  await app.register(cookie, {
    secret: "test-secret"
  });
  await registerAuthRoutes(app, testConfig, {
    authenticateWithPassword: async () => {
      throw new Error("not expected");
    },
    consumeLoginRateLimit: () => ({
      allowed: false,
      remaining: 0,
      retryAfterSeconds: 30
    }),
    getAuthenticatedUser: async () => null,
    resolveViewerAccess: async () => ({
      subjectUserId: "user-1",
      categories: new Set(["exercise"])
    })
  });

  const response = await app.inject({
    method: "POST",
    url: "/auth/login",
    payload: {
      email: "user@example.com",
      password: "wrong"
    }
  });

  assert.equal(response.statusCode, 429);
  assert.equal(response.headers["retry-after"], "30");
  assert.equal(response.json().error, "Too many login attempts. Try again shortly.");
  await app.close();
});

test("GET /auth/me rejects unauthenticated requests", async () => {
  const app = Fastify();
  await app.register(cookie, {
    secret: "test-secret"
  });
  await registerAuthRoutes(app, testConfig, {
    authenticateWithPassword: async () => null,
    consumeLoginRateLimit: allowAllRateLimit,
    getAuthenticatedUser: async () => null,
    resolveViewerAccess: async () => ({
      subjectUserId: "user-1",
      categories: new Set(["exercise"])
    })
  });

  const response = await app.inject({
    method: "GET",
    url: "/auth/me"
  });

  assert.equal(response.statusCode, 401);
  await app.close();
});

test("GET /auth/me returns effective access categories for the signed-in user", async () => {
  const app = Fastify();
  await app.register(cookie, {
    secret: "test-secret"
  });
  await registerAuthRoutes(app, testConfig, {
    authenticateWithPassword: async () => null,
    consumeLoginRateLimit: allowAllRateLimit,
    getAuthenticatedUser: async () => ({
      id: "trainer-1",
      email: "trainer@example.com",
      displayName: "Trainer",
      role: "trainer",
      passwordHash: "plain:test",
      isActive: true
    }),
    resolveViewerAccess: async () => ({
      subjectUserId: "user-1",
      categories: new Set(["exercise", "nutrition"])
    })
  });

  const response = await app.inject({
    method: "GET",
    url: "/auth/me"
  });

  assert.equal(response.statusCode, 200);
  const payload = response.json() as {
    ok: boolean;
    access: {
      categories: string[];
    };
  };
  assert.deepEqual(payload.access.categories, ["exercise", "nutrition"]);
  await app.close();
});

test("POST /auth/logout rejects untrusted origins", async () => {
  const app = Fastify();
  await app.register(cookie, {
    secret: "test-secret"
  });
  await registerAuthRoutes(app, testConfig, {
    authenticateWithPassword: async () => null,
    consumeLoginRateLimit: allowAllRateLimit,
    getAuthenticatedUser: async () => null,
    resolveViewerAccess: async () => ({
      subjectUserId: "user-1",
      categories: new Set(["exercise"])
    })
  });

  const response = await app.inject({
    method: "POST",
    url: "/auth/logout",
    headers: {
      origin: "https://evil.example"
    }
  });

  assert.equal(response.statusCode, 403);
  assert.equal(response.json().error, "Untrusted request origin.");
  await app.close();
});
