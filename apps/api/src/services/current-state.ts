import { and, asc, desc, eq, gt, gte, lt, lte } from "drizzle-orm";

import {
  calendarEvents,
  checkinResponses,
  dailyPlans,
  dayTemplates,
  engagementStatuses,
  getDb,
  healthkitWorkouts,
  hevyWorkouts,
  mealLogs,
  scores,
  sourceFreshness,
  stravaActivities,
  weightEntries
} from "@codex/db";
import type { DayOfWeek, EngagementStatus, ScoreType, SourceKind } from "@codex/shared";
import { defaultDayTemplates } from "@codex/shared";

type TimeRange = {
  start: Date;
  end: Date;
};

type ProtectedBlockInput = {
  startTime: string;
  endTime: string;
  label: string;
};

type BusySlot = {
  start: Date;
  end: Date;
  label: string;
  kind: "calendar" | "protected";
};

type FreeSlot = {
  start: Date;
  end: Date;
  durationMinutes: number;
};

type CommonWorkout = {
  id: string;
  source: SourceKind;
  title: string;
  startedAt: Date;
  endedAt: Date | null;
  durationSeconds: number | null;
  details: Record<string, unknown>;
};

type DailyScore = {
  scoreType: ScoreType;
  value: number;
  confidence: number | null;
  formulaVersion: string;
  scoreDate: Date;
  provenance: unknown;
};

type WeightSnapshot = {
  observedAt: Date;
  kilograms: number;
  source: SourceKind;
  flagged: boolean;
};

type EngagementSnapshot = {
  effectiveAt: Date;
  status: EngagementStatus;
  reasons: unknown;
};

type DailyPlanSnapshot = {
  id: string;
  planDate: Date;
  summary: string;
  workoutPlan: unknown;
  mealPlan: unknown;
  recoveryContext: unknown;
  sourceSnapshot: unknown;
  updatedAt: Date;
};

type DayTemplateSnapshot = {
  dayOfWeek: DayOfWeek;
  activityType: string;
  intensity: string | null;
  preferredTime: string | null;
  notes: string | null;
  hevyRoutineId: string | null;
  hevyRoutineTitle: string | null;
};

type FreshnessSnapshot = {
  source: SourceKind;
  lastSuccessfulIngestAt: Date | null;
  lastAttemptedIngestAt: Date | null;
  lastStatus: string | null;
  lastError: string | null;
  metadata: unknown;
};

type CheckinSnapshot = {
  respondedAt: Date;
  field: string;
  valueText: string;
};

type MealSnapshot = {
  id: string;
  loggedAt: Date;
  description: string;
  calories: number;
  protein: number | null;
  carbs: number | null;
  fat: number | null;
  fibre: number | null;
  confidence: number | null;
  method: "photo" | "barcode" | "text" | "quick_log";
};

type CalendarEventSnapshot = {
  id: string;
  title: string;
  startsAt: Date;
  endsAt: Date;
  isAllDay: boolean | null;
  status: string | null;
  eventType: string | null;
  externalCalendarId: string;
};

type CurrentStateRepository = {
  listCalendarEvents(range: TimeRange): Promise<CalendarEventSnapshot[]>;
  listCheckins(range: TimeRange): Promise<CheckinSnapshot[]>;
  listDailyPlans(range: TimeRange): Promise<DailyPlanSnapshot[]>;
  listDayTemplates(dayOfWeek: DayOfWeek): Promise<DayTemplateSnapshot[]>;
  listEngagementStatuses(asOf: Date): Promise<EngagementSnapshot[]>;
  listFreshness(): Promise<FreshnessSnapshot[]>;
  listHealthkitWorkouts(range: TimeRange): Promise<CommonWorkout[]>;
  listHevyWorkouts(range: TimeRange): Promise<CommonWorkout[]>;
  listMealLogs(range: TimeRange): Promise<MealSnapshot[]>;
  listScores(range: TimeRange): Promise<DailyScore[]>;
  listStravaActivities(range: TimeRange): Promise<CommonWorkout[]>;
  listWeightEntries(range: TimeRange): Promise<WeightSnapshot[]>;
  listWeightEntriesBefore(before: Date, limit: number): Promise<WeightSnapshot[]>;
};

