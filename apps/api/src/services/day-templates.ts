import type { AppConfig } from "../config.js";
import { sendTelegramMessage } from "../lib/telegram.js";
import {
  listLatestHevyRoutines,
  listLatestDayTemplates,
  storeConversationMessage,
  storeDayTemplate
} from "./persistence.js";
import { dayOfWeekSchema, defaultDayTemplates, type DayOfWeek } from "@codex/shared";

type DayTemplateSnapshot = {
  dayOfWeek: DayOfWeek;
  activityType: string;
  intensity: string | null;
  preferredTime: string | null;
  notes: string | null;
  hevyRoutineId: string | null;
  hevyRoutineTitle: string | null;
};

export type HevyRoutineOption = {
  id: string;
  title: string;
  folderId: number | null;
};

type DayTemplateDependencies = {
  listLatestHevyRoutines: typeof listLatestHevyRoutines;
  listLatestDayTemplates: typeof listLatestDayTemplates;
  sendTelegramMessage: typeof sendTelegramMessage;
  storeConversationMessage: typeof storeConversationMessage;
  storeDayTemplate: typeof storeDayTemplate;
};

const defaultDependencies: DayTemplateDependencies = {
  listLatestHevyRoutines,
  listLatestDayTemplates,
  sendTelegramMessage,
  storeConversationMessage,
  storeDayTemplate
};

const orderedDays = dayOfWeekSchema.options;
const intensityValues = new Set(["rest", "light", "moderate", "intense"]);
const preferredTimeValues = new Set(["morning", "midday", "evening"]);

function titleCase(value: string) {
  return value[0] ? `${value[0].toUpperCase()}${value.slice(1)}` : value;
}

function normalizeWhitespace(value: string) {
  return value.trim().replace(/\s+/g, " ");
}

function mergeLatestTemplates(
  rows: Array<{
    dayOfWeek: DayOfWeek;
    activityType: string;
    intensity: string | null;
    preferredTime: string | null;
    notes: string | null;
    hevyRoutineId?: string | null;
    hevyRoutineTitle?: string | null;
  }>
) {
  const seen = new Set<DayOfWeek>();
  const merged: Record<DayOfWeek, DayTemplateSnapshot> = {
    monday: { ...defaultDayTemplates.monday },
    tuesday: { ...defaultDayTemplates.tuesday },
    wednesday: { ...defaultDayTemplates.wednesday },
    thursday: { ...defaultDayTemplates.thursday },
    friday: { ...defaultDayTemplates.friday },
    saturday: { ...defaultDayTemplates.saturday },
    sunday: { ...defaultDayTemplates.sunday }
  };

  for (const row of rows) {
    if (seen.has(row.dayOfWeek)) {
      continue;
    }
    seen.add(row.dayOfWeek);
    merged[row.dayOfWeek] = {
      dayOfWeek: row.dayOfWeek,
      activityType: row.activityType,
      intensity: row.intensity,
      preferredTime: row.preferredTime,
      notes: row.notes,
      hevyRoutineId: row.hevyRoutineId ?? null,
      hevyRoutineTitle: row.hevyRoutineTitle ?? null
    };
  }

  return orderedDays.map((day) => merged[day]);
}

function formatDayTemplateLine(template: DayTemplateSnapshot) {
  const parts = [titleCase(template.dayOfWeek), template.activityType];
  if (template.intensity) {
    parts.push(`(${template.intensity})`);
  }
  if (template.preferredTime) {
    parts.push(`at ${template.preferredTime}`);
  }
  if (template.hevyRoutineTitle) {
    parts.push(`- Hevy: ${template.hevyRoutineTitle}`);
  }
  return parts.join(" ");
}

function parseDay(value: string) {
  const normalized = normalizeWhitespace(value).toLowerCase();
  const aliases: Array<[RegExp, DayOfWeek]> = [
    [/\bmonday\b|\bmondays\b/, "monday"],
    [/\btuesday\b|\btuesdays\b/, "tuesday"],
    [/\bwednesday\b|\bwednesdays\b/, "wednesday"],
    [/\bthursday\b|\bthursdays\b/, "thursday"],
    [/\bfriday\b|\bfridays\b/, "friday"],
    [/\bsaturday\b|\bsaturdays\b/, "saturday"],
    [/\bsunday\b|\bsundays\b/, "sunday"]
  ];

  for (const [pattern, day] of aliases) {
    if (pattern.test(normalized)) {
      return day;
    }
  }

  return null;
}

function normalizeActivityText(value: string) {
  const cleaned = normalizeWhitespace(
    value
      .replace(/\brest day\b/gi, "rest / active recovery")
      .replace(/\brest\b/gi, "rest / active recovery")
  );
  return cleaned.length > 0 ? cleaned : null;
}

