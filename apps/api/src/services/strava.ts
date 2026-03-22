import { requireStravaConfig, type AppConfig } from "../config.js";
import {
  getOAuthToken,
  storeIngestEvent,
  storeStravaActivities,
  updateIngestEventProcessingStatus,
  updateSourceFreshness,
  upsertOAuthToken
} from "./persistence.js";

type StravaTokenResponse = {
  token_type: string;
  access_token: string;
  refresh_token: string;
  expires_at: number;
  expires_in: number;
  athlete?: {
    id?: number;
  };
};

type StravaSummaryActivity = {
  id: number;
  name: string;
  type: string;
  sport_type?: string;
  start_date: string;
  start_date_local?: string;
  timezone?: string;
  distance?: number;
  moving_time?: number;
  elapsed_time?: number;
  total_elevation_gain?: number;
  average_speed?: number;
  max_speed?: number;
  average_heartrate?: number;
  max_heartrate?: number;
  map?: {
    summary_polyline?: string | null;
  };
};

export type StravaRateLimitMetadata = {
  overallLimit: [number, number] | null;
  overallUsage: [number, number] | null;
  readLimit: [number, number] | null;
  readUsage: [number, number] | null;
};

type NormalizedStravaActivity = {
  sourceRecordId: string;
  name: string;
  activityType: string;
  sportType: string | null;
  startedAt: Date;
  startDateLocal: Date | null;
  timezone: string | null;
  endedAt: Date | null;
  distanceMeters: string | null;
  movingTimeSeconds: number | null;
  elapsedTimeSeconds: number | null;
  totalElevationGainMeters: string | null;
  averageSpeed: string | null;
  maxSpeed: string | null;
  averageHeartrate: string | null;
  maxHeartrate: string | null;
  summaryPolyline: string | null;
  payload: StravaSummaryActivity;
};

type SyncStravaDependencies = {
  fetch: typeof fetch;
  getOAuthToken: (
    provider: "strava"
  ) => Promise<{ refreshToken: string | null } | null>;
  upsertOAuthToken: (input: {
    provider: "strava";
    accessToken?: string | null;
    refreshToken?: string | null;
    tokenType?: string | null;
    scope?: string | null;
    expiresAt?: Date | null;
    subjectId?: string | null;
    metadata?: Record<string, unknown> | null;
  }) => Promise<void>;
  storeIngestEvent: typeof storeIngestEvent;
  storeStravaActivities: typeof storeStravaActivities;
  updateIngestEventProcessingStatus: typeof updateIngestEventProcessingStatus;
  updateSourceFreshness: typeof updateSourceFreshness;
};

const defaultDependencies: SyncStravaDependencies = {
  fetch,
  getOAuthToken,
  upsertOAuthToken,
  storeIngestEvent,
  storeStravaActivities,
  updateIngestEventProcessingStatus,
  updateSourceFreshness
};

function parseCsvPair(value: string | null) {
  if (!value) {
    return null;
  }

  const parts = value.split(",").map((part) => Number(part.trim()));

  if (parts.length !== 2 || parts.some((part) => Number.isNaN(part))) {
    return null;
  }

  return parts as [number, number];
}

export function parseStravaRateLimitHeaders(headers: Headers): StravaRateLimitMetadata {
  return {
    overallLimit: parseCsvPair(headers.get("X-RateLimit-Limit")),
    overallUsage: parseCsvPair(headers.get("X-RateLimit-Usage")),
    readLimit: parseCsvPair(headers.get("X-ReadRateLimit-Limit")),
    readUsage: parseCsvPair(headers.get("X-ReadRateLimit-Usage"))
  };
}

function asNumericString(value: number | undefined) {
  return typeof value === "number" ? String(value) : null;
}

