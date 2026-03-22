import { and, desc, eq, isNull } from "drizzle-orm";

import {
  accessGrants,
  accessLog,
  checkinResponses,
  conversationLog,
  calendarEvents,
  dailyPlans,
  dayTemplates,
  engagementStatuses,
  getDb,
  healthMetrics,
  healthkitWorkouts,
  hevyRoutines,
  hevyWorkoutEvents,
  hevyWorkouts,
  ingestEvents,
  jobRuns,
  mealLogs,
  metricDefinitions,
  nutritionTargets,
  oauthTokens,
  operatorAlerts,
  processedUpdates,
  scores,
  syncCursors,
  sourceFreshness,
  stravaActivities,
  users,
  weightEntries
} from "@codex/db";
import type { AccessCategory, EngagementStatus, ScoreType, SourceKind, UserRole } from "@codex/shared";

type StoreIngestEventInput = {
  source: SourceKind;
  sourceRecordId?: string | null;
  payload: unknown;
  validationStatus: string;
  processingStatus: string;
};

type StoreHealthMetricInput = {
  ingestEventId: string;
  metricType: string;
  sourceRecordId?: string | null;
  observedAt: Date;
  unit?: string | null;
  valueNumeric?: string | null;
  payload: unknown;
};

type StoreHealthkitWorkoutInput = {
  ingestEventId: string;
  sourceRecordId: string;
  workoutName: string;
  startedAt: Date;
  endedAt: Date;
  durationSeconds?: number | null;
  location?: string | null;
  isIndoor?: boolean | null;
  distanceValue?: string | null;
  distanceUnit?: string | null;
  activeEnergyValue?: string | null;
  activeEnergyUnit?: string | null;
  totalEnergyValue?: string | null;
  totalEnergyUnit?: string | null;
  avgHeartRate?: string | null;
  maxHeartRate?: string | null;
  payload: unknown;
};

type StoreStravaActivityInput = {
  ingestEventId: string;
  sourceRecordId: string;
  name: string;
  activityType: string;
  sportType?: string | null;
  startedAt: Date;
  startDateLocal?: Date | null;
  timezone?: string | null;
  endedAt?: Date | null;
  distanceMeters?: string | null;
  movingTimeSeconds?: number | null;
  elapsedTimeSeconds?: number | null;
  totalElevationGainMeters?: string | null;
  averageSpeed?: string | null;
  maxSpeed?: string | null;
  averageHeartrate?: string | null;
  maxHeartrate?: string | null;
  summaryPolyline?: string | null;
  payload: unknown;
};

type StoreHevyWorkoutInput = {
  ingestEventId: string;
  snapshotKey: string;
  sourceRecordId: string;
  title: string;
  routineId?: string | null;
  description?: string | null;
  startedAt: Date;
  endedAt?: Date | null;
  durationSeconds?: number | null;
  updatedAtRemote?: Date | null;
  createdAtRemote?: Date | null;
  exerciseCount?: number | null;
  payload: unknown;
};

type StoreHevyWorkoutEventInput = {
  ingestEventId: string;
  eventKey: string;
  eventType: "updated" | "deleted";
  workoutSourceRecordId: string;
  eventOccurredAt: Date;
  payload: unknown;
};

type StoreHevyRoutineInput = {
  ingestEventId: string;
  snapshotKey: string;
  sourceRecordId: string;
  title: string;
  folderId?: number | null;
  updatedAtRemote?: Date | null;
  createdAtRemote?: Date | null;
  exerciseCount?: number | null;
  payload: unknown;
};

type StoreCalendarEventInput = {
  ingestEventId: string;
  sourceRecordId: string;
  externalCalendarId: string;
  title: string;
  status?: string | null;
  eventType?: string | null;
  isAllDay?: boolean | null;
  startsAt: Date;
  endsAt: Date;
  payload: unknown;
};

type UpdateSourceFreshnessInput = {
  source: SourceKind;
  success: boolean;
  error?: string;
  metadata?: Record<string, unknown>;
};

type JobRunStatus = "running" | "succeeded" | "failed" | "skipped";
type OperatorAlertSeverity = "info" | "warning" | "critical";
type OperatorAlertStatus = "open" | "resolved";

type StoreDailyPlanInput = {
  planDate: Date;
  summary: string;
  workoutPlan?: Record<string, unknown> | null;
  mealPlan?: Record<string, unknown> | null;
  recoveryContext?: Record<string, unknown> | null;
  sourceSnapshot?: Record<string, unknown> | null;
};

type OAuthProvider = "strava" | "google_calendar";

type StoreWeightEntryInput = {
  observedAt?: Date;
  kilograms: number;
  source: SourceKind;
  flagged?: boolean;
  sourcePayload?: Record<string, unknown> | null;
};

type StoreCheckinResponseInput = {
  respondedAt?: Date;
  field: string;
  valueText: string;
  sourcePayload?: Record<string, unknown> | null;
};

type StoreMealLogInput = {
  loggedAt?: Date;
  description: string;
  calories: number;
  protein?: number | null;
  carbs?: number | null;
  fat?: number | null;
  fibre?: number | null;
  confidence?: number | null;
  method: "photo" | "barcode" | "text" | "quick_log";
  sourcePayload?: Record<string, unknown> | null;
};

