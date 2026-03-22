import assert from "node:assert/strict";
import test from "node:test";

import type { AppConfig } from "../config.js";

import {
  normalizeGoogleCalendarEvent,
  syncGoogleCalendarEvents
} from "./google-calendar.js";

test("normalizeGoogleCalendarEvent handles timed events", () => {
  const normalized = normalizeGoogleCalendarEvent(
    {
      id: "evt-1",
      status: "confirmed",
      summary: "Planning",
      eventType: "default",
      start: {
        dateTime: "2026-03-14T09:00:00Z"
      },
      end: {
        dateTime: "2026-03-14T10:00:00Z"
      }
    },
    "primary"
  );

  assert.ok(normalized);
  assert.equal(normalized.sourceRecordId, "evt-1");
  assert.equal(normalized.title, "Planning");
  assert.equal(normalized.isAllDay, false);
  assert.equal(normalized.startsAt.toISOString(), "2026-03-14T09:00:00.000Z");
});

test("normalizeGoogleCalendarEvent handles all-day events", () => {
  const normalized = normalizeGoogleCalendarEvent(
    {
      id: "evt-2",
      start: {
        date: "2026-03-14"
      },
      end: {
        date: "2026-03-15"
      }
    },
    "primary"
  );

  assert.ok(normalized);
  assert.equal(normalized.isAllDay, true);
  assert.equal(normalized.startsAt.toISOString(), "2026-03-14T00:00:00.000Z");
  assert.equal(normalized.endsAt.toISOString(), "2026-03-15T00:00:00.000Z");
});

test("syncGoogleCalendarEvents resets cursor and retries after 410", async () => {
  const config = {
    NODE_ENV: "test",
    APP_TIME_ZONE: "Europe/London",
    API_PORT: 3001,
    API_BASE_URL: "http://localhost:3001",
    WEB_BASE_URL: "http://localhost:3000",
    DATABASE_URL: "postgres://postgres:postgres@localhost:5432/codex_health",
    DAILY_CALORIE_TARGET: undefined,
    DAILY_PROTEIN_TARGET: undefined,
    DAILY_FIBRE_TARGET: undefined,
    OPENAI_API_KEY: "test",
    OPENAI_MODEL: "gpt-5",
    TELEGRAM_BOT_TOKEN: "test",
    TELEGRAM_WEBHOOK_SECRET: "secret",
    TELEGRAM_CHAT_ID: undefined,
    TELEGRAM_ALERT_CHAT_ID: undefined,
    ENABLE_OPERATOR_ALERTS: true,
    HEALTH_AUTO_EXPORT_SHARED_SECRET: "hae",
    AUTH_SESSION_SECRET: "auth",
    STRAVA_CLIENT_ID: undefined,
    STRAVA_CLIENT_SECRET: undefined,
    STRAVA_REFRESH_TOKEN: undefined,
    GOOGLE_CLIENT_ID: "google-client",
    GOOGLE_CLIENT_SECRET: "google-secret",
    GOOGLE_REFRESH_TOKEN: "google-refresh",
    GOOGLE_CALENDAR_ID: "primary",
    BACKUP_PGDUMP_BIN: "pg_dump",
    BACKUP_S3_BUCKET: undefined,
    BACKUP_S3_REGION: undefined,
    BACKUP_S3_ENDPOINT: undefined,
    BACKUP_S3_ACCESS_KEY_ID: undefined,
    BACKUP_S3_SECRET_ACCESS_KEY: undefined,
    BACKUP_S3_PREFIX: "postgres",
    BACKUP_S3_FORCE_PATH_STYLE: false
  } satisfies AppConfig;

  let fetchCount = 0;
  let syncCursorValues: Array<string | null | undefined> = [];

  const result = await syncGoogleCalendarEvents(
    config,
    { calendarId: "primary" },
    {
      async fetch(input) {
        fetchCount += 1;

        if (fetchCount === 1) {
          return new Response(
            JSON.stringify({
              access_token: "calendar-access",
              expires_in: 3600,
              token_type: "Bearer"
            }),
            {
              status: 200,
              headers: { "content-type": "application/json" }
            }
          );
        }

        if (fetchCount === 2) {
          return new Response(null, { status: 410 });
        }

        return new Response(
          JSON.stringify({
            items: [
              {
                id: "event-1",
                summary: "Review",
                start: { dateTime: "2026-03-14T15:00:00Z" },
                end: { dateTime: "2026-03-14T15:30:00Z" }
              }
            ],
            nextSyncToken: "sync-token-2"
          }),
          {
            status: 200,
            headers: { "content-type": "application/json" }
          }
        );
      },
      async getOAuthToken() {
        return null;
      },
      async upsertOAuthToken() {
        return;
      },
      async getSyncCursor() {
        return {
          id: "cursor-1",
          source: "google_calendar",
          cursorKey: "calendar:primary",
          cursorValue: "stale-token",
          metadata: null,
          createdAt: new Date(),
          updatedAt: new Date()
        };
      },
      async upsertSyncCursor(input) {
        syncCursorValues.push(input.cursorValue);
      },
      async storeIngestEvent() {
        return { id: "calendar-ingest-1" };
      },
      async storeCalendarEvents() {
        return;
      },
      async updateIngestEventProcessingStatus() {
        return;
      },
      async updateSourceFreshness() {
        return;
      }
    }
  );

  assert.equal(result.ingestEventId, "calendar-ingest-1");
  assert.equal(result.itemCount, 1);
  assert.equal(result.nextSyncToken, "sync-token-2");
  assert.deepEqual(syncCursorValues, [null, "sync-token-2"]);
});
