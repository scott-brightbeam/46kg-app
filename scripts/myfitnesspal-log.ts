import { readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

import { loadConfig } from "../apps/api/src/config.js";
import {
  estimateMeal,
  fallbackEstimateMealFromDescription,
  type MealEstimate
} from "../apps/api/src/services/meal-analysis.js";

const execFileAsync = promisify(execFile);

type MealSlot = "breakfast" | "lunch" | "dinner" | "snacks";

type CliOptions = {
  date: string | null;
  dryRun: boolean;
  images: string[];
  meal: MealSlot | null;
  text: string | null;
};

type SearchResult = {
  externalId: string;
  index: number;
  text: string;
  verified: boolean;
  weightIds: string[];
};

type LoadedItem = {
  defaultQuantity: string;
  description: string;
  externalId: string | null;
  foodId: string;
  mealId: string;
  options: Array<{
    text: string;
    value: string;
  }>;
  versionId: string | null;
};

type PortionPlan = {
  chosenOption: string;
  quantity: string;
  reason: string;
  weightValue: string;
};

type PlannedAddition = {
  chosenFood: string;
  ingredient: string;
  quantity: string;
  reason: string;
  serving: string;
  verified: boolean;
};

const mealIdBySlot: Record<MealSlot, string> = {
  breakfast: "0",
  lunch: "1",
  dinner: "2",
  snacks: "3"
};

function printUsage() {
  console.log(`Usage:
  npm run meal:mfp:log -- --text "Lunch: chicken wrap and banana"
  npm run meal:mfp:log -- --image /absolute/path/to/meal.jpg
  npm run meal:mfp:log -- --text "poke bowl" --image /absolute/path/to/meal.jpg --dry-run

Options:
  --text <value>       Minimal meal description
  --image <path>       Local meal image path (repeatable)
  --meal <slot>        breakfast | lunch | dinner | snacks
  --date <YYYY-MM-DD>  Override the diary date
  --dry-run            Show the logging plan without changing MyFitnessPal`);
}

function parseArgs(argv: string[]): CliOptions {
  const options: CliOptions = {
    date: null,
    dryRun: false,
    images: [],
    meal: null,
    text: null
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === "--text") {
      const value = argv[index + 1];
      if (!value) {
        throw new Error("--text requires a value.");
      }
      options.text = value;
      index += 1;
      continue;
    }

    if (arg === "--image") {
      const value = argv[index + 1];
      if (!value) {
        throw new Error("--image requires a path.");
      }
      options.images.push(path.resolve(value));
      index += 1;
      continue;
    }

    if (arg === "--meal") {
      const value = argv[index + 1] as MealSlot | undefined;
      if (!value || !["breakfast", "lunch", "dinner", "snacks"].includes(value)) {
        throw new Error("--meal must be one of breakfast, lunch, dinner, or snacks.");
      }
      options.meal = value;
      index += 1;
      continue;
    }

    if (arg === "--date") {
      const value = argv[index + 1];
      if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
        throw new Error("--date must be in YYYY-MM-DD format.");
      }
      options.date = value;
      index += 1;
      continue;
    }

    if (arg === "--dry-run") {
      options.dryRun = true;
      continue;
    }

    if (arg === "--help" || arg === "-h") {
      printUsage();
      process.exit(0);
    }

    throw new Error(`Unknown argument: ${arg}`);
  }

  return options;
}

function getMimeType(filePath: string) {
  const extension = path.extname(filePath).toLowerCase();
  switch (extension) {
    case ".jpg":
    case ".jpeg":
      return "image/jpeg";
    case ".png":
      return "image/png";
    case ".webp":
      return "image/webp";
    case ".gif":
      return "image/gif";
    default:
      throw new Error(`Unsupported image type for ${filePath}. Use jpg, png, webp, or gif.`);
  }
}

async function toDataUrl(filePath: string) {
  const buffer = await readFile(filePath);
  return `data:${getMimeType(filePath)};base64,${buffer.toString("base64")}`;
}

