import { requireHevyConfig, type AppConfig } from "../config.js";
import {
  getSyncCursor,
  storeHevyRoutines,
  storeHevyWorkoutEvents,
  storeHevyWorkouts,
  storeIngestEvent,
  updateIngestEventProcessingStatus,
  updateSourceFreshness,
  upsertSyncCursor
} from "./persistence.js";

type HevyUserInfo = {
  id: string;
  name: string;
  url: string;
};

type HevyUserInfoResponse = {
  data: HevyUserInfo;
};

type HevySet = {
  index?: number;
  type?: string;
  weight_kg?: number | null;
  reps?: number | null;
  distance_meters?: number | null;
  duration_seconds?: number | null;
  rpe?: number | null;
  custom_metric?: number | null;
  rep_range?: {
    start?: number | null;
    end?: number | null;
  } | null;
};

type HevyExercise = {
  index?: number;
  title?: string;
  rest_seconds?: number | string | null;
  notes?: string | null;
  exercise_template_id?: string;
  superset_id?: number | null;
  supersets_id?: number | null;
  sets?: HevySet[];
};

type HevyWorkout = {
  id: string;
  title?: string;
  routine_id?: string | null;
  description?: string | null;
  start_time: string;
  end_time?: string | null;
  updated_at?: string | null;
  created_at?: string | null;
  exercises?: HevyExercise[];
};

type HevyRoutine = {
  id: string;
  title?: string;
  folder_id?: number | null;
  updated_at?: string | null;
  created_at?: string | null;
  exercises?: HevyExercise[];
};

type HevyUpdatedWorkoutEvent = {
  type: "updated";
  workout: HevyWorkout;
};

type HevyDeletedWorkoutEvent = {
  type: "deleted";
  id: string;
  deleted_at?: string | null;
};

type HevyWorkoutEvent = HevyUpdatedWorkoutEvent | HevyDeletedWorkoutEvent;

type HevyPaginatedResponse<TCollectionKey extends string, TItem> = {
  page?: number;
  page_count?: number;
} & Record<TCollectionKey, TItem[]>;

type HevyWorkoutEventsResponse = {
  page?: number;
  page_count?: number;
  events?: HevyWorkoutEvent[];
  workouts?: HevyWorkout[];
};

export type NormalizedHevyWorkout = {
  snapshotKey: string;
  sourceRecordId: string;
  title: string;
  routineId: string | null;
  description: string | null;
  startedAt: Date;
  endedAt: Date | null;
  durationSeconds: number | null;
  updatedAtRemote: Date | null;
  createdAtRemote: Date | null;
  exerciseCount: number;
  payload: HevyWorkout;
};

export type NormalizedHevyRoutine = {
  snapshotKey: string;
  sourceRecordId: string;
  title: string;
  folderId: number | null;
  updatedAtRemote: Date | null;
  createdAtRemote: Date | null;
  exerciseCount: number;
  payload: HevyRoutine;
};

export type NormalizedHevyWorkoutEvent = {
  eventKey: string;
  eventType: "updated" | "deleted";
  workoutSourceRecordId: string;
  eventOccurredAt: Date;
  payload: HevyWorkoutEvent;
};

type SyncHevyDependencies = {
  fetch: typeof fetch;
  getSyncCursor: typeof getSyncCursor;
  upsertSyncCursor: typeof upsertSyncCursor;
  storeIngestEvent: typeof storeIngestEvent;
  storeHevyWorkouts: typeof storeHevyWorkouts;
  storeHevyWorkoutEvents: typeof storeHevyWorkoutEvents;
  storeHevyRoutines: typeof storeHevyRoutines;
  updateIngestEventProcessingStatus: typeof updateIngestEventProcessingStatus;
  updateSourceFreshness: typeof updateSourceFreshness;
};

const defaultDependencies: SyncHevyDependencies = {
  fetch,
  getSyncCursor,
  upsertSyncCursor,
  storeIngestEvent,
  storeHevyWorkouts,
  storeHevyWorkoutEvents,
  storeHevyRoutines,
  updateIngestEventProcessingStatus,
  updateSourceFreshness
};

