import type { DayOfWeek, EngagementStatus } from "@codex/shared";

import { sendTelegramMessage } from "../lib/telegram.js";
import type { AppConfig } from "../config.js";
import {
  getNutritionTargetState,
  type NutritionTargetState
} from "./nutrition-targets.js";
import { refreshDailySignals } from "./scoring.js";
import { listRecentConversationMessages, storeConversationMessage, storeDailyPlan } from "./persistence.js";
import { getDailySummary, type DailySummary } from "./current-state.js";

type PlanIntensity = "rest" | "light" | "moderate" | "intense";
type WorkoutPlanStatus =
  | "completed"
  | "rest_day"
  | "planned"
  | "minimum_viable"
  | "no_slot";

type PlannedWorkout = {
  status: WorkoutPlanStatus;
  activityType: string | null;
  routineId: string | null;
  routineTitle: string | null;
  intensity: PlanIntensity;
  suggestedStart: Date | null;
  suggestedEnd: Date | null;
  durationMinutes: number;
  slotReason: string;
  completionTitle: string | null;
};

export type GeneratedDailyPlan = {
  date: string;
  timeZone: string;
  dayOfWeek: DayOfWeek;
  summary: string;
  workout: PlannedWorkout;
  nutrition: {
    note: string;
    configured: boolean;
  };
  recovery: {
    score: number | null;
    label: "good" | "steady" | "poor" | "unknown";
  };
  engagement: {
    status: EngagementStatus | "unknown";
    label: string;
  };
  freshnessNote: string;
  coachingNote: string;
  sourceSummary: {
    workoutsToday: number;
    calendarEventCount: number;
    freeSlotCount: number;
  };
};

type PlanningDependencies = {
  getDailySummary: typeof getDailySummary;
  getNutritionTargetState?: typeof getNutritionTargetState;
  listRecentConversationMessages: typeof listRecentConversationMessages;
  refreshDailySignals: typeof refreshDailySignals;
  storeDailyPlan: typeof storeDailyPlan;
  sendTelegramMessage: typeof sendTelegramMessage;
  storeConversationMessage: typeof storeConversationMessage;
};

const defaultDependencies: PlanningDependencies = {
  getDailySummary,
  getNutritionTargetState,
  listRecentConversationMessages,
  refreshDailySignals,
  storeDailyPlan,
  sendTelegramMessage,
  storeConversationMessage
};

const DEFAULT_TIME_ZONE = "Europe/London";
const DEFAULT_MINIMUM_FREE_SLOT_MINUTES = 20;
const DEFAULT_PROTECTED_BLOCKS = [
  {
    startTime: "00:00",
    endTime: "06:00",
    label: "Sleep"
  },
  {
    startTime: "08:00",
    endTime: "09:00",
    label: "School run"
  },
  {
    startTime: "09:00",
    endTime: "18:00",
    label: "Work block"
  },
  {
    startTime: "18:00",
    endTime: "19:00",
    label: "Family dinner"
  },
  {
    startTime: "22:00",
    endTime: "23:59",
    label: "Wind down"
  }
] as const;

function titleCaseDay(day: string) {
  return day[0] ? `${day[0].toUpperCase()}${day.slice(1)}` : day;
}

function activityLooksLikeRest(activityType: string | null | undefined) {
  if (!activityType) {
    return false;
  }

  return /\brest\b|\brecovery\b/i.test(activityType);
}

function normalizeIntensity(value: string | null | undefined): PlanIntensity {
  const normalized = value?.trim().toLowerCase();
  if (normalized === "rest") {
    return "rest";
  }
  if (normalized === "light") {
    return "light";
  }
  if (normalized === "moderate") {
    return "moderate";
  }

  return "intense";
}

function getRecoveryLabel(score: number | null): "good" | "steady" | "poor" | "unknown" {
  if (score === null) {
    return "unknown";
  }
  if (score < 55) {
    return "poor";
  }
  if (score < 75) {
    return "steady";
  }
  return "good";
}

