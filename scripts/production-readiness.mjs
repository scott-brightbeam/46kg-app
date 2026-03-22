import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const ROOT = resolve(new URL("..", import.meta.url).pathname);
const ENV_PATH = resolve(ROOT, ".env");

const required = [
  "API_BASE_URL",
  "WEB_BASE_URL",
  "NEXT_PUBLIC_API_BASE_URL",
  "OPENAI_API_KEY",
  "TELEGRAM_BOT_TOKEN",
  "TELEGRAM_WEBHOOK_SECRET",
  "TELEGRAM_CHAT_ID",
  "HEALTH_AUTO_EXPORT_SHARED_SECRET",
  "HEVY_API_KEY",
  "AUTH_SESSION_SECRET",
  "DASHBOARD_USER_EMAIL",
  "DASHBOARD_USER_PASSWORD",
  "DASHBOARD_TRAINER_EMAIL",
  "DASHBOARD_TRAINER_PASSWORD",
  "DASHBOARD_NUTRITIONIST_EMAIL",
  "DASHBOARD_NUTRITIONIST_PASSWORD"
];

const recommended = [
  "TELEGRAM_ALERT_CHAT_ID",
  "GOOGLE_CLIENT_ID",
  "GOOGLE_CLIENT_SECRET",
  "GOOGLE_REFRESH_TOKEN",
  "BACKUP_S3_BUCKET",
  "BACKUP_S3_REGION",
  "BACKUP_S3_ACCESS_KEY_ID",
  "BACKUP_S3_SECRET_ACCESS_KEY"
];

function parseDotEnv(contents) {
  const values = {};

  for (const rawLine of contents.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) {
      continue;
    }

    const separatorIndex = line.indexOf("=");
    if (separatorIndex < 0) {
      continue;
    }

    const key = line.slice(0, separatorIndex).trim();
    let value = line.slice(separatorIndex + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    values[key] = value;
  }

  return values;
}

function loadEnv() {
  try {
    return {
      ...parseDotEnv(readFileSync(ENV_PATH, "utf8")),
      ...process.env
    };
  } catch {
    return {
      ...process.env
    };
  }
}

function isConfigured(value) {
  if (value === undefined || value === null) {
    return false;
  }

  const trimmed = String(value).trim();
  if (trimmed.length === 0) {
    return false;
  }

  return !/\bplaceholder\b|\bchangeme\b|\bexample\b/i.test(trimmed);
}

function run() {
  const env = loadEnv();
  const missingRequired = required.filter((key) => !isConfigured(env[key]));
  const missingRecommended = recommended.filter((key) => !isConfigured(env[key]));

  console.log(
    JSON.stringify(
      {
        ok: missingRequired.length === 0,
        missingRequired,
        missingRecommended,
        notes: [
          "Apple Fitness / HealthKit is the default cardio path in v1.",
          "Google Calendar and S3 backup are optional but strongly recommended for a real deployment.",
          "Render Blueprint sync:false variables must be filled manually in the dashboard if they were added after the first Blueprint creation."
        ]
      },
      null,
      2
    )
  );

  if (missingRequired.length > 0) {
    process.exitCode = 1;
  }
}

run();
