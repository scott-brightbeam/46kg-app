import { mkdir, readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";

import { chromium } from "playwright";

import { loadConfig } from "../apps/api/src/config.js";
import { estimateMeal, type MealEstimate } from "../apps/api/src/services/meal-analysis.js";

type CliOptions = {
  bootstrapLogin: boolean;
  images: string[];
  json: boolean;
  profileDir: string;
  text: string | null;
};

function printUsage() {
  console.log(`Usage:
  npm run meal:mfp -- --text "Lunch was chicken wrap and crisps"
  npm run meal:mfp -- --image /absolute/path/to/meal.jpg
  npm run meal:mfp -- --text "poke bowl" --image /absolute/path/to/meal.jpg --json
  npm run meal:mfp -- --bootstrap-login

Options:
  --text <value>         Minimal meal description
  --image <path>         Local meal image path (repeatable)
  --json                 Print the structured estimate as JSON
  --bootstrap-login      Open the persistent MyFitnessPal browser profile for one-time login
  --profile-dir <path>   Override the persistent browser profile directory`);
}

function parseArgs(argv: string[]): CliOptions {
  const options: CliOptions = {
    bootstrapLogin: false,
    images: [],
    json: false,
    profileDir: path.join(process.cwd(), ".codex-local", "myfitnesspal-profile"),
    text: null
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--bootstrap-login") {
      options.bootstrapLogin = true;
      continue;
    }

    if (arg === "--json") {
      options.json = true;
      continue;
    }

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

    if (arg === "--profile-dir") {
      const value = argv[index + 1];
      if (!value) {
        throw new Error("--profile-dir requires a path.");
      }

      options.profileDir = path.resolve(value);
      index += 1;
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
  const mimeType = getMimeType(filePath);
  return `data:${mimeType};base64,${buffer.toString("base64")}`;
}

function summarizeMeal(meal: MealEstimate) {
  const macros = [
    meal.protein === null ? null : `protein ${Math.round(meal.protein)}g`,
    meal.carbs === null ? null : `carbs ${Math.round(meal.carbs)}g`,
    meal.fat === null ? null : `fat ${Math.round(meal.fat)}g`,
    meal.fibre === null ? null : `fibre ${Math.round(meal.fibre)}g`
  ].filter((value): value is string => Boolean(value));

  const ingredients =
    meal.ingredients.length === 0
      ? "No ingredient breakdown."
      : meal.ingredients
          .map((ingredient) => {
            const quantity = ingredient.quantityDescription ? ` - ${ingredient.quantityDescription}` : "";
            return `- ${ingredient.name}${quantity}`;
          })
          .join("\n");

  const review =
    meal.reviewQuestions.length === 0
      ? "No immediate review questions."
      : meal.reviewQuestions.map((question) => `- ${question}`).join("\n");

  return `Description: ${meal.description}
Method: ${meal.method}
Calories: ${Math.round(meal.calories)}
Macros: ${macros.length > 0 ? macros.join(", ") : "not estimated"}
Confidence: ${Math.round(meal.confidence * 100)}%

Ingredients:
${ingredients}

Review:
${review}`;
}

async function bootstrapLogin(profileDir: string) {
  await mkdir(profileDir, {
    recursive: true
  });

  const context = await chromium.launchPersistentContext(profileDir, {
    headless: false
  });

  const page = context.pages()[0] ?? (await context.newPage());
  await page.goto("https://www.myfitnesspal.com/food/diary", {
    waitUntil: "domcontentloaded"
  });

  console.log(`Opened MyFitnessPal in a persistent browser profile:
${profileDir}

Log in manually in the browser window. When the diary page is ready, press Enter here to close the helper.`);

  const readline = createInterface({
    input,
    output
  });
  await readline.question("");
  readline.close();

  await context.close();
}

async function main() {
  const options = parseArgs(process.argv.slice(2));

  if (options.bootstrapLogin) {
    await bootstrapLogin(options.profileDir);
  }

  if (!options.text && options.images.length === 0) {
    if (options.bootstrapLogin) {
      return;
    }

    printUsage();
    process.exit(1);
  }

  const config = loadConfig();
  const imageUrls = await Promise.all(options.images.map((imagePath) => toDataUrl(imagePath)));
  const meal = await estimateMeal(config, {
    text: options.text ?? undefined,
    imageUrls
  });

  if (options.json) {
    console.log(JSON.stringify(meal, null, 2));
    return;
  }

  console.log(summarizeMeal(meal));
  console.log(`
Next step:
- If the estimate looks right, we can use the same persistent profile to finish the MyFitnessPal diary automation against your live logged-in session.`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
