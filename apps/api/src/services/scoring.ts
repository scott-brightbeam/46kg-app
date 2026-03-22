import { and, asc, eq, gte, lt } from "drizzle-orm";

import { conversationLog, getDb, healthMetrics } from "@codex/db";
import type { EngagementStatus, ScoreType } from "@codex/shared";

import { getDailySummary, getWeeklySummary, type DailySummary, type WeeklySummary } from "./current-state.js";
import { ensureMetricDefinition, replaceDailyScore, replaceEngagementStatus } from "./persistence.js";

type HealthMetricSnapshot = {
  metricType: string;
  observedAt: Date;
  valueNumeric: number | null;
  unit: string | null;
};

type ConversationSnapshot = {
  actor: string;
  content: string | null;
  messageAt: Date;
  metadata: unknown;
};

type ScoreComputation = {
  scoreType: ScoreType;
  value: number;
  confidence: number;
  provenance: Record<string, unknown>;
};

type EngagementReason = {
  code: string;
  detail: string;
};

type DailySignals = {
  date: string;
  timeZone: string;
  scores: Record<ScoreType, ScoreComputation>;
  engagementStatus: {
    status: EngagementStatus;
    reasons: EngagementReason[];
    indicators: Record<string, unknown>;
  };
};

type ScoringRepository = {
  ensureMetricDefinition: typeof ensureMetricDefinition;
  getDailySummary: typeof getDailySummary;
  getWeeklySummary: typeof getWeeklySummary;
  listConversationMessages: (range: { start: Date; end: Date }) => Promise<ConversationSnapshot[]>;
  listHealthMetrics: (range: { start: Date; end: Date }) => Promise<HealthMetricSnapshot[]>;
  replaceDailyScore: typeof replaceDailyScore;
  replaceEngagementStatus: typeof replaceEngagementStatus;
};

const DEFAULT_TIME_ZONE = "Europe/London";
const FORMULA_VERSION = "v1";
const SCORE_FORMULAS: Record<ScoreType, { formula: string; notes: string }> = {
  workout_adherence: {
    formula:
      "100 when a required session is completed or not yet due; 100 on rest/no-slot days; 0 once a required session is overdue and still incomplete.",
    notes: "Deterministic day-level adherence for a single-user coaching loop."
  },
  effort: {
    formula:
      "Min(100, actual workout minutes / planned minutes * 100). Defaults to 100 for rest/no-slot/pending sessions and 0 for missed sessions.",
    notes: "Duration-based effort proxy until richer heart-rate and RPE signals are wired in."
  },
  recovery: {
    formula:
      "Average of available recovery components from subjective check-ins and Health metrics, with a neutral fallback of 65 when signals are absent.",
    notes: "Components currently include sleep, mood, stress, soreness, disruption, HRV, resting heart rate, and sleep duration where available."
  },
  consistency: {
    formula:
      "Rolling 7-day score from meal coverage, workout cadence, check-in completion, weekly weigh-in presence, and response-day coverage, with a neutral fallback of 60 when no history exists.",
    notes: "Designed to reward continuity rather than intensity."
  }
};

const defaultRepository: ScoringRepository = {
  ensureMetricDefinition,
  getDailySummary,
  getWeeklySummary,
  async listConversationMessages(range) {
    const db = getDb();
    const rows = await db
      .select({
        actor: conversationLog.actor,
        content: conversationLog.content,
        messageAt: conversationLog.messageAt,
        metadata: conversationLog.metadata
      })
      .from(conversationLog)
      .where(and(gte(conversationLog.messageAt, range.start), lt(conversationLog.messageAt, range.end)))
      .orderBy(asc(conversationLog.messageAt));

    return rows;
  },
  async listHealthMetrics(range) {
    const db = getDb();
    const rows = await db
      .select({
        metricType: healthMetrics.metricType,
        observedAt: healthMetrics.observedAt,
        valueNumeric: healthMetrics.valueNumeric,
        unit: healthMetrics.unit
      })
      .from(healthMetrics)
      .where(and(gte(healthMetrics.observedAt, range.start), lt(healthMetrics.observedAt, range.end)))
      .orderBy(asc(healthMetrics.observedAt));

    return rows.map((row) => ({
      metricType: row.metricType,
      observedAt: row.observedAt,
      valueNumeric: row.valueNumeric === null ? null : Number(row.valueNumeric),
      unit: row.unit
    }));
  },
  replaceDailyScore,
  replaceEngagementStatus
};

