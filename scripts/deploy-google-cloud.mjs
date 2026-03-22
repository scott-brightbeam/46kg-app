import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";

const PROJECT_ID =
  process.env.GCP_PROJECT_ID?.trim() || process.env.CLOUDSDK_CORE_PROJECT?.trim() || "scotts-kanban-pilot-03062106";
const REGION = process.env.GCP_REGION?.trim() || "us-central1";
const REPOSITORY = process.env.GCP_ARTIFACT_REPOSITORY?.trim() || "kanban-repo";
const API_SERVICE = process.env.GCP_API_SERVICE?.trim() || "46kg-api";
const WEB_SERVICE = process.env.GCP_WEB_SERVICE?.trim() || "46kg-web";
const BOOTSTRAP_JOB = process.env.GCP_BOOTSTRAP_JOB?.trim() || "46kg-bootstrap";
const CLOUD_SQL_INSTANCE =
  process.env.GCP_CLOUD_SQL_INSTANCE?.trim() ||
  `${PROJECT_ID}:${REGION}:kanban-pg-pilot`;
const PGDATABASE = process.env.GCP_PGDATABASE?.trim() || "kanban";
const PGUSER = process.env.GCP_PGUSER?.trim() || "kanban_app";
const PGPASSWORD_SECRET = process.env.GCP_PGPASSWORD_SECRET?.trim() || "kanban-pg-password";
const POSTGRES_SCHEMA = process.env.GCP_POSTGRES_SCHEMA?.trim() || "fortysixkg";
const BUILD_SOURCE_URL = process.env.GCP_BUILD_SOURCE_URL?.trim() || "";
const BUILD_SOURCE_REVISION = process.env.GCP_BUILD_SOURCE_REVISION?.trim() || "main";
const ROOT = process.cwd();
const ENV_PATH = path.join(ROOT, ".env");

function isPlaceholder(value) {
  if (!value) {
    return true;
  }

  const normalized = value.trim().toLowerCase();
  return (
    normalized.length === 0 ||
    normalized.includes("placeholder") ||
    normalized.includes("change-me") ||
    normalized.includes("your_") ||
    normalized === "example"
  );
}

function parseEnvFile(filePath) {
  const values = {};
  const source = readFileSync(filePath, "utf8");
  for (const line of source.split(/\r?\n/)) {
    if (!line || line.trim().startsWith("#") || !line.includes("=")) {
      continue;
    }

    const [key, ...rest] = line.split("=");
    values[key.trim()] = rest.join("=").trim();
  }
  return values;
}

function resolveValue(envValues, name, options = {}) {
  const raw = envValues[name] ?? process.env[name] ?? "";
  const trimmed = raw.trim();
  if (!trimmed || (options.allowPlaceholder === false && isPlaceholder(trimmed))) {
    if (options.generate) {
      return options.generate();
    }

    if (options.defaultValue !== undefined) {
      return options.defaultValue;
    }
  }

  return trimmed || options.defaultValue || "";
}

function writeEnvFile(envObject, directory, name) {
  const filePath = path.join(directory, name);
  writeFileSync(filePath, JSON.stringify(envObject, null, 2));
  return filePath;
}

function run(command, args, { capture = false } = {}) {
  const result = spawnSync(command, args, {
    cwd: ROOT,
    stdio: capture ? ["inherit", "pipe", "pipe"] : "inherit",
    encoding: "utf8"
  });

  if (result.status !== 0) {
    const details = capture ? `${result.stdout || ""}${result.stderr || ""}`.trim() : "";
    throw new Error(`${command} ${args.join(" ")} failed${details ? `\n${details}` : ""}`);
  }

  return capture ? (result.stdout || "").trim() : "";
}

function serviceExists(name) {
  const result = spawnSync(
    "gcloud",
    ["run", "services", "describe", name, "--region", REGION, "--format=value(status.url)"],
    {
      cwd: ROOT,
      stdio: "pipe",
      encoding: "utf8"
    }
  );

  return result.status === 0;
}

function jobExists(name) {
  const result = spawnSync(
    "gcloud",
    ["run", "jobs", "describe", name, "--region", REGION, "--format=value(metadata.name)"],
    {
      cwd: ROOT,
      stdio: "pipe",
      encoding: "utf8"
    }
  );

  return result.status === 0;
}

