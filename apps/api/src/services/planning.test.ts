import assert from "node:assert/strict";
import test from "node:test";

import type { AppConfig } from "../config.js";
import { generateDailyPlan, renderMorningBrief, sendMorningBrief } from "./planning.js";
import type { DailySummary } from "./current-state.js";

function buildSummary(overrides: Partial<DailySummary> = {}): DailySummary {
  return {
    date: "2026-03-17",
    timeZone: "Europe/London",
    range: {
      start: new Date("2026-03-17T00:00:00Z"),
      end: new Date("2026-03-18T00:00:00Z")
    },
    dayOfWeek: "tuesday",
    calendar: {
      events: [],
      busySlots: [],
      freeSlots: [
        {
          start: new Date("2026-03-17T07:00:00Z"),
          end: new Date("2026-03-17T08:00:00Z"),
          durationMinutes: 60
        },
        {
          start: new Date("2026-03-17T18:00:00Z"),
          end: new Date("2026-03-17T18:30:00Z"),
          durationMinutes: 30
        }
      ]
    },
    workouts: [],
    meals: {
      entries: [],
      totals: {
        calories: 0,
        protein: 0,
        carbs: 0,
        fat: 0,
        fibre: 0
      }
    },
    checkins: [],
    scores: {},
    latestWeight: null,
    engagementStatus: null,
    dailyPlan: null,
    dayTemplate: {
      dayOfWeek: "tuesday",
      activityType: "PT session",
      intensity: "intense",
      preferredTime: "morning",
      notes: "Trainer session",
      hevyRoutineId: null,
      hevyRoutineTitle: null
    },
    freshness: [
      {
        source: "health_auto_export",
        lastSuccessfulIngestAt: new Date("2026-03-17T06:10:00Z"),
        lastAttemptedIngestAt: new Date("2026-03-17T06:10:00Z"),
        lastStatus: "success",
        lastError: null,
        metadata: null
      }
    ],
    ...overrides
  };
}

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

test("generateDailyPlan picks the preferred morning slot and stores a plan", async () => {
  const stored: Array<Record<string, unknown>> = [];

  const plan = await generateDailyPlan(
    {
      date: "2026-03-17",
      timeZone: "Europe/London"
    },
    {
      getDailySummary: async () =>
        buildSummary({
          scores: {
            recovery: {
              scoreType: "recovery",
              value: 78,
              confidence: 0.9,
              formulaVersion: "v1",
              scoreDate: new Date("2026-03-17T05:00:00Z"),
              provenance: {}
            }
          },
          engagementStatus: {
            effectiveAt: new Date("2026-03-16T20:00:00Z"),
            status: "green",
            reasons: ["normal"]
          }
        }),
      storeDailyPlan: async (input) => {
        stored.push(input as unknown as Record<string, unknown>);
        return {
          id: "plan-1",
          planDate: input.planDate,
          updatedAt: new Date("2026-03-17T06:00:00Z")
        };
      }
    }
  );

  assert.equal(plan.workout.status, "planned");
  assert.equal(plan.workout.suggestedStart?.toISOString(), "2026-03-17T07:00:00.000Z");
  assert.equal(plan.workout.durationMinutes, 60);
  assert.match(plan.coachingNote, /planned session/i);
  assert.equal(stored.length, 1);
});

test("generateDailyPlan downgrades to minimum viable when engagement is amber and slot is short", async () => {
  const plan = await generateDailyPlan(
    {
      date: "2026-03-17",
      timeZone: "Europe/London"
    },
    {
      getDailySummary: async () =>
        buildSummary({
          calendar: {
            events: [],
            busySlots: [],
            freeSlots: [
              {
                start: new Date("2026-03-17T18:00:00Z"),
                end: new Date("2026-03-17T18:20:00Z"),
                durationMinutes: 20
              }
            ]
          },
          scores: {
            recovery: {
              scoreType: "recovery",
              value: 49,
              confidence: 0.8,
              formulaVersion: "v1",
              scoreDate: new Date("2026-03-17T05:00:00Z"),
              provenance: {}
            }
          },
          engagementStatus: {
            effectiveAt: new Date("2026-03-16T20:00:00Z"),
            status: "amber",
            reasons: ["missed workout"]
          }
        }),
      storeDailyPlan: async () => ({
        id: "plan-2",
        planDate: new Date("2026-03-17T00:00:00Z"),
        updatedAt: new Date("2026-03-17T06:00:00Z")
      })
    }
  );

  assert.equal(plan.workout.status, "minimum_viable");
  assert.equal(plan.workout.intensity, "light");
  assert.equal(plan.workout.durationMinutes, 20);
  assert.match(plan.coachingNote, /small target|quality|smallest/i);
});