const HEVY_BASE_URL = "https://api.hevyapp.com";
const WORKOUT_EVENTS_CURSOR_KEY = "workout_events_since";
const ROUTINES_SYNC_CURSOR_KEY = "routines_snapshot_at";
const CURSOR_OVERLAP_MS = 5 * 60 * 1000;

function parseOptionalDate(value: string | null | undefined) {
  if (!value) {
    return null;
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function getExerciseCount(exercises: HevyExercise[] | undefined) {
  return Array.isArray(exercises) ? exercises.length : 0;
}

function getSnapshotAnchor(...dates: Array<Date | null>) {
  for (const date of dates) {
    if (date) {
      return date;
    }
  }

  return null;
}

function buildWorkoutSnapshotKey(workoutId: string, snapshotAnchor: Date) {
  return `${workoutId}:${snapshotAnchor.toISOString()}`;
}

function buildRoutineSnapshotKey(routineId: string, snapshotAnchor: Date) {
  return `${routineId}:${snapshotAnchor.toISOString()}`;
}

export function normalizeHevyWorkout(workout: HevyWorkout): NormalizedHevyWorkout | null {
  const startedAt = parseOptionalDate(workout.start_time);

  if (!startedAt) {
    return null;
  }

  const endedAt = parseOptionalDate(workout.end_time);
  const updatedAtRemote = parseOptionalDate(workout.updated_at);
  const createdAtRemote = parseOptionalDate(workout.created_at);
  const snapshotAnchor = getSnapshotAnchor(updatedAtRemote, createdAtRemote, endedAt, startedAt);

  if (!snapshotAnchor) {
    return null;
  }

  return {
    snapshotKey: buildWorkoutSnapshotKey(workout.id, snapshotAnchor),
    sourceRecordId: workout.id,
    title: workout.title && workout.title.length > 0 ? workout.title : "(untitled workout)",
    routineId: workout.routine_id ?? null,
    description: workout.description ?? null,
    startedAt,
    endedAt,
    durationSeconds:
      endedAt !== null ? Math.max(0, Math.round((endedAt.getTime() - startedAt.getTime()) / 1000)) : null,
    updatedAtRemote,
    createdAtRemote,
    exerciseCount: getExerciseCount(workout.exercises),
    payload: workout
  };
}

export function normalizeHevyRoutine(routine: HevyRoutine): NormalizedHevyRoutine | null {
  const updatedAtRemote = parseOptionalDate(routine.updated_at);
  const createdAtRemote = parseOptionalDate(routine.created_at);
  const snapshotAnchor = getSnapshotAnchor(updatedAtRemote, createdAtRemote);

  if (!snapshotAnchor) {
    return null;
  }

  return {
    snapshotKey: buildRoutineSnapshotKey(routine.id, snapshotAnchor),
    sourceRecordId: routine.id,
    title: routine.title && routine.title.length > 0 ? routine.title : "(untitled routine)",
    folderId: typeof routine.folder_id === "number" ? routine.folder_id : null,
    updatedAtRemote,
    createdAtRemote,
    exerciseCount: getExerciseCount(routine.exercises),
    payload: routine
  };
}

export function normalizeHevyWorkoutEvent(
  event: HevyWorkoutEvent
): NormalizedHevyWorkoutEvent | null {
  if (event.type === "updated") {
    const normalizedWorkout = normalizeHevyWorkout(event.workout);

    if (!normalizedWorkout) {
      return null;
    }

    const eventOccurredAt =
      normalizedWorkout.updatedAtRemote ??
      normalizedWorkout.createdAtRemote ??
      normalizedWorkout.endedAt ??
      normalizedWorkout.startedAt;

    return {
      eventKey: `updated:${normalizedWorkout.sourceRecordId}:${eventOccurredAt.toISOString()}`,
      eventType: "updated",
      workoutSourceRecordId: normalizedWorkout.sourceRecordId,
      eventOccurredAt,
      payload: event
    };
  }

  const deletedAt = parseOptionalDate(event.deleted_at) ?? new Date(0);

  return {
    eventKey: `deleted:${event.id}:${deletedAt.toISOString()}`,
    eventType: "deleted",
    workoutSourceRecordId: event.id,
    eventOccurredAt: deletedAt,
    payload: event
  };
}

async function hevyGet<T>(
  config: AppConfig,
  path: string,
  dependencies: SyncHevyDependencies
): Promise<T> {
  const credentials = requireHevyConfig(config);
  const response = await dependencies.fetch(`${HEVY_BASE_URL}${path}`, {
    headers: {
      "api-key": credentials.apiKey
    }
  });

  if (!response.ok) {
    throw new Error(`Hevy request failed for ${path} with status ${response.status}`);
  }

  return (await response.json()) as T;
}

async function fetchAllHevyPages<TCollectionKey extends string, TItem>(
  config: AppConfig,
  path: string,
  collectionKey: TCollectionKey,
  dependencies: SyncHevyDependencies,
  extraParams: Record<string, string> = {}
) {
  const items: TItem[] = [];
  let page = 1;
  let pageCount = 1;

  do {
    const query = new URLSearchParams({
      page: String(page),
      pageSize: "10",
      ...extraParams
    });

    const payload = await hevyGet<HevyPaginatedResponse<TCollectionKey, TItem>>(
      config,
      `${path}?${query.toString()}`,
      dependencies
    );

    const pageItems = payload[collectionKey];

    if (Array.isArray(pageItems)) {
      items.push(...pageItems);
    }

    pageCount = typeof payload.page_count === "number" ? payload.page_count : page;
    page += 1;
  } while (page <= pageCount);

  return items;
}

function extractHevyWorkoutEvents(payload: HevyWorkoutEventsResponse) {
  if (Array.isArray(payload.events)) {
    return payload.events;
  }

  if (Array.isArray(payload.workouts)) {
    return payload.workouts.map((workout) => ({
      type: "updated" as const,
      workout
    }));
  }

  return [];
}

async function fetchAllHevyWorkoutEvents(
  config: AppConfig,
  sinceIso: string,
  dependencies: SyncHevyDependencies
) {
  const items: HevyWorkoutEvent[] = [];
  let page = 1;
  let pageCount = 1;

  do {
    const query = new URLSearchParams({
      page: String(page),
      pageSize: "10",
      since: sinceIso
    });

    const payload = await hevyGet<HevyWorkoutEventsResponse>(
      config,
      `/v1/workouts/events?${query.toString()}`,
      dependencies
    );

    items.push(...extractHevyWorkoutEvents(payload));
    pageCount = typeof payload.page_count === "number" ? payload.page_count : page;
    page += 1;
  } while (page <= pageCount);

  return items;
}

function computeNextWorkoutEventsCursor(events: NormalizedHevyWorkoutEvent[]) {
  const latestEventTime =
    events.length > 0
      ? events.reduce(
          (latest, event) =>
            event.eventOccurredAt.getTime() > latest.getTime() ? event.eventOccurredAt : latest,
          events[0].eventOccurredAt
        )
      : new Date();

  return new Date(latestEventTime.getTime() - CURSOR_OVERLAP_MS).toISOString();
}

export async function syncHevyData(
  config: AppConfig,
  options: { sinceIso?: string } = {},
  dependencies: SyncHevyDependencies = defaultDependencies
) {
  const startedAt = new Date();

  try {
    const userInfoResponse = await hevyGet<HevyUserInfoResponse>(
      config,
      "/v1/user/info",
      dependencies
    );

    const storedCursor = await dependencies.getSyncCursor({
      source: "hevy",
      cursorKey: WORKOUT_EVENTS_CURSOR_KEY
    });
    const sinceIso =
      options.sinceIso ??
      storedCursor?.cursorValue ??
      new Date(0).toISOString();

    const workoutEvents = await fetchAllHevyWorkoutEvents(config, sinceIso, dependencies);

    const workoutEventsIngest = await dependencies.storeIngestEvent({
      source: "hevy",
      sourceRecordId: `workout-events:${sinceIso}`,
      payload: {
        since: sinceIso,
        user: userInfoResponse.data,
        events: workoutEvents
      },
      validationStatus: "accepted",
      processingStatus: "stored_raw"
    });

    const normalizedEvents = workoutEvents
      .map((event) => normalizeHevyWorkoutEvent(event))
      .filter((event): event is NormalizedHevyWorkoutEvent => Boolean(event));
    const normalizedWorkouts = workoutEvents
      .flatMap((event) => (event.type === "updated" ? [event.workout] : []))
      .map((workout) => normalizeHevyWorkout(workout))
      .filter((workout): workout is NormalizedHevyWorkout => Boolean(workout));

    await dependencies.storeHevyWorkoutEvents(
      normalizedEvents.map((event) => ({
        ingestEventId: workoutEventsIngest.id,
        ...event
      }))
    );
    await dependencies.storeHevyWorkouts(
      normalizedWorkouts.map((workout) => ({
        ingestEventId: workoutEventsIngest.id,
        ...workout
      }))
    );
    await dependencies.updateIngestEventProcessingStatus({
      ingestEventId: workoutEventsIngest.id,
      processingStatus:
        normalizedEvents.length > 0 || normalizedWorkouts.length > 0
          ? "normalized_hevy_workout_events"
          : "stored_raw_only"
    });

    const nextCursor = computeNextWorkoutEventsCursor(normalizedEvents);

    await dependencies.upsertSyncCursor({
      source: "hevy",
      cursorKey: WORKOUT_EVENTS_CURSOR_KEY,
      cursorValue: nextCursor,
      metadata: {
        lastIngestEventId: workoutEventsIngest.id,
        eventCount: normalizedEvents.length,
        updatedWorkoutCount: normalizedWorkouts.length
      }
    });

    const routines = await fetchAllHevyPages<"routines", HevyRoutine>(
      config,
      "/v1/routines",
      "routines",
      dependencies
    );

    const routinesIngest = await dependencies.storeIngestEvent({
      source: "hevy",
      sourceRecordId: `routines:${startedAt.toISOString()}`,
      payload: {
        user: userInfoResponse.data,
        routines
      },
      validationStatus: "accepted",
      processingStatus: "stored_raw"
    });

    const normalizedRoutines = routines
      .map((routine) => normalizeHevyRoutine(routine))
      .filter((routine): routine is NormalizedHevyRoutine => Boolean(routine));

    await dependencies.storeHevyRoutines(
      normalizedRoutines.map((routine) => ({
        ingestEventId: routinesIngest.id,
        ...routine
      }))
    );
    await dependencies.updateIngestEventProcessingStatus({
      ingestEventId: routinesIngest.id,
      processingStatus: normalizedRoutines.length > 0 ? "normalized_hevy_routines" : "stored_raw_only"
    });
    await dependencies.upsertSyncCursor({
      source: "hevy",
      cursorKey: ROUTINES_SYNC_CURSOR_KEY,
      cursorValue: startedAt.toISOString(),
      metadata: {
        lastIngestEventId: routinesIngest.id,
        routineCount: normalizedRoutines.length
      }
    });

    await dependencies.updateSourceFreshness({
      source: "hevy",
      success: true,
      metadata: {
        userId: userInfoResponse.data.id,
        userName: userInfoResponse.data.name,
        eventsSince: sinceIso,
        nextWorkoutEventsCursor: nextCursor,
        eventCount: normalizedEvents.length,
        updatedWorkoutCount: normalizedWorkouts.length,
        deletedWorkoutCount: normalizedEvents.filter((event) => event.eventType === "deleted").length,
        routineCount: normalizedRoutines.length
      }
    });

    return {
      user: userInfoResponse.data,
      workoutEventsIngestId: workoutEventsIngest.id,
      routinesIngestId: routinesIngest.id,
      nextWorkoutEventsCursor: nextCursor,
      eventCount: normalizedEvents.length,
      updatedWorkoutCount: normalizedWorkouts.length,
      deletedWorkoutCount: normalizedEvents.filter((event) => event.eventType === "deleted").length,
      routineCount: normalizedRoutines.length
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown Hevy sync error";

    await dependencies.updateSourceFreshness({
      source: "hevy",
      success: false,
      error: message
    });

    throw error;
  }
}
