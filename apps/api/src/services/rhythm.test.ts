import assert from "node:assert/strict";
import test from "node:test";

import type { AppConfig } from "../config.js";
import { runCoachingRhythm } from "./rhythm.js";

function buildConfig(): AppConfig {
  return {
    NODE_ENV: "test",
    APP_TIME_ZONE: "Europe/London",
    API_PORT: 3001,
    API_BASE_URL: "http://localhost:3001",
    WEB_BASE_URL: "http://localhost:3000",
    DATABASE_URL: "postgres://example",
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
}

test("runCoachingRhythm triggers the morning brief and weekly weight prompt on Sunday at 07:00", async () => {
  const called: string[] = [];

  const result = await runCoachingRhythm(
    buildConfig(),
    {
      now: new Date("2026-03-15T07:00:00Z"),
      timeZone: "Europe/London",
      dryRun: true
    },
    {
      refreshDailySignals: async () => ({
        date: "2026-03-15",
        timeZone: "Europe/London",
        scores: {} as never,
        engagementStatus: {
          status: "green",
          reasons: [],
          indicators: {}
        }
      }),
      sendMorningBrief: async (_config, input) => {
        called.push(`morning:${input.date}`);
        return {
          plan: { summary: "Plan" },
          text: "Brief",
          skipped: false
        } as Awaited<ReturnType<(typeof import("./planning.js"))["sendMorningBrief"]>>;
      },
      sendWeightPrompt: async (_config, input) => {
        called.push(`weight:${input.date}`);
        return {
          sent: false,
          text: "Weight"
        };
      },
      sendNextCheckinPrompt: async () => {
        called.push("checkin");
        return {
          sent: false,
          text: ""
        };
      },
      sendMissedWorkoutFollowUp: async () => {
        called.push("missed");
        return {
          sent: false,
          text: ""
        };
      }
    }
  );

  assert.equal(result.date, "2026-03-15");
  assert.deepEqual(called, ["morning:2026-03-15", "weight:2026-03-15"]);
});

test("runCoachingRhythm triggers check-in and missed-workout follow-up during the daytime rhythm", async () => {
  const called: string[] = [];

  const result = await runCoachingRhythm(
    buildConfig(),
    {
      now: new Date("2026-03-16T13:00:00Z"),
      timeZone: "Europe/London",
      dryRun: true
    },
    {
      refreshDailySignals: async () => ({
        date: "2026-03-16",
        timeZone: "Europe/London",
        scores: {} as never,
        engagementStatus: {
          status: "green",
          reasons: [],
          indicators: {}
        }
      }),
      sendMorningBrief: async () => {
        called.push("morning");
        return {
          plan: { summary: "Plan" },
          text: "Brief",
          skipped: false
        } as Awaited<ReturnType<(typeof import("./planning.js"))["sendMorningBrief"]>>;
      },
      sendWeightPrompt: async () => {
        called.push("weight");
        return {
          sent: false,
          text: ""
        };
      },
      sendNextCheckinPrompt: async (_config, input) => {
        called.push(`checkin:${input.date}`);
        return {
          sent: false,
          text: "Check-in"
        };
      },
      sendMissedWorkoutFollowUp: async (_config, input) => {
        called.push(`missed:${input.date}`);
        return {
          sent: false,
          text: "Follow-up"
        };
      }
    }
  );

  assert.equal(result.date, "2026-03-16");
  assert.deepEqual(called, ["checkin:2026-03-16", "missed:2026-03-16"]);
});

test("runCoachingRhythm no-ops outside the configured windows", async () => {
  const called: string[] = [];

  const result = await runCoachingRhythm(
    buildConfig(),
    {
      now: new Date("2026-03-16T09:00:00Z"),
      timeZone: "Europe/London",
      dryRun: true
    },
    {
      refreshDailySignals: async () => ({
        date: "2026-03-16",
        timeZone: "Europe/London",
        scores: {} as never,
        engagementStatus: {
          status: "green",
          reasons: [],
          indicators: {}
        }
      }),
      sendMorningBrief: async () => {
        called.push("morning");
        throw new Error("not expected");
      },
      sendWeightPrompt: async () => {
        called.push("weight");
        throw new Error("not expected");
      },
      sendNextCheckinPrompt: async () => {
        called.push("checkin");
        throw new Error("not expected");
      },
      sendMissedWorkoutFollowUp: async () => {
        called.push("missed");
        throw new Error("not expected");
      }
    }
  );

  assert.equal(result.date, "2026-03-16");
  assert.deepEqual(called, []);
  assert.deepEqual(result.actions, {});
});