test("generateDailyPlan uses stored nutrition targets when provided", async () => {
  const plan = await generateDailyPlan(
    {
      date: "2026-03-17",
      timeZone: "Europe/London",
      config: buildConfig()
    },
    {
      getDailySummary: async () => buildSummary(),
      getNutritionTargetState: async () => ({
        targets: {
          calories: 2200,
          protein: 190,
          fibre: 35
        },
        source: "stored",
        notes: null,
        updatedAt: new Date("2026-03-17T06:00:00Z")
      }),
      storeDailyPlan: async () => ({
        id: "plan-2b",
        planDate: new Date("2026-03-17T00:00:00Z"),
        updatedAt: new Date("2026-03-17T06:00:00Z")
      })
    }
  );

  assert.equal(plan.nutrition.configured, true);
  assert.match(plan.nutrition.note, /2200 kcal/i);
  assert.match(plan.nutrition.note, /190g protein/i);
});

test("generateDailyPlan prefers the linked Hevy routine title in the workout plan", async () => {
  const plan = await generateDailyPlan(
    {
      date: "2026-03-17",
      timeZone: "Europe/London"
    },
    {
      getDailySummary: async () =>
        buildSummary({
          dayTemplate: {
            dayOfWeek: "tuesday",
            activityType: "Strength session",
            intensity: "intense",
            preferredTime: "morning",
            notes: "Use Hevy routine",
            hevyRoutineId: "routine-123",
            hevyRoutineTitle: "30kg Full-Body Barbell Circuit"
          }
        }),
      storeDailyPlan: async () => ({
        id: "plan-hevy-1",
        planDate: new Date("2026-03-17T00:00:00Z"),
        updatedAt: new Date("2026-03-17T06:00:00Z")
      })
    }
  );

  assert.equal(plan.workout.activityType, "30kg Full-Body Barbell Circuit");
  assert.equal(plan.workout.routineId, "routine-123");
  assert.equal(plan.workout.routineTitle, "30kg Full-Body Barbell Circuit");
});

test("sendMorningBrief dry run returns text without sending Telegram", async () => {
  let sent = false;
  let logged = false;

  const result = await sendMorningBrief(
    buildConfig(),
    {
      date: "2026-03-17",
      timeZone: "Europe/London",
      dryRun: true
    },
    {
      getDailySummary: async () => buildSummary(),
      listRecentConversationMessages: async () => [],
      refreshDailySignals: async () => ({
        date: "2026-03-17",
        timeZone: "Europe/London",
        scores: {} as never,
        engagementStatus: {
          status: "green",
          reasons: [],
          indicators: {}
        }
      }),
      storeDailyPlan: async () => ({
        id: "plan-3",
        planDate: new Date("2026-03-17T00:00:00Z"),
        updatedAt: new Date("2026-03-17T06:00:00Z")
      }),
      sendTelegramMessage: async () => {
        sent = true;
        return {};
      },
      storeConversationMessage: async () => {
        logged = true;
        return { id: "message-1" };
      }
    }
  );

  assert.equal(sent, false);
  assert.equal(logged, false);
  assert.match(result.text, /Workout:/);
  assert.match(renderMorningBrief(result.plan), /Nutrition:/);
});

test("sendMorningBrief skips when one has already been logged for the day", async () => {
  let sent = false;
  let logged = false;

  const result = await sendMorningBrief(
    buildConfig(),
    {
      date: "2026-03-17",
      timeZone: "Europe/London"
    },
    {
      getDailySummary: async () => buildSummary(),
      listRecentConversationMessages: async () => [
        {
          id: "message-1",
          messageAt: new Date("2026-03-17T07:00:00Z"),
          actor: "assistant",
          content: "Tuesday. Here is the shape of the day.",
          metadata: {
            kind: "morning_brief",
            planDate: "2026-03-17"
          }
        }
      ],
      refreshDailySignals: async () => ({
        date: "2026-03-17",
        timeZone: "Europe/London",
        scores: {} as never,
        engagementStatus: {
          status: "green",
          reasons: [],
          indicators: {}
        }
      }),
      storeDailyPlan: async () => ({
        id: "plan-4",
        planDate: new Date("2026-03-17T00:00:00Z"),
        updatedAt: new Date("2026-03-17T06:00:00Z")
      }),
      sendTelegramMessage: async () => {
        sent = true;
        return {};
      },
      storeConversationMessage: async () => {
        logged = true;
        return { id: "message-2" };
      }
    }
  );

  assert.equal(result.skipped, true);
  assert.equal(sent, false);
  assert.equal(logged, false);
});