function normalizeWhitespace(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function normalizeKey(value: string) {
  return normalizeWhitespace(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function tokenize(value: string) {
  return normalizeKey(value).split(" ").filter(Boolean);
}

function detectMealSlot(text: string | null, date: Date): MealSlot {
  const normalized = normalizeKey(text ?? "");
  if (normalized.includes("breakfast")) {
    return "breakfast";
  }
  if (normalized.includes("lunch")) {
    return "lunch";
  }
  if (normalized.includes("dinner")) {
    return "dinner";
  }
  if (normalized.includes("snack")) {
    return "snacks";
  }

  const hour = date.getHours();
  if (hour < 11) {
    return "breakfast";
  }
  if (hour < 16) {
    return "lunch";
  }
  if (hour < 21) {
    return "dinner";
  }
  return "snacks";
}

function formatDateInTimeZone(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    timeZone
  }).formatToParts(date);

  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  const day = parts.find((part) => part.type === "day")?.value;

  if (!year || !month || !day) {
    throw new Error("Unable to format date in the configured time zone.");
  }

  return `${year}-${month}-${day}`;
}

async function runAppleScript(lines: string[]) {
  const args = lines.flatMap((line) => ["-e", line]);
  const { stdout } = await execFileAsync("osascript", args);
  return stdout.trim();
}

async function chromeExecuteJavaScript(script: string) {
  try {
    return await runAppleScript([
      `tell application "Google Chrome" to tell active tab of front window to execute javascript ${JSON.stringify(script)}`
    ]);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes("Allow JavaScript from Apple Events")) {
      throw new Error(
        'Chrome is blocking automation. In Chrome, enable View > Developer > Allow JavaScript from Apple Events.'
      );
    }

    throw error;
  }
}

async function focusMyFitnessPalTab() {
  await runAppleScript([
    'tell application "Google Chrome"',
    'repeat with wi from 1 to count of windows',
    'repeat with ti from 1 to count of tabs of window wi',
    'set tabUrl to URL of tab ti of window wi',
    'if tabUrl contains "myfitnesspal.com" then',
    'set active tab index of window wi to ti',
    'set index of window wi to 1',
    'activate',
    'delay 1',
    'return tabUrl',
    'end if',
    'end repeat',
    'end repeat',
    'error "No MyFitnessPal tab is open in Google Chrome."',
    'end tell'
  ]);
}

async function setChromeTabUrl(url: string) {
  await runAppleScript([
    'tell application "Google Chrome"',
    `set URL of active tab of front window to ${JSON.stringify(url)}`,
    "end tell"
  ]);
}

async function wait(ms: number) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForJavaScriptCondition(
  conditionScript: string,
  timeoutMs = 10000,
  intervalMs = 300
) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    const result = await chromeExecuteJavaScript(conditionScript);
    if (result === "true") {
      return;
    }
    await wait(intervalMs);
  }

  throw new Error("Timed out waiting for MyFitnessPal to finish loading.");
}

async function navigateToSearchPage(query: string, mealId: string, date: string) {
  const url = `https://www.myfitnesspal.com/food/search?meal=${mealId}&date=${date}&search=${encodeURIComponent(query)}`;
  await setChromeTabUrl(url);
  try {
    await waitForJavaScriptCondition('document.readyState === "complete"');
    await waitForJavaScriptCondition('document.querySelectorAll("a.search").length > 0');
    await wait(1200);
  } catch {
    throw new Error(`Timed out waiting for MyFitnessPal search results for "${query}".`);
  }
}

async function getSearchResults() {
  const raw = await chromeExecuteJavaScript(`
    JSON.stringify(
      Array.from(document.querySelectorAll("a.search")).slice(0, 20).map((anchor, index) => ({
        index,
        text: (anchor.textContent || "").trim(),
        externalId: anchor.dataset.externalId || "",
        verified: anchor.dataset.verified === "true",
        weightIds: (anchor.dataset.weightIds || "").split(",").filter(Boolean)
      }))
    )
  `);

  return JSON.parse(raw) as SearchResult[];
}

function scoreSearchResult(query: string, result: SearchResult) {
  const queryKey = normalizeKey(query);
  const resultKey = normalizeKey(result.text);
  const queryTokens = tokenize(query);
  const resultTokens = new Set(tokenize(result.text));
  const overlap = queryTokens.filter((token) => resultTokens.has(token)).length;

  let score = overlap * 12;
  if (resultKey === queryKey) {
    score += 80;
  } else if (resultKey.includes(queryKey) || queryKey.includes(resultKey)) {
    score += 35;
  }

  if (result.verified) {
    score += 8;
  }

  score -= Math.max(0, Math.abs(resultKey.length - queryKey.length) / 5);
  return score;
}

function pickSearchResult(query: string, results: SearchResult[]) {
  if (results.length === 0) {
    throw new Error(`No MyFitnessPal results found for "${query}".`);
  }

  return [...results]
    .map((result) => ({
      result,
      score: scoreSearchResult(query, result)
    }))
    .sort((left, right) => right.score - left.score)[0]?.result;
}

