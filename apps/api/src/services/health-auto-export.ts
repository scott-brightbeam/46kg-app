import {
  storeHealthMetrics,
  storeHealthkitWorkouts,
  storeIngestEvent,
  updateIngestEventProcessingStatus,
  updateSourceFreshness
} from "./persistence.js";

type HealthAutoExportMetricSeries = {
  name?: unknown;
  units?: unknown;
  data?: unknown;
};

type HealthMetricRow = {
  metricType: string;
  sourceRecordId: string;
  observedAt: Date;
  unit: string | null;
  valueNumeric: string | null;
  payload: Record<string, unknown>;
};

type HealthWorkoutRow = {
  sourceRecordId: string;
  workoutName: string;
  startedAt: Date;
  endedAt: Date;
  durationSeconds: number | null;
  location: string | null;
  isIndoor: boolean | null;
  distanceValue: string | null;
  distanceUnit: string | null;
  activeEnergyValue: string | null;
  activeEnergyUnit: string | null;
  totalEnergyValue: string | null;
  totalEnergyUnit: string | null;
  avgHeartRate: string | null;
  maxHeartRate: string | null;
  payload: Record<string, unknown>;
};

type HealthAutoExportDependencies = {
  storeIngestEvent: typeof storeIngestEvent;
  storeHealthMetrics: typeof storeHealthMetrics;
  storeHealthkitWorkouts: typeof storeHealthkitWorkouts;
  updateIngestEventProcessingStatus: typeof updateIngestEventProcessingStatus;
  updateSourceFreshness: typeof updateSourceFreshness;
};

const defaultDependencies: HealthAutoExportDependencies = {
  storeIngestEvent,
  storeHealthMetrics,
  storeHealthkitWorkouts,
  updateIngestEventProcessingStatus,
  updateSourceFreshness
};

function inferSourceRecordId(payload: unknown) {
  if (!payload || typeof payload !== "object") {
    return null;
  }

  const record = payload as Record<string, unknown>;
  const candidate =
    record.id ??
    record.uuid ??
    record.recordId ??
    record.exportId ??
    record.syncId;

  return typeof candidate === "string" ? candidate : null;
}

function inferTopLevelRecordCount(payload: unknown) {
  if (Array.isArray(payload)) {
    return payload.length;
  }

  if (payload && typeof payload === "object") {
    const record = payload as Record<string, unknown>;

    if (Array.isArray(record.data)) {
      return record.data.length;
    }

    if (Array.isArray(record.records)) {
      return record.records.length;
    }
  }

  return 1;
}

function parseObservedAt(value: unknown) {
  if (typeof value !== "string" || value.length === 0) {
    return null;
  }

  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return new Date(`${value}T00:00:00.000Z`);
  }

  const normalized = value.replace(
    /^(\d{4}-\d{2}-\d{2}) (\d{2}:\d{2}:\d{2}) ([+-]\d{2})(\d{2})$/,
    "$1T$2$3:$4"
  );
  const date = new Date(normalized);

  return Number.isNaN(date.getTime()) ? null : date;
}

function coerceValueNumeric(point: Record<string, unknown>) {
  const quantity = point.qty;

  if (typeof quantity === "number" || typeof quantity === "string") {
    return String(quantity);
  }

  if (
    quantity &&
    typeof quantity === "object" &&
    "Avg" in quantity &&
    (typeof quantity.Avg === "number" || typeof quantity.Avg === "string")
  ) {
    return String(quantity.Avg);
  }

  return null;
}

function extractMetricDataPoints(series: HealthAutoExportMetricSeries) {
  return Array.isArray(series.data)
    ? series.data.filter(
        (entry): entry is Record<string, unknown> => Boolean(entry && typeof entry === "object")
      )
    : [];
}

function extractMetricName(series: HealthAutoExportMetricSeries) {
  return typeof series.name === "string" && series.name.length > 0 ? series.name : "unknown_metric";
}

function extractMetricUnit(series: HealthAutoExportMetricSeries) {
  return typeof series.units === "string" && series.units.length > 0 ? series.units : null;
}

function asObject(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : null;
}

function extractQuantity(value: unknown) {
  const record = asObject(value);

  if (!record) {
    return {
      value: null,
      unit: null
    };
  }

  const quantityValue = record.qty;
  const unit = typeof record.units === "string" ? record.units : null;

  if (typeof quantityValue === "number" || typeof quantityValue === "string") {
    return {
      value: String(quantityValue),
      unit
    };
  }

  return {
    value: null,
    unit
  };
}

function extractSummaryHeartRate(workout: Record<string, unknown>, field: "Avg" | "Max") {
  const avgHeartRate = asObject(workout.avgHeartRate);

  if (!avgHeartRate) {
    return null;
  }

  const quantity = asObject(avgHeartRate.qty);

  if (!quantity) {
    return null;
  }

  const value = quantity[field];

  return typeof value === "number" || typeof value === "string" ? String(value) : null;
}