type StoreScoreInput = {
  scoreDate: Date;
  scoreType: ScoreType;
  value: number;
  confidence?: number | null;
  formulaVersion: string;
  provenance: Record<string, unknown>;
};

type StoreEngagementStatusInput = {
  effectiveAt: Date;
  status: EngagementStatus;
  reasons: unknown;
  createdBy?: SourceKind;
};

type StoreDayTemplateInput = {
  dayOfWeek: "monday" | "tuesday" | "wednesday" | "thursday" | "friday" | "saturday" | "sunday";
  activityType: string;
  intensity?: string | null;
  preferredTime?: string | null;
  notes?: string | null;
  hevyRoutineId?: string | null;
  hevyRoutineTitle?: string | null;
};

type StoreNutritionTargetsInput = {
  calories?: number | null;
  protein?: number | null;
  fibre?: number | null;
  notes?: string | null;
};

type NutritionTargetRow = {
  id: string;
  calories: string | null;
  protein: string | null;
  fibre: string | null;
  notes: string | null;
  updatedAt: Date;
};

export async function recordProcessedUpdate(input: {
  provider: SourceKind;
  externalUpdateId: string;
  payloadHash: string;
}) {
  const db = getDb();
  const rows = await db
    .insert(processedUpdates)
    .values({
      provider: input.provider,
      externalUpdateId: input.externalUpdateId,
      payloadHash: input.payloadHash
    })
    .onConflictDoNothing()
    .returning({ id: processedUpdates.id });

  return {
    created: rows.length > 0
  };
}

export async function storeConversationMessage(input: {
  actor: "user" | "assistant" | "system";
  content: string | null;
  metadata?: Record<string, unknown>;
}) {
  const db = getDb();

  const [row] = await db
    .insert(conversationLog)
    .values({
      actor: input.actor,
      channel: "telegram",
      content: input.content,
      metadata: input.metadata ?? null
    })
    .returning({
      id: conversationLog.id
    });

  return row;
}

export async function storeDailyPlan(input: StoreDailyPlanInput) {
  const db = getDb();

  const [row] = await db
    .insert(dailyPlans)
    .values({
      planDate: input.planDate,
      summary: input.summary,
      workoutPlan: input.workoutPlan ?? null,
      mealPlan: input.mealPlan ?? null,
      recoveryContext: input.recoveryContext ?? null,
      sourceSnapshot: input.sourceSnapshot ?? null
    })
    .returning({
      id: dailyPlans.id,
      planDate: dailyPlans.planDate,
      updatedAt: dailyPlans.updatedAt
    });

  return row;
}

export async function ensureMetricDefinition(input: {
  scoreType: ScoreType;
  version: string;
  formula: string;
  notes?: string | null;
}) {
  const db = getDb();

  const [existing] = await db
    .select({
      id: metricDefinitions.id
    })
    .from(metricDefinitions)
    .where(and(eq(metricDefinitions.scoreType, input.scoreType), eq(metricDefinitions.version, input.version)))
    .limit(1);

  if (existing) {
    return existing;
  }

  const [row] = await db
    .insert(metricDefinitions)
    .values({
      scoreType: input.scoreType,
      version: input.version,
      formula: input.formula,
      notes: input.notes ?? null
    })
    .returning({
      id: metricDefinitions.id
    });

  return row;
}

export async function replaceDailyScore(input: StoreScoreInput) {
  const db = getDb();

  await db
    .delete(scores)
    .where(and(eq(scores.scoreDate, input.scoreDate), eq(scores.scoreType, input.scoreType)));

  const [row] = await db
    .insert(scores)
    .values({
      scoreDate: input.scoreDate,
      scoreType: input.scoreType,
      value: input.value.toFixed(3),
      confidence:
        input.confidence === null || input.confidence === undefined
          ? null
          : input.confidence.toFixed(2),
      formulaVersion: input.formulaVersion,
      provenance: input.provenance
    })
    .returning({
      id: scores.id,
      scoreDate: scores.scoreDate,
      scoreType: scores.scoreType,
      value: scores.value
    });

  return row;
}

export async function replaceEngagementStatus(input: StoreEngagementStatusInput) {
  const db = getDb();

  await db.delete(engagementStatuses).where(eq(engagementStatuses.effectiveAt, input.effectiveAt));

  const [row] = await db
    .insert(engagementStatuses)
    .values({
      effectiveAt: input.effectiveAt,
      status: input.status,
      reasons: input.reasons,
      createdBy: input.createdBy ?? "manual"
    })
    .returning({
      id: engagementStatuses.id,
      effectiveAt: engagementStatuses.effectiveAt,
      status: engagementStatuses.status
    });

  return row;
}

