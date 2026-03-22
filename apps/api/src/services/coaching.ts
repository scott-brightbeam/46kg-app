import type { AppConfig } from "../config.js";
import { sendTelegramMessage } from "../lib/telegram.js";
import { getDailySummary } from "./current-state.js";
import { generateDailyPlan } from "./planning.js";
import {
  listRecentConversationMessages,
  setConversationMessageMetadata,
  storeCheckinResponse,
  storeConversationMessage,
  storeDailyPlan,
  storeWeightEntry
} from "./persistence.js";

type PromptKind = "weight" | "checkin" | "missed_workout";

type PromptMetadata = {
  kind: "prompt";
  promptKind: PromptKind;
  promptDate: string;
  field?: string;
  awaitingReply: boolean;
  resolvedAt?: string;
  resolvedBy?: string;
};

type ConversationMessageRecord = Awaited<ReturnType<typeof listRecentConversationMessages>>[number];

type CoachingDependencies = {
  generateDailyPlan: typeof generateDailyPlan;
  getDailySummary: typeof getDailySummary;
  listRecentConversationMessages: typeof listRecentConversationMessages;
  sendTelegramMessage: typeof sendTelegramMessage;
  setConversationMessageMetadata: typeof setConversationMessageMetadata;
  storeCheckinResponse: typeof storeCheckinResponse;
  storeConversationMessage: typeof storeConversationMessage;
  storeDailyPlan: typeof storeDailyPlan;
  storeWeightEntry: typeof storeWeightEntry;
};

const defaultDependencies: CoachingDependencies = {
  generateDailyPlan,
  getDailySummary,
  listRecentConversationMessages,
  sendTelegramMessage,
  setConversationMessageMetadata,
  storeCheckinResponse,
  storeConversationMessage,
  storeDailyPlan,
  storeWeightEntry
};

const CHECKIN_FIELDS = [
  {
    field: "sleep_quality",
    prompt: "Quick one. How was your sleep last night?"
  },
  {
    field: "mood",
    prompt: "How is your mood today?"
  },
  {
    field: "stress",
    prompt: "Stress today?"
  },
  {
    field: "soreness",
    prompt: "How sore are you today?"
  },
  {
    field: "hunger",
    prompt: "How hungry are you today?"
  },
  {
    field: "disruption",
    prompt: "Anything likely to knock the day off course?"
  }
] as const;

function coercePromptMetadata(value: unknown): PromptMetadata | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const prompt = value as Record<string, unknown>;
  if (prompt.kind !== "prompt" || typeof prompt.promptKind !== "string") {
    return null;
  }

  if (typeof prompt.awaitingReply !== "boolean") {
    return null;
  }

  if (typeof prompt.promptDate !== "string") {
    return null;
  }

  return {
    kind: "prompt",
    promptKind: prompt.promptKind as PromptKind,
    promptDate: prompt.promptDate,
    field: typeof prompt.field === "string" ? prompt.field : undefined,
    awaitingReply: prompt.awaitingReply,
    resolvedAt: typeof prompt.resolvedAt === "string" ? prompt.resolvedAt : undefined,
    resolvedBy: typeof prompt.resolvedBy === "string" ? prompt.resolvedBy : undefined
  };
}

function buildPromptMetadata(input: {
  promptKind: PromptKind;
  promptDate: string;
  field?: string;
}): PromptMetadata {
  return {
    kind: "prompt",
    promptKind: input.promptKind,
    promptDate: input.promptDate,
    field: input.field,
    awaitingReply: true
  };
}

function findPendingPrompt(
  messages: ConversationMessageRecord[],
  matcher?: (metadata: PromptMetadata) => boolean
) {
  return findPrompt(messages, matcher, true);
}

function findPrompt(
  messages: ConversationMessageRecord[],
  matcher?: (metadata: PromptMetadata) => boolean,
  pendingOnly = false
) {
  for (const message of messages) {
    if (message.actor !== "assistant") {
      continue;
    }

    const metadata = coercePromptMetadata(message.metadata);
    if (!metadata || (pendingOnly && !metadata.awaitingReply)) {
      continue;
    }

    if (!matcher || matcher(metadata)) {
      return {
        message,
        metadata
      };
    }
  }

  return null;
}

