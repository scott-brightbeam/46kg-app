import type { AppConfig } from "../config.js";
import { sendTelegramMessage } from "../lib/telegram.js";
import { getDailySummary } from "./current-state.js";
import {
  type MealEstimate,
  estimateMealFromText,
  extractQuickLog,
  fallbackEstimateMealFromDescription,
  looksLikeMealLoggingMessage
} from "./meal-analysis.js";
import { storeConversationMessage, storeMealLog } from "./persistence.js";

type NutritionDependencies = {
  estimateMealFromText: typeof estimateMealFromText;
  getDailySummary: typeof getDailySummary;
  sendTelegramMessage: typeof sendTelegramMessage;
  storeConversationMessage: typeof storeConversationMessage;
  storeMealLog: typeof storeMealLog;
};

const defaultDependencies: NutritionDependencies = {
  estimateMealFromText,
  getDailySummary,
  sendTelegramMessage,
  storeConversationMessage,
  storeMealLog
};

function formatMacro(label: string, value: number | null) {
  if (value === null || Number.isNaN(value)) {
    return null;
  }

  return `${label} ${Math.round(value)}g`;
}

function buildIngredientPreview(meal: MealEstimate) {
  if (meal.ingredients.length === 0) {
    return null;
  }

  const preview = meal.ingredients
    .slice(0, 4)
    .map((ingredient) =>
      ingredient.quantityDescription
        ? `${ingredient.name} (${ingredient.quantityDescription})`
        : ingredient.name
    )
    .join(", ");

  return `Likely ingredients: ${preview}.`;
}

function buildReviewPrompt(meal: MealEstimate) {
  if (meal.reviewQuestions.length === 0) {
    return null;
  }

  return `Check: ${meal.reviewQuestions[0]}`;
}

function buildMealLoggedResponseText(meal: MealEstimate) {
  const macroParts = [
    formatMacro("Protein", meal.protein),
    formatMacro("Carbs", meal.carbs),
    formatMacro("Fat", meal.fat),
    formatMacro("Fibre", meal.fibre)
  ].filter((value): value is string => Boolean(value));

  const confidenceText =
    meal.method === "quick_log"
      ? "Quick log."
      : meal.strategy === "heuristic"
        ? `Rough estimate. Confidence ${Math.round(meal.confidence * 100)}%.`
        : `Confidence ${Math.round(meal.confidence * 100)}%.`;

  const zeroCalorieCheck = meal.calories === 0 ? " Was that right?" : "";
  const ingredientPreview = buildIngredientPreview(meal);
  const reviewPrompt = buildReviewPrompt(meal);

  return [
    `Logged: ${meal.description}. ${Math.round(meal.calories)} kcal.${macroParts.length > 0 ? ` ${macroParts.join(". ")}.` : ""} ${confidenceText}${zeroCalorieCheck}`.trim(),
    ingredientPreview,
    reviewPrompt
  ]
    .filter((value): value is string => Boolean(value))
    .join(" ");
}

function buildDailyMealRollupText(input: {
  mealCount: number;
  calories: number;
  protein: number;
}) {
  return `Day total now ${Math.round(input.calories)} kcal across ${input.mealCount} meal${input.mealCount === 1 ? "" : "s"}. Protein ${Math.round(input.protein)}g.`;
}

export async function handleMealLoggingMessage(
  config: AppConfig,
  input: {
    text: string;
    messageDate?: Date;
    dryRun?: boolean;
  },
  dependencies: NutritionDependencies = defaultDependencies
) {
  if (!looksLikeMealLoggingMessage(input.text)) {
    return {
      handled: false
    };
  }

  let meal: MealEstimate;
  try {
    meal = await dependencies.estimateMealFromText(config, input.text);
  } catch (error) {
    const fallbackMeal = fallbackEstimateMealFromDescription(input.text);
    if (!fallbackMeal) {
      const responseText =
        "I couldn't pin that meal down. Try something like 'ate chicken wrap and crisps' or '650 cals lunch'.";

      if (!input.dryRun) {
        await dependencies.sendTelegramMessage(config, responseText);
        await dependencies.storeConversationMessage({
          actor: "assistant",
          content: responseText,
          metadata: {
            kind: "meal_log",
            status: "estimation_failed",
            sourceText: input.text,
            error: error instanceof Error ? error.message : "unknown_error"
          }
        });
      }

      return {
        handled: true,
        responseText,
        storedMealId: null
      };
    }

    meal = fallbackMeal;
  }

  const storedMeal = input.dryRun
    ? null
    : await dependencies.storeMealLog({
        loggedAt: input.messageDate,
        description: meal.description,
        calories: meal.calories,
        protein: meal.protein,
        carbs: meal.carbs,
        fat: meal.fat,
        fibre: meal.fibre,
        confidence: meal.confidence,
        method: meal.method,
        sourcePayload: {
          sourceText: input.text,
          estimationMethod: meal.method,
          estimationStrategy: meal.strategy ?? meal.method,
          ingredients: meal.ingredients,
          reviewQuestions: meal.reviewQuestions
        }
      });

  let responseText = buildMealLoggedResponseText(meal);

  if (!input.dryRun) {
    const date = (input.messageDate ?? new Date()).toISOString().slice(0, 10);
    try {
      const dailySummary = await dependencies.getDailySummary({
        date
      });
      responseText = `${responseText}\n${buildDailyMealRollupText({
        mealCount: dailySummary.meals.entries.length,
        calories: dailySummary.meals.totals.calories,
        protein: dailySummary.meals.totals.protein
      })}`;
    } catch {
      // Keep meal logging resilient if the read side is temporarily unavailable.
    }
  }

  if (!input.dryRun) {
    await dependencies.sendTelegramMessage(config, responseText);
    await dependencies.storeConversationMessage({
      actor: "assistant",
      content: responseText,
      metadata: {
        kind: "meal_log",
        mealMethod: meal.method,
        mealStrategy: meal.strategy ?? meal.method,
        confidence: meal.confidence,
        mealDescription: meal.description,
        calories: meal.calories,
        storedMealId: storedMeal?.id ?? null
      }
    });
  }

  return {
    handled: true,
    responseText,
    storedMealId: storedMeal?.id ?? null
  };
}

export {
  estimateMealFromText,
  extractQuickLog,
  fallbackEstimateMealFromDescription,
  looksLikeMealLoggingMessage
};
