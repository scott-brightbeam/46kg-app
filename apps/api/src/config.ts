import { z } from "zod";

const optionalPositiveNumber = z.preprocess((value) => {
  if (value === undefined || value === null || value === "") {
    return undefined;
  }

  return Number(value);
}, z.number().positive().optional());

const optionalBoolean = z.preprocess((value) => {
  if (value === undefined || value === null || value === "") {
    return undefined;
  }

  if (typeof value === "boolean") {
    return value;
  }

  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (["1", "true", "yes", "on"].includes(normalized)) {
      return true;
    }

    if (["0", "false", "no", "off"].includes(normalized)) {
      return false;
    }
  }

  return value;
}, z.boolean().optional());

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  APP_TIME_ZONE: z.string().default("Europe/London"),
  API_PORT: z.coerce.number().default(3001),
  API_BASE_URL: z.string().url().default("http://localhost:3001"),
  WEB_BASE_URL: z.string().url().default("http://localhost:3000"),
  DATABASE_URL: z.string().optional(),
  PGHOST: z.string().optional(),
  PGPORT: z.string().optional(),
  PGDATABASE: z.string().optional(),
  PGUSER: z.string().optional(),
  PGPASSWORD: z.string().optional(),
  PGSSLMODE: z.string().optional(),
  POSTGRES_SCHEMA: z.string().optional(),
  DAILY_CALORIE_TARGET: optionalPositiveNumber,
  DAILY_PROTEIN_TARGET: optionalPositiveNumber,
  DAILY_FIBRE_TARGET: optionalPositiveNumber,
  OPENAI_API_KEY: z.string().min(1),
  OPENAI_MODEL: z.string().default("gpt-5"),
  TELEGRAM_BOT_TOKEN: z.string().min(1),
  TELEGRAM_WEBHOOK_SECRET: z.string().min(1),
  TELEGRAM_CHAT_ID: z.string().optional(),
  TELEGRAM_ALERT_CHAT_ID: z.string().optional(),
  ENABLE_OPERATOR_ALERTS: optionalBoolean.default(true),
  HEALTH_AUTO_EXPORT_SHARED_SECRET: z.string().min(1),
  HEVY_API_KEY: z.string().optional(),
  AUTH_SESSION_SECRET: z.string().min(1),
  STRAVA_CLIENT_ID: z.string().optional(),
  STRAVA_CLIENT_SECRET: z.string().optional(),
  STRAVA_REFRESH_TOKEN: z.string().optional(),
  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),
  GOOGLE_REFRESH_TOKEN: z.string().optional(),
  GOOGLE_CALENDAR_ID: z.string().default("primary"),
  BACKUP_PGDUMP_BIN: z.string().default("pg_dump"),
  BACKUP_S3_BUCKET: z.string().optional(),
  BACKUP_S3_REGION: z.string().optional(),
  BACKUP_S3_ENDPOINT: z.string().optional(),
  BACKUP_S3_ACCESS_KEY_ID: z.string().optional(),
  BACKUP_S3_SECRET_ACCESS_KEY: z.string().optional(),
  BACKUP_S3_PREFIX: z.string().default("postgres"),
  BACKUP_S3_FORCE_PATH_STYLE: optionalBoolean.default(false)
});

export type AppConfig = z.infer<typeof envSchema>;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const resolvedEnv = {
    ...env,
    API_PORT:
      env.API_PORT && env.API_PORT.trim().length > 0
        ? env.API_PORT
        : env.PORT && env.PORT.trim().length > 0
          ? env.PORT
          : env.API_PORT
  };

  const parsed = envSchema.parse(resolvedEnv);
  const hasDatabaseUrl = Boolean(parsed.DATABASE_URL?.trim());
  const hasPgTuple = Boolean(
    parsed.PGHOST?.trim() &&
      parsed.PGDATABASE?.trim() &&
      parsed.PGUSER?.trim() &&
      parsed.PGPASSWORD?.trim()
  );

  if (!hasDatabaseUrl && !hasPgTuple) {
    throw new Error(
      "DATABASE_URL is required, or PGHOST/PGDATABASE/PGUSER/PGPASSWORD must all be set"
    );
  }

  return parsed;
}

export function requireStravaConfig(config: AppConfig) {
  if (!config.STRAVA_CLIENT_ID || !config.STRAVA_CLIENT_SECRET || !config.STRAVA_REFRESH_TOKEN) {
    throw new Error(
      "STRAVA_CLIENT_ID, STRAVA_CLIENT_SECRET, and STRAVA_REFRESH_TOKEN are required for Strava sync"
    );
  }

  return {
    clientId: config.STRAVA_CLIENT_ID,
    clientSecret: config.STRAVA_CLIENT_SECRET,
    refreshToken: config.STRAVA_REFRESH_TOKEN
  };
}

export function requireHevyConfig(config: AppConfig) {
  if (!config.HEVY_API_KEY) {
    throw new Error("HEVY_API_KEY is required for Hevy sync");
  }

  return {
    apiKey: config.HEVY_API_KEY
  };
}

export function requireGoogleCalendarConfig(config: AppConfig) {
  if (!config.GOOGLE_CLIENT_ID || !config.GOOGLE_CLIENT_SECRET || !config.GOOGLE_REFRESH_TOKEN) {
    throw new Error(
      "GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, and GOOGLE_REFRESH_TOKEN are required for Google Calendar sync"
    );
  }

  return {
    clientId: config.GOOGLE_CLIENT_ID,
    clientSecret: config.GOOGLE_CLIENT_SECRET,
    refreshToken: config.GOOGLE_REFRESH_TOKEN
  };
}

export function getBackupConfig(config: AppConfig) {
  const values = [
    config.BACKUP_S3_BUCKET,
    config.BACKUP_S3_REGION,
    config.BACKUP_S3_ACCESS_KEY_ID,
    config.BACKUP_S3_SECRET_ACCESS_KEY
  ];
  const configuredCount = values.filter((value) => value && value.trim().length > 0).length;

  if (configuredCount === 0) {
    return null;
  }

  if (
    !config.BACKUP_S3_BUCKET ||
    !config.BACKUP_S3_REGION ||
    !config.BACKUP_S3_ACCESS_KEY_ID ||
    !config.BACKUP_S3_SECRET_ACCESS_KEY
  ) {
    throw new Error(
      "BACKUP_S3_BUCKET, BACKUP_S3_REGION, BACKUP_S3_ACCESS_KEY_ID, and BACKUP_S3_SECRET_ACCESS_KEY must all be set for backups"
    );
  }

  return {
    bucket: config.BACKUP_S3_BUCKET,
    region: config.BACKUP_S3_REGION,
    endpoint: config.BACKUP_S3_ENDPOINT ?? null,
    accessKeyId: config.BACKUP_S3_ACCESS_KEY_ID,
    secretAccessKey: config.BACKUP_S3_SECRET_ACCESS_KEY,
    prefix: config.BACKUP_S3_PREFIX,
    forcePathStyle: config.BACKUP_S3_FORCE_PATH_STYLE,
    pgDumpBin: config.BACKUP_PGDUMP_BIN
  };
}
