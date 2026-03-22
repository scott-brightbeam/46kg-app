import { zodTextFormat } from "openai/helpers/zod";
import { z } from "zod";

import type { AppConfig } from "../config.js";
import { createOpenAIClient } from "../lib/openai.js";

const ingredientEstimateSchema = z.object({
  name: z.string().min(1),
  quantityDescription: z.string().min(1).nullable(),
  calories: z.number().min(0).max(2500).nullable(),
  protein: z.number().min(0).max(250).nullable(),
  carbs: z.number().min(0).max(350).nullable(),
  fat: z.number().min(0).max(200).nullable(),
  fibre: z.number().min(0).max(100).nullable(),
  confidence: z.number().min(0).max(1)
});

const mealEstimateSchema = z.object({
  description: z.string().min(1),
  ingredients: z.array(ingredientEstimateSchema).max(12),
  calories: z.number().min(0).max(3000),
  protein: z.number().min(0).max(300).nullable(),
  carbs: z.number().min(0).max(400).nullable(),
  fat: z.number().min(0).max(200).nullable(),
  fibre: z.number().min(0).max(100).nullable(),
  confidence: z.number().min(0).max(1),
  reviewQuestions: z.array(z.string().min(1)).max(3)
});

export type IngredientEstimate = z.infer<typeof ingredientEstimateSchema>;

export type MealEstimate = z.infer<typeof mealEstimateSchema> & {
  method: "photo" | "text" | "quick_log";
  strategy?: "openai" | "heuristic" | "quick_log";
};

export type MealAnalysisInput = {
  text?: string;
  imageUrls?: string[];
};

const HEURISTIC_COMPONENTS = [
  { keyword: "chicken caesar wrap", calories: 520, protein: 28, carbs: 42, fat: 24, fibre: 4 },
  { keyword: "packet of ready salted crisps", calories: 160, protein: 2, carbs: 15, fat: 10, fibre: 1 },
  { keyword: "packet of crisps", calories: 160, protein: 2, carbs: 15, fat: 10, fibre: 1 },
  { keyword: "protein shake", calories: 180, protein: 30, carbs: 8, fat: 4, fibre: 1 },
  { keyword: "chicken wrap", calories: 430, protein: 30, carbs: 35, fat: 18, fibre: 3 },
  { keyword: "caesar salad", calories: 420, protein: 24, carbs: 18, fat: 28, fibre: 4 },
  { keyword: "bowl of porridge", calories: 260, protein: 10, carbs: 40, fat: 6, fibre: 5 },
  { keyword: "greek yogurt", calories: 140, protein: 15, carbs: 6, fat: 5, fibre: 0 },
  { keyword: "sandwich", calories: 420, protein: 18, carbs: 40, fat: 18, fibre: 4 },
  { keyword: "crisps", calories: 160, protein: 2, carbs: 15, fat: 10, fibre: 1 },
  { keyword: "banana", calories: 105, protein: 1, carbs: 27, fat: 0.4, fibre: 3 },
  { keyword: "eggs", calories: 160, protein: 13, carbs: 1, fat: 11, fibre: 0 },
  { keyword: "toast", calories: 120, protein: 4, carbs: 22, fat: 2, fibre: 2 },
  { keyword: "yogurt", calories: 120, protein: 8, carbs: 10, fat: 5, fibre: 0 },
  { keyword: "pasta", calories: 360, protein: 12, carbs: 65, fat: 6, fibre: 4 },
  { keyword: "rice", calories: 260, protein: 5, carbs: 57, fat: 1, fibre: 1 },
  { keyword: "salad", calories: 280, protein: 10, carbs: 14, fat: 18, fibre: 5 },
  { keyword: "wrap", calories: 320, protein: 10, carbs: 38, fat: 12, fibre: 3 },
  { keyword: "chicken", calories: 220, protein: 35, carbs: 0, fat: 8, fibre: 0 }
].sort((left, right) => right.keyword.length - left.keyword.length);