export type DailySummary = {
  date: string;
  timeZone: string;
  range: TimeRange;
  dayOfWeek: DayOfWeek;
  calendar: {
    events: CalendarEventSnapshot[];
    freeSlots: FreeSlot[];
    busySlots: BusySlot[];
  };
  workouts: CommonWorkout[];
  meals: {
    entries: MealSnapshot[];
    totals: {
      calories: number;
      protein: number;
      carbs: number;
      fat: number;
      fibre: number;
    };
  };
  checkins: CheckinSnapshot[];
  scores: Partial<Record<ScoreType, DailyScore>>;
  latestWeight: WeightSnapshot | null;
  engagementStatus: EngagementSnapshot | null;
  dailyPlan: DailyPlanSnapshot | null;
  dayTemplate: DayTemplateSnapshot | null;
  freshness: FreshnessSnapshot[];
};

export type WeeklySummary = {
  weekStart: string;
  timeZone: string;
  range: TimeRange;
  workoutCount: number;
  workoutDurationSeconds: number;
  workoutsBySource: Record<string, number>;
  workouts: CommonWorkout[];
  meals: {
    totalEntries: number;
    daysWithTwoMealsLogged: number;
    totals: {
      calories: number;
      protein: number;
      carbs: number;
      fat: number;
      fibre: number;
    };
  };
  checkinCount: number;
  latestWeight: WeightSnapshot | null;
  previousWeight: WeightSnapshot | null;
  weightDeltaKg: number | null;
  scores: Partial<Record<ScoreType, DailyScore>>;
  engagementStatus: EngagementSnapshot | null;
};

export type DailySummaryInput = {
  date: string;
  timeZone?: string;
  protectedBlocks?: ProtectedBlockInput[];
  minimumFreeSlotMinutes?: number;
};

export type WeeklySummaryInput = {
  weekStart: string;
  timeZone?: string;
};

export type CalendarSlotsInput = {
  date: string;
  timeZone?: string;
  calendarEvents: Array<Pick<CalendarEventSnapshot, "title" | "startsAt" | "endsAt">>;
  protectedBlocks?: ProtectedBlockInput[];
  minimumFreeSlotMinutes?: number;
};

const DEFAULT_TIME_ZONE = "Europe/London";

function parseIsoDate(date: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!match) {
    throw new Error(`Expected ISO date string (YYYY-MM-DD), received "${date}".`);
  }

  return {
    year: Number.parseInt(match[1]!, 10),
    month: Number.parseInt(match[2]!, 10),
    day: Number.parseInt(match[3]!, 10)
  };
}

function parseClockTime(value: string) {
  const match = /^(\d{2}):(\d{2})$/.exec(value);
  if (!match) {
    throw new Error(`Expected clock time string (HH:MM), received "${value}".`);
  }

  return {
    hour: Number.parseInt(match[1]!, 10),
    minute: Number.parseInt(match[2]!, 10)
  };
}

function shiftIsoDate(date: string, dayDelta: number) {
  const { year, month, day } = parseIsoDate(date);
  const shifted = new Date(Date.UTC(year, month - 1, day + dayDelta));
  return shifted.toISOString().slice(0, 10);
}

function parseTimeZoneOffsetLabel(value: string) {
  if (value === "GMT" || value === "UTC") {
    return 0;
  }

  const match = /^GMT([+-])(\d{1,2})(?::?(\d{2}))?$/.exec(value);
  if (!match) {
    throw new Error(`Unable to parse time zone offset "${value}".`);
  }

  const sign = match[1] === "-" ? -1 : 1;
  const hours = Number.parseInt(match[2]!, 10);
  const minutes = Number.parseInt(match[3] ?? "0", 10);
  return sign * ((hours * 60) + minutes) * 60_000;
}

function getTimeZoneOffsetMs(date: Date, timeZone: string) {
  const formatter = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    timeZoneName: "shortOffset",
    hour: "2-digit",
    minute: "2-digit"
  });
  const offsetLabel = formatter.formatToParts(date).find((part) => part.type === "timeZoneName")?.value;

  if (!offsetLabel) {
    throw new Error(`Unable to resolve time zone offset for "${timeZone}".`);
  }

  return parseTimeZoneOffsetLabel(offsetLabel);
}

function zonedDateTimeToUtc(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  timeZone: string
) {
  const utcGuess = new Date(Date.UTC(year, month - 1, day, hour, minute, 0));
  const offsetMs = getTimeZoneOffsetMs(utcGuess, timeZone);
  return new Date(utcGuess.getTime() - offsetMs);
}

