import assert from "node:assert/strict";
import test from "node:test";

import type { AppConfig } from "../config.js";

import {
  normalizeHevyRoutine,
  normalizeHevyWorkout,
  normalizeHevyWorkoutEvent,
  syncHevyData
} from "./hevy.js";

test("normalizeHevyWorkout maps the documented workout payload into a snapshot row", () => {
  const normalized = normalizeHevyWorkout({
    id: "workout-1",
    title: "Upper Body",
    routine_id: "routine-9",
    description: "Heavy day",
    start_time: "2026-03-14T06:30:00Z",
    end_time: "2026-03-14T07:20:00Z",
    updated_at: "2026-03-14T07:25:00Z",
    created_at: "2026-03-14T07:21:00Z",
    exercises: [{ title: "Bench Press" }, { title: "Rows" }]
  });

  assert.ok(normalized);
  assert.equal(normalized.sourceRecordId, "workout-1");
  assert.equal(normalized.snapshotKey, "workout-1:2026-03-14T07:25:00.000Z");
  assert.equal(normalized.routineId, "routine-9");
  assert.equal(normalized.durationSeconds, 3000);
  assert.equal(normalized.exerciseCount, 2);
});

test("normalizeHevyRoutine maps routine metadata into a snapshot row", () => {
  const normalized = normalizeHevyRoutine({
    id: "routine-1",
    title: "Push Day",
    folder_id: 42,
    updated_at: "2026-03-14T08:00:00Z",
    created_at: "2026-03-10T08:00:00Z",
    exercises: [{ title: "Bench" }]
  });

  assert.ok(normalized);
  assert.equal(normalized.sourceRecordId, "routine-1");
  assert.equal(normalized.snapshotKey, "routine-1:2026-03-14T08:00:00.000Z");
  assert.equal(normalized.folderId, 42);
  assert.equal(normalized.exerciseCount, 1);
});

test("normalizeHevyWorkoutEvent handles both updated and deleted events", () => {
  const updated = normalizeHevyWorkoutEvent({
    type: "updated",
    workout: {
      id: "workout-2",
      title: "Pull Day",
      start_time: "2026-03-14T09:00:00Z",
      end_time: "2026-03-14T09:45:00Z",
      updated_at: "2026-03-14T10:00:00Z",
      exercises: []
    }
  });
  const deleted = normalizeHevyWorkoutEvent({
    type: "deleted",
    id: "workout-3",
    deleted_at: "2026-03-14T11:00:00Z"
  });

  assert.ok(updated);
  assert.ok(deleted);
  assert.equal(updated.eventKey, "updated:workout-2:2026-03-14T10:00:00.000Z");
  assert.equal(updated.workoutSourceRecordId, "workout-2");
  assert.equal(deleted.eventKey, "deleted:workout-3:2026-03-14T11:00:00.000Z");
  assert.equal(deleted.eventType, "deleted");
});