function shiftIsoDate(date: string, deltaDays: number) {
  const base = new Date(`${date}T12:00:00.000Z`);
  base.setUTCDate(base.getUTCDate() + deltaDays);
  return base.toISOString().slice(0, 10);
}

function getWeekStart(date: string) {
  const base = new Date(`${date}T12:00:00.000Z`);
  const day = base.getUTCDay();
  const delta = day === 0 ? -6 : 1 - day;
  base.setUTCDate(base.getUTCDate() + delta);
  return base.toISOString().slice(0, 10);
}

function clamp(value: number, min = 0, max = 100) {
  return Math.min(max, Math.max(min, value));
}

function round(value: number, digits = 2) {
  return Number(value.toFixed(digits));
}

function average(values: number[]) {
  if (values.length === 0) {
    return null;
  }

  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function isRestLike(activityType: string | null | undefined) {
  return Boolean(activityType && /\brest\b|\brecovery\b/i.test(activityType));
}

function coerceWorkoutPlan(value: unknown) {
  if (!value || typeof value !== "object") {
    return null;
  }

  const plan = value as Record<string, unknown>;
  const suggestedStart =
    typeof plan.suggestedStart === "string" ? new Date(plan.suggestedStart) : null;
  const suggestedEnd = typeof plan.suggestedEnd === "string" ? new Date(plan.suggestedEnd) : null;

  return {
    status: typeof plan.status === "string" ? plan.status : null,
    activityType: typeof plan.activityType === "string" ? plan.activityType : null,
    durationMinutes:
      typeof plan.durationMinutes === "number" && Number.isFinite(plan.durationMinutes)
        ? plan.durationMinutes
        : 0,
    suggestedStart:
      suggestedStart && !Number.isNaN(suggestedStart.getTime()) ? suggestedStart : null,
    suggestedEnd: suggestedEnd && !Number.isNaN(suggestedEnd.getTime()) ? suggestedEnd : null
  };
}

function parsePromptKind(metadata: unknown) {
  if (!metadata || typeof metadata !== "object") {
    return null;
  }

  const record = metadata as Record<string, unknown>;
  return typeof record.kind === "string" ? record.kind : null;
}

function parsePromptDate(metadata: unknown) {
  if (!metadata || typeof metadata !== "object") {
    return null;
  }

  const record = metadata as Record<string, unknown>;
  return typeof record.promptDate === "string" ? record.promptDate : null;
}

function parseNumericScale(text: string) {
  const match = text.match(/-?\d+(?:[.,]\d+)?/);
  if (!match) {
    return null;
  }

  const value = Number.parseFloat(match[0].replace(",", "."));
  if (!Number.isFinite(value)) {
    return null;
  }

  if (value >= 0 && value <= 5) {
    return clamp((value / 5) * 100);
  }

  if (value >= 0 && value <= 10) {
    return clamp(value * 10);
  }

  if (value > 10 && value <= 100) {
    return clamp(value);
  }

  return null;
}

function parseSubjectiveScore(text: string) {
  const numeric = parseNumericScale(text);
  if (numeric !== null) {
    return numeric;
  }

  const normalized = text.trim().toLowerCase();
  if (!normalized) {
    return null;
  }

  const mappings: Array<[RegExp, number]> = [
    [/\bexcellent\b|\bgreat\b|\bvery good\b|\bbrilliant\b|\bstrong\b/, 90],
    [/\bgood\b|\bsolid\b|\bdecent\b/, 78],
    [/\bok\b|\bokay\b|\bfine\b|\bmedium\b|\bmoderate\b|\baverage\b/, 62],
    [/\bpoor\b|\bbad\b|\blow\b|\brough\b|\btired\b/, 40],
    [/\bterrible\b|\bawful\b|\bexhausted\b|\bvery low\b|\bshattered\b/, 22],
    [/\bhigh\b|\bvery high\b/, 85],
    [/\blight\b|\blow\b|\bnone\b|\bnope\b/, 20]
  ];

  for (const [pattern, score] of mappings) {
    if (pattern.test(normalized)) {
      return score;
    }
  }

  return null;
}

function scoreSleepHours(hours: number) {
  if (hours >= 8) {
    return 90;
  }
  if (hours >= 7) {
    return 80;
  }
  if (hours >= 6) {
    return 65;
  }
  if (hours >= 5) {
    return 45;
  }
  return 28;
}

function scoreHrv(value: number) {
  if (value >= 60) {
    return 90;
  }
  if (value >= 45) {
    return 80;
  }
  if (value >= 30) {
    return 65;
  }
  if (value >= 20) {
    return 45;
  }
  return 28;
}

function scoreRestingHeartRate(value: number) {
  if (value < 55) {
    return 90;
  }
  if (value < 65) {
    return 78;
  }
  if (value < 75) {
    return 62;
  }
  if (value < 85) {
    return 45;
  }
  return 30;
}

function collectHealthMetricSignals(metrics: HealthMetricSnapshot[]) {
  const signalScores: number[] = [];
  const components: Record<string, number> = {};

  const sleepCandidates = metrics.filter(
    (metric) =>
      /sleep/i.test(metric.metricType) &&
      !/stage/i.test(metric.metricType) &&
      metric.valueNumeric !== null &&
      metric.valueNumeric > 0.5 &&
      metric.valueNumeric < 14
  );
  const sleepAverage = average(sleepCandidates.map((metric) => metric.valueNumeric ?? 0));
  if (sleepAverage !== null) {
    const score = scoreSleepHours(sleepAverage);
    signalScores.push(score);
    components.sleep_hours = round(sleepAverage);
  }

  const hrvCandidates = metrics.filter(
    (metric) =>
      /(^|\s)hrv\b|heart rate variability/i.test(metric.metricType) &&
      metric.valueNumeric !== null
  );
  const hrvAverage = average(hrvCandidates.map((metric) => metric.valueNumeric ?? 0));
  if (hrvAverage !== null) {
    const score = scoreHrv(hrvAverage);
    signalScores.push(score);
    components.hrv = round(hrvAverage);
  }

  const restingHrCandidates = metrics.filter(
    (metric) => /resting.*heart|heart rate.*resting/i.test(metric.metricType) && metric.valueNumeric !== null
  );
  const restingHrAverage = average(restingHrCandidates.map((metric) => metric.valueNumeric ?? 0));
  if (restingHrAverage !== null) {
    const score = scoreRestingHeartRate(restingHrAverage);
    signalScores.push(score);
    components.resting_heart_rate = round(restingHrAverage);
  }

  return {
    signalScores,
    components
  };
}

function buildRecoveryScore(summary: DailySummary, metrics: HealthMetricSnapshot[]): ScoreComputation {
  const checkinComponents: number[] = [];
  const checkinDetails: Record<string, number> = {};

  for (const checkin of summary.checkins) {
    const score = parseSubjectiveScore(checkin.valueText);
    if (score === null) {
      continue;
    }

    let normalized = score;
    if (["stress", "soreness", "disruption", "illness", "alcohol", "hunger"].includes(checkin.field)) {
      normalized = 100 - score;
    }

    checkinComponents.push(normalized);
    checkinDetails[checkin.field] = round(normalized);
  }

  const healthSignals = collectHealthMetricSignals(metrics);
  const combined = [...checkinComponents, ...healthSignals.signalScores];
  const value = combined.length > 0 ? average(combined) ?? 65 : 65;
  const confidence = clamp(0.25 + combined.length * 0.11, 0.25, 0.92);

  return {
    scoreType: "recovery",
    value: round(value ?? 65),
    confidence: round(confidence),
    provenance: {
      source: "deterministic_v1",
      checkins: checkinDetails,
      health: healthSignals.components,
      componentCount: combined.length,
      fallbackApplied: combined.length === 0
    }
  };
}

function buildWorkoutAdherenceScore(summary: DailySummary, evaluationNow: Date): ScoreComputation {
  const plan = coerceWorkoutPlan(summary.dailyPlan?.workoutPlan);
  const hasWorkout = summary.workouts.length > 0;
  const required = plan
    ? !["completed", "rest_day", "no_slot"].includes(plan.status ?? "")
    : Boolean(summary.dayTemplate && !isRestLike(summary.dayTemplate.activityType));
  const pending =
    required &&
    plan?.suggestedEnd instanceof Date &&
    evaluationNow.getTime() < plan.suggestedEnd.getTime();
  const value = hasWorkout || !required || pending ? 100 : 0;

  return {
    scoreType: "workout_adherence",
    value,
    confidence: required ? 0.9 : 0.6,
    provenance: {
      source: "deterministic_v1",
      hasWorkout,
      required,
      pending,
      workoutCount: summary.workouts.length,
      planStatus: plan?.status ?? null
    }
  };
}

function buildEffortScore(summary: DailySummary, evaluationNow: Date): ScoreComputation {
  const plan = coerceWorkoutPlan(summary.dailyPlan?.workoutPlan);
  const totalWorkoutMinutes = Math.max(
    0,
    summary.workouts.reduce((sum, workout) => sum + Math.round((workout.durationSeconds ?? 0) / 60), 0)
  );

  if (summary.workouts.length > 0) {
    const plannedMinutes = plan?.durationMinutes ?? 0;
    const ratio = plannedMinutes > 0 ? clamp((totalWorkoutMinutes / plannedMinutes) * 100) : 100;
    return {
      scoreType: "effort",
      value: round(ratio),
      confidence: plannedMinutes > 0 ? 0.86 : 0.72,
      provenance: {
        source: "deterministic_v1",
        totalWorkoutMinutes,
        plannedMinutes
      }
    };
  }

  const required = plan
    ? !["completed", "rest_day", "no_slot"].includes(plan.status ?? "")
    : Boolean(summary.dayTemplate && !isRestLike(summary.dayTemplate.activityType));
  const pending =
    required &&
    plan?.suggestedEnd instanceof Date &&
    evaluationNow.getTime() < plan.suggestedEnd.getTime();
  const value = !required || pending ? 100 : 0;

  return {
    scoreType: "effort",
    value,
    confidence: 0.7,
    provenance: {
      source: "deterministic_v1",
      totalWorkoutMinutes,
      required,
      pending
    }
  };
}

function buildConsistencyScore(input: {
  weeklySummary: WeeklySummary;
  recentDailySummaries: DailySummary[];
  conversationMessages: ConversationSnapshot[];
}) {
  const userMessageDays = new Set(
    input.conversationMessages
      .filter((message) => message.actor === "user")
      .map((message) => message.messageAt.toISOString().slice(0, 10))
  ).size;

  const hasAnyHistory =
    input.weeklySummary.workoutCount > 0 ||
    input.weeklySummary.meals.totalEntries > 0 ||
    input.weeklySummary.checkinCount > 0 ||
    input.weeklySummary.latestWeight !== null ||
    input.conversationMessages.length > 0;

  if (!hasAnyHistory) {
    return {
      scoreType: "consistency" as const,
      value: 60,
      confidence: 0.3,
      provenance: {
        source: "deterministic_v1",
        fallbackApplied: true,
        reason: "no_recent_history"
      }
    };
  }

  const mealCoverage = (input.weeklySummary.meals.daysWithTwoMealsLogged / 7) * 40;
  const workoutCadence = (Math.min(input.weeklySummary.workoutCount, 3) / 3) * 25;
  const checkinCoverage = (Math.min(input.weeklySummary.checkinCount, 7) / 7) * 20;
  const weightCoverage = input.weeklySummary.latestWeight ? 10 : 0;
  const responseCoverage = (Math.min(userMessageDays, 7) / 7) * 5;
  const value = clamp(mealCoverage + workoutCadence + checkinCoverage + weightCoverage + responseCoverage);

  return {
    scoreType: "consistency" as const,
    value: round(value),
    confidence: 0.84,
    provenance: {
      source: "deterministic_v1",
      mealCoverageDays: input.weeklySummary.meals.daysWithTwoMealsLogged,
      workoutCount: input.weeklySummary.workoutCount,
      checkinCount: input.weeklySummary.checkinCount,
      userMessageDays,
      latestWeightPresent: input.weeklySummary.latestWeight !== null
    }
  };
}

function evaluateEngagement(input: {
  date: string;
  weeklySummary: WeeklySummary;
  recentDailySummaries: DailySummary[];
  conversationMessages: ConversationSnapshot[];
}) {
  const hasAnyHistory =
    input.weeklySummary.workoutCount > 0 ||
    input.weeklySummary.meals.totalEntries > 0 ||
    input.weeklySummary.checkinCount > 0 ||
    input.weeklySummary.latestWeight !== null ||
    input.conversationMessages.length > 0;

  if (!hasAnyHistory) {
    return {
      status: "green" as const,
      reasons: [],
      indicators: {
        bootstrapping: true
      }
    };
  }

  const reasons: EngagementReason[] = [];
  const recentThreeDays = input.recentDailySummaries.slice(-3);
  const recentTwoDayMealCounts = input.recentDailySummaries.slice(-2).map((summary) => summary.meals.entries.length);
  let missedWorkoutDays = 0;

  for (const summary of recentThreeDays) {
    const plan = coerceWorkoutPlan(summary.dailyPlan?.workoutPlan);
    const hasWorkout = summary.workouts.length > 0;
    const required = plan
      ? !["completed", "rest_day", "no_slot"].includes(plan.status ?? "")
      : Boolean(summary.dayTemplate && !isRestLike(summary.dayTemplate.activityType));
    const evaluationNow =
      summary.date === input.date
        ? new Date(`${summary.date}T23:59:59.999Z`)
        : new Date(`${summary.date}T23:59:59.999Z`);
    const pending =
      required &&
      plan?.suggestedEnd instanceof Date &&
      evaluationNow.getTime() < plan.suggestedEnd.getTime();

    if (required && !hasWorkout && !pending) {
      missedWorkoutDays += 1;
    }
  }

  if (missedWorkoutDays >= 2) {
    reasons.push({
      code: "missed_workouts_3d",
      detail: `${missedWorkoutDays} missed workout days in the last 3 days.`
    });
  }

  const lowMealLoggingTwoConsecutiveDays =
    recentTwoDayMealCounts.length === 2 &&
    recentTwoDayMealCounts[0]! < 2 &&
    recentTwoDayMealCounts[1]! < 2;
  if (lowMealLoggingTwoConsecutiveDays) {
    reasons.push({
      code: "low_meal_logging",
      detail: "Fewer than two meals were logged on two consecutive days."
    });
  }

  const promptedForWeight = input.conversationMessages.some((message) => {
    if (message.actor !== "assistant") {
      return false;
    }

    const metadata = message.metadata as Record<string, unknown> | null;
    return metadata?.kind === "prompt" && metadata?.promptKind === "weight";
  });
  if (promptedForWeight && input.weeklySummary.latestWeight === null) {
    reasons.push({
      code: "missed_weigh_in",
      detail: "A weekly weigh-in prompt was sent, but no weight was logged in the last 7 days."
    });
  }

  const assistantPrompts = input.conversationMessages.filter(
    (message) =>
      message.actor === "assistant" &&
      parsePromptKind(message.metadata) === "prompt"
  ).length;
  const userReplies = input.conversationMessages.filter((message) => message.actor === "user").length;
  const responseRate = assistantPrompts > 0 ? userReplies / assistantPrompts : 1;
  if (assistantPrompts >= 3 && responseRate < 0.5) {
    reasons.push({
      code: "response_rate_drop",
      detail: `Telegram response rate is down to ${Math.round(responseRate * 100)}% across recent prompts.`
    });
  }

  const userMessages = input.conversationMessages.filter((message) => message.actor === "user");
  const lastUserMessage = userMessages[userMessages.length - 1] ?? null;
  const silenceFiveDays =
    assistantPrompts > 0 &&
    (!lastUserMessage ||
      lastUserMessage.messageAt.getTime() < new Date(`${shiftIsoDate(input.date, -5)}T00:00:00.000Z`).getTime());

  let status: EngagementStatus = "green";
  if (silenceFiveDays) {
    status = "red";
    reasons.unshift({
      code: "silence_five_days",
      detail: "No user response has landed in the last 5 days."
    });
  } else if (reasons.length > 0) {
    status = "amber";
  }

  if (status === "amber" && reasons.length >= 3) {
    status = "red";
  }

  return {
    status,
    reasons,
    indicators: {
      missedWorkoutDays,
      lowMealLoggingTwoConsecutiveDays,
      promptedForWeight,
      responseRate: round(responseRate),
      assistantPrompts,
      userReplies,
      silenceFiveDays
    }
  };
}

export async function refreshDailySignals(
  input: {
    date: string;
    timeZone?: string;
    dryRun?: boolean;
  },
  repository: ScoringRepository = defaultRepository
): Promise<DailySignals> {
  const timeZone = input.timeZone ?? DEFAULT_TIME_ZONE;
  const dates = Array.from({ length: 7 }, (_, index) => shiftIsoDate(input.date, index - 6));
  const [today, weeklySummary, conversationMessages, healthMetricRows] = await Promise.all([
    repository.getDailySummary({
      date: input.date,
      timeZone
    }),
    repository.getWeeklySummary({
      weekStart: getWeekStart(input.date),
      timeZone
    }),
    repository.listConversationMessages({
      start: new Date(`${dates[0]}T00:00:00.000Z`),
      end: new Date(`${shiftIsoDate(input.date, 1)}T00:00:00.000Z`)
    }),
    repository.listHealthMetrics({
      start: new Date(`${input.date}T00:00:00.000Z`),
      end: new Date(`${shiftIsoDate(input.date, 1)}T00:00:00.000Z`)
    })
  ]);

  const recentDailySummaries = await Promise.all(
    dates.map((date) =>
      repository.getDailySummary({
        date,
        timeZone
      })
    )
  );

  const evaluationNow = new Date(`${shiftIsoDate(input.date, 1)}T00:00:00.000Z`);
  const workoutAdherence = buildWorkoutAdherenceScore(today, evaluationNow);
  const effort = buildEffortScore(today, evaluationNow);
  const recovery = buildRecoveryScore(today, healthMetricRows);
  const consistency = buildConsistencyScore({
    weeklySummary,
    recentDailySummaries,
    conversationMessages
  });
  const engagement = evaluateEngagement({
    date: input.date,
    weeklySummary,
    recentDailySummaries,
    conversationMessages
  });

  const scores: Record<ScoreType, ScoreComputation> = {
    workout_adherence: workoutAdherence,
    effort,
    recovery,
    consistency
  };

  if (!input.dryRun) {
    await Promise.all(
      (Object.keys(SCORE_FORMULAS) as ScoreType[]).map((scoreType) =>
        repository.ensureMetricDefinition({
          scoreType,
          version: FORMULA_VERSION,
          formula: SCORE_FORMULAS[scoreType].formula,
          notes: SCORE_FORMULAS[scoreType].notes
        })
      )
    );

    await Promise.all([
      ...Object.values(scores).map((score) =>
        repository.replaceDailyScore({
          scoreDate: today.range.start,
          scoreType: score.scoreType,
          value: score.value,
          confidence: score.confidence,
          formulaVersion: FORMULA_VERSION,
          provenance: score.provenance
        })
      ),
      repository.replaceEngagementStatus({
        effectiveAt: today.range.start,
        status: engagement.status,
        reasons: engagement.reasons,
        createdBy: "manual"
      })
    ]);
  }

  return {
    date: input.date,
    timeZone,
    scores,
    engagementStatus: engagement
  };
}