function adjustIntensity(base: PlanIntensity, recovery: GeneratedDailyPlan["recovery"]["label"], engagement: EngagementStatus | "unknown") {
  if (base === "rest") {
    return "rest" as const;
  }

  if (engagement === "red" || recovery === "poor") {
    return "light" as const;
  }

  if (engagement === "amber" && base === "intense") {
    return "moderate" as const;
  }

  return base;
}

function durationForIntensity(intensity: PlanIntensity) {
  switch (intensity) {
    case "rest":
      return 0;
    case "light":
      return 25;
    case "moderate":
      return 40;
    case "intense":
      return 60;
  }
}

function formatLocalTime(date: Date | null, timeZone: string) {
  if (!date) {
    return null;
  }

  return new Intl.DateTimeFormat("en-GB", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  }).format(date);
}

function formatFreshness(summary: DailySummary) {
  const healthSource = summary.freshness.find((entry) => entry.source === "health_auto_export");
  const latest = healthSource?.lastSuccessfulIngestAt ?? null;

  if (!latest) {
    return "Watch sync: no successful Health Auto Export sync recorded yet.";
  }

  return `Watch sync: last seen ${new Intl.DateTimeFormat("en-GB", {
    timeZone: summary.timeZone,
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  }).format(latest)}.`;
}

function pickSlot(summary: DailySummary, durationMinutes: number, preferredTime: string | null | undefined) {
  const freeSlots = summary.calendar.freeSlots;
  if (freeSlots.length === 0) {
    return null;
  }

  const morningSlots = freeSlots.filter((slot) => {
    const hour = Number(
      new Intl.DateTimeFormat("en-GB", {
        timeZone: summary.timeZone,
        hour: "2-digit",
        hour12: false
      }).format(slot.start)
    );
    return hour < 9;
  });

  const preferredPool = preferredTime?.toLowerCase() === "morning" && morningSlots.length > 0
    ? morningSlots
    : freeSlots;

  return preferredPool.find((slot) => slot.durationMinutes >= durationMinutes)
    ?? preferredPool.reduce((best, slot) => {
      if (!best || slot.durationMinutes > best.durationMinutes) {
        return slot;
      }
      return best;
    }, preferredPool[0] ?? null);
}