function parseTemplateCommand(text: string) {
  const normalized = normalizeWhitespace(text).toLowerCase();

  if (
    normalized === "show day templates" ||
    normalized === "show weekly template" ||
    normalized === "show workout template" ||
    normalized === "show schedule"
  ) {
    return { action: "list" as const };
  }

  const match = /^(?:set|update)\s+(monday|tuesday|wednesday|thursday|friday|saturday|sunday)(?:s)?\s+(?:to|as)\s+(.+)$/.exec(
    normalized
  );
  if (!match) {
    return null;
  }

  const dayOfWeek = parseDay(match[1] ?? "");
  if (!dayOfWeek) {
    return null;
  }

  const descriptor = match[2] ?? "";
  let preferredTime: string | null = null;
  if (/\bmorning\b/.test(descriptor)) {
    preferredTime = "morning";
  } else if (/\bmidday\b|\blunch\b/.test(descriptor)) {
    preferredTime = "midday";
  } else if (/\bevening\b|\bnight\b/.test(descriptor)) {
    preferredTime = "evening";
  }

  let intensity: string | null = null;
  if (/\brest\b/.test(descriptor)) {
    intensity = "rest";
  } else if (/\blight\b/.test(descriptor)) {
    intensity = "light";
  } else if (/\bmoderate\b/.test(descriptor)) {
    intensity = "moderate";
  } else if (/\bintense\b|\bhard\b/.test(descriptor)) {
    intensity = "intense";
  }

  const activity = normalizeActivityText(
    descriptor
      .replace(/\bmorning\b|\bmidday\b|\blunch\b|\bevening\b|\bnight\b/g, "")
      .replace(/\brest\b|\blight\b|\bmoderate\b|\bintense\b|\bhard\b/g, "")
  );

  if (!activity) {
    return null;
  }

  return {
    action: "set" as const,
    dayOfWeek,
    activityType: activity,
    intensity,
    preferredTime
  };
}

export async function listDayTemplateState(
  dependencies: Pick<DayTemplateDependencies, "listLatestDayTemplates"> = defaultDependencies
) {
  const rows = await dependencies.listLatestDayTemplates();
  return mergeLatestTemplates(rows);
}

export async function listHevyRoutineOptions(
  dependencies: Pick<DayTemplateDependencies, "listLatestHevyRoutines"> = defaultDependencies
): Promise<HevyRoutineOption[]> {
  const rows = await dependencies.listLatestHevyRoutines();
  return rows.map((row) => ({
    id: row.sourceRecordId,
    title: row.title,
    folderId: row.folderId ?? null
  }));
}

export async function updateDayTemplate(
  input: {
    dayOfWeek: DayOfWeek;
    activityType: string;
    intensity?: string | null;
    preferredTime?: string | null;
    notes?: string | null;
    hevyRoutineId?: string | null;
    hevyRoutineTitle?: string | null;
  },
  dependencies: Pick<DayTemplateDependencies, "storeDayTemplate" | "listLatestDayTemplates"> = defaultDependencies
) {
  const activityType = normalizeActivityText(input.activityType);
  if (!activityType) {
    throw new Error("Activity type is required.");
  }

  const intensity =
    input.intensity && intensityValues.has(input.intensity) ? input.intensity : null;
  const preferredTime =
    input.preferredTime && preferredTimeValues.has(input.preferredTime) ? input.preferredTime : null;

  await dependencies.storeDayTemplate({
    dayOfWeek: input.dayOfWeek,
    activityType,
    intensity,
    preferredTime,
    notes: input.notes ?? null,
    hevyRoutineId: input.hevyRoutineId ?? null,
    hevyRoutineTitle: input.hevyRoutineTitle ?? null
  });

  return {
    changed: true,
    responseText: `Done. ${titleCase(input.dayOfWeek)} is now ${formatDayTemplateLine({
      dayOfWeek: input.dayOfWeek,
      activityType,
      intensity,
      preferredTime,
      notes: input.notes ?? null,
      hevyRoutineId: input.hevyRoutineId ?? null,
      hevyRoutineTitle: input.hevyRoutineTitle ?? null
    })}.`,
    templates: await listDayTemplateState(dependencies)
  };
}

function renderDayTemplateSummary(templates: DayTemplateSnapshot[]) {
  return ["Current weekly template:", ...templates.map(formatDayTemplateLine)].join("\n");
}

export async function handleDayTemplateCommand(
  config: AppConfig,
  input: {
    text: string;
    dryRun?: boolean;
  },
  dependencies: DayTemplateDependencies = defaultDependencies
) {
  const parsed = parseTemplateCommand(input.text);
  if (!parsed) {
    return {
      handled: false
    };
  }

  let responseText = "";
  let metadata: Record<string, unknown> = {
    kind: "day_template"
  };

  if (parsed.action === "list") {
    const templates = await listDayTemplateState(dependencies);
    responseText = renderDayTemplateSummary(templates);
    metadata = {
      ...metadata,
      action: "list"
    };
  } else {
    const result = await updateDayTemplate(
      {
        dayOfWeek: parsed.dayOfWeek,
        activityType: parsed.activityType,
        intensity: parsed.intensity,
        preferredTime: parsed.preferredTime
      },
      dependencies
    );
    responseText = `${result.responseText}\n\n${renderDayTemplateSummary(result.templates)}`;
    metadata = {
      ...metadata,
      action: "set",
      dayOfWeek: parsed.dayOfWeek
    };
  }

  if (!input.dryRun) {
    await dependencies.sendTelegramMessage(config, responseText);
    await dependencies.storeConversationMessage({
      actor: "assistant",
      content: responseText,
      metadata
    });
  }

  return {
    handled: true,
    responseText
  };
}
