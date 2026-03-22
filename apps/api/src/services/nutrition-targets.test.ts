import assert from "node:assert/strict";
import test from "node:test";

import type { AppConfig } from "../config.js";
import {
  buildDailyNutritionBudget,
  getNutritionTargetState,
  handleNutritionTargetCommand,
  updateNutritionTargets
} from "./nutrition-targets.js";

function buildConfig(): AppConfig {
  return {
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
}

test("getNutritionTargetState falls back to configured defaults when no stored targets exist", async () => {
  const result = await getNutritionTargetState(buildConfig(), {
    getLatestNutritionTargets: async () => null
  });

  assert.deepEqual(result.targets, {
    calories: 2400,
    protein: 180,
    fibre: 30
  });
  assert.equal(result.source, "default");
});

test("updateNutritionTargets stores overrides and returns the latest state", async () => {
  const stored: Array<Record<string, unknown>> = [];

  const result = await updateNutritionTargets(
    buildConfig(),
    {
      calories: 2200,
      protein: 190
    },
    {
      getLatestNutritionTargets: async () => ({
        id: "target-1",
        calories: "2200.00",
        protein: "190.00",
        fibre: "30.00",
        notes: null,
        updatedAt: new Date("2026-03-15T12:00:00Z")
      }),
      storeNutritionTargets: async (input) => {
        stored.push(input as unknown as Record<string, unknown>);
        return {
          id: "target-1",
          updatedAt: new Date("2026-03-15T12:00:00Z")
        };
      }
    }
  );

  assert.equal(stored.length, 1);
  assert.equal(stored[0]?.calories, 2200);
  assert.equal(result.targets.protein, 190);
  assert.match(result.responseText, /2200 kcal/i);
});

test("buildDailyNutritionBudget returns null when no targets are configured", () => {
  const budget = buildDailyNutritionBudget(
    {
      calories: null,
      protein: null,
      fibre: null
    },
    {
      calories: 600,
      protein: 40,
      fibre: 12
    }
  );

  assert.equal(budget, null);
});

test("handleNutritionTargetCommand lists and updates targets via Telegram-style commands", async () => {
  const sent: string[] = [];
  const storedConversation: string[] = [];

  const listResult = await handleNutritionTargetCommand(
    buildConfig(),
    {
      text: "show nutrition targets"
    },
    {
      getLatestNutritionTargets: async () => null,
      sendTelegramMessage: async (_config, text) => {
        sent.push(text);
        return {};
      },
      storeConversationMessage: async (input) => {
        storedConversation.push(input.content ?? "");
        return { id: "message-1" };
      },
      storeNutritionTargets: async () => {
        throw new Error("not expected");
      }
    }
  );

  assert.equal(listResult.handled, true);
  assert.match(sent[0] ?? "", /Current nutrition targets:/);

  sent.length = 0;
  storedConversation.length = 0;

  const setResult = await handleNutritionTargetCommand(
    buildConfig(),
    {
      text: "set nutrition targets to 2300 calories 190 protein 35 fibre"
    },
    {
      getLatestNutritionTargets: async () => ({
        id: "target-2",
        calories: "2300.00",
        protein: "190.00",
        fibre: "35.00",
        notes: null,
        updatedAt: new Date("2026-03-15T12:00:00Z")
      }),
      sendTelegramMessage: async (_config, text) => {
        sent.push(text);
        return {};
      },
      storeConversationMessage: async (input) => {
        storedConversation.push(input.content ?? "");
        return { id: "message-2" };
      },
      storeNutritionTargets: async () => ({
        id: "target-2",
        updatedAt: new Date("2026-03-15T12:00:00Z")
      })
    }
  );

  assert.equal(setResult.handled, true);
  assert.match(sent[0] ?? "", /Done\. Targets are now 2300 kcal/i);
  assert.equal(storedConversation.length, 1);
});
