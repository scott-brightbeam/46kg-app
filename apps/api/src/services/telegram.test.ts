import assert from "node:assert/strict";
import test from "node:test";

import type { TelegramUpdate } from "@codex/shared";

import type { AppConfig } from "../config.js";
import { handleTelegramUpdate } from "./telegram.js";

const sampleUpdate: TelegramUpdate = {
  update_id: 99,
  message: {
    message_id: 12,
    date: 1_710_000_000,
    text: "Morning"
  }
};

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

test("handleTelegramUpdate short-circuits duplicate updates", async () => {
  let storedConversation = false;
  let freshnessUpdated = false;

  const result = await handleTelegramUpdate(sampleUpdate, testConfig, {
    async handleAccessGrantCommand() {
      return { handled: false };
    },
    async handleDayTemplateCommand() {
      return { handled: false };
    },
    async handleNutritionTargetCommand() {
      return { handled: false };
    },
    async handleMealLoggingMessage() {
      return { handled: false };
    },
    async handlePromptReply() {
      return { handled: false };
    },
    async recordProcessedUpdate() {
      return { created: false };
    },
    async storeConversationMessage() {
      storedConversation = true;
      return { id: "message-1" };
    },
    async updateSourceFreshness() {
      freshnessUpdated = true;
    }
  });

  assert.equal(result.duplicate, true);
  assert.equal(storedConversation, false);
  assert.equal(freshnessUpdated, false);
});

test("handleTelegramUpdate stores non-duplicate text messages", async () => {
  let storedText: string | null = null;
  let freshnessUpdateId: number | null = null;

  const result = await handleTelegramUpdate(sampleUpdate, testConfig, {
    async handleAccessGrantCommand() {
      return { handled: false };
    },
    async handleDayTemplateCommand() {
      return { handled: false };
    },
    async handleNutritionTargetCommand() {
      return { handled: false };
    },
    async handleMealLoggingMessage() {
      return { handled: false };
    },
    async handlePromptReply() {
      return { handled: false };
    },
    async recordProcessedUpdate() {
      return { created: true };
    },
    async storeConversationMessage(input) {
      storedText = input.content;
      return { id: "message-1" };
    },
    async updateSourceFreshness(input) {
      freshnessUpdateId = Number(input.metadata?.updateId ?? null);
    }
  });

  assert.equal(result.duplicate, false);
  assert.equal(storedText, "Morning");
  assert.equal(freshnessUpdateId, 99);
});

test("handleTelegramUpdate forwards replies into prompt handling", async () => {
  let handledText: string | null = null;

  await handleTelegramUpdate(sampleUpdate, testConfig, {
    async handleAccessGrantCommand() {
      return { handled: false };
    },
    async handleDayTemplateCommand() {
      return { handled: false };
    },
    async handleNutritionTargetCommand() {
      return { handled: false };
    },
    async handleMealLoggingMessage() {
      return { handled: false };
    },
    async handlePromptReply(_config, input) {
      handledText = input.text;
      return { handled: true, promptKind: "checkin", responseText: "Noted." };
    },
    async recordProcessedUpdate() {
      return { created: true };
    },
    async storeConversationMessage() {
      return { id: "message-1" };
    },
    async updateSourceFreshness() {}
  });

  assert.equal(handledText, "Morning");
});

test("handleTelegramUpdate forwards non-prompt text into access-grant handling", async () => {
  let grantCommandText: string | null = null;

  await handleTelegramUpdate(
    {
      ...sampleUpdate,
      message: {
        ...sampleUpdate.message!,
        text: "give my trainer access to nutrition data"
      }
    },
    testConfig,
    {
      async handleAccessGrantCommand(_config, input) {
        grantCommandText = input.text;
        return { handled: true, responseText: "Granted." };
      },
      async handleDayTemplateCommand() {
        return { handled: false };
      },
      async handleNutritionTargetCommand() {
        return { handled: false };
      },
      async handleMealLoggingMessage() {
        return { handled: false };
      },
      async handlePromptReply() {
        return { handled: false };
      },
      async recordProcessedUpdate() {
        return { created: true };
      },
      async storeConversationMessage() {
        return { id: "message-1" };
      },
      async updateSourceFreshness() {}
    }
  );

  assert.equal(grantCommandText, "give my trainer access to nutrition data");
});

test("handleTelegramUpdate forwards non-grant text into day-template handling", async () => {
  let templateCommandText: string | null = null;

  await handleTelegramUpdate(
    {
      ...sampleUpdate,
      message: {
        ...sampleUpdate.message!,
        text: "set sunday to swim light morning"
      }
    },
    testConfig,
    {
      async handleAccessGrantCommand() {
        return { handled: false };
      },
      async handleDayTemplateCommand(_config, input) {
        templateCommandText = input.text;
        return { handled: true, responseText: "Updated." };
      },
      async handleNutritionTargetCommand() {
        return { handled: false };
      },
      async handleMealLoggingMessage() {
        return { handled: false };
      },
      async handlePromptReply() {
        return { handled: false };
      },
      async recordProcessedUpdate() {
        return { created: true };
      },
      async storeConversationMessage() {
        return { id: "message-1" };
      },
      async updateSourceFreshness() {}
    }
  );

  assert.equal(templateCommandText, "set sunday to swim light morning");
});

test("handleTelegramUpdate forwards non-day-template text into nutrition target handling", async () => {
  let nutritionCommandText: string | null = null;

  await handleTelegramUpdate(
    {
      ...sampleUpdate,
      message: {
        ...sampleUpdate.message!,
        text: "set calorie target to 2400"
      }
    },
    testConfig,
    {
      async handleAccessGrantCommand() {
        return { handled: false };
      },
      async handleDayTemplateCommand() {
        return { handled: false };
      },
      async handleNutritionTargetCommand(_config, input) {
        nutritionCommandText = input.text;
        return { handled: true, responseText: "Targets updated." };
      },
      async handleMealLoggingMessage() {
        return { handled: false };
      },
      async handlePromptReply() {
        return { handled: false };
      },
      async recordProcessedUpdate() {
        return { created: true };
      },
      async storeConversationMessage() {
        return { id: "message-1" };
      },
      async updateSourceFreshness() {}
    }
  );

  assert.equal(nutritionCommandText, "set calorie target to 2400");
});

test("handleTelegramUpdate forwards non-nutrition-target text into meal logging", async () => {
  let mealLoggingText: string | null = null;

  await handleTelegramUpdate(
    {
      ...sampleUpdate,
      message: {
        ...sampleUpdate.message!,
        text: "lunch was 650 cals"
      }
    },
    testConfig,
    {
      async handleAccessGrantCommand() {
        return { handled: false };
      },
      async handleDayTemplateCommand() {
        return { handled: false };
      },
      async handleNutritionTargetCommand() {
        return { handled: false };
      },
      async handleMealLoggingMessage(_config, input) {
        mealLoggingText = input.text;
        return { handled: true, responseText: "Logged.", storedMealId: "meal-1" };
      },
      async handlePromptReply() {
        return { handled: false };
      },
      async recordProcessedUpdate() {
        return { created: true };
      },
      async storeConversationMessage() {
        return { id: "message-1" };
      },
      async updateSourceFreshness() {}
    }
  );

  assert.equal(mealLoggingText, "lunch was 650 cals");
});