function normalizeWhitespace(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function sentenceCase(value: string) {
  const trimmed = normalizeWhitespace(value).replace(/^[\s:,-]+|[\s:,-]+$/g, "");
  if (!trimmed) {
    return "Meal";
  }

  return trimmed.charAt(0).toUpperCase() + trimmed.slice(1);
}

export function looksLikeMealLoggingMessage(text: string) {
  const value = normalizeWhitespace(text).toLowerCase();
  return [
    /^(?:i\s+)?ate\b/,
    /^(?:i\s+)?had\b/,
    /^(?:log|logged)\b/,
    /^(?:for\s+)?(?:breakfast|lunch|dinner|snack)\b/,
    /^(?:meal|food)\s*[:=-]/,
    /\b(?:kcal|calories|cals|cal)\b/
  ].some((pattern) => pattern.test(value));
}

export function extractQuickLog(text: string): MealEstimate | null {
  const normalized = normalizeWhitespace(text);
  const mealFirstMatch =
    /^(?:(breakfast|lunch|dinner|snack)\s*(?:was|=|:|-)?\s*)?(?:about|around|roughly)?\s*(\d{1,4}(?:\.\d+)?)\s*(?:kcal|calories|cals|cal)\b/i.exec(
      normalized
    );

  if (mealFirstMatch) {
    const calories = Number.parseFloat(mealFirstMatch[2] ?? "0");
    if (mealFirstMatch[1] && !Number.isNaN(calories)) {
      return {
        description: sentenceCase(mealFirstMatch[1] || "Quick log"),
        ingredients: [],
        calories,
        protein: null,
        carbs: null,
        fat: null,
        fibre: null,
        confidence: 0.95,
        reviewQuestions: [],
        method: "quick_log",
        strategy: "quick_log"
      };
    }
  }

  const calorieFirstMatch =
    /^(?:about|around|roughly)?\s*(\d{1,4}(?:\.\d+)?)\s*(?:kcal|calories|cals|cal)\b(?:\s*(?:for)?\s*(breakfast|lunch|dinner|snack))?/i.exec(
      normalized
    );

  if (calorieFirstMatch) {
    const calories = Number.parseFloat(calorieFirstMatch[1] ?? "0");
    if (!Number.isNaN(calories)) {
      return {
        description: sentenceCase(calorieFirstMatch[2] || "Quick log"),
        ingredients: [],
        calories,
        protein: null,
        carbs: null,
        fat: null,
        fibre: null,
        confidence: 0.95,
        reviewQuestions: [],
        method: "quick_log",
        strategy: "quick_log"
      };
    }
  }

  return null;
}

function stripMealLeadIn(text: string) {
  return normalizeWhitespace(text)
    .replace(/^(?:i\s+)?(?:ate|had)\s+/i, "")
    .replace(/^(?:for\s+)?(?:breakfast|lunch|dinner|snack)\s*(?:was|is|:|-)?\s*/i, "")
    .replace(/^(?:log|logged)\s+(?:meal\s*)?/i, "");
}

export function fallbackEstimateMealFromDescription(text: string): MealEstimate | null {
  const cleaned = stripMealLeadIn(text).toLowerCase();
  if (!cleaned) {
    return null;
  }

  const segments = cleaned
    .split(/\s*(?:,|\band\b|\bwith\b|\+)\s*/i)
    .map((segment) => normalizeWhitespace(segment))
    .filter(Boolean);

  let totalCalories = 0;
  let totalProtein = 0;
  let totalCarbs = 0;
  let totalFat = 0;
  let totalFibre = 0;
  let matchedCount = 0;
  let unmatchedCount = 0;
  const ingredients: IngredientEstimate[] = [];

  for (const segment of segments) {
    const match = HEURISTIC_COMPONENTS.find((entry) => segment.includes(entry.keyword));
    if (!match) {
      unmatchedCount += 1;
      continue;
    }

    matchedCount += 1;
    totalCalories += match.calories;
    totalProtein += match.protein;
    totalCarbs += match.carbs;
    totalFat += match.fat;
    totalFibre += match.fibre;
    ingredients.push({
      name: sentenceCase(match.keyword),
      quantityDescription: null,
      calories: match.calories,
      protein: match.protein,
      carbs: match.carbs,
      fat: match.fat,
      fibre: match.fibre,
      confidence: 0.55
    });
  }

  if (matchedCount === 0) {
    return null;
  }

  const confidence = Math.max(
    0.35,
    Math.min(0.68, 0.5 + (matchedCount * 0.08) - (unmatchedCount * 0.06))
  );

  return {
    description: sentenceCase(stripMealLeadIn(text)),
    ingredients,
    calories: Math.round(totalCalories),
    protein: Math.round(totalProtein),
    carbs: Math.round(totalCarbs),
    fat: Math.round(totalFat),
    fibre: Math.round(totalFibre),
    confidence,
    reviewQuestions: unmatchedCount > 0 ? ["Some ingredients were unclear in the description."] : [],
    method: "text",
    strategy: "heuristic"
  };
}

function normalizeMealEstimate(
  parsed: z.infer<typeof mealEstimateSchema>,
  method: "photo" | "text"
): MealEstimate {
  return {
    ...parsed,
    description: sentenceCase(parsed.description),
    ingredients: parsed.ingredients.map((ingredient) => ({
      ...ingredient,
      name: sentenceCase(ingredient.name),
      quantityDescription: ingredient.quantityDescription
        ? normalizeWhitespace(ingredient.quantityDescription)
        : null
    })),
    reviewQuestions: parsed.reviewQuestions.map((question) => normalizeWhitespace(question)).filter(Boolean),
    method,
    strategy: "openai"
  };
}

export async function estimateMeal(
  config: AppConfig,
  input: MealAnalysisInput
): Promise<MealEstimate> {
  const normalizedText = normalizeWhitespace(input.text ?? "");
  const imageUrls = (input.imageUrls ?? []).filter((value) => normalizeWhitespace(value).length > 0);

  if (!normalizedText && imageUrls.length === 0) {
    throw new Error("Meal estimation needs text, an image, or both.");
  }

  if (imageUrls.length === 0) {
    const quickLog = extractQuickLog(normalizedText);
    if (quickLog) {
      return quickLog;
    }
  }

  const client = createOpenAIClient(config);
  const response = await client.responses.parse({
    model: config.OPENAI_MODEL,
    input: [
      {
        role: "system",
        content: [
          {
            type: "input_text",
            text:
              "Estimate a real-world meal for logging. Infer likely foods, ingredients, and portion sizes from the user's note and any meal photos. Be conservative and practical for a MyFitnessPal-style entry. If a brand or exact quantity is unclear, choose a sensible generic option, lower confidence, and add a short review question. Return only the structured estimate."
          }
        ]
      },
      {
        role: "user",
        content: [
          ...(normalizedText
            ? [
                {
                  type: "input_text" as const,
                  text: normalizedText
                }
              ]
            : [
                {
                  type: "input_text" as const,
                  text: "Please estimate this meal from the attached photo."
                }
              ]),
          ...imageUrls.map((imageUrl) => ({
            type: "input_image" as const,
            image_url: imageUrl,
            detail: "high" as const
          }))
        ]
      }
    ],
    text: {
      format: zodTextFormat(mealEstimateSchema, "meal_estimate")
    }
  });

  const parsed = response.output_parsed;
  if (!parsed) {
    throw new Error("Meal estimation did not return a structured result.");
  }

  return normalizeMealEstimate(parsed, imageUrls.length > 0 ? "photo" : "text");
}

export async function estimateMealFromText(config: AppConfig, text: string) {
  return estimateMeal(config, {
    text
  });
}
