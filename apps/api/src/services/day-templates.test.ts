import assert from "node:assert/strict";
import test from "node:test";

import type { AppConfig } from "../config.js";
import {
  handleDayTemplateCommand,
  listDayTemplateState,
  updateDayTemplate
} from "./day-templates.js";

function buildConfig(): AppConfig {
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
    BACKUP_S3_FORCE_PATH_STYLE: false
  };
}

test("listDayTemplateState falls back to the default weekly template", async () => {
  const templates = await listDayTemplateState({
    listLatestDayTemplates: async () => []
  });

  assert.equal(templates.length, 7);
  assert.equal(templates[1]?.dayOfWeek, "tuesday");
  assert.equal(templates[1]?.activityType, "PT session");
  assert.equal(templates[6]?.activityType, "Rest / active recovery");
  assert.equal(templates[1]?.hevyRoutineTitle, null);
});

test("updateDayTemplate stores a new override and returns merged templates", async () => {
  const stored: Array<Record<string, unknown>> = [];

  const result = await updateDayTemplate(
    {
      dayOfWeek: "thursday",
      activityType: "cardio intervals",
      intensity: "intense",
      preferredTime: "evening"
    },
    {
      storeDayTemplate: async (input) => {
        stored.push(input as unknown as Record<string, unknown>);
        return {
          id: "template-1",
          dayOfWeek: input.dayOfWeek,
          updatedAt: new Date("2026-03-15T12:00:00Z")
        };
      },
      listLatestDayTemplates: async () => [
        {
          id: "template-1",
          dayOfWeek: "thursday",
          activityType: "cardio intervals",
          intensity: "intense",
          preferredTime: "evening",
          notes: null,
          hevyRoutineId: "routine-123",
          hevyRoutineTitle: "30kg Full-Body Barbell Circuit",
          updatedAt: new Date("2026-03-15T12:00:00Z")
        }
      ]
    }
  );

  assert.equal(stored.length, 1);
  assert.equal(stored[0]?.activityType, "cardio intervals");
  assert.equal(stored[0]?.hevyRoutineTitle, null);
  assert.match(result.responseText, /Thursday is now Thursday cardio intervals/i);
  assert.equal(result.templates.find((template) => template.dayOfWeek === "thursday")?.preferredTime, "evening");
});

test("handleDayTemplateCommand lists and updates templates via Telegram-style commands", async () => {
  const sent: string[] = [];
  const storedConversation: string[] = [];

  const listResult = await handleDayTemplateCommand(
    buildConfig(),
    {
      text: "show day templates"
    },
    {
      listLatestDayTemplates: async () => [],
      listLatestHevyRoutines: async () => [],
      sendTelegramMessage: async (_config, text) => {
        sent.push(text);
        return {};
      },
      storeConversationMessage: async (input) => {
        storedConversation.push(input.content ?? "");
        return { id: "message-1" };
      },
      storeDayTemplate: async () => {
        throw new Error("not expected");
      }
    }
  );

  assert.equal(listResult.handled, true);
  assert.match(sent[0] ?? "", /Current weekly template:/);

  sent.length = 0;
  storedConversation.length = 0;

  const setResult = await handleDayTemplateCommand(
    buildConfig(),
    {
      text: "set sunday to swim light morning"
    },
    {
      listLatestDayTemplates: async () => [
        {
          id: "template-2",
          dayOfWeek: "sunday",
          activityType: "swim",
          intensity: "light",
          preferredTime: "morning",
          notes: null,
          hevyRoutineId: null,
          hevyRoutineTitle: null,
          updatedAt: new Date("2026-03-15T12:00:00Z")
        }
      ],
      sendTelegramMessage: async (_config, text) => {
        sent.push(text);
        return {};
      },
      storeConversationMessage: async (input) => {
        storedConversation.push(input.content ?? "");
        return { id: "message-2" };
      },
      storeDayTemplate: async () => ({
        id: "template-2",
        dayOfWeek: "sunday",
        updatedAt: new Date("2026-03-15T12:00:00Z")
      }),
      listLatestHevyRoutines: async () => []
    }
  );

  assert.equal(setResult.handled, true);
  assert.match(sent[0] ?? "", /Done\. Sunday is now Sunday swim/i);
  assert.equal(storedConversation.length, 1);
});