export async function storeDayTemplate(input: StoreDayTemplateInput) {
  const db = getDb();

  const [row] = await db
    .insert(dayTemplates)
    .values({
      dayOfWeek: input.dayOfWeek,
      activityType: input.activityType,
      intensity: input.intensity ?? null,
      preferredTime: input.preferredTime ?? null,
      notes: input.notes ?? null,
      hevyRoutineId: input.hevyRoutineId ?? null,
      hevyRoutineTitle: input.hevyRoutineTitle ?? null
    })
    .returning({
      id: dayTemplates.id,
      dayOfWeek: dayTemplates.dayOfWeek,
      updatedAt: dayTemplates.updatedAt
    });

  return row;
}

export async function listLatestDayTemplates() {
  const db = getDb();

  return db
    .select({
      id: dayTemplates.id,
      dayOfWeek: dayTemplates.dayOfWeek,
      activityType: dayTemplates.activityType,
      intensity: dayTemplates.intensity,
      preferredTime: dayTemplates.preferredTime,
      notes: dayTemplates.notes,
      hevyRoutineId: dayTemplates.hevyRoutineId,
      hevyRoutineTitle: dayTemplates.hevyRoutineTitle,
      updatedAt: dayTemplates.updatedAt
    })
    .from(dayTemplates)
    .orderBy(desc(dayTemplates.updatedAt));
}

export async function listLatestHevyRoutines() {
  const db = getDb();

  const rows = await db
    .select({
      sourceRecordId: hevyRoutines.sourceRecordId,
      title: hevyRoutines.title,
      folderId: hevyRoutines.folderId,
      updatedAtRemote: hevyRoutines.updatedAtRemote,
      createdAt: hevyRoutines.createdAt
    })
    .from(hevyRoutines)
    .orderBy(desc(hevyRoutines.updatedAtRemote), desc(hevyRoutines.createdAt));

  const seen = new Set<string>();
  const uniqueRows: typeof rows = [];

  for (const row of rows) {
    if (seen.has(row.sourceRecordId)) {
      continue;
    }
    seen.add(row.sourceRecordId);
    uniqueRows.push(row);
  }

  return uniqueRows;
}

export async function storeNutritionTargets(
  input: StoreNutritionTargetsInput
): Promise<{ id: string; updatedAt: Date }> {
  const db = getDb();

  const [row] = await db
    .insert(nutritionTargets)
    .values({
      calories:
        input.calories === null || input.calories === undefined
          ? null
          : input.calories.toFixed(2),
      protein:
        input.protein === null || input.protein === undefined
          ? null
          : input.protein.toFixed(2),
      fibre:
        input.fibre === null || input.fibre === undefined ? null : input.fibre.toFixed(2),
      notes: input.notes ?? null
    })
    .returning({
      id: nutritionTargets.id,
      updatedAt: nutritionTargets.updatedAt
    });

  return row;
}

export async function getLatestNutritionTargets(): Promise<NutritionTargetRow | null> {
  const db = getDb();

  const [row] = await db
    .select({
      id: nutritionTargets.id,
      calories: nutritionTargets.calories,
      protein: nutritionTargets.protein,
      fibre: nutritionTargets.fibre,
      notes: nutritionTargets.notes,
      updatedAt: nutritionTargets.updatedAt
    })
    .from(nutritionTargets)
    .orderBy(desc(nutritionTargets.updatedAt))
    .limit(1);

  return (row ?? null) as NutritionTargetRow | null;
}

export async function storeWeightEntry(input: StoreWeightEntryInput) {
  const db = getDb();

  const [row] = await db
    .insert(weightEntries)
    .values({
      observedAt: input.observedAt ?? new Date(),
      kilograms: input.kilograms.toFixed(2),
      source: input.source,
      flagged: input.flagged ?? false,
      sourcePayload: input.sourcePayload ?? null
    })
    .returning({
      id: weightEntries.id,
      observedAt: weightEntries.observedAt,
      kilograms: weightEntries.kilograms
    });

  return row;
}

export async function storeCheckinResponse(input: StoreCheckinResponseInput) {
  const db = getDb();

  const [row] = await db
    .insert(checkinResponses)
    .values({
      respondedAt: input.respondedAt ?? new Date(),
      field: input.field,
      valueText: input.valueText,
      sourcePayload: input.sourcePayload ?? null
    })
    .returning({
      id: checkinResponses.id,
      respondedAt: checkinResponses.respondedAt
    });

  return row;
}

export async function storeMealLog(input: StoreMealLogInput) {
  const db = getDb();

  const [row] = await db
    .insert(mealLogs)
    .values({
      loggedAt: input.loggedAt ?? new Date(),
      description: input.description,
      calories: input.calories.toFixed(2),
      protein: input.protein === null || input.protein === undefined ? null : input.protein.toFixed(2),
      carbs: input.carbs === null || input.carbs === undefined ? null : input.carbs.toFixed(2),
      fat: input.fat === null || input.fat === undefined ? null : input.fat.toFixed(2),
      fibre: input.fibre === null || input.fibre === undefined ? null : input.fibre.toFixed(2),
      confidence:
        input.confidence === null || input.confidence === undefined
          ? null
          : input.confidence.toFixed(2),
      method: input.method,
      sourcePayload: input.sourcePayload ?? null
    })
    .returning({
      id: mealLogs.id,
      loggedAt: mealLogs.loggedAt,
      description: mealLogs.description,
      calories: mealLogs.calories,
      method: mealLogs.method
    });

  return row;
}

