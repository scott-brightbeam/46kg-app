import type { AppConfig } from "../config.js";
import { sendMissedWorkoutFollowUp, sendNextCheckinPrompt, sendWeightPrompt } from "./coaching.js";
import { sendMorningBrief } from "./planning.js";
import { refreshDailySignals } from "./scoring.js";

type RhythmDependencies = {
  refreshDailySignals: typeof refreshDailySignals;
  sendMorningBrief: typeof sendMorningBrief;
  sendWeightPrompt: typeof sendWeightPrompt;
  sendNextCheckinPrompt: typeof sendNextCheckinPrompt;
  sendMissedWorkoutFollowUp: typeof sendMissedWorkoutFollowUp;
};

type RhythmInput = {
  now?: Date;
  timeZone?: string;
  dryRun?: boolean;
};

type RhythmActionName =
  | "morningBrief"
  | "weeklyWeightPrompt"
  | "checkinPrompt"
  | "missedWorkoutFollowUp";

const defaultDependencies: RhythmDependencies = {
  refreshDailySignals,
  sendMorningBrief,
  sendWeightPrompt,
  sendNextCheckinPrompt,
  sendMissedWorkoutFollowUp
};

const DEFAULT_TIME_ZONE = "Europe/London";
const CHECKIN_HOURS = new Set([10, 13, 16, 19]);
const MISSED_WORKOUT_START_HOUR = 10;
const MISSED_WORKOUT_END_HOUR = 21;

function getLocalParts(now: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    weekday: "long",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  }).formatToParts(now);

  const getPart = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value;
  const year = getPart("year");
  const month = getPart("month");
  const day = getPart("day");
  const hour = getPart("hour");
  const minute = getPart("minute");
  const weekday = getPart("weekday")?.toLowerCase();

  if (!year || !month || !day || !hour || !minute || !weekday) {
    throw new Error(`Unable to derive local time parts for "${timeZone}".`);
  }

  return {
    date: `${year}-${month}-${day}`,
    weekday,
    hour: Number.parseInt(hour, 10),
    minute: Number.parseInt(minute, 10)
  };
}

function shouldSendMorningBrief(hour: number) {
  return hour === 7;
}

function shouldSendWeightPrompt(weekday: string, hour: number) {
  return weekday === "sunday" && hour === 7;
}

function shouldSendCheckinPrompt(hour: number) {
  return CHECKIN_HOURS.has(hour);
}

function shouldSendMissedWorkoutFollowUp(hour: number) {
  return hour >= MISSED_WORKOUT_START_HOUR && hour <= MISSED_WORKOUT_END_HOUR;
}

export async function runCoachingRhythm(
  config: AppConfig,
  input: RhythmInput = {},
  dependencies: RhythmDependencies = defaultDependencies
) {
  const timeZone = input.timeZone ?? DEFAULT_TIME_ZONE;
  const now = input.now ?? new Date();
  const local = getLocalParts(now, timeZone);
  const date = local.date;
  const dryRun = input.dryRun ?? false;
  const actions: Partial<Record<RhythmActionName, unknown>> = {};

  if (!dryRun) {
    await dependencies.refreshDailySignals({
      date,
      timeZone
    });
  }

  if (shouldSendMorningBrief(local.hour)) {
    actions.morningBrief = await dependencies.sendMorningBrief(config, {
      date,
      timeZone,
      dryRun
    });
  }

  if (shouldSendWeightPrompt(local.weekday, local.hour)) {
    actions.weeklyWeightPrompt = await dependencies.sendWeightPrompt(config, {
      date,
      dryRun
    });
  }

  if (shouldSendCheckinPrompt(local.hour)) {
    actions.checkinPrompt = await dependencies.sendNextCheckinPrompt(config, {
      date,
      timeZone,
      dryRun
    });
  }

  if (shouldSendMissedWorkoutFollowUp(local.hour)) {
    actions.missedWorkoutFollowUp = await dependencies.sendMissedWorkoutFollowUp(config, {
      date,
      timeZone,
      now,
      dryRun
    });
  }

  return {
    date,
    timeZone,
    localTime: `${date} ${String(local.hour).padStart(2, "0")}:${String(local.minute).padStart(2, "0")}`,
    actions
  };
}
