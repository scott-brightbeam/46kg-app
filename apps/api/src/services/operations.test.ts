import assert from "node:assert/strict";
import test from "node:test";

import type { AppConfig } from "../config.js";
import { buildOperatorStatus, runTrackedJob } from "./operations.js";

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
    TELEGRAM_ALERT_CHAT_ID: "999",
    ENABLE_OPERATOR_ALERTS: true,
    HEALTH_AUTO_EXPORT_SHARED_SECRET: "health",
    HEVY_API_KEY: "hevy",
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

test("buildOperatorStatus classifies stale sources and failed jobs", async () => {
  const status = await buildOperatorStatus(buildConfig(), {
    finishJobRun: async () => ({}) as never,
    getOperatorAlertByKey: async () => null,
    listOperatorAlerts: async () => [
      {
        alertKey: "job:hevy-sync:failure",
        category: "integration",
        severity: "critical",
        status: "open",
        summary: "Hevy sync failed.",
        details: "boom",
        metadata: null,
        firstRaisedAt: new Date("2026-03-16T06:00:00.000Z"),
        lastRaisedAt: new Date("2026-03-16T06:00:00.000Z"),
        lastNotifiedAt: new Date("2026-03-16T06:05:00.000Z"),
        notificationCount: 1,
        resolvedAt: null,
        updatedAt: new Date("2026-03-16T06:05:00.000Z"),
        id: "alert-1"
      }
    ],
    listRecentJobRuns: async () => [
      {
        id: "job-1",
        jobName: "coaching-rhythm",
        trigger: "cron",
        status: "succeeded",
        startedAt: new Date(),
        finishedAt: new Date(),
        durationMs: 1000,
        summary: "Done",
        errorMessage: null,
        metadata: null,
        updatedAt: new Date()
      },
      {
        id: "job-2",
        jobName: "hevy-sync",
        trigger: "cron",
        status: "failed",
        startedAt: new Date(),
        finishedAt: new Date(),
        durationMs: 1000,
        summary: "Failed",
        errorMessage: "boom",
        metadata: null,
        updatedAt: new Date()
      }
    ],
    listSourceFreshnessRows: async () => [
      {
        source: "health_auto_export",
        lastSuccessfulIngestAt: new Date(Date.now() - 12 * 60 * 60 * 1000),
        lastAttemptedIngestAt: new Date(Date.now() - 12 * 60 * 60 * 1000),
        lastStatus: "success",
        lastError: null,
        metadata: null,
        updatedAt: new Date()
      },
      {
        source: "hevy",
        lastSuccessfulIngestAt: new Date(),
        lastAttemptedIngestAt: new Date(),
        lastStatus: "success",
        lastError: null,
        metadata: null,
        updatedAt: new Date()
      }
    ],
    resolveOperatorAlert: async () => false,
    sendTelegramMessageToChat: async () => ({}),
    startJobRun: async () => ({ id: "job-0", startedAt: new Date() }),
    upsertOperatorAlert: async () => ({}) as never
  });

  assert.equal(status.overallStatus, "critical");
  assert.equal(status.sources.find((item) => item.key === "health_auto_export")?.status, "warning");
  assert.equal(status.jobs.find((item) => item.key === "hevy-sync")?.status, "critical");
  assert.equal(status.alerts.length, 1);
});

test("runTrackedJob records failure and sends a dedupable operator alert", async () => {
  let finishedStatus: string | null = null;
  let notified = false;

  await assert.rejects(async () =>
    runTrackedJob(
      buildConfig(),
      {
        jobName: "hevy-sync",
        trigger: "cron",
        failureAlertKey: "job:hevy-sync:failure",
        failureSummary: "Hevy sync failed.",
        failureCategory: "integration"
      },
      async () => {
        throw new Error("boom");
      },
      {
        finishJobRun: async (input) => {
          finishedStatus = input.status;
          return {} as never;
        },
        getOperatorAlertByKey: async () => null,
        listOperatorAlerts: async () => [],
        listRecentJobRuns: async () => [],
        listSourceFreshnessRows: async () => [],
        resolveOperatorAlert: async () => false,
        sendTelegramMessageToChat: async () => {
          notified = true;
          return {};
        },
        startJobRun: async () => ({
          id: "job-1",
          startedAt: new Date("2026-03-16T09:00:00.000Z")
        }),
        upsertOperatorAlert: async () => ({}) as never
      }
    )
  );

  assert.equal(finishedStatus, "failed");
  assert.equal(notified, true);
});