function buildPromptSkipReason(metadata: PromptMetadata) {
  return metadata.awaitingReply ? "pending_prompt_exists" : "prompt_already_sent";
}

function getNextCheckinField(currentField?: string) {
  if (!currentField) {
    return CHECKIN_FIELDS[0] ?? null;
  }

  const currentIndex = CHECKIN_FIELDS.findIndex((entry) => entry.field === currentField);
  if (currentIndex < 0) {
    return CHECKIN_FIELDS[0] ?? null;
  }

  return CHECKIN_FIELDS[currentIndex + 1] ?? null;
}

function formatLocalTime(date: Date, timeZone = "Europe/London") {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  }).format(date);
}

function buildCheckinPromptText(field: (typeof CHECKIN_FIELDS)[number]) {
  return `${field.prompt} Reply with a word, a number, or a short phrase.`;
}

type RescheduledWorkoutPlan = {
  status: "planned" | "minimum_viable" | "no_slot";
  activityType: string;
  intensity: "light" | "moderate";
  suggestedStart: Date | null;
  suggestedEnd: Date | null;
  durationMinutes: number;
  slotReason: string;
  summary: string;
};

function coerceWorkoutPlan(value: unknown) {
  if (!value || typeof value !== "object") {
    return null;
  }

  const plan = value as Record<string, unknown>;
  return {
    activityType:
      typeof plan.activityType === "string" && plan.activityType.length > 0
        ? plan.activityType
        : "Movement",
    intensity:
      plan.intensity === "light" || plan.intensity === "moderate" || plan.intensity === "intense"
        ? plan.intensity
        : "moderate",
    durationMinutes:
      typeof plan.durationMinutes === "number" && plan.durationMinutes > 0
        ? plan.durationMinutes
        : 40
  };
}