function getDateRangeForLocalDate(date: string, timeZone = DEFAULT_TIME_ZONE): TimeRange {
  const { year, month, day } = parseIsoDate(date);
  const nextDate = shiftIsoDate(date, 1);
  const next = parseIsoDate(nextDate);

  return {
    start: zonedDateTimeToUtc(year, month, day, 0, 0, timeZone),
    end: zonedDateTimeToUtc(next.year, next.month, next.day, 0, 0, timeZone)
  };
}

function getDayOfWeekForLocalDate(date: string, timeZone = DEFAULT_TIME_ZONE): DayOfWeek {
  const { year, month, day } = parseIsoDate(date);
  const midday = zonedDateTimeToUtc(year, month, day, 12, 0, timeZone);
  const weekdayIndex = Number(
    new Intl.DateTimeFormat("en-US", {
      timeZone,
      weekday: "short"
    }).format(midday)
  );

  const weekday = new Intl.DateTimeFormat("en-US", {
    timeZone,
    weekday: "long"
  }).format(midday).toLowerCase() as DayOfWeek;

  if (!weekday) {
    throw new Error(`Unable to resolve day of week for "${date}" in "${timeZone}".`);
  }

  void weekdayIndex;
  return weekday;
}

function buildProtectedBusySlots(
  date: string,
  timeZone: string,
  protectedBlocks: ProtectedBlockInput[]
) {
  return protectedBlocks.map((block) => {
    const startParts = parseClockTime(block.startTime);
    const endParts = parseClockTime(block.endTime);
    const { year, month, day } = parseIsoDate(date);

    return {
      start: zonedDateTimeToUtc(year, month, day, startParts.hour, startParts.minute, timeZone),
      end: zonedDateTimeToUtc(year, month, day, endParts.hour, endParts.minute, timeZone),
      label: block.label,
      kind: "protected" as const
    };
  });
}