async function selectSearchResult(index: number) {
  await chromeExecuteJavaScript(`
    (() => {
      const link = Array.from(document.querySelectorAll("a.search"))[${index}];
      if (!link) {
        return "missing";
      }
      link.click();
      return "clicked";
    })()
  `);

  try {
    await waitForJavaScriptCondition(
      'Boolean(document.querySelector("#food-nutritional-details-form #loaded_item input[name=\\"food_entry[food_id]\\"]")?.value)'
    );
  } catch {
    throw new Error("Timed out waiting for MyFitnessPal to load the selected serving picker.");
  }

  const raw = await chromeExecuteJavaScript(`
    (() => {
      const root = document.querySelector("#food-nutritional-details-form #loaded_item");
      if (!root) {
        return JSON.stringify(null);
      }

      return JSON.stringify({
        foodId: root.querySelector('input[name="food_entry[food_id]"]')?.value || "",
        description: (root.querySelector(".food-description")?.textContent || "").trim(),
        defaultQuantity: root.querySelector('input[name="food_entry[quantity]"]')?.value || "",
        mealId: root.querySelector('select[name="food_entry[meal_id]"]')?.value || "",
        externalId: root.querySelector("#update_servings")?.getAttribute("data-external-id"),
        versionId: root.querySelector("#update_servings")?.getAttribute("data-version-id"),
        options: Array.from(root.querySelectorAll('select[name="food_entry[weight_id]"] option')).map((option) => ({
          value: option.value,
          text: (option.textContent || "").trim()
        }))
      });
    })()
  `);

  const parsed = JSON.parse(raw) as LoadedItem | null;
  if (!parsed || !parsed.foodId) {
    throw new Error("MyFitnessPal did not load a serving picker for the selected food.");
  }

  return parsed;
}

function extractNumericQuantity(quantityDescription: string | null) {
  if (!quantityDescription) {
    return 1;
  }

  const match = quantityDescription.match(/(\d+(?:\.\d+)?)/);
  if (!match) {
    return 1;
  }

  const value = Number.parseFloat(match[1] ?? "1");
  return Number.isFinite(value) && value > 0 ? value : 1;
}

function normalizeUnit(value: string) {
  return normalizeKey(value)
    .replace(/\bgrams?\b/g, "g")
    .replace(/\bkilograms?\b/g, "kg")
    .replace(/\bounces?\b/g, "oz")
    .replace(/\btablespoons?\b/g, "tbsp")
    .replace(/\bteaspoons?\b/g, "tsp")
    .replace(/\bcups?\b/g, "cup")
    .replace(/\bslices?\b/g, "slice")
    .replace(/\bservings?\b/g, "serving")
    .replace(/\bpieces?\b/g, "piece")
    .replace(/\bwhole\b/g, "piece");
}

function scoreServingOption(optionText: string, quantityDescription: string | null) {
  if (!quantityDescription) {
    return 0;
  }

  const optionKey = normalizeUnit(optionText);
  const quantityKey = normalizeUnit(quantityDescription);
  const optionTokens = new Set(tokenize(optionKey));
  const quantityTokens = tokenize(quantityKey).filter((token) => Number.isNaN(Number(token)));
  const overlap = quantityTokens.filter((token) => optionTokens.has(token)).length;

  let score = overlap * 10;
  if (quantityTokens.length > 0 && optionKey.includes(quantityTokens.join(" "))) {
    score += 20;
  }
  if (quantityKey.includes(" g") && optionKey.includes("1 g")) {
    score += 15;
  }
  if (quantityKey.includes(" oz") && optionKey.includes("1 oz")) {
    score += 15;
  }
  if (quantityKey.includes("cup") && optionKey.includes("cup")) {
    score += 10;
  }
  if (quantityKey.includes("medium") && optionKey.includes("medium")) {
    score += 10;
  }
  if (quantityKey.includes("large") && optionKey.includes("large")) {
    score += 10;
  }
  if (quantityKey.includes("small") && optionKey.includes("small")) {
    score += 10;
  }

  return score;
}

function choosePortionPlan(quantityDescription: string | null, item: LoadedItem): PortionPlan {
  if (item.options.length === 0) {
    throw new Error(`No serving options were available for ${item.description}.`);
  }

  const quantity = extractNumericQuantity(quantityDescription);
  const winningOption =
    [...item.options]
      .map((option) => ({
        option,
        score: scoreServingOption(option.text, quantityDescription)
      }))
      .sort((left, right) => right.score - left.score)[0]?.option ?? item.options[0];

  const reason =
    quantityDescription && normalizeWhitespace(quantityDescription).length > 0
      ? `matched from "${quantityDescription}"`
      : "used the default serving";

  return {
    chosenOption: winningOption.text,
    quantity: String(quantity),
    reason,
    weightValue: winningOption.value
  };
}