function buildWorkoutPlan(summary: DailySummary): PlannedWorkout {
  const completed = summary.workouts[0] ?? null;
  if (completed) {
    const endedAt = completed.endedAt ?? completed.startedAt;
    const durationMinutes = Math.max(1, Math.round((completed.durationSeconds ?? 0) / 60));
    const routineId =
      completed.details && typeof completed.details === "object" && "routineId" in completed.details
        ? String(completed.details.routineId ?? "")
        : null;
    return {
      status: "completed",
      activityType: completed.title,
      routineId: routineId && routineId.length > 0 ? routineId : null,
      routineTitle: completed.title,
      intensity: "moderate",
      suggestedStart: completed.startedAt,
      suggestedEnd: endedAt,
      durationMinutes,
      slotReason: "Workout already recorded today.",
      completionTitle: completed.title
    };
  }

  const template = summary.dayTemplate;
  const templateActivity = template?.activityType ?? null;
  const templateRoutineId = template?.hevyRoutineId ?? null;
  const templateRoutineTitle = template?.hevyRoutineTitle ?? null;
  const plannedActivityTitle = templateRoutineTitle ?? templateActivity ?? "Movement";
  const baseIntensity = activityLooksLikeRest(templateActivity)
    ? "rest"
    : normalizeIntensity(template?.intensity);
  const engagementStatus = summary.engagementStatus?.status ?? "unknown";
  const recoveryLabel = getRecoveryLabel(summary.scores.recovery?.value ?? null);
  const adjustedIntensity = adjustIntensity(baseIntensity, recoveryLabel, engagementStatus);

  if (activityLooksLikeRest(templateActivity) || adjustedIntensity === "rest") {
    return {
      status: "rest_day",
      activityType: templateActivity ?? "Rest / recovery",
      routineId: null,
      routineTitle: null,
      intensity: "rest",
      suggestedStart: null,
      suggestedEnd: null,
      durationMinutes: 0,
      slotReason: "Template marks today as rest or active recovery.",
      completionTitle: null
    };
  }

  const plannedDuration = durationForIntensity(adjustedIntensity);
  const slot = pickSlot(summary, plannedDuration, template?.preferredTime);
  if (!slot) {
    return {
      status: "no_slot",
      activityType: plannedActivityTitle,
      routineId: templateRoutineId,
      routineTitle: templateRoutineTitle,
      intensity: adjustedIntensity,
      suggestedStart: null,
      suggestedEnd: null,
      durationMinutes: 20,
      slotReason: "No free slot meets the minimum threshold today.",
      completionTitle: null
    };
  }

  const actualDuration = Math.min(plannedDuration, slot.durationMinutes);
  const plannedEnd = new Date(slot.start.getTime() + actualDuration * 60_000);
  if (slot.durationMinutes < plannedDuration) {
    return {
      status: "minimum_viable",
      activityType: plannedActivityTitle,
      routineId: templateRoutineId,
      routineTitle: templateRoutineTitle,
      intensity: "light",
      suggestedStart: slot.start,
      suggestedEnd: plannedEnd,
      durationMinutes: actualDuration,
      slotReason: "Calendar is tight, so this is a trimmed minimum-viable session.",
      completionTitle: null
    };
  }

  return {
    status: "planned",
    activityType: plannedActivityTitle,
    routineId: templateRoutineId,
    routineTitle: templateRoutineTitle,
    intensity: adjustedIntensity,
    suggestedStart: slot.start,
    suggestedEnd: plannedEnd,
    durationMinutes: actualDuration,
    slotReason:
      template?.preferredTime?.toLowerCase() === "morning"
        ? "Earliest morning slot that fits the session."
        : "Best available free slot from today’s calendar.",
    completionTitle: null
  };
}

function formatNutritionTargetSummary(targetState: NutritionTargetState) {
  const parts = [];

  if (targetState.targets.calories !== null) {
    parts.push(`${targetState.targets.calories} kcal`);
  }
  if (targetState.targets.protein !== null) {
    parts.push(`${targetState.targets.protein}g protein`);
  }
  if (targetState.targets.fibre !== null) {
    parts.push(`${targetState.targets.fibre}g fibre`);
  }

  return parts.join(", ");
}

function buildNutritionNote(summary: DailySummary, targetState: NutritionTargetState | null) {
  const mealPlan = summary.dailyPlan?.mealPlan as Record<string, unknown> | null | undefined;
  const targetSummary =
    targetState &&
    (targetState.targets.calories !== null ||
      targetState.targets.protein !== null ||
      targetState.targets.fibre !== null)
      ? formatNutritionTargetSummary(targetState)
      : null;

  if (mealPlan && typeof mealPlan.dinner === "string") {
    return {
      configured: true,
      note: targetSummary
        ? `Dinner plan: ${mealPlan.dinner}. Targets: ${targetSummary}.`
        : `Dinner plan: ${mealPlan.dinner}.`
    };
  }

  if (targetSummary) {
    return {
      configured: true,
      note: `Targets: ${targetSummary}.`
    };
  }

  return {
    configured: false,
    note: "Nutrition target is not configured yet. Keep logging meals and keep lunch simple."
  };
}