function buildBaseApiEnv(envValues) {
  return {
    NODE_ENV: "production",
    API_BASE_URL: "https://placeholder.invalid",
    WEB_BASE_URL: "https://placeholder.invalid",
    APP_TIME_ZONE: envValues.APP_TIME_ZONE?.trim() || "Europe/London",
    OPENAI_API_KEY: resolveValue(envValues, "OPENAI_API_KEY", {
      allowPlaceholder: false,
      defaultValue: "disabled-openai-api-key"
    }),
    OPENAI_MODEL: envValues.OPENAI_MODEL?.trim() || "gpt-5",
    TELEGRAM_BOT_TOKEN: resolveValue(envValues, "TELEGRAM_BOT_TOKEN", {
      allowPlaceholder: false,
      defaultValue: "disabled-telegram-bot-token"
    }),
    TELEGRAM_WEBHOOK_SECRET: resolveValue(envValues, "TELEGRAM_WEBHOOK_SECRET", {
      allowPlaceholder: false,
      generate: () => randomBytes(24).toString("hex")
    }),
    TELEGRAM_CHAT_ID: resolveValue(envValues, "TELEGRAM_CHAT_ID", {
      allowPlaceholder: false,
      defaultValue: ""
    }),
    TELEGRAM_ALERT_CHAT_ID: resolveValue(envValues, "TELEGRAM_ALERT_CHAT_ID", {
      allowPlaceholder: false,
      defaultValue: ""
    }),
    ENABLE_OPERATOR_ALERTS: "false",
    HEALTH_AUTO_EXPORT_SHARED_SECRET: resolveValue(envValues, "HEALTH_AUTO_EXPORT_SHARED_SECRET", {
      allowPlaceholder: false,
      generate: () => randomBytes(24).toString("hex")
    }),
    HEVY_API_KEY: resolveValue(envValues, "HEVY_API_KEY", {
      allowPlaceholder: false,
      defaultValue: ""
    }),
    AUTH_SESSION_SECRET: resolveValue(envValues, "AUTH_SESSION_SECRET", {
      allowPlaceholder: false,
      generate: () => randomBytes(32).toString("hex")
    }),
    GOOGLE_CLIENT_ID: resolveValue(envValues, "GOOGLE_CLIENT_ID", {
      allowPlaceholder: false,
      defaultValue: ""
    }),
    GOOGLE_CLIENT_SECRET: resolveValue(envValues, "GOOGLE_CLIENT_SECRET", {
      allowPlaceholder: false,
      defaultValue: ""
    }),
    GOOGLE_REFRESH_TOKEN: resolveValue(envValues, "GOOGLE_REFRESH_TOKEN", {
      allowPlaceholder: false,
      defaultValue: ""
    }),
    GOOGLE_CALENDAR_ID: envValues.GOOGLE_CALENDAR_ID?.trim() || "primary",
    DASHBOARD_USER_EMAIL: resolveValue(envValues, "DASHBOARD_USER_EMAIL"),
    DASHBOARD_USER_PASSWORD: resolveValue(envValues, "DASHBOARD_USER_PASSWORD"),
    DASHBOARD_TRAINER_EMAIL: resolveValue(envValues, "DASHBOARD_TRAINER_EMAIL"),
    DASHBOARD_TRAINER_PASSWORD: resolveValue(envValues, "DASHBOARD_TRAINER_PASSWORD"),
    DASHBOARD_NUTRITIONIST_EMAIL: resolveValue(envValues, "DASHBOARD_NUTRITIONIST_EMAIL"),
    DASHBOARD_NUTRITIONIST_PASSWORD: resolveValue(envValues, "DASHBOARD_NUTRITIONIST_PASSWORD"),
    PGHOST: `/cloudsql/${CLOUD_SQL_INSTANCE}`,
    PGPORT: "5432",
    PGDATABASE,
    PGUSER,
    PGSSLMODE: "disable",
    POSTGRES_SCHEMA
  };
}

function buildApiImageUrl() {
  return `${REGION}-docker.pkg.dev/${PROJECT_ID}/${REPOSITORY}/46kg-api:latest`;
}

function buildWebImageUrl() {
  return `${REGION}-docker.pkg.dev/${PROJECT_ID}/${REPOSITORY}/46kg-web:latest`;
}

function buildSubmitArgs(configPath, substitutions = []) {
  const args = ["builds", "submit"];

  if (BUILD_SOURCE_URL) {
    args.push(BUILD_SOURCE_URL, "--git-source-revision", BUILD_SOURCE_REVISION);
  }

  args.push("--config", configPath);

  if (substitutions.length > 0) {
    args.push("--substitutions", substitutions.join(","));
  }

  return args;
}