export async function listRecentConversationMessages(limit = 20) {
  const db = getDb();

  return db
    .select({
      id: conversationLog.id,
      messageAt: conversationLog.messageAt,
      actor: conversationLog.actor,
      content: conversationLog.content,
      metadata: conversationLog.metadata
    })
    .from(conversationLog)
    .orderBy(desc(conversationLog.messageAt))
    .limit(limit);
}

export async function setConversationMessageMetadata(input: {
  id: string;
  metadata: Record<string, unknown> | null;
}) {
  const db = getDb();

  await db
    .update(conversationLog)
    .set({
      metadata: input.metadata
    })
    .where(eq(conversationLog.id, input.id));
}

export async function storeIngestEvent(input: StoreIngestEventInput) {
  const db = getDb();
  const [row] = await db
    .insert(ingestEvents)
    .values({
      source: input.source,
      sourceRecordId: input.sourceRecordId ?? null,
      payload: input.payload,
      validationStatus: input.validationStatus,
      processingStatus: input.processingStatus
    })
    .returning({
      id: ingestEvents.id
    });

  return row;
}

export async function updateIngestEventProcessingStatus(input: {
  ingestEventId: string;
  validationStatus?: string;
  processingStatus: string;
}) {
  const db = getDb();

  await db
    .update(ingestEvents)
    .set({
      validationStatus: input.validationStatus,
      processingStatus: input.processingStatus
    })
    .where(eq(ingestEvents.id, input.ingestEventId));
}

export async function storeHealthMetrics(rows: StoreHealthMetricInput[]) {
  if (rows.length === 0) {
    return;
  }

  const db = getDb();

  await db.insert(healthMetrics).values(
    rows.map((row) => ({
      ingestEventId: row.ingestEventId,
      metricType: row.metricType,
      sourceRecordId: row.sourceRecordId ?? null,
      observedAt: row.observedAt,
      unit: row.unit ?? null,
      valueNumeric: row.valueNumeric ?? null,
      payload: row.payload
    }))
  );
}

export async function storeHealthkitWorkouts(rows: StoreHealthkitWorkoutInput[]) {
  if (rows.length === 0) {
    return;
  }

  const db = getDb();

  await db.insert(healthkitWorkouts).values(
    rows.map((row) => ({
      ingestEventId: row.ingestEventId,
      sourceRecordId: row.sourceRecordId,
      workoutName: row.workoutName,
      startedAt: row.startedAt,
      endedAt: row.endedAt,
      durationSeconds: row.durationSeconds ?? null,
      location: row.location ?? null,
      isIndoor: row.isIndoor ?? null,
      distanceValue: row.distanceValue ?? null,
      distanceUnit: row.distanceUnit ?? null,
      activeEnergyValue: row.activeEnergyValue ?? null,
      activeEnergyUnit: row.activeEnergyUnit ?? null,
      totalEnergyValue: row.totalEnergyValue ?? null,
      totalEnergyUnit: row.totalEnergyUnit ?? null,
      avgHeartRate: row.avgHeartRate ?? null,
      maxHeartRate: row.maxHeartRate ?? null,
      payload: row.payload
    }))
  );
}

export async function storeStravaActivities(rows: StoreStravaActivityInput[]) {
  if (rows.length === 0) {
    return;
  }

  const db = getDb();

  await db
    .insert(stravaActivities)
    .values(
      rows.map((row) => ({
        ingestEventId: row.ingestEventId,
        sourceRecordId: row.sourceRecordId,
        name: row.name,
        activityType: row.activityType,
        sportType: row.sportType ?? null,
        startedAt: row.startedAt,
        startDateLocal: row.startDateLocal ?? null,
        timezone: row.timezone ?? null,
        endedAt: row.endedAt ?? null,
        distanceMeters: row.distanceMeters ?? null,
        movingTimeSeconds: row.movingTimeSeconds ?? null,
        elapsedTimeSeconds: row.elapsedTimeSeconds ?? null,
        totalElevationGainMeters: row.totalElevationGainMeters ?? null,
        averageSpeed: row.averageSpeed ?? null,
        maxSpeed: row.maxSpeed ?? null,
        averageHeartrate: row.averageHeartrate ?? null,
        maxHeartrate: row.maxHeartrate ?? null,
        summaryPolyline: row.summaryPolyline ?? null,
        payload: row.payload
      }))
    )
    .onConflictDoNothing();
}

export async function storeHevyWorkouts(rows: StoreHevyWorkoutInput[]) {
  if (rows.length === 0) {
    return;
  }

  const db = getDb();

  await db
    .insert(hevyWorkouts)
    .values(
      rows.map((row) => ({
        ingestEventId: row.ingestEventId,
        snapshotKey: row.snapshotKey,
        sourceRecordId: row.sourceRecordId,
        title: row.title,
        routineId: row.routineId ?? null,
        description: row.description ?? null,
        startedAt: row.startedAt,
        endedAt: row.endedAt ?? null,
        durationSeconds: row.durationSeconds ?? null,
        updatedAtRemote: row.updatedAtRemote ?? null,
        createdAtRemote: row.createdAtRemote ?? null,
        exerciseCount: row.exerciseCount ?? null,
        payload: row.payload
      }))
    )
    .onConflictDoNothing();
}

