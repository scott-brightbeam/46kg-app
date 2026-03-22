import assert from "node:assert/strict";
import test from "node:test";

import type { AppConfig } from "../config.js";
import {
  handlePromptReply,
  sendMissedWorkoutFollowUp,
  sendNextCheckinPrompt,
  sendWeightPrompt
} from "./coaching.js";
import type { DailySummary } from "./current-state.js";

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

function buildSummary(overrides: Partial<DailySummary> = {}): DailySummary {
  return {
    date: "2026-03-15",
    timeZone: "Europe/London",
    range: {
      start: new Date("2026-03-15T00:00:00Z"),
      end: new Date("2026-03-16T00:00:00Z")
    },
    dayOfWeek: "sunday",
    calendar: {
      events: [],
      busySlots: [],
      freeSlots: []
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
    dayTemplate: null,
    freshness: [],
    ...overrides
  };
}

test("sendWeightPrompt emits a structured weight prompt", async () => {
  const result = await sendWeightPrompt(
    buildConfig(),
    {
      date: "2026-03-15",
      dryRun: true
    },
    {
      generateDailyPlan: async () => {
        throw new Error("not used");
      },
      getDailySummary: async () => {
        throw new Error("not used");
      },
      listRecentConversationMessages: async () => [],
      sendTelegramMessage: async () => ({}),
      setConversationMessageMetadata: async () => {},
      storeCheckinResponse: async () => ({ id: "checkin-1", respondedAt: new Date() }),
      storeConversationMessage: async () => ({ id: "message-1" }),
      storeDailyPlan: async () => ({
        id: "plan-1",
        planDate: new Date(),
        updatedAt: new Date()
      }),
      storeWeightEntry: async () => ({
        id: "weight-1",
        observedAt: new Date(),
        kilograms: "118.4"
      })
    }
  );

  assert.equal(result.sent, false);
  assert.match(result.text, /weight in kg/i);
});

test("sendWeightPrompt skips when the day's weight prompt was already sent", async () => {
  const result = await sendWeightPrompt(
    buildConfig(),
    {
      date: "2026-03-15",
      dryRun: true
    },
    {
      generateDailyPlan: async () => {
        throw new Error("not used");
      },
      getDailySummary: async () => {
        throw new Error("not used");
      },
      listRecentConversationMessages: async () => [
        {
          id: "prompt-1",
          messageAt: new Date("2026-03-15T07:00:00Z"),
          actor: "assistant",
          content: "Morning. Send your weight in kg. Just the number will do.",
          metadata: {
            kind: "prompt",
            promptKind: "weight",
            promptDate: "2026-03-15",
            awaitingReply: false
          }
        }
      ],
      sendTelegramMessage: async () => ({}),
      setConversationMessageMetadata: async () => {},
      storeCheckinResponse: async () => ({ id: "checkin-1", respondedAt: new Date() }),
      storeConversationMessage: async () => ({ id: "message-1" }),
      storeDailyPlan: async () => ({
        id: "plan-1",
        planDate: new Date(),
        updatedAt: new Date()
      }),
      storeWeightEntry: async () => ({
        id: "weight-1",
        observedAt: new Date(),
        kilograms: "118.4"
      })
    }
  );

  assert.equal(result.sent, false);
  assert.equal("reason" in result ? result.reason : undefined, "prompt_already_sent");
});

test("sendNextCheckinPrompt picks the first unanswered check-in field", async () => {
  const result = await sendNextCheckinPrompt(
    buildConfig(),
    {
      date: "2026-03-15",
      timeZone: "Europe/London",
      dryRun: true
    },
    {
      generateDailyPlan: async () => {
        throw new Error("not used");
      },
      getDailySummary: async () =>
        buildSummary({
          checkins: [
            {
              respondedAt: new Date("2026-03-15T08:00:00Z"),
              field: "sleep_quality",
              valueText: "fine"
            }
          ]
        }),
      listRecentConversationMessages: async () => [],
      sendTelegramMessage: async () => ({}),
      setConversationMessageMetadata: async () => {},
      storeCheckinResponse: async () => ({ id: "checkin-1", respondedAt: new Date() }),
      storeConversationMessage: async () => ({ id: "message-1" }),
      storeDailyPlan: async () => ({
        id: "plan-1",
        planDate: new Date(),
        updatedAt: new Date()
      }),
      storeWeightEntry: async () => ({
        id: "weight-1",
        observedAt: new Date(),
        kilograms: "118.4"
      })
    }
  );

  assert.equal(result.sent, false);
  assert.match(result.text, /mood today/i);
});

test("handlePromptReply stores a weight reply and resolves the prompt", async () => {
  let storedWeight: { kilograms?: unknown } | null = null;
  let updatedMetadata: { awaitingReply?: unknown } | null = null;
  const sentTexts: string[] = [];
  const assistantMessages: string[] = [];

  const result = await handlePromptReply(
    buildConfig(),
    {
      text: "118.4",
      promptDate: "2026-03-15",
      updateId: 101,
      messageId: 55
    },
    {
      generateDailyPlan: async () => {
        throw new Error("not used");
      },
      getDailySummary: async () => buildSummary(),
      listRecentConversationMessages: async () => [
        {
          id: "prompt-1",
          messageAt: new Date("2026-03-15T08:00:00Z"),
          actor: "assistant",
          content: "Morning. Send your weight in kg.",
          metadata: {
            kind: "prompt",
            promptKind: "weight",
            promptDate: "2026-03-15",
            awaitingReply: true
          }
        }
      ],
      sendTelegramMessage: async (_config, text) => {
        sentTexts.push(text);
        return {};
      },
      setConversationMessageMetadata: async (input) => {
        updatedMetadata = input.metadata as { awaitingReply?: unknown };
      },
      storeCheckinResponse: async () => ({ id: "checkin-1", respondedAt: new Date() }),
      storeConversationMessage: async (input) => {
        if (input.content) {
          assistantMessages.push(input.content);
        }
        return { id: "message-2" };
      },
      storeDailyPlan: async () => ({
        id: "plan-1",
        planDate: new Date(),
        updatedAt: new Date()
      }),
      storeWeightEntry: async (input) => {
        storedWeight = input;
        return {
          id: "weight-1",
          observedAt: new Date(),
          kilograms: "118.4"
        };
      }
    }
  );

  assert.equal(result.handled, true);
  assert.equal(result.promptKind, "weight");
  assert.equal((storedWeight as { kilograms?: unknown } | null)?.kilograms, 118.4);
  assert.ok(sentTexts.includes("Logged: 118.4 kg."));
  assert.equal((updatedMetadata as { awaitingReply?: unknown } | null)?.awaitingReply, false);
  assert.ok(sentTexts.some((message) => /sleep last night/i.test(message)));
  assert.ok(assistantMessages.some((message) => /sleep last night/i.test(message)));
});

test("sendMissedWorkoutFollowUp sends a catch-up prompt when a planned slot is overdue", async () => {
  const result = await sendMissedWorkoutFollowUp(
    buildConfig(),
    {
      date: "2026-03-15",
      now: new Date("2026-03-15T12:00:00Z"),
      dryRun: true
    },
    {
      generateDailyPlan: async () => ({
        date: "2026-03-15",
        timeZone: "Europe/London",
        dayOfWeek: "sunday",
        summary: "Sunday plan",
        workout: {
          status: "planned",
          activityType: "Strength",
          intensity: "moderate",
          suggestedStart: new Date("2026-03-15T07:00:00Z"),
          suggestedEnd: new Date("2026-03-15T08:00:00Z"),
          durationMinutes: 60,
          slotReason: "Morning slot",
          completionTitle: null,
          routineId: null,
          routineTitle: null
        },
        nutrition: {
          note: "No target",
          configured: false
        },
        recovery: {
          score: null,
          label: "unknown"
        },
        engagement: {
          status: "unknown",
          label: "unknown"
        },
        freshnessNote: "Watch sync unknown",
        coachingNote: "Do the work.",
        sourceSummary: {
          workoutsToday: 0,
          calendarEventCount: 0,
          freeSlotCount: 1
        }
      }),
      getDailySummary: async () => buildSummary(),
      listRecentConversationMessages: async () => [],
      sendTelegramMessage: async () => ({}),
      setConversationMessageMetadata: async () => {},
      storeCheckinResponse: async () => ({ id: "checkin-1", respondedAt: new Date() }),
      storeConversationMessage: async () => ({ id: "message-1" }),
      storeDailyPlan: async () => ({
        id: "plan-1",
        planDate: new Date(),
        updatedAt: new Date()
      }),
      storeWeightEntry: async () => ({
        id: "weight-1",
        observedAt: new Date(),
        kilograms: "118.4"
      })
    }
  );

  assert.equal(result.sent, false);
  assert.match(result.text, /planned slot has gone/i);
});

test("sendMissedWorkoutFollowUp reuses the stored daily plan and skips duplicate prompts", async () => {
  let generated = false;

  const result = await sendMissedWorkoutFollowUp(
    buildConfig(),
    {
      date: "2026-03-15",
      now: new Date("2026-03-15T12:00:00Z"),
      dryRun: true
    },
    {
      generateDailyPlan: async () => {
        generated = true;
        throw new Error("should not generate");
      },
      getDailySummary: async () =>
        buildSummary({
          dailyPlan: {
            id: "plan-existing",
            planDate: new Date("2026-03-15T00:00:00Z"),
            summary: "Existing plan",
            workoutPlan: {
              status: "planned",
              activityType: "Strength",
              intensity: "moderate",
              suggestedStart: "2026-03-15T07:00:00.000Z",
              suggestedEnd: "2026-03-15T08:00:00.000Z",
              durationMinutes: 60,
              slotReason: "Morning slot"
            },
            mealPlan: null,
            recoveryContext: null,
            sourceSnapshot: null,
            updatedAt: new Date("2026-03-15T06:00:00Z")
          }
        }),
      listRecentConversationMessages: async () => [
        {
          id: "prompt-2",
          messageAt: new Date("2026-03-15T10:30:00Z"),
          actor: "assistant",
          content: "The planned slot has gone. Choose one: later today, 20-minute version, or minimum-viable walk.",
          metadata: {
            kind: "prompt",
            promptKind: "missed_workout",
            promptDate: "2026-03-15",
            awaitingReply: false
          }
        }
      ],
      sendTelegramMessage: async () => ({}),
      setConversationMessageMetadata: async () => {},
      storeCheckinResponse: async () => ({ id: "checkin-1", respondedAt: new Date() }),
      storeConversationMessage: async () => ({ id: "message-1" }),
      storeDailyPlan: async () => ({
        id: "plan-1",
        planDate: new Date(),
        updatedAt: new Date()
      }),
      storeWeightEntry: async () => ({
        id: "weight-1",
        observedAt: new Date(),
        kilograms: "118.4"
      })
    }
  );

  assert.equal(generated, false);
  assert.equal(result.sent, false);
  assert.equal("reason" in result ? result.reason : undefined, "prompt_already_sent");
});

test("handlePromptReply chains the next check-in prompt after a check-in answer", async () => {
  const sentTexts: string[] = [];

  const result = await handlePromptReply(
    buildConfig(),
    {
      text: "steady",
      promptDate: "2026-03-15",
      updateId: 102,
      messageId: 56
    },
    {
      generateDailyPlan: async () => {
        throw new Error("not used");
      },
      getDailySummary: async () => buildSummary(),
      listRecentConversationMessages: async () => [
        {
          id: "prompt-2",
          messageAt: new Date("2026-03-15T08:10:00Z"),
          actor: "assistant",
          content: "How is your mood today?",
          metadata: {
            kind: "prompt",
            promptKind: "checkin",
            promptDate: "2026-03-15",
            field: "mood",
            awaitingReply: true
          }
        }
      ],
      sendTelegramMessage: async (_config, text) => {
        sentTexts.push(text);
        return {};
      },
      setConversationMessageMetadata: async () => {},
      storeCheckinResponse: async () => ({ id: "checkin-2", respondedAt: new Date() }),
      storeConversationMessage: async () => ({ id: "message-3" }),
      storeDailyPlan: async () => ({
        id: "plan-1",
        planDate: new Date(),
        updatedAt: new Date()
      }),
      storeWeightEntry: async () => ({
        id: "weight-1",
        observedAt: new Date(),
        kilograms: "118.4"
      })
    }
  );

  assert.equal(result.handled, true);
  assert.equal(result.promptKind, "checkin");
  assert.match(result.followUpText ?? "", /Stress today/i);
  assert.ok(sentTexts.includes("Noted."));
  assert.ok(sentTexts.some((text) => /Stress today/i.test(text)));
});

test("handlePromptReply stores an adjusted plan after a missed-workout reply", async () => {
  let storedPlan: Record<string, unknown> | null = null;

  const result = await handlePromptReply(
    buildConfig(),
    {
      text: "20-minute version",
      promptDate: "2026-03-15",
      updateId: 103,
      messageId: 57
    },
    {
      generateDailyPlan: async () => {
        throw new Error("not used");
      },
      getDailySummary: async () =>
        buildSummary({
          timeZone: "Europe/London",
          calendar: {
            events: [],
            busySlots: [],
            freeSlots: [
              {
                start: new Date(Date.now() + (30 * 60 * 1000)),
                end: new Date(Date.now() + (70 * 60 * 1000)),
                durationMinutes: 40
              }
            ]
          },
          dailyPlan: {
            id: "plan-existing",
            planDate: new Date("2026-03-15T00:00:00Z"),
            summary: "Original plan",
            workoutPlan: {
              activityType: "Strength",
              intensity: "moderate",
              durationMinutes: 40
            },
            mealPlan: null,
            recoveryContext: null,
            sourceSnapshot: null,
            updatedAt: new Date()
          }
        }),
      listRecentConversationMessages: async () => [
        {
          id: "prompt-3",
          messageAt: new Date("2026-03-15T09:00:00Z"),
          actor: "assistant",
          content: "The planned slot has gone.",
          metadata: {
            kind: "prompt",
            promptKind: "missed_workout",
            promptDate: "2026-03-15",
            awaitingReply: true
          }
        }
      ],
      sendTelegramMessage: async () => ({}),
      setConversationMessageMetadata: async () => {},
      storeCheckinResponse: async () => ({ id: "checkin-1", respondedAt: new Date() }),
      storeConversationMessage: async () => ({ id: "message-4" }),
      storeDailyPlan: async (input) => {
        storedPlan = input as unknown as Record<string, unknown>;
        return {
          id: "plan-2",
          planDate: input.planDate,
          updatedAt: new Date()
        };
      },
      storeWeightEntry: async () => ({
        id: "weight-1",
        observedAt: new Date(),
        kilograms: "118.4"
      })
    }
  );

  assert.equal(result.handled, true);
  assert.equal(result.promptKind, "missed_workout");
  assert.ok(storedPlan);
  const workoutPlan = (storedPlan as { workoutPlan?: Record<string, unknown> } | null)?.workoutPlan;
  assert.equal(workoutPlan?.durationMinutes, 20);
  assert.equal(workoutPlan?.status, "minimum_viable");
});