async function submitLoadedItem(plan: PortionPlan, mealId: string) {
  await chromeExecuteJavaScript(`
    (() => {
      const form = document.querySelector("#food-nutritional-details-form");
      if (!form) {
        return "missing";
      }

      const quantity = form.querySelector('input[name="food_entry[quantity]"]');
      const weight = form.querySelector('select[name="food_entry[weight_id]"]');
      const meal = form.querySelector('select[name="food_entry[meal_id]"]');

      if (!quantity || !weight || !meal) {
        return "missing";
      }

      quantity.value = ${JSON.stringify(plan.quantity)};
      weight.value = ${JSON.stringify(plan.weightValue)};
      meal.value = ${JSON.stringify(mealId)};
      form.submit();
      return "submitted";
    })()
  `);

  try {
    await waitForJavaScriptCondition('document.readyState === "complete"');
  } catch {
    throw new Error("Timed out waiting for MyFitnessPal to finish submitting the food entry.");
  }
  await wait(1200);
}

async function navigateToDiary(date: string) {
  await setChromeTabUrl(`https://www.myfitnesspal.com/food/diary?date=${date}`);
  try {
    await waitForJavaScriptCondition('document.readyState === "complete"');
  } catch {
    throw new Error("Timed out returning to the MyFitnessPal diary.");
  }
}

function buildIngredientsToLog(meal: MealEstimate) {
  if (meal.ingredients.length > 0) {
    return meal.ingredients;
  }

  if (meal.method === "quick_log") {
    throw new Error(
      "Quick-add calorie logging is not wired into the Chrome logger yet. Use a food description or photo so I can map real ingredients into MyFitnessPal."
    );
  }

  return [
    {
      name: meal.description,
      quantityDescription: null,
      calories: meal.calories,
      protein: meal.protein,
      carbs: meal.carbs,
      fat: meal.fat,
      fibre: meal.fibre,
      confidence: meal.confidence
    }
  ];
}

function summarizePlan(meal: MealEstimate, additions: PlannedAddition[], mealSlot: MealSlot, date: string) {
  const header = `Plan for ${mealSlot} on ${date}: ${meal.description} (${Math.round(meal.calories)} kcal, confidence ${Math.round(meal.confidence * 100)}%)`;
  const lines = additions.map(
    (addition) =>
      `- ${addition.ingredient} -> ${addition.chosenFood} | ${addition.quantity} x ${addition.serving} | ${addition.reason}${addition.verified ? " | verified" : ""}`
  );
  const checks =
    meal.reviewQuestions.length === 0
      ? null
      : `Review: ${meal.reviewQuestions.join(" | ")}`;

  return [header, ...lines, checks].filter((value): value is string => Boolean(value)).join("\n");
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (!options.text && options.images.length === 0) {
    printUsage();
    process.exit(1);
  }

  const config = loadConfig();
  const now = new Date();
  const mealSlot = options.meal ?? detectMealSlot(options.text, now);
  const mealId = mealIdBySlot[mealSlot];
  const date = options.date ?? formatDateInTimeZone(now, config.APP_TIME_ZONE);
  const imageUrls = await Promise.all(options.images.map((imagePath) => toDataUrl(imagePath)));
  let meal: MealEstimate;
  try {
    meal = await estimateMeal(config, {
      text: options.text ?? undefined,
      imageUrls
    });
  } catch (error) {
    if (imageUrls.length > 0) {
      throw new Error(
        `Meal photo analysis failed. ${error instanceof Error ? error.message : String(error)}`
      );
    }

    if (!options.text) {
      throw error;
    }

    const fallbackMeal = fallbackEstimateMealFromDescription(options.text);
    if (!fallbackMeal) {
      throw error;
    }

    meal = fallbackMeal;
  }

  console.error("[mfp] focusing MyFitnessPal tab");
  await focusMyFitnessPalTab();

  const additions: PlannedAddition[] = [];
  for (const ingredient of buildIngredientsToLog(meal)) {
    console.error(`[mfp] searching for ${ingredient.name}`);
    await navigateToSearchPage(ingredient.name, mealId, date);
    console.error(`[mfp] reading results for ${ingredient.name}`);
    const results = await getSearchResults();
    const selected = pickSearchResult(ingredient.name, results);
    console.error(`[mfp] selected ${selected.text} for ${ingredient.name}`);
    const loadedItem = await selectSearchResult(selected.index);
    const portionPlan = choosePortionPlan(ingredient.quantityDescription, loadedItem);

    additions.push({
      ingredient: ingredient.name,
      chosenFood: loadedItem.description,
      quantity: portionPlan.quantity,
      reason: portionPlan.reason,
      serving: portionPlan.chosenOption,
      verified: selected.verified
    });

    if (!options.dryRun) {
      console.error(`[mfp] submitting ${loadedItem.description}`);
      await submitLoadedItem(portionPlan, mealId);
    }
  }

  console.error("[mfp] returning to diary");
  await navigateToDiary(date);
  console.log(summarizePlan(meal, additions, mealSlot, date));
  if (options.dryRun) {
    console.log("\nDry run only. Nothing was added to MyFitnessPal.");
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