export async function storeHevyWorkoutEvents(rows: StoreHevyWorkoutEventInput[]) {
  if (rows.length === 0) {
    return;
  }

  const db = getDb();

  await db
    .insert(hevyWorkoutEvents)
    .values(
      rows.map((row) => ({
        ingestEventId: row.ingestEventId,
        eventKey: row.eventKey,
        eventType: row.eventType,
        workoutSourceRecordId: row.workoutSourceRecordId,
        eventOccurredAt: row.eventOccurredAt,
        payload: row.payload
      }))
    )
    .onConflictDoNothing();
}

export async function storeHevyRoutines(rows: StoreHevyRoutineInput[]) {
  if (rows.length === 0) {
    return;
  }

  const db = getDb();

  await db
    .insert(hevyRoutines)
    .values(
      rows.map((row) => ({
        ingestEventId: row.ingestEventId,
        snapshotKey: row.snapshotKey,
        sourceRecordId: row.sourceRecordId,
        title: row.title,
        folderId: row.folderId ?? null,
        updatedAtRemote: row.updatedAtRemote ?? null,
        createdAtRemote: row.createdAtRemote ?? null,
        exerciseCount: row.exerciseCount ?? null,
        payload: row.payload
      }))
    )
    .onConflictDoNothing();
}

export async function storeCalendarEvents(rows: StoreCalendarEventInput[]) {
  if (rows.length === 0) {
    return;
  }

  const db = getDb();

  await db.insert(calendarEvents).values(
    rows.map((row) => ({
      ingestEventId: row.ingestEventId,
      sourceRecordId: row.sourceRecordId,
      externalCalendarId: row.externalCalendarId,
      title: row.title,
      status: row.status ?? null,
      eventType: row.eventType ?? null,
      isAllDay: row.isAllDay ?? null,
      startsAt: row.startsAt,
      endsAt: row.endsAt,
      payload: row.payload
    }))
  );
}

export async function updateSourceFreshness(input: UpdateSourceFreshnessInput) {
  const db = getDb();
  const now = new Date();

  await db
    .insert(sourceFreshness)
    .values({
      source: input.source,
      lastAttemptedIngestAt: now,
      lastSuccessfulIngestAt: input.success ? now : null,
      lastStatus: input.success ? "success" : "error",
      lastError: input.error ?? null,
      metadata: input.metadata ?? null
    })
    .onConflictDoUpdate({
      target: sourceFreshness.source,
      set: {
        lastAttemptedIngestAt: now,
        lastSuccessfulIngestAt: input.success
          ? now
          : sourceFreshness.lastSuccessfulIngestAt,
        lastStatus: input.success ? "success" : "error",
        lastError: input.error ?? null,
        metadata: input.metadata ?? null,
        updatedAt: now
      }
    });
}

export async function listSourceFreshnessRows() {
  const db = getDb();

  return db
    .select({
      source: sourceFreshness.source,
      lastSuccessfulIngestAt: sourceFreshness.lastSuccessfulIngestAt,
      lastAttemptedIngestAt: sourceFreshness.lastAttemptedIngestAt,
      lastStatus: sourceFreshness.lastStatus,
      lastError: sourceFreshness.lastError,
      metadata: sourceFreshness.metadata,
      updatedAt: sourceFreshness.updatedAt
    })
    .from(sourceFreshness)
    .orderBy(sourceFreshness.source);
}

export async function startJobRun(input: {
  jobName: string;
  trigger?: string;
  metadata?: Record<string, unknown> | null;
}) {
  const db = getDb();

  const [row] = await db
    .insert(jobRuns)
    .values({
      jobName: input.jobName,
      trigger: input.trigger ?? "manual",
      status: "running",
      metadata: input.metadata ?? null
    })
    .returning({
      id: jobRuns.id,
      startedAt: jobRuns.startedAt
    });

  return row;
}

export async function finishJobRun(input: {
  id: string;
  startedAt?: Date | null;
  status: JobRunStatus;
  summary?: string | null;
  errorMessage?: string | null;
  metadata?: Record<string, unknown> | null;
}) {
  const db = getDb();
  const now = new Date();
  let startedAt = input.startedAt ?? null;

  if (!startedAt) {
    const [row] = await db
      .select({
        startedAt: jobRuns.startedAt
      })
      .from(jobRuns)
      .where(eq(jobRuns.id, input.id))
      .limit(1);

    startedAt = row?.startedAt ?? null;
  }

  const durationMs = startedAt ? Math.max(0, now.getTime() - startedAt.getTime()) : null;

  const [row] = await db
    .update(jobRuns)
    .set({
      status: input.status,
      finishedAt: now,
      durationMs,
      summary: input.summary ?? null,
      errorMessage: input.errorMessage ?? null,
      metadata: input.metadata ?? null,
      updatedAt: now
    })
    .where(eq(jobRuns.id, input.id))
    .returning({
      id: jobRuns.id,
      jobName: jobRuns.jobName,
      status: jobRuns.status,
      finishedAt: jobRuns.finishedAt,
      durationMs: jobRuns.durationMs
    });

  return row;
}