function parseStoredDate(value: unknown) {
  if (value instanceof Date) {
    return value;
  }

  if (typeof value !== "string") {
    return null;
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function coerceStoredWorkoutPlan(value: unknown) {
  if (!value || typeof value !== "object") {
    return null;
  }

  const plan = value as Record<string, unknown>;
  const status = plan.status;
  if (
    status !== "completed" &&
    status !== "rest_day" &&
    status !== "planned" &&
    status !== "minimum_viable" &&
    status !== "no_slot"
  ) {
    return null;
  }

  return {
    status,
    activityType:
      typeof plan.activityType === "string" && plan.activityType.length > 0
        ? plan.activityType
        : "Movement",
    intensity:
      plan.intensity === "light" || plan.intensity === "moderate" || plan.intensity === "intense"
        ? plan.intensity
        : "moderate",
    suggestedStart: parseStoredDate(plan.suggestedStart),
    suggestedEnd: parseStoredDate(plan.suggestedEnd),
    durationMinutes:
      typeof plan.durationMinutes === "number" && plan.durationMinutes > 0
        ? plan.durationMinutes
        : 0,
    slotReason: typeof plan.slotReason === "string" ? plan.slotReason : "",
    completionTitle: typeof plan.completionTitle === "string" ? plan.completionTitle : null
  };
}

function buildRescheduleOptions(
  summary: Awaited<ReturnType<typeof getDailySummary>>,
  now: Date,
  choice: "later" | "twenty" | "walk"
): RescheduledWorkoutPlan {
  const existing = coerceWorkoutPlan(summary.dailyPlan?.workoutPlan);
  const baseActivity = choice === "walk" ? "Walk" : (existing?.activityType ?? summary.dayTemplate?.activityType ?? "Movement");
  const targetDuration =
    choice === "twenty" || choice === "walk"
      ? 20
      : Math.max(30, existing?.durationMinutes ?? 40);
  const candidateSlots = summary.calendar.freeSlots
    .map((slot) => {
      const start = slot.start.getTime() < now.getTime() ? new Date(now) : slot.start;
      const remainingMinutes = Math.floor((slot.end.getTime() - start.getTime()) / 60_000);
      return {
        start,
        end: slot.end,
        remainingMinutes
      };
    })
    .filter((slot) => slot.remainingMinutes >= 20)
    .sort((left, right) => left.start.getTime() - right.start.getTime());

  const fullMatch = candidateSlots.find((slot) => slot.remainingMinutes >= targetDuration);
  const fallbackSlot = fullMatch ?? candidateSlots[0] ?? null;

  if (!fallbackSlot) {
    return {
      status: "no_slot",
      activityType: baseActivity,
      intensity: "light",
      suggestedStart: null,
      suggestedEnd: null,
      durationMinutes: 20,
      slotReason: "No usable slot remains today, so the plan stays open rather than pretending.",
      summary: `No clean slot remains today. Keep the target to 20 minutes of ${baseActivity.toLowerCase()} if you can steal it.`
    };
  }

  const actualDuration = Math.min(targetDuration, fallbackSlot.remainingMinutes);
  const suggestedEnd = new Date(fallbackSlot.start.getTime() + actualDuration * 60_000);
  const minimumViable = choice !== "later" || actualDuration < targetDuration;

  return {
    status: minimumViable ? "minimum_viable" : "planned",
    activityType: baseActivity,
    intensity: minimumViable ? "light" : "moderate",
    suggestedStart: fallbackSlot.start,
    suggestedEnd,
    durationMinutes: actualDuration,
    slotReason:
      choice === "walk"
        ? "Swapped to a walk to keep the day alive."
        : choice === "twenty"
          ? "Trimmed to a 20-minute version to fit the day."
          : "Moved to the next viable free slot.",
    summary:
      choice === "walk"
        ? `Walk for ${actualDuration} minutes at ${formatLocalTime(fallbackSlot.start, summary.timeZone)}.`
        : `${baseActivity} for ${actualDuration} minutes at ${formatLocalTime(fallbackSlot.start, summary.timeZone)}.`
  };
}

async function maybeSendNextSequentialCheckinPrompt(
  config: AppConfig,
  promptDate: string,
  currentField: string | undefined,
  dryRun: boolean,
  dependencies: CoachingDependencies
) {
  const nextField = getNextCheckinField(currentField);
  if (!nextField) {
    return null;
  }

  const recent = await dependencies.listRecentConversationMessages(30);
  const existing = findPendingPrompt(
    recent,
    (metadata) =>
      metadata.promptKind === "checkin" &&
      metadata.promptDate === promptDate &&
      metadata.field === nextField.field
  );
  if (existing) {
    return existing.message.content ?? null;
  }

  const text = buildCheckinPromptText(nextField);
  if (!dryRun) {
    await dependencies.sendTelegramMessage(config, text);
    await dependencies.storeConversationMessage({
      actor: "assistant",
      content: text,
      metadata: buildPromptMetadata({
        promptKind: "checkin",
        promptDate,
        field: nextField.field
      })
    });
  }

  return text;
}

async function sendAssistantPrompt(
  config: AppConfig,
  text: string,
  metadata: PromptMetadata,
  dryRun: boolean,
  dependencies: CoachingDependencies
) {
  if (dryRun) {
    return {
      sent: false,
      text
    };
  }

  await dependencies.sendTelegramMessage(config, text);
  await dependencies.storeConversationMessage({
    actor: "assistant",
    content: text,
    metadata
  });

  return {
    sent: true,
    text
  };
}

async function resolvePrompt(
  prompt: { message: ConversationMessageRecord; metadata: PromptMetadata },
  resolutionText: string,
  config: AppConfig,
  dependencies: CoachingDependencies,
  dryRun = false
) {
  const mergedMetadata: PromptMetadata = {
    ...prompt.metadata,
    awaitingReply: false,
    resolvedAt: new Date().toISOString(),
    resolvedBy: "telegram_reply"
  };

  if (!dryRun) {
    await dependencies.setConversationMessageMetadata({
      id: prompt.message.id,
      metadata: mergedMetadata
    });
    await dependencies.sendTelegramMessage(config, resolutionText);
    await dependencies.storeConversationMessage({
      actor: "assistant",
      content: resolutionText,
      metadata: {
        kind: "ack",
        promptKind: prompt.metadata.promptKind,
        promptDate: prompt.metadata.promptDate
      }
    });
  }

  return resolutionText;
}

export async function sendWeightPrompt(
  config: AppConfig,
  input: {
    date: string;
    dryRun?: boolean;
  },
  dependencies: CoachingDependencies = defaultDependencies
) {
  const recent = await dependencies.listRecentConversationMessages(30);
  const existing = findPrompt(
    recent,
    (metadata) => metadata.promptKind === "weight" && metadata.promptDate === input.date
  );
  if (existing) {
    return {
      sent: false,
      reason: buildPromptSkipReason(existing.metadata),
      text: existing.message.content ?? ""
    };
  }

  return sendAssistantPrompt(
    config,
    "Morning. Send your weight in kg. Just the number will do.",
    buildPromptMetadata({
      promptKind: "weight",
      promptDate: input.date
    }),
    input.dryRun ?? false,
    dependencies
  );
}

export async function sendNextCheckinPrompt(
  config: AppConfig,
  input: {
    date: string;
    timeZone?: string;
    dryRun?: boolean;
  },
  dependencies: CoachingDependencies = defaultDependencies
) {
  const summary = await dependencies.getDailySummary({
    date: input.date,
    timeZone: input.timeZone
  });
  const answeredFields = new Set(summary.checkins.map((item) => item.field));
  const next = CHECKIN_FIELDS.find((entry) => !answeredFields.has(entry.field));
  if (!next) {
    return {
      sent: false,
      reason: "checkins_complete",
      text: ""
    };
  }

  const recent = await dependencies.listRecentConversationMessages(30);
  const existing = findPendingPrompt(
    recent,
    (metadata) =>
      metadata.promptKind === "checkin" &&
      metadata.promptDate === input.date &&
      metadata.field === next.field
  );
  if (existing) {
    return {
      sent: false,
      reason: "pending_prompt_exists",
      text: existing.message.content ?? ""
    };
  }

  return sendAssistantPrompt(
    config,
    buildCheckinPromptText(next),
    buildPromptMetadata({
      promptKind: "checkin",
      promptDate: input.date,
      field: next.field
    }),
    input.dryRun ?? false,
    dependencies
  );
}

export async function sendMissedWorkoutFollowUp(
  config: AppConfig,
  input: {
    date: string;
    timeZone?: string;
    now?: Date;
    dryRun?: boolean;
  },
  dependencies: CoachingDependencies = defaultDependencies
) {
  const summary = await dependencies.getDailySummary({
    date: input.date,
    timeZone: input.timeZone
  });
  const plan =
    coerceStoredWorkoutPlan(summary.dailyPlan?.workoutPlan) ??
    (
      await dependencies.generateDailyPlan({
        date: input.date,
        timeZone: input.timeZone
      })
    ).workout;

  if (
    summary.workouts.length > 0 ||
    plan.status === "completed" ||
    plan.status === "rest_day" ||
    plan.status === "no_slot"
  ) {
    return {
      sent: false,
      reason: "no_follow_up_needed",
      text: ""
    };
  }

  if (!plan.suggestedEnd) {
    return {
      sent: false,
      reason: "missing_scheduled_end",
      text: ""
    };
  }

  const now = input.now ?? new Date();
  const followUpThreshold = plan.suggestedEnd.getTime() + (2 * 60 * 60 * 1000);
  if (now.getTime() < followUpThreshold) {
    return {
      sent: false,
      reason: "too_early",
      text: ""
    };
  }

  const recent = await dependencies.listRecentConversationMessages(30);
  const existing = findPrompt(
    recent,
    (metadata) => metadata.promptKind === "missed_workout" && metadata.promptDate === input.date
  );
  if (existing) {
    return {
      sent: false,
      reason: buildPromptSkipReason(existing.metadata),
      text: existing.message.content ?? ""
    };
  }

  return sendAssistantPrompt(
    config,
    "The planned slot has gone. Choose one: later today, 20-minute version, or minimum-viable walk.",
    buildPromptMetadata({
      promptKind: "missed_workout",
      promptDate: input.date
    }),
    input.dryRun ?? false,
    dependencies
  );
}

function parseWeightKg(text: string) {
  const match = text.match(/(\d+(?:[.,]\d+)?)/);
  if (!match) {
    return null;
  }

  const kilograms = Number.parseFloat(match[1]!.replace(",", "."));
  if (!Number.isFinite(kilograms) || kilograms < 40 || kilograms > 300) {
    return null;
  }

  return Number(kilograms.toFixed(1));
}

function buildMissedWorkoutReply(text: string) {
  if (/\blater\b/i.test(text)) {
    return "later";
  }
  if (/\b20\b|\btwenty\b/i.test(text)) {
    return "twenty";
  }
  if (/\bwalk\b|\bminimum\b/i.test(text)) {
    return "walk";
  }

  return "unknown";
}

export async function handlePromptReply(
  config: AppConfig,
  input: {
    text: string;
    promptDate: string;
    updateId: number;
    messageId: number;
    dryRun?: boolean;
  },
  dependencies: CoachingDependencies = defaultDependencies
) {
  const recent = await dependencies.listRecentConversationMessages(30);
  const pending =
    findPendingPrompt(
      recent,
      (metadata) => metadata.promptDate === input.promptDate
    ) ?? findPendingPrompt(recent);
  if (!pending) {
    return {
      handled: false
    };
  }

  const trimmed = input.text.trim();
  if (!trimmed) {
    return {
      handled: false
    };
  }

  if (pending.metadata.promptKind === "weight") {
    const kilograms = parseWeightKg(trimmed);
    if (kilograms === null) {
      const retryText = "Need that as a number in kg. For example: 118.4";
      if (!input.dryRun) {
        await dependencies.sendTelegramMessage(config, retryText);
        await dependencies.storeConversationMessage({
          actor: "assistant",
          content: retryText,
          metadata: {
            kind: "ack",
            promptKind: "weight",
            promptDate: pending.metadata.promptDate,
            retry: true
          }
        });
      }
      return {
        handled: true,
        promptKind: "weight",
        responseText: retryText
      };
    }

    if (!input.dryRun) {
      await dependencies.storeWeightEntry({
        kilograms,
        source: "telegram",
        sourcePayload: {
          rawText: trimmed,
          updateId: input.updateId,
          messageId: input.messageId,
          promptId: pending.message.id
        }
      });
    }

    const responseText = `Logged: ${kilograms.toFixed(1)} kg.`;
    await resolvePrompt(pending, responseText, config, dependencies, input.dryRun ?? false);

    await maybeSendNextSequentialCheckinPrompt(
      config,
      pending.metadata.promptDate,
      undefined,
      input.dryRun ?? false,
      dependencies
    );
    return {
      handled: true,
      promptKind: "weight",
      responseText
    };
  }

  if (pending.metadata.promptKind === "checkin") {
    if (!input.dryRun) {
      await dependencies.storeCheckinResponse({
        field: pending.metadata.field ?? "checkin",
        valueText: trimmed,
        sourcePayload: {
          rawText: trimmed,
          updateId: input.updateId,
          messageId: input.messageId,
          promptId: pending.message.id
        }
      });
    }

    const responseText = "Noted.";
    await resolvePrompt(pending, responseText, config, dependencies, input.dryRun ?? false);
    const nextPromptText = await maybeSendNextSequentialCheckinPrompt(
      config,
      pending.metadata.promptDate,
      pending.metadata.field,
      input.dryRun ?? false,
      dependencies
    );
    return {
      handled: true,
      promptKind: "checkin",
      responseText,
      followUpText: nextPromptText ?? undefined
    };
  }

  const choice = buildMissedWorkoutReply(trimmed);
  let responseText = "Understood. Keep the next step small and make it real.";
  if (choice !== "unknown") {
    const now = new Date();
    const summary = await dependencies.getDailySummary({
      date: pending.metadata.promptDate
    });
    const updatedPlan = buildRescheduleOptions(summary, now, choice);
    responseText =
      updatedPlan.status === "no_slot"
        ? updatedPlan.summary
        : `${updatedPlan.summary} ${updatedPlan.slotReason}`;

    if (!input.dryRun) {
      await dependencies.storeDailyPlan({
        planDate: summary.range.start,
        summary: responseText,
        workoutPlan: {
          ...updatedPlan,
          suggestedStart: updatedPlan.suggestedStart?.toISOString() ?? null,
          suggestedEnd: updatedPlan.suggestedEnd?.toISOString() ?? null
        },
        mealPlan: summary.dailyPlan?.mealPlan as Record<string, unknown> | null,
        recoveryContext: summary.dailyPlan?.recoveryContext as Record<string, unknown> | null,
        sourceSnapshot: {
          adjustedFromPrompt: true,
          promptKind: "missed_workout",
          promptDate: pending.metadata.promptDate,
          choice
        }
      });
    }
  }

  await resolvePrompt(pending, responseText, config, dependencies, input.dryRun ?? false);
  return {
    handled: true,
    promptKind: "missed_workout",
    responseText
  };
}