export function normalizeStravaActivity(activity: StravaSummaryActivity): NormalizedStravaActivity {
  const startedAt = new Date(activity.start_date);
  const startDateLocal = activity.start_date_local ? new Date(activity.start_date_local) : null;
  const elapsed = typeof activity.elapsed_time === "number" ? activity.elapsed_time : null;
  const endedAt = elapsed !== null ? new Date(startedAt.getTime() + elapsed * 1000) : null;

  return {
    sourceRecordId: String(activity.id),
    name: activity.name,
    activityType: activity.type,
    sportType: activity.sport_type ?? null,
    startedAt,
    startDateLocal,
    timezone: activity.timezone ?? null,
    endedAt,
    distanceMeters: asNumericString(activity.distance),
    movingTimeSeconds:
      typeof activity.moving_time === "number" ? activity.moving_time : null,
    elapsedTimeSeconds: elapsed,
    totalElevationGainMeters: asNumericString(activity.total_elevation_gain),
    averageSpeed: asNumericString(activity.average_speed),
    maxSpeed: asNumericString(activity.max_speed),
    averageHeartrate: asNumericString(activity.average_heartrate),
    maxHeartrate: asNumericString(activity.max_heartrate),
    summaryPolyline: activity.map?.summary_polyline ?? null,
    payload: activity
  };
}

async function refreshStravaToken(
  config: AppConfig,
  dependencies: SyncStravaDependencies
) {
  const credentials = requireStravaConfig(config);
  const storedToken = await dependencies.getOAuthToken("strava");
  const refreshToken = storedToken?.refreshToken ?? credentials.refreshToken;

  const response = await dependencies.fetch("https://www.strava.com/oauth/token", {
    method: "POST",
    headers: {
      "content-type": "application/json"
    },
    body: JSON.stringify({
      client_id: credentials.clientId,
      client_secret: credentials.clientSecret,
      grant_type: "refresh_token",
      refresh_token: refreshToken
    })
  });

  if (!response.ok) {
    throw new Error(`Strava token refresh failed with status ${response.status}`);
  }

  const token = (await response.json()) as StravaTokenResponse;

  await dependencies.upsertOAuthToken({
    provider: "strava",
    accessToken: token.access_token,
    refreshToken: token.refresh_token,
    tokenType: token.token_type,
    expiresAt: new Date(token.expires_at * 1000),
    subjectId: token.athlete?.id ? String(token.athlete.id) : null,
    metadata: {
      expiresIn: token.expires_in
    }
  });

  return token;
}

export async function syncRecentStravaActivities(
  config: AppConfig,
  options: { afterEpochSeconds?: number; perPage?: number } = {},
  dependencies: SyncStravaDependencies = defaultDependencies
) {
  const token = await refreshStravaToken(config, dependencies);
  const query = new URLSearchParams({
    per_page: String(options.perPage ?? 50),
    page: "1"
  });

  if (options.afterEpochSeconds) {
    query.set("after", String(options.afterEpochSeconds));
  }

  const response = await dependencies.fetch(
    `https://www.strava.com/api/v3/athlete/activities?${query.toString()}`,
    {
      headers: {
        Authorization: `Bearer ${token.access_token}`
      }
    }
  );

  const rateLimits = parseStravaRateLimitHeaders(response.headers);

  if (!response.ok) {
    await dependencies.updateSourceFreshness({
      source: "strava",
      success: false,
      error: `Strava activity fetch failed with status ${response.status}`,
      metadata: {
        rateLimits
      }
    });

    throw new Error(`Strava activity fetch failed with status ${response.status}`);
  }

  const payload = (await response.json()) as StravaSummaryActivity[];
  const ingestEvent = await dependencies.storeIngestEvent({
    source: "strava",
    sourceRecordId: `activities:${new Date().toISOString()}`,
    payload,
    validationStatus: "accepted",
    processingStatus: "stored_raw"
  });

  const normalized = payload.map(normalizeStravaActivity);

  await dependencies.storeStravaActivities(
    normalized.map((activity) => ({
      ingestEventId: ingestEvent.id,
      ...activity
    }))
  );

  await dependencies.updateIngestEventProcessingStatus({
    ingestEventId: ingestEvent.id,
    processingStatus: normalized.length > 0 ? "normalized_strava_activities" : "stored_raw_only"
  });

  await dependencies.updateSourceFreshness({
    source: "strava",
    success: true,
    metadata: {
      ingestEventId: ingestEvent.id,
      activityCount: normalized.length,
      rateLimits
    }
  });

  return {
    ingestEventId: ingestEvent.id,
    activityCount: normalized.length,
    rateLimits
  };
}