export async function listRecentJobRuns(limit = 25) {
  const db = getDb();

  return db
    .select({
      id: jobRuns.id,
      jobName: jobRuns.jobName,
      trigger: jobRuns.trigger,
      status: jobRuns.status,
      startedAt: jobRuns.startedAt,
      finishedAt: jobRuns.finishedAt,
      durationMs: jobRuns.durationMs,
      summary: jobRuns.summary,
      errorMessage: jobRuns.errorMessage,
      metadata: jobRuns.metadata,
      updatedAt: jobRuns.updatedAt
    })
    .from(jobRuns)
    .orderBy(desc(jobRuns.startedAt))
    .limit(limit);
}

export async function getLatestJobRunByName(jobName: string) {
  const db = getDb();

  const [row] = await db
    .select({
      id: jobRuns.id,
      jobName: jobRuns.jobName,
      trigger: jobRuns.trigger,
      status: jobRuns.status,
      startedAt: jobRuns.startedAt,
      finishedAt: jobRuns.finishedAt,
      durationMs: jobRuns.durationMs,
      summary: jobRuns.summary,
      errorMessage: jobRuns.errorMessage,
      metadata: jobRuns.metadata,
      updatedAt: jobRuns.updatedAt
    })
    .from(jobRuns)
    .where(eq(jobRuns.jobName, jobName))
    .orderBy(desc(jobRuns.startedAt))
    .limit(1);

  return row ?? null;
}

export async function upsertOperatorAlert(input: {
  alertKey: string;
  category: string;
  severity: OperatorAlertSeverity;
  summary: string;
  details?: string | null;
  metadata?: Record<string, unknown> | null;
  markNotified?: boolean;
}) {
  const db = getDb();
  const now = new Date();

  const [existing] = await db
    .select({
      id: operatorAlerts.id,
      firstRaisedAt: operatorAlerts.firstRaisedAt,
      notificationCount: operatorAlerts.notificationCount,
      lastNotifiedAt: operatorAlerts.lastNotifiedAt
    })
    .from(operatorAlerts)
    .where(eq(operatorAlerts.alertKey, input.alertKey))
    .limit(1);

  if (!existing) {
    const [row] = await db
      .insert(operatorAlerts)
      .values({
        alertKey: input.alertKey,
        category: input.category,
        severity: input.severity,
        status: "open",
        summary: input.summary,
        details: input.details ?? null,
        metadata: input.metadata ?? null,
        firstRaisedAt: now,
        lastRaisedAt: now,
        lastNotifiedAt: input.markNotified ? now : null,
        notificationCount: input.markNotified ? 1 : 0
      })
      .returning({
        id: operatorAlerts.id,
        alertKey: operatorAlerts.alertKey,
        status: operatorAlerts.status,
        lastNotifiedAt: operatorAlerts.lastNotifiedAt,
        notificationCount: operatorAlerts.notificationCount
      });

    return row;
  }

  const [row] = await db
    .update(operatorAlerts)
    .set({
      category: input.category,
      severity: input.severity,
      status: "open",
      summary: input.summary,
      details: input.details ?? null,
      metadata: input.metadata ?? null,
      lastRaisedAt: now,
      lastNotifiedAt: input.markNotified ? now : existing.lastNotifiedAt,
      notificationCount: input.markNotified
        ? (existing.notificationCount ?? 0) + 1
        : existing.notificationCount,
      resolvedAt: null,
      updatedAt: now
    })
    .where(eq(operatorAlerts.alertKey, input.alertKey))
    .returning({
      id: operatorAlerts.id,
      alertKey: operatorAlerts.alertKey,
      status: operatorAlerts.status,
      lastNotifiedAt: operatorAlerts.lastNotifiedAt,
      notificationCount: operatorAlerts.notificationCount
    });

  return row;
}

export async function getOperatorAlertByKey(alertKey: string) {
  const db = getDb();

  const [row] = await db
    .select({
      id: operatorAlerts.id,
      alertKey: operatorAlerts.alertKey,
      category: operatorAlerts.category,
      severity: operatorAlerts.severity,
      status: operatorAlerts.status,
      summary: operatorAlerts.summary,
      details: operatorAlerts.details,
      metadata: operatorAlerts.metadata,
      firstRaisedAt: operatorAlerts.firstRaisedAt,
      lastRaisedAt: operatorAlerts.lastRaisedAt,
      lastNotifiedAt: operatorAlerts.lastNotifiedAt,
      notificationCount: operatorAlerts.notificationCount,
      resolvedAt: operatorAlerts.resolvedAt,
      updatedAt: operatorAlerts.updatedAt
    })
    .from(operatorAlerts)
    .where(eq(operatorAlerts.alertKey, alertKey))
    .limit(1);

  return row ?? null;
}