function toNumber(value: string | number | null | undefined) {
  if (value === null || value === undefined) {
    return null;
  }

  if (typeof value === "number") {
    return value;
  }

  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function sumBy<T>(rows: T[], mapper: (row: T) => number | null) {
  return rows.reduce((total, row) => total + (mapper(row) ?? 0), 0);
}

function mergeBusySlots(slots: BusySlot[]) {
  if (slots.length === 0) {
    return [];
  }

  const sorted = [...slots].sort((left, right) => left.start.getTime() - right.start.getTime());
  const merged: BusySlot[] = [sorted[0]!];

  for (const slot of sorted.slice(1)) {
    const last = merged[merged.length - 1]!;
    if (slot.start.getTime() <= last.end.getTime()) {
      last.end = new Date(Math.max(last.end.getTime(), slot.end.getTime()));
      last.label = [last.label, slot.label].filter(Boolean).join(" + ");
      continue;
    }

    merged.push({ ...slot });
  }

  return merged;
}

function selectLatestByScoreType(rows: DailyScore[]) {
  const latest = new Map<ScoreType, DailyScore>();

  for (const row of rows.sort((left, right) => right.scoreDate.getTime() - left.scoreDate.getTime())) {
    if (!latest.has(row.scoreType)) {
      latest.set(row.scoreType, row);
    }
  }

  return Object.fromEntries(latest.entries()) as Partial<Record<ScoreType, DailyScore>>;
}

function getLatestWeight(rows: WeightSnapshot[]) {
  return [...rows].sort((left, right) => right.observedAt.getTime() - left.observedAt.getTime())[0] ?? null;
}

export function getCalendarSlots(input: CalendarSlotsInput) {
  const timeZone = input.timeZone ?? DEFAULT_TIME_ZONE;
  const range = getDateRangeForLocalDate(input.date, timeZone);
  const minimumFreeSlotMinutes = input.minimumFreeSlotMinutes ?? 20;
  const calendarBusySlots: BusySlot[] = input.calendarEvents.map((event) => ({
    start: event.startsAt,
    end: event.endsAt,
    label: event.title,
    kind: "calendar"
  }));

  const protectedBusySlots = buildProtectedBusySlots(
    input.date,
    timeZone,
    input.protectedBlocks ?? []
  );
  const mergedBusySlots = mergeBusySlots([...calendarBusySlots, ...protectedBusySlots])
    .map((slot) => ({
      ...slot,
      start: new Date(Math.max(slot.start.getTime(), range.start.getTime())),
      end: new Date(Math.min(slot.end.getTime(), range.end.getTime()))
    }))
    .filter((slot) => slot.end.getTime() > slot.start.getTime());

  const freeSlots: FreeSlot[] = [];
  let cursor = range.start;

  for (const slot of mergedBusySlots) {
    if (slot.start.getTime() > cursor.getTime()) {
      const durationMinutes = Math.round((slot.start.getTime() - cursor.getTime()) / 60_000);
      if (durationMinutes >= minimumFreeSlotMinutes) {
        freeSlots.push({
          start: cursor,
          end: slot.start,
          durationMinutes
        });
      }
    }

    if (slot.end.getTime() > cursor.getTime()) {
      cursor = slot.end;
    }
  }

  if (range.end.getTime() > cursor.getTime()) {
    const durationMinutes = Math.round((range.end.getTime() - cursor.getTime()) / 60_000);
    if (durationMinutes >= minimumFreeSlotMinutes) {
      freeSlots.push({
        start: cursor,
        end: range.end,
        durationMinutes
      });
    }
  }

  return {
    range,
    busySlots: mergedBusySlots,
    freeSlots
  };
}

const defaultRepository: CurrentStateRepository = {
  async listCalendarEvents(range) {
    const db = getDb();
    return db
      .select({
        id: calendarEvents.id,
        title: calendarEvents.title,
        startsAt: calendarEvents.startsAt,
        endsAt: calendarEvents.endsAt,
        isAllDay: calendarEvents.isAllDay,
        status: calendarEvents.status,
        eventType: calendarEvents.eventType,
        externalCalendarId: calendarEvents.externalCalendarId
      })
      .from(calendarEvents)
      .where(and(lt(calendarEvents.startsAt, range.end), gt(calendarEvents.endsAt, range.start)))
      .orderBy(asc(calendarEvents.startsAt));
  },
  async listCheckins(range) {
    const db = getDb();
    return db
      .select({
        respondedAt: checkinResponses.respondedAt,
        field: checkinResponses.field,
        valueText: checkinResponses.valueText
      })
      .from(checkinResponses)
      .where(and(gte(checkinResponses.respondedAt, range.start), lt(checkinResponses.respondedAt, range.end)))
      .orderBy(asc(checkinResponses.respondedAt));
  },
  async listDailyPlans(range) {
    const db = getDb();
    return db
      .select({
        id: dailyPlans.id,
        planDate: dailyPlans.planDate,
        summary: dailyPlans.summary,
        workoutPlan: dailyPlans.workoutPlan,
        mealPlan: dailyPlans.mealPlan,
        recoveryContext: dailyPlans.recoveryContext,
        sourceSnapshot: dailyPlans.sourceSnapshot,
        updatedAt: dailyPlans.updatedAt
      })
      .from(dailyPlans)
      .where(and(gte(dailyPlans.planDate, range.start), lt(dailyPlans.planDate, range.end)))
      .orderBy(desc(dailyPlans.updatedAt));
  },
  async listDayTemplates(dayOfWeek) {
    const db = getDb();
    const rows = await db
      .select({
        dayOfWeek: dayTemplates.dayOfWeek,
        activityType: dayTemplates.activityType,
        intensity: dayTemplates.intensity,
        preferredTime: dayTemplates.preferredTime,
        notes: dayTemplates.notes,
        hevyRoutineId: dayTemplates.hevyRoutineId,
        hevyRoutineTitle: dayTemplates.hevyRoutineTitle
      })
      .from(dayTemplates)
      .where(eq(dayTemplates.dayOfWeek, dayOfWeek))
      .orderBy(desc(dayTemplates.updatedAt));

    if (rows.length > 0) {
      return rows;
    }

    return [defaultDayTemplates[dayOfWeek]];
  },
  async listEngagementStatuses(asOf) {
    const db = getDb();
    return db
      .select({
        effectiveAt: engagementStatuses.effectiveAt,
        status: engagementStatuses.status,
        reasons: engagementStatuses.reasons
      })
      .from(engagementStatuses)
      .where(lte(engagementStatuses.effectiveAt, asOf))
      .orderBy(desc(engagementStatuses.effectiveAt))
      .limit(1);
  },
  async listFreshness() {
    const db = getDb();
    return db
      .select({
        source: sourceFreshness.source,
        lastSuccessfulIngestAt: sourceFreshness.lastSuccessfulIngestAt,
        lastAttemptedIngestAt: sourceFreshness.lastAttemptedIngestAt,
        lastStatus: sourceFreshness.lastStatus,
        lastError: sourceFreshness.lastError,
        metadata: sourceFreshness.metadata
      })
      .from(sourceFreshness)
      .orderBy(asc(sourceFreshness.source));
  },
  async listHealthkitWorkouts(range) {
    const db = getDb();
    const rows = await db
      .select({
        id: healthkitWorkouts.id,
        title: healthkitWorkouts.workoutName,
        startedAt: healthkitWorkouts.startedAt,
        endedAt: healthkitWorkouts.endedAt,
        durationSeconds: healthkitWorkouts.durationSeconds,
        location: healthkitWorkouts.location,
        isIndoor: healthkitWorkouts.isIndoor,
        distanceValue: healthkitWorkouts.distanceValue,
        distanceUnit: healthkitWorkouts.distanceUnit,
        avgHeartRate: healthkitWorkouts.avgHeartRate,
        maxHeartRate: healthkitWorkouts.maxHeartRate
      })
      .from(healthkitWorkouts)
      .where(
        and(
          eq(healthkitWorkouts.canonical, true),
          gte(healthkitWorkouts.startedAt, range.start),
          lt(healthkitWorkouts.startedAt, range.end)
        )
      )
      .orderBy(asc(healthkitWorkouts.startedAt));

    return rows.map((row) => ({
      id: row.id,
      source: "health_auto_export" as const,
      title: row.title,
      startedAt: row.startedAt,
      endedAt: row.endedAt,
      durationSeconds: row.durationSeconds,
      details: {
        location: row.location,
        isIndoor: row.isIndoor,
        distanceValue: toNumber(row.distanceValue),
        distanceUnit: row.distanceUnit,
        avgHeartRate: toNumber(row.avgHeartRate),
        maxHeartRate: toNumber(row.maxHeartRate)
      }
    }));
  },
  async listHevyWorkouts(range) {
    const db = getDb();
    const rows = await db
      .select({
        id: hevyWorkouts.id,
        title: hevyWorkouts.title,
        startedAt: hevyWorkouts.startedAt,
        endedAt: hevyWorkouts.endedAt,
        durationSeconds: hevyWorkouts.durationSeconds,
        routineId: hevyWorkouts.routineId,
        exerciseCount: hevyWorkouts.exerciseCount
      })
      .from(hevyWorkouts)
      .where(
        and(
          eq(hevyWorkouts.canonical, true),
          gte(hevyWorkouts.startedAt, range.start),
          lt(hevyWorkouts.startedAt, range.end)
        )
      )
      .orderBy(asc(hevyWorkouts.startedAt));

    return rows.map((row) => ({
      id: row.id,
      source: "hevy" as const,
      title: row.title,
      startedAt: row.startedAt,
      endedAt: row.endedAt,
      durationSeconds: row.durationSeconds,
      details: {
        routineId: row.routineId,
        exerciseCount: row.exerciseCount
      }
    }));
  },
  async listMealLogs(range) {
    const db = getDb();
    const rows = await db
      .select({
        id: mealLogs.id,
        loggedAt: mealLogs.loggedAt,
        description: mealLogs.description,
        calories: mealLogs.calories,
        protein: mealLogs.protein,
        carbs: mealLogs.carbs,
        fat: mealLogs.fat,
        fibre: mealLogs.fibre,
        confidence: mealLogs.confidence,
        method: mealLogs.method
      })
      .from(mealLogs)
      .where(and(gte(mealLogs.loggedAt, range.start), lt(mealLogs.loggedAt, range.end)))
      .orderBy(asc(mealLogs.loggedAt));

    return rows.map((row) => ({
      id: row.id,
      loggedAt: row.loggedAt,
      description: row.description,
      calories: toNumber(row.calories) ?? 0,
      protein: toNumber(row.protein),
      carbs: toNumber(row.carbs),
      fat: toNumber(row.fat),
      fibre: toNumber(row.fibre),
      confidence: toNumber(row.confidence),
      method: row.method
    }));
  },
  async listScores(range) {
    const db = getDb();
    const rows = await db
      .select({
        scoreType: scores.scoreType,
        value: scores.value,
        confidence: scores.confidence,
        formulaVersion: scores.formulaVersion,
        scoreDate: scores.scoreDate,
        provenance: scores.provenance
      })
      .from(scores)
      .where(and(gte(scores.scoreDate, range.start), lt(scores.scoreDate, range.end)))
      .orderBy(desc(scores.scoreDate));

    return rows.map((row) => ({
      scoreType: row.scoreType,
      value: toNumber(row.value) ?? 0,
      confidence: toNumber(row.confidence),
      formulaVersion: row.formulaVersion,
      scoreDate: row.scoreDate,
      provenance: row.provenance
    }));
  },
  async listStravaActivities(range) {
    const db = getDb();
    const rows = await db
      .select({
        id: stravaActivities.id,
        name: stravaActivities.name,
        activityType: stravaActivities.activityType,
        sportType: stravaActivities.sportType,
        startedAt: stravaActivities.startedAt,
        endedAt: stravaActivities.endedAt,
        movingTimeSeconds: stravaActivities.movingTimeSeconds,
        elapsedTimeSeconds: stravaActivities.elapsedTimeSeconds,
        distanceMeters: stravaActivities.distanceMeters,
        averageHeartrate: stravaActivities.averageHeartrate,
        maxHeartrate: stravaActivities.maxHeartrate
      })
      .from(stravaActivities)
      .where(
        and(
          eq(stravaActivities.canonical, true),
          gte(stravaActivities.startedAt, range.start),
          lt(stravaActivities.startedAt, range.end)
        )
      )
      .orderBy(asc(stravaActivities.startedAt));

    return rows.map((row) => ({
      id: row.id,
      source: "strava" as const,
      title: row.name,
      startedAt: row.startedAt,
      endedAt: row.endedAt,
      durationSeconds: row.elapsedTimeSeconds ?? row.movingTimeSeconds,
      details: {
        activityType: row.activityType,
        sportType: row.sportType,
        distanceMeters: toNumber(row.distanceMeters),
        averageHeartrate: toNumber(row.averageHeartrate),
        maxHeartrate: toNumber(row.maxHeartrate)
      }
    }));
  },
  async listWeightEntries(range) {
    const db = getDb();
    const rows = await db
      .select({
        observedAt: weightEntries.observedAt,
        kilograms: weightEntries.kilograms,
        source: weightEntries.source,
        flagged: weightEntries.flagged
      })
      .from(weightEntries)
      .where(and(gte(weightEntries.observedAt, range.start), lt(weightEntries.observedAt, range.end)))
      .orderBy(desc(weightEntries.observedAt));

    return rows.map((row) => ({
      observedAt: row.observedAt,
      kilograms: toNumber(row.kilograms) ?? 0,
      source: row.source,
      flagged: row.flagged
    }));
  },
  async listWeightEntriesBefore(before, limit) {
    const db = getDb();
    const rows = await db
      .select({
        observedAt: weightEntries.observedAt,
        kilograms: weightEntries.kilograms,
        source: weightEntries.source,
        flagged: weightEntries.flagged
      })
      .from(weightEntries)
      .where(lt(weightEntries.observedAt, before))
      .orderBy(desc(weightEntries.observedAt))
      .limit(limit);

    return rows.map((row) => ({
      observedAt: row.observedAt,
      kilograms: toNumber(row.kilograms) ?? 0,
      source: row.source,
      flagged: row.flagged
    }));
  }
};

export async function getDailySummary(
  input: DailySummaryInput,
  repository: CurrentStateRepository = defaultRepository
): Promise<DailySummary> {
  const timeZone = input.timeZone ?? DEFAULT_TIME_ZONE;
  const range = getDateRangeForLocalDate(input.date, timeZone);
  const dayOfWeek = getDayOfWeekForLocalDate(input.date, timeZone);

  const [
    calendar,
    checkins,
    dailyPlansForDate,
    templates,
    engagement,
    freshness,
    healthkit,
    hevy,
    meals,
    scoreRows,
    strava,
    weights
  ] = await Promise.all([
    repository.listCalendarEvents(range),
    repository.listCheckins(range),
    repository.listDailyPlans(range),
    repository.listDayTemplates(dayOfWeek),
    repository.listEngagementStatuses(range.end),
    repository.listFreshness(),
    repository.listHealthkitWorkouts(range),
    repository.listHevyWorkouts(range),
    repository.listMealLogs(range),
    repository.listScores(range),
    repository.listStravaActivities(range),
    repository.listWeightEntries(range)
  ]);

  const workouts = [...hevy, ...strava, ...healthkit].sort(
    (left, right) => left.startedAt.getTime() - right.startedAt.getTime()
  );
  const calendarSlots = getCalendarSlots({
    date: input.date,
    timeZone,
    calendarEvents: calendar,
    protectedBlocks: input.protectedBlocks,
    minimumFreeSlotMinutes: input.minimumFreeSlotMinutes
  });

  return {
    date: input.date,
    timeZone,
    range,
    dayOfWeek,
    calendar: {
      events: calendar,
      busySlots: calendarSlots.busySlots,
      freeSlots: calendarSlots.freeSlots
    },
    workouts,
    meals: {
      entries: meals,
      totals: {
        calories: sumBy(meals, (meal) => meal.calories),
        protein: sumBy(meals, (meal) => meal.protein),
        carbs: sumBy(meals, (meal) => meal.carbs),
        fat: sumBy(meals, (meal) => meal.fat),
        fibre: sumBy(meals, (meal) => meal.fibre)
      }
    },
    checkins,
    scores: selectLatestByScoreType(scoreRows),
    latestWeight: getLatestWeight(weights),
    engagementStatus: engagement[0] ?? null,
    dailyPlan: dailyPlansForDate[0] ?? null,
    dayTemplate: templates[0] ?? null,
    freshness
  };
}

export async function getWeeklySummary(
  input: WeeklySummaryInput,
  repository: CurrentStateRepository = defaultRepository
): Promise<WeeklySummary> {
  const timeZone = input.timeZone ?? DEFAULT_TIME_ZONE;
  const range = {
    start: getDateRangeForLocalDate(input.weekStart, timeZone).start,
    end: getDateRangeForLocalDate(shiftIsoDate(input.weekStart, 7), timeZone).start
  };

  const [checkins, healthkit, hevy, meals, scoreRows, strava, weights, previousWeights, engagement] =
    await Promise.all([
      repository.listCheckins(range),
      repository.listHealthkitWorkouts(range),
      repository.listHevyWorkouts(range),
      repository.listMealLogs(range),
      repository.listScores(range),
      repository.listStravaActivities(range),
      repository.listWeightEntries(range),
      repository.listWeightEntriesBefore(range.start, 1),
      repository.listEngagementStatuses(range.end)
    ]);

  const workouts = [...hevy, ...strava, ...healthkit].sort(
    (left, right) => left.startedAt.getTime() - right.startedAt.getTime()
  );
  const mealsByDate = new Map<string, number>();
  for (const meal of meals) {
    const key = meal.loggedAt.toISOString().slice(0, 10);
    mealsByDate.set(key, (mealsByDate.get(key) ?? 0) + 1);
  }

  const latestWeight = getLatestWeight(weights);
  const previousWeight = previousWeights[0] ?? null;

  return {
    weekStart: input.weekStart,
    timeZone,
    range,
    workoutCount: workouts.length,
    workoutDurationSeconds: sumBy(workouts, (workout) => workout.durationSeconds),
    workoutsBySource: workouts.reduce<Record<string, number>>((totals, workout) => {
      totals[workout.source] = (totals[workout.source] ?? 0) + 1;
      return totals;
    }, {}),
    workouts,
    meals: {
      totalEntries: meals.length,
      daysWithTwoMealsLogged: [...mealsByDate.values()].filter((count) => count >= 2).length,
      totals: {
        calories: sumBy(meals, (meal) => meal.calories),
        protein: sumBy(meals, (meal) => meal.protein),
        carbs: sumBy(meals, (meal) => meal.carbs),
        fat: sumBy(meals, (meal) => meal.fat),
        fibre: sumBy(meals, (meal) => meal.fibre)
      }
    },
    checkinCount: checkins.length,
    latestWeight,
    previousWeight,
    weightDeltaKg:
      latestWeight && previousWeight
        ? Number((latestWeight.kilograms - previousWeight.kilograms).toFixed(2))
        : null,
    scores: selectLatestByScoreType(scoreRows),
    engagementStatus: engagement[0] ?? null
  };
}