function buildCoachingNote(plan: PlannedWorkout, recoveryLabel: GeneratedDailyPlan["recovery"]["label"], engagement: EngagementStatus | "unknown") {
  if (plan.status === "completed") {
    return "Training is already banked. Keep the rest of the day tidy.";
  }

  if (plan.status === "rest_day") {
    return "Rest counts. Keep the day calm and do not invent hardship.";
  }

  if (plan.status === "no_slot") {
    return "Calendar is crowded. Do the smallest useful thing rather than missing the day entirely.";
  }

  if (engagement === "red" || engagement === "amber") {
    return "Small target today. Get the session done before life starts bargaining with you.";
  }

  if (recoveryLabel === "poor") {
    return "Recovery looks thin. Reduce the heroics and keep the quality.";
  }

  return "Do the planned session before the day fragments.";
}

function buildSummaryText(
  date: string,
  dayOfWeek: DayOfWeek,
  timeZone: string,
  workout: PlannedWorkout,
  recovery: GeneratedDailyPlan["recovery"],
  engagement: GeneratedDailyPlan["engagement"],
  nutrition: GeneratedDailyPlan["nutrition"]
) {
  const slotStart = formatLocalTime(workout.suggestedStart, timeZone);
  const slotEnd = formatLocalTime(workout.suggestedEnd, timeZone);
  const workoutSentence =
    workout.status === "completed"
      ? `Workout already done: ${workout.completionTitle}.`
      : workout.status === "rest_day"
        ? "Rest / recovery day."
        : workout.status === "no_slot"
          ? `No clean slot today. Minimum viable target: ${workout.activityType} for about ${workout.durationMinutes} minutes.`
          : `${workout.activityType} for ${workout.durationMinutes} minutes${slotStart && slotEnd ? ` at ${slotStart}-${slotEnd}` : ""}.`;

  return `${titleCaseDay(dayOfWeek)} ${date}. ${workoutSentence} Recovery: ${recovery.label}${recovery.score !== null ? ` (${recovery.score})` : ""}. Engagement: ${engagement.label}. ${nutrition.note}`;
}

export async function generateDailyPlan(
  input: {
    date: string;
    timeZone?: string;
    config?: AppConfig;
  },
  dependencies: Pick<
    PlanningDependencies,
    "getDailySummary" | "storeDailyPlan" | "getNutritionTargetState"
  > = defaultDependencies
): Promise<GeneratedDailyPlan> {
  const summary = await dependencies.getDailySummary({
    date: input.date,
    timeZone: input.timeZone,
    minimumFreeSlotMinutes: DEFAULT_MINIMUM_FREE_SLOT_MINUTES,
    protectedBlocks: [...DEFAULT_PROTECTED_BLOCKS]
  });

  const recoveryScore = summary.scores.recovery?.value ?? null;
  const recoveryLabel = getRecoveryLabel(recoveryScore);
  const engagementStatus = summary.engagementStatus?.status ?? "unknown";
  const workout = buildWorkoutPlan(summary);
  const nutritionTargets =
    input.config && dependencies.getNutritionTargetState
      ? await dependencies.getNutritionTargetState(input.config)
      : null;
  const nutrition = buildNutritionNote(summary, nutritionTargets);
  const freshnessNote = formatFreshness(summary);
  const coachingNote = buildCoachingNote(workout, recoveryLabel, engagementStatus);
  const engagementLabel =
    engagementStatus === "green"
      ? "green"
      : engagementStatus === "amber"
        ? "amber"
        : engagementStatus === "red"
          ? "red"
          : "unknown";
  const generated: GeneratedDailyPlan = {
    date: input.date,
    timeZone: summary.timeZone,
    dayOfWeek: summary.dayOfWeek,
    summary: buildSummaryText(
      input.date,
      summary.dayOfWeek,
      summary.timeZone,
      workout,
      { score: recoveryScore, label: recoveryLabel },
      { status: engagementStatus, label: engagementLabel },
      nutrition
    ),
    workout,
    nutrition,
    recovery: {
      score: recoveryScore,
      label: recoveryLabel
    },
    engagement: {
      status: engagementStatus,
      label: engagementLabel
    },
    freshnessNote,
    coachingNote,
    sourceSummary: {
      workoutsToday: summary.workouts.length,
      calendarEventCount: summary.calendar.events.length,
      freeSlotCount: summary.calendar.freeSlots.length
    }
  };

  await dependencies.storeDailyPlan({
    planDate: summary.range.start,
    summary: generated.summary,
    workoutPlan: {
      ...generated.workout,
      suggestedStart: generated.workout.suggestedStart?.toISOString() ?? null,
      suggestedEnd: generated.workout.suggestedEnd?.toISOString() ?? null
    },
    mealPlan: {
      note: generated.nutrition.note,
      configured: generated.nutrition.configured
    },
    recoveryContext: generated.recovery,
    sourceSnapshot: {
      freshness: summary.freshness.map((entry) => ({
        source: entry.source,
        lastSuccessfulIngestAt: entry.lastSuccessfulIngestAt?.toISOString() ?? null,
        lastStatus: entry.lastStatus
      })),
      engagementStatus: generated.engagement.status,
      workoutsToday: generated.sourceSummary.workoutsToday,
      calendarEventCount: generated.sourceSummary.calendarEventCount,
      freeSlotCount: generated.sourceSummary.freeSlotCount
    }
  });

  return generated;
}