export async function resolveOperatorAlert(alertKey: string) {
  const db = getDb();
  const now = new Date();

  const rows = await db
    .update(operatorAlerts)
    .set({
      status: "resolved" satisfies OperatorAlertStatus,
      resolvedAt: now,
      updatedAt: now
    })
    .where(and(eq(operatorAlerts.alertKey, alertKey), eq(operatorAlerts.status, "open")))
    .returning({
      id: operatorAlerts.id
    });

  return rows.length > 0;
}

export async function listOperatorAlerts(input: {
  status?: OperatorAlertStatus;
  limit?: number;
} = {}) {
  const db = getDb();
  const selection = {
    id: operatorAlerts.id,
    alertKey: operatorAlerts.alertKey,
    category: operatorAlerts.category,
    severity: operatorAlerts.severity,
    status: operatorAlerts.status,
    summary: operatorAlerts.summary,
    details: operatorAlerts.details,
    metadata: operatorAlerts.metadata,
    firstRaisedAt: operatorAlerts.firstRaisedAt,
    lastRaisedAt: operatorAlerts.lastRaisedAt,
    lastNotifiedAt: operatorAlerts.lastNotifiedAt,
    notificationCount: operatorAlerts.notificationCount,
    resolvedAt: operatorAlerts.resolvedAt,
    updatedAt: operatorAlerts.updatedAt
  };

  if (input.status) {
    return db
      .select(selection)
      .from(operatorAlerts)
      .where(eq(operatorAlerts.status, input.status))
      .orderBy(desc(operatorAlerts.lastRaisedAt))
      .limit(input.limit ?? 25);
  }

  return db
    .select(selection)
    .from(operatorAlerts)
    .orderBy(desc(operatorAlerts.lastRaisedAt))
    .limit(input.limit ?? 25);
}

export async function getActiveGrantCountForCategory(input: {
  subjectUserId: string;
  practitionerUserId: string;
  category: "exercise" | "nutrition" | "weight" | "engagement_status";
}) {
  const db = getDb();

  const rows = await db
    .select({ id: accessGrants.id })
    .from(accessGrants)
    .where(
      and(
        eq(accessGrants.subjectUserId, input.subjectUserId),
        eq(accessGrants.practitionerUserId, input.practitionerUserId),
        eq(accessGrants.category, input.category),
        isNull(accessGrants.revokedAt)
      )
    );

  return rows.length;
}

export async function listAccessGrantDecisionsForPair(input: {
  subjectUserId: string;
  practitionerUserId: string;
}) {
  const db = getDb();

  return db
    .select({
      id: accessGrants.id,
      category: accessGrants.category,
      grantedAt: accessGrants.grantedAt,
      revokedAt: accessGrants.revokedAt,
      practitionerUserId: accessGrants.practitionerUserId,
      subjectUserId: accessGrants.subjectUserId,
      createdByUserId: accessGrants.createdByUserId
    })
    .from(accessGrants)
    .where(
      and(
        eq(accessGrants.subjectUserId, input.subjectUserId),
        eq(accessGrants.practitionerUserId, input.practitionerUserId)
      )
    )
    .orderBy(desc(accessGrants.grantedAt));
}

export async function listAccessGrantDecisionsForSubject(input: {
  subjectUserId: string;
}) {
  const db = getDb();

  return db
    .select({
      id: accessGrants.id,
      category: accessGrants.category,
      grantedAt: accessGrants.grantedAt,
      revokedAt: accessGrants.revokedAt,
      practitionerUserId: accessGrants.practitionerUserId,
      practitionerDisplayName: users.displayName,
      practitionerRole: users.role,
      subjectUserId: accessGrants.subjectUserId,
      createdByUserId: accessGrants.createdByUserId
    })
    .from(accessGrants)
    .innerJoin(users, eq(accessGrants.practitionerUserId, users.id))
    .where(eq(accessGrants.subjectUserId, input.subjectUserId))
    .orderBy(desc(accessGrants.grantedAt));
}

export async function createAccessGrant(input: {
  subjectUserId: string;
  practitionerUserId: string;
  category: AccessCategory;
  createdByUserId: string;
  expiresAt?: Date | null;
}) {
  const db = getDb();

  const [row] = await db
    .insert(accessGrants)
    .values({
      subjectUserId: input.subjectUserId,
      practitionerUserId: input.practitionerUserId,
      category: input.category,
      expiresAt: input.expiresAt ?? null,
      createdByUserId: input.createdByUserId,
      revokedAt: null
    })
    .returning({
      id: accessGrants.id,
      category: accessGrants.category,
      grantedAt: accessGrants.grantedAt,
      revokedAt: accessGrants.revokedAt
    });

  return row;
}

export async function revokeActiveAccessGrants(input: {
  subjectUserId: string;
  practitionerUserId: string;
  category: AccessCategory;
}) {
  const db = getDb();
  const now = new Date();

  const rows = await db
    .update(accessGrants)
    .set({
      revokedAt: now
    })
    .where(
      and(
        eq(accessGrants.subjectUserId, input.subjectUserId),
        eq(accessGrants.practitionerUserId, input.practitionerUserId),
        eq(accessGrants.category, input.category),
        isNull(accessGrants.revokedAt)
      )
    )
    .returning({
      id: accessGrants.id
    });

  return rows.length;
}

