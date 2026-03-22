import assert from "node:assert/strict";
import test from "node:test";

import type { AppConfig } from "../config.js";
import {
  extractQuickLog,
  fallbackEstimateMealFromDescription,
  handleMealLoggingMessage,
  looksLikeMealLoggingMessage
} from "./nutrition.js";

const testConfig: AppConfig = {
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

test("extractQuickLog parses calorie-first quick logs cleanly", () => {
  const result = extractQuickLog("650 cals for lunch");

  assert.deepEqual(result, {
    description: "Lunch",
    ingredients: [],
    calories: 650,
    protein: null,
    carbs: null,
    fat: null,
    fibre: null,
    confidence: 0.95,
    reviewQuestions: [],
    method: "quick_log",
    strategy: "quick_log"
  });
});

test("extractQuickLog parses meal-first quick logs cleanly", () => {
  const result = extractQuickLog("dinner was about 820 calories");

  assert.deepEqual(result, {
    description: "Dinner",
    ingredients: [],
    calories: 820,
    protein: null,
    carbs: null,
    fat: null,
    fibre: null,
    confidence: 0.95,
    reviewQuestions: [],
    method: "quick_log",
    strategy: "quick_log"
  });
});

test("looksLikeMealLoggingMessage recognizes likely nutrition inputs", () => {
  assert.equal(looksLikeMealLoggingMessage("ate chicken wrap and crisps"), true);
  assert.equal(looksLikeMealLoggingMessage("lunch was 650 cals"), true);
  assert.equal(looksLikeMealLoggingMessage("what happened to Thursday"), false);
});

test("handleMealLoggingMessage stores quick logs and sends an acknowledgement", async () => {
  let sentText: string | null = null;
  let storedDescription: string | null = null;
  let storedMethod: string | null = null;
  let storedCalories: number | null = null;

  const result = await handleMealLoggingMessage(
    testConfig,
    {
      text: "lunch was 650 cals",
      messageDate: new Date("2026-03-15T12:30:00Z")
    },
    {
      estimateMealFromText: async () => ({
        description: "Lunch",
        ingredients: [],
        calories: 650,
        protein: null,
        carbs: null,
        fat: null,
        fibre: null,
        confidence: 0.95,
        reviewQuestions: [],
        method: "quick_log"
      }),
      getDailySummary: async () => ({
        meals: {
          entries: [{ id: "meal-1" }],
          totals: {
            calories: 650,
            protein: 0,
            carbs: 0,
            fat: 0,
            fibre: 0
          }
        }
      }) as any,
      sendTelegramMessage: async (_config, text) => {
        sentText = text;
        return {};
      },
      storeConversationMessage: async () => ({ id: "message-1" }),
      storeMealLog: async (input) => {
        storedDescription = input.description;
        storedMethod = input.method;
        storedCalories = input.calories;
        return {
          id: "meal-1",
          loggedAt: input.loggedAt ?? new Date(),
          description: input.description,
          calories: String(input.calories),
          method: input.method
        };
      }
    }
  );

  assert.equal(result.handled, true);
  assert.equal(result.storedMealId, "meal-1");
  assert.equal(storedDescription, "Lunch");
  assert.equal(storedMethod, "quick_log");
  assert.equal(storedCalories, 650);
  assert.match(sentText ?? "", /Logged: Lunch\. 650 kcal\./);
  assert.match(sentText ?? "", /Day total now 650 kcal across 1 meal/);
  assert.match(sentText ?? "", /Quick log\./);
});

test("handleMealLoggingMessage uses estimated text meals when heuristics say it is food", async () => {
  let storedPayload: Record<string, unknown> | null = null;

  const result = await handleMealLoggingMessage(
    testConfig,
    {
      text: "ate chicken wrap and crisps"
    },
    {
      estimateMealFromText: async () => ({
        description: "Chicken wrap and crisps",
        ingredients: [
          {
            name: "Chicken wrap",
            quantityDescription: null,
            calories: 430,
            protein: 30,
            carbs: 35,
            fat: 18,
            fibre: 3,
            confidence: 0.72
          },
          {
            name: "Crisps",
            quantityDescription: null,
            calories: 160,
            protein: 2,
            carbs: 15,
            fat: 10,
            fibre: 1,
            confidence: 0.72
          }
        ],
        calories: 740,
        protein: 32,
        carbs: 78,
        fat: 31,
        fibre: 7,
        confidence: 0.72,
        reviewQuestions: [],
        method: "text"
      }),
      getDailySummary: async () => ({
        meals: {
          entries: [{ id: "meal-2" }, { id: "meal-previous" }],
          totals: {
            calories: 1140,
            protein: 50,
            carbs: 78,
            fat: 31,
            fibre: 7
          }
        }
      }) as any,
      sendTelegramMessage: async () => ({}),
      storeConversationMessage: async () => ({ id: "message-2" }),
      storeMealLog: async (input) => {
        storedPayload = input.sourcePayload ?? null;
        return {
          id: "meal-2",
          loggedAt: input.loggedAt ?? new Date(),
          description: input.description,
          calories: String(input.calories),
          method: input.method
        };
      }
    }
  );

  assert.equal(result.handled, true);
  assert.equal(result.storedMealId, "meal-2");
  assert.deepEqual(storedPayload, {
    sourceText: "ate chicken wrap and crisps",
    estimationMethod: "text",
    estimationStrategy: "text",
    ingredients: [
      {
        name: "Chicken wrap",
        quantityDescription: null,
        calories: 430,
        protein: 30,
        carbs: 35,
        fat: 18,
        fibre: 3,
        confidence: 0.72
      },
      {
        name: "Crisps",
        quantityDescription: null,
        calories: 160,
        protein: 2,
        carbs: 15,
        fat: 10,
        fibre: 1,
        confidence: 0.72
      }
    ],
    reviewQuestions: []
  });
  assert.match(result.responseText ?? "", /Confidence 72%/);
});

test("fallbackEstimateMealFromDescription produces a usable low-confidence estimate", () => {
  const result = fallbackEstimateMealFromDescription(
    "ate a chicken caesar wrap and a packet of ready salted crisps"
  );

  assert.ok(result);
  assert.equal(result?.description, "A chicken caesar wrap and a packet of ready salted crisps");
  assert.equal(result?.calories, 680);
  assert.equal(result?.strategy, "heuristic");
});

test("handleMealLoggingMessage falls back to heuristics when AI estimation fails", async () => {
  let sentText: string | null = null;

  const result = await handleMealLoggingMessage(
    testConfig,
    {
      text: "ate a chicken caesar wrap and a packet of ready salted crisps"
    },
    {
      estimateMealFromText: async () => {
        throw new Error("invalid api key");
      },
      getDailySummary: async () => ({
        meals: {
          entries: [{ id: "meal-heuristic" }],
          totals: {
            calories: 680,
            protein: 30,
            carbs: 57,
            fat: 34,
            fibre: 5
          }
        }
      }) as any,
      sendTelegramMessage: async (_config, text) => {
        sentText = text;
        return {};
      },
      storeConversationMessage: async () => ({ id: "message-heuristic" }),
      storeMealLog: async (input) => ({
        id: "meal-heuristic",
        loggedAt: input.loggedAt ?? new Date(),
        description: input.description,
        calories: String(input.calories),
        method: input.method
      })
    }
  );

  assert.equal(result.handled, true);
  assert.equal(result.storedMealId, "meal-heuristic");
  assert.match(sentText ?? "", /Rough estimate/i);
  assert.match(sentText ?? "", /680 kcal/i);
  assert.match(sentText ?? "", /Day total now 680 kcal across 1 meal/);
});

test("handleMealLoggingMessage replies gracefully when estimation fails", async () => {
  let sentText: string | null = null;

  const result = await handleMealLoggingMessage(
    testConfig,
    {
      text: "ate something from the station"
    },
    {
      estimateMealFromText: async () => {
        throw new Error("bad estimate");
      },
      getDailySummary: async () => {
        throw new Error("should not be called");
      },
      sendTelegramMessage: async (_config, text) => {
        sentText = text;
        return {};
      },
      storeConversationMessage: async () => ({ id: "message-3" }),
      storeMealLog: async () => {
        throw new Error("should not be called");
      }
    }
  );

  assert.equal(result.handled, true);
  assert.equal(result.storedMealId, null);
  assert.match(sentText ?? "", /I couldn't pin that meal down/i);
});
