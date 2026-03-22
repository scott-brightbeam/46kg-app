import type { AppConfig } from "../config.js";
import { sendTelegramMessage } from "../lib/telegram.js";
import {
  getLatestNutritionTargets,
  storeConversationMessage,
  storeNutritionTargets
} from "./persistence.js";

type MealTotals = {
  calories: number;
  protein: number;
  fibre: number;
};

export type NutritionTargets = {
  calories: number | null;
  protein: number | null;
  fibre: number | null;
};

type NutritionTargetSnapshot = NutritionTargets & {
  notes: string | null;
  updatedAt: Date | null;
};

export type NutritionTargetState = {
  targets: NutritionTargets;
  source: "stored" | "default";
  notes: string | null;
  updatedAt: Date | null;
};

type NutritionTargetDependencies = {
  getLatestNutritionTargets: typeof getLatestNutritionTargets;
  sendTelegramMessage: typeof sendTelegramMessage;
  storeConversationMessage: typeof storeConversationMessage;
  storeNutritionTargets: typeof storeNutritionTargets;
};

const defaultDependencies: NutritionTargetDependencies = {
  getLatestNutritionTargets,
  sendTelegramMessage,
  storeConversationMessage,
  storeNutritionTargets
};

export type DailyNutritionBudget = {
  targets: NutritionTargets;
  consumed: NutritionTargets;
  remaining: NutritionTargets;
};

function calculateRemaining(target: number | null, consumed: number) {
  if (target === null) {
    return null;
  }

  return Math.round((target - consumed) * 100) / 100;
}