export function renderMorningBrief(plan: GeneratedDailyPlan) {
  const slotStart = formatLocalTime(plan.workout.suggestedStart, plan.timeZone);
  const slotEnd = formatLocalTime(plan.workout.suggestedEnd, plan.timeZone);
  const workoutLine =
    plan.workout.status === "completed"
      ? `Workout: already done (${plan.workout.completionTitle}).`
      : plan.workout.status === "rest_day"
        ? "Workout: rest / active recovery."
        : plan.workout.status === "no_slot"
          ? `Workout: no clean slot. Minimum viable target is ${plan.workout.durationMinutes} minutes of ${plan.workout.activityType?.toLowerCase() ?? "movement"}.`
          : `Workout: ${plan.workout.activityType} for ${plan.workout.durationMinutes} minutes${slotStart && slotEnd ? ` at ${slotStart}-${slotEnd}` : ""}.`;

  const whyLine = `Why: ${plan.workout.slotReason}`;
  const recoveryLine = `Recovery: ${plan.recovery.label}${plan.recovery.score !== null ? ` (${plan.recovery.score})` : ""}. Engagement: ${plan.engagement.label}.`;

  return [
    `${titleCaseDay(plan.dayOfWeek)}.`,
    workoutLine,
    whyLine,
    `Nutrition: ${plan.nutrition.note}`,
    recoveryLine,
    plan.freshnessNote,
    `Note: ${plan.coachingNote}`
  ].join("\n");
}

export async function sendMorningBrief(
  config: AppConfig,
  input: {
    date: string;
    timeZone?: string;
    dryRun?: boolean;
  },
  dependencies: PlanningDependencies = defaultDependencies
) {
  if (!(input.dryRun ?? false)) {
    await dependencies.refreshDailySignals({
      date: input.date,
      timeZone: input.timeZone
    });
  }

  const plan = await generateDailyPlan(
    {
      date: input.date,
      timeZone: input.timeZone,
      config
    },
    dependencies
  );
  const text = renderMorningBrief(plan);

  const recent = await dependencies.listRecentConversationMessages(30);
  const existing = recent.find((message) => {
    if (message.actor !== "assistant" || !message.metadata || typeof message.metadata !== "object") {
      return false;
    }

    const metadata = message.metadata as Record<string, unknown>;
    return metadata.kind === "morning_brief" && metadata.planDate === input.date;
  });

  if (!input.dryRun && !existing) {
    await dependencies.sendTelegramMessage(config, text);
    await dependencies.storeConversationMessage({
      actor: "assistant",
      content: text,
      metadata: {
        kind: "morning_brief",
        planDate: input.date
      }
    });
  }

  return {
    plan,
    text,
    skipped: Boolean(existing)
  };
}