function printWarnings(envObject) {
  const warnings = [];
  if (envObject.OPENAI_API_KEY === "disabled-openai-api-key") {
    warnings.push("OPENAI_API_KEY is still a placeholder; AI estimation/coaching depth will be limited.");
  }

  if (envObject.TELEGRAM_BOT_TOKEN === "disabled-telegram-bot-token") {
    warnings.push("TELEGRAM_BOT_TOKEN is still a placeholder; Telegram webhook configuration is intentionally skipped.");
  }

  if (!envObject.GOOGLE_CLIENT_ID || !envObject.GOOGLE_CLIENT_SECRET || !envObject.GOOGLE_REFRESH_TOKEN) {
    warnings.push("Google Calendar credentials are not configured; calendar sync stays dormant.");
  }

  if (!envObject.HEVY_API_KEY) {
    warnings.push("HEVY_API_KEY is missing; Hevy sync will not work until it is set.");
  }

  if (warnings.length > 0) {
    console.log("\nWarnings:");
    for (const warning of warnings) {
      console.log(`- ${warning}`);
    }
  }
}

async function main() {
  const envValues = parseEnvFile(ENV_PATH);
  const apiEnv = buildBaseApiEnv(envValues);

  const tempDir = mkdtempSync(path.join(os.tmpdir(), "46kg-gcp-"));
  try {
    const apiEnvFile = writeEnvFile(apiEnv, tempDir, "api-env.json");

    run("gcloud", buildSubmitArgs("cloudbuild.api.yaml"));

    run("gcloud", [
      "run",
      "deploy",
      API_SERVICE,
      "--image",
      buildApiImageUrl(),
      "--region",
      REGION,
      "--allow-unauthenticated",
      "--memory",
      "1Gi",
      "--cpu",
      "1",
      "--min-instances",
      "0",
      "--max-instances",
      "3",
      "--add-cloudsql-instances",
      CLOUD_SQL_INSTANCE,
      "--env-vars-file",
      apiEnvFile,
      "--set-secrets",
      `PGPASSWORD=${PGPASSWORD_SECRET}:latest`
    ]);

    const apiUrl = run(
      "gcloud",
      ["run", "services", "describe", API_SERVICE, "--region", REGION, "--format=value(status.url)"],
      { capture: true }
    );

    const bootstrapArgs = [
      "run",
      "jobs",
      jobExists(BOOTSTRAP_JOB) ? "update" : "create",
      BOOTSTRAP_JOB,
      "--image",
      buildApiImageUrl(),
      "--region",
      REGION,
      "--memory",
      "1Gi",
      "--cpu",
      "1",
      "--max-retries",
      "0",
      "--tasks",
      "1",
      "--add-cloudsql-instances",
      CLOUD_SQL_INSTANCE,
      "--env-vars-file",
      apiEnvFile,
      "--set-secrets",
      `PGPASSWORD=${PGPASSWORD_SECRET}:latest`,
      "--command",
      "node",
      "--args",
      "scripts/bootstrap-cloud.mjs"
    ];

    run("gcloud", bootstrapArgs);
    run("gcloud", ["run", "jobs", "execute", BOOTSTRAP_JOB, "--region", REGION, "--wait"]);

    run(
      "gcloud",
      buildSubmitArgs("cloudbuild.web.yaml", [`_NEXT_PUBLIC_API_BASE_URL=${apiUrl}`])
    );

    run("gcloud", [
      "run",
      "deploy",
      WEB_SERVICE,
      "--image",
      buildWebImageUrl(),
      "--region",
      REGION,
      "--allow-unauthenticated",
      "--memory",
      "512Mi",
      "--cpu",
      "1",
      "--min-instances",
      "0",
      "--max-instances",
      "2"
    ]);

    const webUrl = run(
      "gcloud",
      ["run", "services", "describe", WEB_SERVICE, "--region", REGION, "--format=value(status.url)"],
      { capture: true }
    );

    run("gcloud", [
      "run",
      "services",
      "update",
      API_SERVICE,
      "--region",
      REGION,
      "--update-env-vars",
      `API_BASE_URL=${apiUrl},WEB_BASE_URL=${webUrl}`
    ]);

    console.log("\n46KG deployed on Google Cloud.");
    console.log(`API: ${apiUrl}`);
    console.log(`Web: ${webUrl}`);
    console.log(`Bootstrap job: ${BOOTSTRAP_JOB}`);
    printWarnings(apiEnv);
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