function parseNullableNumber(value: string | null | undefined) {
  if (value === null || value === undefined) {
    return null;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function roundMetric(value: number | null | undefined) {
  if (value === null || value === undefined) {
    return null;
  }

  return Math.round(value * 100) / 100;
}

function titleCase(value: string) {
  return value[0] ? `${value[0].toUpperCase()}${value.slice(1)}` : value;
}

function normalizeWhitespace(value: string) {
  return value.trim().replace(/\s+/g, " ");
}

export function getDefaultNutritionTargets(config: AppConfig): NutritionTargets {
  return {
    calories: config.DAILY_CALORIE_TARGET ?? null,
    protein: config.DAILY_PROTEIN_TARGET ?? null,
    fibre: config.DAILY_FIBRE_TARGET ?? null
  };
}

export function resolveNutritionTargets(
  config: AppConfig,
  storedTargets: NutritionTargets | null
): NutritionTargets {
  if (!storedTargets) {
    return getDefaultNutritionTargets(config);
  }

  return storedTargets;
}

export function buildDailyNutritionBudget(
  targets: NutritionTargets,
  consumed: MealTotals
): DailyNutritionBudget | null {
  if (targets.calories === null && targets.protein === null && targets.fibre === null) {
    return null;
  }

  return {
    targets,
    consumed: {
      calories: consumed.calories,
      protein: consumed.protein,
      fibre: consumed.fibre
    },
    remaining: {
      calories: calculateRemaining(targets.calories, consumed.calories),
      protein: calculateRemaining(targets.protein, consumed.protein),
      fibre: calculateRemaining(targets.fibre, consumed.fibre)
    }
  };
}

export async function getNutritionTargetState(
  config: AppConfig,
  dependencies: Pick<NutritionTargetDependencies, "getLatestNutritionTargets"> = defaultDependencies
): Promise<NutritionTargetState> {
  const latest = await dependencies.getLatestNutritionTargets();
  const storedTargets = latest
    ? {
        calories: parseNullableNumber(latest.calories),
        protein: parseNullableNumber(latest.protein),
        fibre: parseNullableNumber(latest.fibre)
      }
    : null;
  const targets = resolveNutritionTargets(config, storedTargets);

  return {
    targets,
    source: latest ? "stored" : "default",
    notes: latest?.notes ?? null,
    updatedAt: latest?.updatedAt ?? null
  };
}

export async function updateNutritionTargets(
  config: AppConfig,
  input: {
    calories?: number | null;
    protein?: number | null;
    fibre?: number | null;
    notes?: string | null;
  },
  dependencies: Pick<
    NutritionTargetDependencies,
    "getLatestNutritionTargets" | "storeNutritionTargets"
  > = defaultDependencies
): Promise<
  {
    changed: true;
    responseText: string;
  } & NutritionTargetState
> {
  const current = await getNutritionTargetState(config, dependencies);
  const nextTargets: NutritionTargetSnapshot = {
    calories:
      input.calories === undefined ? current.targets.calories : roundMetric(input.calories),
    protein:
      input.protein === undefined ? current.targets.protein : roundMetric(input.protein),
    fibre: input.fibre === undefined ? current.targets.fibre : roundMetric(input.fibre),
    notes: input.notes === undefined ? current.notes : input.notes,
    updatedAt: null
  };

  await dependencies.storeNutritionTargets({
    calories: nextTargets.calories,
    protein: nextTargets.protein,
    fibre: nextTargets.fibre,
    notes: nextTargets.notes
  });

  return {
    changed: true,
    responseText: `Done. Targets are now ${formatNutritionTargetSummary(nextTargets)}.`,
    ...(await getNutritionTargetState(config, dependencies))
  };
}

function formatNutritionTargetSummary(targets: NutritionTargets) {
  const parts = [
    targets.calories === null ? "calories not set" : `${targets.calories} kcal`,
    targets.protein === null ? "protein not set" : `${targets.protein}g protein`,
    targets.fibre === null ? "fibre not set" : `${targets.fibre}g fibre`
  ];

  return parts.join(", ");
}

function renderNutritionTargetSummary(input: {
  targets: NutritionTargets;
  source: "stored" | "default";
}) {
  return [
    "Current nutrition targets:",
    `Calories: ${input.targets.calories === null ? "not set" : `${input.targets.calories} kcal`}`,
    `Protein: ${input.targets.protein === null ? "not set" : `${input.targets.protein} g`}`,
    `Fibre: ${input.targets.fibre === null ? "not set" : `${input.targets.fibre} g`}`,
    `Source: ${titleCase(input.source)}`
  ].join("\n");
}

function parseTargetNumber(value: string) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.round(parsed * 100) / 100 : null;
}

function parseNutritionTargetCommand(text: string) {
  const normalized = normalizeWhitespace(text).toLowerCase();

  if (
    normalized === "show nutrition targets" ||
    normalized === "show calorie target" ||
    normalized === "show macro targets"
  ) {
    return {
      action: "list" as const
    };
  }

  const setSingleMatch =
    /^(?:set|update)\s+(calorie|calories|protein|fibre|fiber)\s+target\s+(?:to|as)\s+(\d+(?:\.\d+)?)$/.exec(
      normalized
    ) ??
    /^(?:set|update)\s+(calorie|calories|protein|fibre|fiber)\s+(?:to|as)\s+(\d+(?:\.\d+)?)$/.exec(
      normalized
    );

  if (setSingleMatch) {
    const rawMetric = setSingleMatch[1] ?? "";
    const metric =
      rawMetric === "fiber"
        ? "fibre"
        : rawMetric === "calorie"
          ? "calories"
          : rawMetric;
    const value = parseTargetNumber(setSingleMatch[2] ?? "");

    if (!value) {
      return null;
    }

    return {
      action: "set" as const,
      updates: {
        [metric]: value
      } satisfies Partial<NutritionTargets>
    };
  }

  const setAllMatch = /^(?:set|update)\s+nutrition\s+targets\s+(?:to|as)\s+(.+)$/.exec(normalized);
  if (!setAllMatch) {
    return null;
  }

  const descriptor = setAllMatch[1] ?? "";
  const caloriesMatch = /(\d+(?:\.\d+)?)\s*(?:kcal|calories|cals?)/.exec(descriptor);
  const proteinMatch = /(\d+(?:\.\d+)?)\s*(?:g\s*)?protein/.exec(descriptor);
  const fibreMatch = /(\d+(?:\.\d+)?)\s*(?:g\s*)?(?:fibre|fiber)/.exec(descriptor);

  const updates: Partial<NutritionTargets> = {};
  if (caloriesMatch) {
    updates.calories = parseTargetNumber(caloriesMatch[1] ?? "");
  }
  if (proteinMatch) {
    updates.protein = parseTargetNumber(proteinMatch[1] ?? "");
  }
  if (fibreMatch) {
    updates.fibre = parseTargetNumber(fibreMatch[1] ?? "");
  }

  if (Object.keys(updates).length === 0) {
    return null;
  }

  return {
    action: "set" as const,
    updates
  };
}

export async function handleNutritionTargetCommand(
  config: AppConfig,
  input: {
    text: string;
    dryRun?: boolean;
  },
  dependencies: NutritionTargetDependencies = defaultDependencies
) {
  const parsed = parseNutritionTargetCommand(input.text);
  if (!parsed) {
    return {
      handled: false
    };
  }

  let responseText = "";
  let metadata: Record<string, unknown> = {
    kind: "nutrition_targets"
  };

  if (parsed.action === "list") {
    const current = await getNutritionTargetState(config, dependencies);
    responseText = renderNutritionTargetSummary(current);
    metadata = {
      ...metadata,
      action: "list"
    };
  } else {
    const result = await updateNutritionTargets(config, parsed.updates, dependencies);
    responseText = `${result.responseText}\n\n${renderNutritionTargetSummary(result)}`;
    metadata = {
      ...metadata,
      action: "set",
      updates: parsed.updates
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