test("syncHevyData paginates events and routines, stores snapshots, and advances the cursor", async () => {
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
    HEVY_API_KEY: "hevy-key",
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
  } satisfies AppConfig;

  const requestedPaths: string[] = [];
  const storedIngestSources: string[] = [];
  const storedEventKeys: string[] = [];
  const storedWorkoutSnapshotKeys: string[] = [];
  const storedRoutineSnapshotKeys: string[] = [];
  const cursorUpdates: Array<{ cursorKey: string; cursorValue?: string | null }> = [];
  let freshnessMetadata: Record<string, unknown> | null = null;

  const result = await syncHevyData(config, undefined, {
    async fetch(input, init) {
      const url = typeof input === "string" ? input : input.toString();
      requestedPaths.push(url);
      assert.equal(init?.headers && (init.headers as Record<string, string>)["api-key"], "hevy-key");

      if (url.endsWith("/v1/user/info")) {
        return new Response(
          JSON.stringify({
            data: {
              id: "user-1",
              name: "Scott",
              url: "https://hevy.com/user/scott"
            }
          }),
          { status: 200, headers: { "content-type": "application/json" } }
        );
      }

      if (url.includes("/v1/workouts/events?")) {
        const parsed = new URL(url);
        const page = parsed.searchParams.get("page");

        if (page === "1") {
          return new Response(
            JSON.stringify({
              page: 1,
              page_count: 2,
              events: [
                {
                  type: "updated",
                  workout: {
                    id: "workout-1",
                    title: "Push",
                    routine_id: "routine-1",
                    start_time: "2026-03-14T06:00:00Z",
                    end_time: "2026-03-14T06:45:00Z",
                    updated_at: "2026-03-14T06:50:00Z",
                    created_at: "2026-03-14T06:46:00Z",
                    exercises: [{ title: "Bench" }]
                  }
                }
              ]
            }),
            { status: 200, headers: { "content-type": "application/json" } }
          );
        }

        return new Response(
          JSON.stringify({
            page: 2,
            page_count: 2,
            events: [
              {
                type: "deleted",
                id: "workout-2",
                deleted_at: "2026-03-14T07:00:00Z"
              }
            ]
          }),
          { status: 200, headers: { "content-type": "application/json" } }
        );
      }

      if (url.includes("/v1/routines?")) {
        return new Response(
          JSON.stringify({
            page: 1,
            page_count: 1,
            routines: [
              {
                id: "routine-1",
                title: "Push",
                folder_id: 7,
                updated_at: "2026-03-14T05:00:00Z",
                created_at: "2026-03-10T05:00:00Z",
                exercises: [{ title: "Bench" }, { title: "Incline Press" }]
              }
            ]
          }),
          { status: 200, headers: { "content-type": "application/json" } }
        );
      }

      throw new Error(`Unexpected URL: ${url}`);
    },
    async getSyncCursor() {
      return {
        id: "cursor-1",
        source: "hevy",
        cursorKey: "workout_events_since",
        cursorValue: null,
        metadata: null,
        createdAt: new Date(),
        updatedAt: new Date()
      };
    },
    async upsertSyncCursor(input) {
      cursorUpdates.push(input);
    },
    async storeIngestEvent(input) {
      storedIngestSources.push(input.sourceRecordId ?? "unknown");

      return {
        id: `ingest-${storedIngestSources.length}`
      };
    },
    async storeHevyWorkoutEvents(rows) {
      storedEventKeys.push(...rows.map((row) => row.eventKey));
    },
    async storeHevyWorkouts(rows) {
      storedWorkoutSnapshotKeys.push(...rows.map((row) => row.snapshotKey));
    },
    async storeHevyRoutines(rows) {
      storedRoutineSnapshotKeys.push(...rows.map((row) => row.snapshotKey));
    },
    async updateIngestEventProcessingStatus() {
      return;
    },
    async updateSourceFreshness(input) {
      freshnessMetadata = (input.metadata as Record<string, unknown> | null) ?? null;
    }
  });

  assert.equal(result.user.id, "user-1");
  assert.equal(result.eventCount, 2);
  assert.equal(result.updatedWorkoutCount, 1);
  assert.equal(result.deletedWorkoutCount, 1);
  assert.equal(result.routineCount, 1);
  assert.deepEqual(storedEventKeys, [
    "updated:workout-1:2026-03-14T06:50:00.000Z",
    "deleted:workout-2:2026-03-14T07:00:00.000Z"
  ]);
  assert.deepEqual(storedWorkoutSnapshotKeys, ["workout-1:2026-03-14T06:50:00.000Z"]);
  assert.deepEqual(storedRoutineSnapshotKeys, ["routine-1:2026-03-14T05:00:00.000Z"]);
  assert.equal(cursorUpdates[0]?.cursorKey, "workout_events_since");
  assert.equal(cursorUpdates[1]?.cursorKey, "routines_snapshot_at");
  assert.ok(result.nextWorkoutEventsCursor.startsWith("2026-03-14T06:55:00."));
  assert.ok(freshnessMetadata);
  assert.equal(freshnessMetadata?.["userId"], "user-1");
  assert.equal(requestedPaths.length, 4);
  assert.equal(storedIngestSources[0], "workout-events:1970-01-01T00:00:00.000Z");
  assert.ok(storedIngestSources[1]?.startsWith("routines:"));
});

test("syncHevyData tolerates workouts/events endpoint returning workouts instead of events", async () => {
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
    HEVY_API_KEY: "hevy-key",
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
  } satisfies AppConfig;

  let storedEventCount = 0;
  let storedWorkoutCount = 0;

  const result = await syncHevyData(config, undefined, {
    async fetch(input) {
      const url = typeof input === "string" ? input : input.toString();

      if (url.endsWith("/v1/user/info")) {
        return new Response(
          JSON.stringify({
            data: {
              id: "user-1",
              name: "Scott",
              url: "https://hevy.com/user/scott"
            }
          }),
          { status: 200, headers: { "content-type": "application/json" } }
        );
      }

      if (url.includes("/v1/workouts/events?")) {
        return new Response(
          JSON.stringify({
            page: 1,
            page_count: 1,
            workouts: [
              {
                id: "workout-9",
                title: "Live Contract",
                start_time: "2026-03-14T06:00:00Z",
                end_time: "2026-03-14T06:40:00Z",
                updated_at: "2026-03-14T06:45:00Z",
                exercises: []
              }
            ]
          }),
          { status: 200, headers: { "content-type": "application/json" } }
        );
      }

      if (url.includes("/v1/routines?")) {
        return new Response(
          JSON.stringify({
            page: 1,
            page_count: 1,
            routines: []
          }),
          { status: 200, headers: { "content-type": "application/json" } }
        );
      }

      throw new Error(`Unexpected URL: ${url}`);
    },
    async getSyncCursor() {
      return {
        id: "cursor-1",
        source: "hevy",
        cursorKey: "workout_events_since",
        cursorValue: null,
        metadata: null,
        createdAt: new Date(),
        updatedAt: new Date()
      };
    },
    async upsertSyncCursor() {
      return;
    },
    async storeIngestEvent() {
      return { id: "ingest-1" };
    },
    async storeHevyWorkoutEvents(rows) {
      storedEventCount += rows.length;
    },
    async storeHevyWorkouts(rows) {
      storedWorkoutCount += rows.length;
    },
    async storeHevyRoutines() {
      return;
    },
    async updateIngestEventProcessingStatus() {
      return;
    },
    async updateSourceFreshness() {
      return;
    }
  });

  assert.equal(result.eventCount, 1);
  assert.equal(result.updatedWorkoutCount, 1);
  assert.equal(storedEventCount, 1);
  assert.equal(storedWorkoutCount, 1);
});
