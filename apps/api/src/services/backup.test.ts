import assert from "node:assert/strict";
import test from "node:test";

import type { AppConfig } from "../config.js";
import { runNightlyBackup } from "./backup.js";

function buildConfig(overrides: Partial<AppConfig> = {}): AppConfig {
  return {
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
    BACKUP_S3_FORCE_PATH_STYLE: false,
    ...overrides
  };
}

test("runNightlyBackup skips cleanly when backup config is absent", async () => {
  const result = await runNightlyBackup(buildConfig(), {
    createS3Client: () => {
      throw new Error("not expected");
    },
    now: () => new Date("2026-03-16T09:00:00.000Z"),
    runPgDump: async () => {
      throw new Error("not expected");
    },
    uploadObject: async () => {
      throw new Error("not expected");
    }
  });

  assert.deepEqual(result, {
    skipped: true,
    reason: "backup_not_configured"
  });
});

test("runNightlyBackup compresses and uploads the pg_dump output", async () => {
  const uploads: Array<{ bucket: string; key: string; size: number }> = [];
  const result = await runNightlyBackup(
    buildConfig({
      BACKUP_S3_BUCKET: "backups",
      BACKUP_S3_REGION: "eu-west-2",
      BACKUP_S3_ACCESS_KEY_ID: "key",
      BACKUP_S3_SECRET_ACCESS_KEY: "secret",
      BACKUP_S3_PREFIX: "nightly"
    }),
    {
      createS3Client: () => ({}) as never,
      now: () => new Date("2026-03-16T09:00:00.000Z"),
      runPgDump: async () => Buffer.from("select 1;\n"),
      uploadObject: async (input) => {
        uploads.push({
          bucket: input.bucket,
          key: input.key,
          size: input.body.length
        });
      }
    }
  );

  assert.equal(result.skipped, false);
  assert.equal(uploads.length, 1);
  assert.equal(uploads[0]?.bucket, "backups");
  assert.match(uploads[0]?.key ?? "", /^nightly\/46kg-2026-03-16T09-00-00\.000Z\.sql\.gz$/);
  assert.ok((uploads[0]?.size ?? 0) > 0);
});
