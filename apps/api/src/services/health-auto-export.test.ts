import assert from "node:assert/strict";
import test from "node:test";

import {
  extractHealthMetricRows,
  extractHealthWorkoutRows,
  handleHealthAutoExportPayload
} from "./health-auto-export.js";

test("extractHealthMetricRows normalizes documented metric series", () => {
  const payload = {
    data: {
      metrics: [
        {
          name: "steps",
          units: "count",
          data: [
            {
              date: "2026-03-14 08:30:00 +0000",
              qty: 4321
            }
          ]
        },
        {
          name: "heart_rate",
          units: "count/min",
          data: [
            {
              date: "2026-03-14 09:00:00 +0000",
              qty: {
                Min: 61,
                Avg: 74,
                Max: 128
              }
            }
          ]
        },
        {
          name: "sleep_analysis",
          units: "min",
          data: [
            {
              date: "2026-03-14",
              qty: 455
            }
          ]
        }
      ]
    }
  };

  const rows = extractHealthMetricRows(payload);

  assert.equal(rows.length, 3);
  assert.equal(rows[0]?.metricType, "steps");
  assert.equal(rows[0]?.valueNumeric, "4321");
  assert.equal(rows[1]?.metricType, "heart_rate");
  assert.equal(rows[1]?.valueNumeric, "74");
  assert.equal(rows[2]?.observedAt.toISOString(), "2026-03-14T00:00:00.000Z");
});

test("handleHealthAutoExportPayload stores raw ingest and normalized metrics", async () => {
  const calls: {
    storeHealthMetricsRows?: unknown[];
    storeHealthkitWorkoutRows?: unknown[];
    processingStatus?: string;
    freshness?: Record<string, unknown>;
  } = {};

  const result = await handleHealthAutoExportPayload(
    {
      data: {
        metrics: [
          {
            name: "resting_heart_rate",
            units: "count/min",
            data: [
              {
                date: "2026-03-14 06:00:00 +0000",
                qty: 55
              }
            ]
          }
        ]
      }
    },
    {
      async storeIngestEvent() {
        return { id: "ingest-1" };
      },
      async storeHealthMetrics(rows) {
        calls.storeHealthMetricsRows = rows;
      },
      async storeHealthkitWorkouts(rows) {
        calls.storeHealthkitWorkoutRows = rows;
      },
      async updateIngestEventProcessingStatus(input) {
        calls.processingStatus = input.processingStatus;
      },
      async updateSourceFreshness(input) {
        calls.freshness = input.metadata;
      }
    }
  );

  assert.equal(result.ingestEventId, "ingest-1");
  assert.equal(result.normalizedMetricCount, 1);
  assert.equal(result.normalizedWorkoutCount, 0);
  assert.equal(calls.processingStatus, "normalized_health_data");
  assert.equal((calls.storeHealthMetricsRows ?? []).length, 1);
  assert.equal((calls.storeHealthkitWorkoutRows ?? []).length, 0);
  assert.equal(calls.freshness?.normalizedMetricCount, 1);
});

test("extractHealthWorkoutRows normalizes workout sessions", () => {
  const payload = {
    data: {
      workouts: [
        {
          id: "workout-123",
          name: "Running",
          start: "2026-03-14 07:00:00 +0000",
          end: "2026-03-14 07:42:00 +0000",
          duration: 2520,
          location: "outdoor",
          isIndoor: false,
          distance: {
            qty: 8.5,
            units: "km"
          },
          activeEnergy: {
            qty: 640,
            units: "kcal"
          },
          totalEnergyBurned: {
            qty: 701,
            units: "kcal"
          },
          avgHeartRate: {
            qty: {
              Avg: 151
            },
            units: "count/min"
          }
        }
      ]
    }
  };

  const rows = extractHealthWorkoutRows(payload);

  assert.equal(rows.length, 1);
  assert.equal(rows[0]?.sourceRecordId, "workout-123");
  assert.equal(rows[0]?.workoutName, "Running");
  assert.equal(rows[0]?.distanceValue, "8.5");
  assert.equal(rows[0]?.distanceUnit, "km");
  assert.equal(rows[0]?.activeEnergyValue, "640");
  assert.equal(rows[0]?.avgHeartRate, "151");
});

test("handleHealthAutoExportPayload stores normalized workouts when present", async () => {
  const calls: {
    storeHealthMetricsRows?: unknown[];
    storeHealthkitWorkoutRows?: unknown[];
    processingStatus?: string;
    freshness?: Record<string, unknown>;
  } = {};

  const result = await handleHealthAutoExportPayload(
    {
      data: {
        workouts: [
          {
            id: "hk-workout-1",
            name: "Walking",
            start: "2026-03-14 18:00:00 +0000",
            end: "2026-03-14 18:35:00 +0000",
            duration: 2100
          }
        ]
      }
    },
    {
      async storeIngestEvent() {
        return { id: "ingest-2" };
      },
      async storeHealthMetrics(rows) {
        calls.storeHealthMetricsRows = rows;
      },
      async storeHealthkitWorkouts(rows) {
        calls.storeHealthkitWorkoutRows = rows;
      },
      async updateIngestEventProcessingStatus(input) {
        calls.processingStatus = input.processingStatus;
      },
      async updateSourceFreshness(input) {
        calls.freshness = input.metadata;
      }
    }
  );

  assert.equal(result.ingestEventId, "ingest-2");
  assert.equal(result.normalizedMetricCount, 0);
  assert.equal(result.normalizedWorkoutCount, 1);
  assert.equal((calls.storeHealthMetricsRows ?? []).length, 0);
  assert.equal((calls.storeHealthkitWorkoutRows ?? []).length, 1);
  assert.equal(calls.processingStatus, "normalized_health_data");
  assert.equal(calls.freshness?.normalizedWorkoutCount, 1);
});
