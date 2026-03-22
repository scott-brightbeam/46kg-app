import assert from "node:assert/strict";
import test from "node:test";

import type { AppConfig } from "../config.js";

import {
  normalizeStravaActivity,
  parseStravaRateLimitHeaders,
  type StravaRateLimitMetadata,
  syncRecentStravaActivities
} from "./strava.js";

test("normalizeStravaActivity maps summary activity fields into the landing shape", () => {
  const normalized = normalizeStravaActivity({
    id: 12345,
    name: "Lunch Run",
    type: "Run",
    sport_type: "TrailRun",
    start_date: "2026-03-14T12:00:00Z",
    start_date_local: "2026-03-14T12:00:00Z",
    timezone: "(GMT+00:00) Europe/London",
    distance: 8421.3,
    moving_time: 2475,
    elapsed_time: 2610,
    total_elevation_gain: 121.4,
    average_speed: 3.4,
    max_speed: 5.8,
    average_heartrate: 154.2,
    max_heartrate: 177.6,
    map: {
      summary_polyline: "abc123"
    }
  });

  assert.equal(normalized.sourceRecordId, "12345");
  assert.equal(normalized.name, "Lunch Run");
  assert.equal(normalized.activityType, "Run");
  assert.equal(normalized.sportType, "TrailRun");
  assert.equal(normalized.distanceMeters, "8421.3");
  assert.equal(normalized.elapsedTimeSeconds, 2610);
  assert.equal(normalized.totalElevationGainMeters, "121.4");
  assert.equal(normalized.averageHeartrate, "154.2");
  assert.equal(normalized.summaryPolyline, "abc123");
  assert.equal(normalized.endedAt?.toISOString(), "2026-03-14T12:43:30.000Z");
});

test("parseStravaRateLimitHeaders reads both overall and read-specific limits", () => {
  const headers = new Headers({
    "X-RateLimit-Limit": "200,2000",
    "X-RateLimit-Usage": "12,111",
    "X-ReadRateLimit-Limit": "100,1000",
    "X-ReadRateLimit-Usage": "7,77"
  });

  const metadata = parseStravaRateLimitHeaders(headers);

  assert.deepEqual(metadata.overallLimit, [200, 2000]);
  assert.deepEqual(metadata.overallUsage, [12, 111]);
  assert.deepEqual(metadata.readLimit, [100, 1000]);
  assert.deepEqual(metadata.readUsage, [7, 77]);
});

test("syncRecentStravaActivities refreshes tokens, stores ingest, and records freshness", async () => {
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
    STRAVA_CLIENT_ID: "client-id",
    STRAVA_CLIENT_SECRET: "client-secret",
    STRAVA_REFRESH_TOKEN: "env-refresh",
    HEVY_API_KEY: undefined,
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
  } satisfies AppConfig;

  let fetchCount = 0;
  let storedActivityCount = 0;
  let freshnessMetadata: {
    rateLimits?: StravaRateLimitMetadata;
  } | null = null;
  let oauthRefreshToken: string | null = null;

  const result = await syncRecentStravaActivities(
    config,
    { perPage: 10 },
    {
      async fetch(input) {
        fetchCount += 1;

        if (fetchCount === 1) {
          return new Response(
            JSON.stringify({
              token_type: "Bearer",
              access_token: "new-access",
              refresh_token: "rotated-refresh",
              expires_at: 1_800_000_000,
              expires_in: 21600,
              athlete: { id: 42 }
            }),
            {
              status: 200,
              headers: {
                "content-type": "application/json"
              }
            }
          );
        }

        return new Response(
          JSON.stringify([
            {
              id: 91,
              name: "Evening Ride",
              type: "Ride",
              start_date: "2026-03-14T18:00:00Z",
              elapsed_time: 3600
            }
          ]),
          {
            status: 200,
            headers: {
              "content-type": "application/json",
              "X-RateLimit-Limit": "200,2000",
              "X-RateLimit-Usage": "15,120"
            }
          }
        );
      },
      async getOAuthToken(_provider) {
        return null;
      },
      async upsertOAuthToken(input) {
        oauthRefreshToken = input.refreshToken ?? null;
      },
      async storeIngestEvent() {
        return { id: "strava-ingest-1" };
      },
      async storeStravaActivities(rows) {
        storedActivityCount = rows.length;
      },
      async updateIngestEventProcessingStatus() {
        return;
      },
      async updateSourceFreshness(input) {
        freshnessMetadata = (input.metadata as { rateLimits?: StravaRateLimitMetadata } | null) ?? null;
      }
    }
  );

  assert.equal(result.ingestEventId, "strava-ingest-1");
  assert.equal(result.activityCount, 1);
  assert.equal(storedActivityCount, 1);
  assert.equal(oauthRefreshToken, "rotated-refresh");
  assert.ok(freshnessMetadata);
  assert.deepEqual(result.rateLimits, {
    overallLimit: [200, 2000],
    overallUsage: [15, 120],
    readLimit: null,
    readUsage: null
  });
});