export function extractHealthMetricRows(payload: unknown): HealthMetricRow[] {
  if (!payload || typeof payload !== "object") {
    return [];
  }

  const record = payload as Record<string, unknown>;
  const data = record.data;

  if (!data || typeof data !== "object") {
    return [];
  }

  const metrics = (data as Record<string, unknown>).metrics;

  if (!Array.isArray(metrics)) {
    return [];
  }

  const rows: HealthMetricRow[] = [];

  metrics.forEach((series, seriesIndex) => {
    if (!series || typeof series !== "object") {
      return;
    }

    const typedSeries = series as HealthAutoExportMetricSeries;
    const metricType = extractMetricName(typedSeries);
    const unit = extractMetricUnit(typedSeries);

    extractMetricDataPoints(typedSeries).forEach((point, pointIndex) => {
      const observedAt = parseObservedAt(point.date ?? point.startDate ?? point.endDate);

      if (!observedAt) {
        return;
      }

      rows.push({
        metricType,
        sourceRecordId: `${metricType}:${seriesIndex}:${pointIndex}:${observedAt.toISOString()}`,
        observedAt,
        unit,
        valueNumeric: coerceValueNumeric(point),
        payload: {
          metricType,
          unit,
          point
        }
      });
    });
  });

  return rows;
}

export function extractHealthWorkoutRows(payload: unknown): HealthWorkoutRow[] {
  const record = asObject(payload);
  const data = asObject(record?.data);
  const workouts = data?.workouts;

  if (!Array.isArray(workouts)) {
    return [];
  }

  const rows: HealthWorkoutRow[] = [];

  workouts.forEach((entry, index) => {
    const workout = asObject(entry);

    if (!workout) {
      return;
    }

    const workoutName =
      typeof workout.name === "string" && workout.name.length > 0
        ? workout.name
        : "unknown_workout";
    const startedAt = parseObservedAt(workout.start);
    const endedAt = parseObservedAt(workout.end);

    if (!startedAt || !endedAt) {
      return;
    }

    const distance = extractQuantity(workout.distance);
    const activeEnergy = extractQuantity(workout.activeEnergy);
    const totalEnergy = extractQuantity(workout.totalEnergyBurned);
    const durationSecondsRaw = workout.duration;

    rows.push({
      sourceRecordId:
        typeof workout.id === "string"
          ? workout.id
          : `${workoutName}:${index}:${startedAt.toISOString()}`,
      workoutName,
      startedAt,
      endedAt,
      durationSeconds:
        typeof durationSecondsRaw === "number"
          ? durationSecondsRaw
          : typeof durationSecondsRaw === "string"
            ? Number(durationSecondsRaw)
            : null,
      location: typeof workout.location === "string" ? workout.location : null,
      isIndoor: typeof workout.isIndoor === "boolean" ? workout.isIndoor : null,
      distanceValue: distance.value,
      distanceUnit: distance.unit,
      activeEnergyValue: activeEnergy.value,
      activeEnergyUnit: activeEnergy.unit,
      totalEnergyValue: totalEnergy.value,
      totalEnergyUnit: totalEnergy.unit,
      avgHeartRate: extractSummaryHeartRate(workout, "Avg"),
      maxHeartRate: extractSummaryHeartRate(workout, "Max"),
      payload: workout
    });
  });

  return rows;
}

export async function handleHealthAutoExportPayload(
  payload: unknown,
  dependencies: HealthAutoExportDependencies = defaultDependencies
) {
  const topLevelRecordCount = inferTopLevelRecordCount(payload);
  const event = await dependencies.storeIngestEvent({
    source: "health_auto_export",
    sourceRecordId: inferSourceRecordId(payload),
    payload,
    validationStatus: "accepted",
    processingStatus: "stored_raw"
  });

  try {
    const metricRows = extractHealthMetricRows(payload);
    const workoutRows = extractHealthWorkoutRows(payload);

    await dependencies.storeHealthMetrics(
      metricRows.map((row) => ({
        ingestEventId: event.id,
        ...row
      }))
    );

    await dependencies.storeHealthkitWorkouts(
      workoutRows.map((row) => ({
        ingestEventId: event.id,
        ...row
      }))
    );

    await dependencies.updateIngestEventProcessingStatus({
      ingestEventId: event.id,
      processingStatus:
        metricRows.length > 0 || workoutRows.length > 0
          ? "normalized_health_data"
          : "stored_raw_only"
    });

    await dependencies.updateSourceFreshness({
      source: "health_auto_export",
      success: true,
      metadata: {
        ingestEventId: event.id,
        topLevelRecordCount,
        normalizedMetricCount: metricRows.length,
        normalizedWorkoutCount: workoutRows.length
      }
    });

    return {
      ingestEventId: event.id,
      topLevelRecordCount,
      normalizedMetricCount: metricRows.length,
      normalizedWorkoutCount: workoutRows.length
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown normalization error";

    await dependencies.updateIngestEventProcessingStatus({
      ingestEventId: event.id,
      validationStatus: "accepted_with_processing_error",
      processingStatus: "normalization_failed"
    });

    await dependencies.updateSourceFreshness({
      source: "health_auto_export",
      success: false,
      error: message,
      metadata: {
        ingestEventId: event.id,
        topLevelRecordCount
      }
    });

    throw error;
  }
}