export async function createAccessRevocationMarker(input: {
  subjectUserId: string;
  practitionerUserId: string;
  category: AccessCategory;
  createdByUserId: string;
}) {
  const db = getDb();
  const now = new Date();

  const [row] = await db
    .insert(accessGrants)
    .values({
      subjectUserId: input.subjectUserId,
      practitionerUserId: input.practitionerUserId,
      category: input.category,
      createdByUserId: input.createdByUserId,
      grantedAt: now,
      revokedAt: now
    })
    .returning({
      id: accessGrants.id,
      category: accessGrants.category,
      grantedAt: accessGrants.grantedAt,
      revokedAt: accessGrants.revokedAt
    });

  return row;
}

export async function getUserByEmail(email: string) {
  const db = getDb();

  const [row] = await db
    .select({
      id: users.id,
      email: users.email,
      displayName: users.displayName,
      role: users.role,
      passwordHash: users.passwordHash,
      isActive: users.isActive
    })
    .from(users)
    .where(eq(users.email, email))
    .limit(1);

  return row ?? null;
}

export async function getUserById(id: string) {
  const db = getDb();

  const [row] = await db
    .select({
      id: users.id,
      email: users.email,
      displayName: users.displayName,
      role: users.role,
      passwordHash: users.passwordHash,
      isActive: users.isActive
    })
    .from(users)
    .where(eq(users.id, id))
    .limit(1);

  return row ?? null;
}

export async function getPrimaryUserByRole(role: UserRole) {
  const db = getDb();

  const [row] = await db
    .select({
      id: users.id,
      email: users.email,
      displayName: users.displayName,
      role: users.role,
      passwordHash: users.passwordHash,
      isActive: users.isActive
    })
    .from(users)
    .where(and(eq(users.role, role), eq(users.isActive, true)))
    .orderBy(users.createdAt)
    .limit(1);

  return row ?? null;
}

export async function storeAccessLog(input: {
  practitionerUserId: string;
  subjectUserId: string;
  category: "exercise" | "nutrition" | "weight" | "engagement_status";
  requestPath: string;
  metadata?: Record<string, unknown> | null;
}) {
  const db = getDb();

  const [row] = await db
    .insert(accessLog)
    .values({
      practitionerUserId: input.practitionerUserId,
      subjectUserId: input.subjectUserId,
      category: input.category,
      requestPath: input.requestPath,
      metadata: input.metadata ?? null
    })
    .returning({
      id: accessLog.id
    });

  return row;
}

export async function getOAuthToken(provider: OAuthProvider) {
  const db = getDb();

  const [row] = await db
    .select()
    .from(oauthTokens)
    .where(eq(oauthTokens.provider, provider))
    .limit(1);

  return row ?? null;
}

export async function upsertOAuthToken(input: {
  provider: OAuthProvider;
  accessToken?: string | null;
  refreshToken?: string | null;
  tokenType?: string | null;
  scope?: string | null;
  expiresAt?: Date | null;
  subjectId?: string | null;
  metadata?: Record<string, unknown> | null;
}) {
  const db = getDb();
  const now = new Date();

  await db
    .insert(oauthTokens)
    .values({
      provider: input.provider,
      accessToken: input.accessToken ?? null,
      refreshToken: input.refreshToken ?? null,
      tokenType: input.tokenType ?? null,
      scope: input.scope ?? null,
      expiresAt: input.expiresAt ?? null,
      subjectId: input.subjectId ?? null,
      metadata: input.metadata ?? null
    })
    .onConflictDoUpdate({
      target: oauthTokens.provider,
      set: {
        accessToken: input.accessToken ?? null,
        refreshToken: input.refreshToken ?? null,
        tokenType: input.tokenType ?? null,
        scope: input.scope ?? null,
        expiresAt: input.expiresAt ?? null,
        subjectId: input.subjectId ?? null,
        metadata: input.metadata ?? null,
        updatedAt: now
      }
    });
}

export async function getSyncCursor(input: {
  source: SourceKind;
  cursorKey: string;
}) {
  const db = getDb();

  const [row] = await db
    .select()
    .from(syncCursors)
    .where(and(eq(syncCursors.source, input.source), eq(syncCursors.cursorKey, input.cursorKey)))
    .limit(1);

  return row ?? null;
}

export async function upsertSyncCursor(input: {
  source: SourceKind;
  cursorKey: string;
  cursorValue?: string | null;
  metadata?: Record<string, unknown> | null;
}) {
  const db = getDb();
  const now = new Date();

  await db
    .insert(syncCursors)
    .values({
      source: input.source,
      cursorKey: input.cursorKey,
      cursorValue: input.cursorValue ?? null,
      metadata: input.metadata ?? null
    })
    .onConflictDoUpdate({
      target: [syncCursors.source, syncCursors.cursorKey],
      set: {
        cursorValue: input.cursorValue ?? null,
        metadata: input.metadata ?? null,
        updatedAt: now
      }
    });
}
