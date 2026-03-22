import { requireGoogleCalendarConfig, type AppConfig } from "../config.js";
import {
  getOAuthToken,
  getSyncCursor,
  storeCalendarEvents,
  storeIngestEvent,
  updateIngestEventProcessingStatus,
  updateSourceFreshness,
  upsertOAuthToken,
  upsertSyncCursor
} from "./persistence.js";

type GoogleTokenResponse = {
  access_token: string;
  expires_in: number;
  scope?: string;
  token_type: string;
  refresh_token?: string;
};

type GoogleCalendarEvent = {
  id: string;
  status?: string;
  summary?: string;
  eventType?: string;
  start?: {
    date?: string;
    dateTime?: string;
    timeZone?: string;
  };
  end?: {
    date?: string;
    dateTime?: string;
    timeZone?: string;
  };
};

export type GoogleCalendarNormalizedEvent = {
  sourceRecordId: string;
  externalCalendarId: string;
  title: string;
  status: string | null;
  eventType: string | null;
  isAllDay: boolean;
  startsAt: Date;
  endsAt: Date;
  payload: GoogleCalendarEvent;
};

type SyncGoogleCalendarDependencies = {
  fetch: typeof fetch;
  getOAuthToken: (
    provider: "google_calendar"
  ) => Promise<{ refreshToken: string | null } | null>;
  upsertOAuthToken: (input: {
    provider: "google_calendar";
    accessToken?: string | null;
    refreshToken?: string | null;
    tokenType?: string | null;
    scope?: string | null;
    expiresAt?: Date | null;
    subjectId?: string | null;
    metadata?: Record<string, unknown> | null;
  }) => Promise<void>;
  getSyncCursor: (input: {
    source: "google_calendar";
    cursorKey: string;
  }) => Promise<{ cursorValue: string | null } | null>;
  upsertSyncCursor: typeof upsertSyncCursor;
  storeIngestEvent: typeof storeIngestEvent;
  storeCalendarEvents: typeof storeCalendarEvents;
  updateIngestEventProcessingStatus: typeof updateIngestEventProcessingStatus;
  updateSourceFreshness: typeof updateSourceFreshness;
};

const defaultDependencies: SyncGoogleCalendarDependencies = {
  fetch,
  getOAuthToken,
  upsertOAuthToken,
  getSyncCursor,
  upsertSyncCursor,
  storeIngestEvent,
  storeCalendarEvents,
  updateIngestEventProcessingStatus,
  updateSourceFreshness
};

function parseGoogleDate(value: { date?: string; dateTime?: string } | undefined) {
  if (!value) {
    return null;
  }

  if (value.dateTime) {
    return {
      date: new Date(value.dateTime),
      isAllDay: false
    };
  }

  if (value.date) {
    return {
      date: new Date(`${value.date}T00:00:00.000Z`),
      isAllDay: true
    };
  }

  return null;
}

export function normalizeGoogleCalendarEvent(
  event: GoogleCalendarEvent,
  calendarId: string
): GoogleCalendarNormalizedEvent | null {
  const start = parseGoogleDate(event.start);
  const end = parseGoogleDate(event.end);

  if (!start || !end) {
    return null;
  }

  return {
    sourceRecordId: event.id,
    externalCalendarId: calendarId,
    title: event.summary && event.summary.length > 0 ? event.summary : "(untitled event)",
    status: event.status ?? null,
    eventType: event.eventType ?? null,
    isAllDay: start.isAllDay,
    startsAt: start.date,
    endsAt: end.date,
    payload: event
  };
}

async function refreshGoogleCalendarToken(
  config: AppConfig,
  dependencies: SyncGoogleCalendarDependencies
) {
  const credentials = requireGoogleCalendarConfig(config);
  const storedToken = await dependencies.getOAuthToken("google_calendar");
  const refreshToken = storedToken?.refreshToken ?? credentials.refreshToken;

  const response = await dependencies.fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded"
    },
    body: new URLSearchParams({
      client_id: credentials.clientId,
      client_secret: credentials.clientSecret,
      grant_type: "refresh_token",
      refresh_token: refreshToken
    })
  });

  if (!response.ok) {
    throw new Error(`Google token refresh failed with status ${response.status}`);
  }

  const token = (await response.json()) as GoogleTokenResponse;

  await dependencies.upsertOAuthToken({
    provider: "google_calendar",
    accessToken: token.access_token,
    refreshToken: token.refresh_token ?? refreshToken,
    tokenType: token.token_type,
    scope: token.scope ?? null,
    expiresAt: new Date(Date.now() + token.expires_in * 1000),
    metadata: {
      expiresIn: token.expires_in
    }
  });

  return token;
}

async function fetchCalendarEvents(
  accessToken: string,
  calendarId: string,
  syncToken: string | null,
  dependencies: SyncGoogleCalendarDependencies
) {
  const items: GoogleCalendarEvent[] = [];
  let pageToken: string | null = null;
  let nextSyncToken: string | null = null;

  do {
    const query = new URLSearchParams({
      singleEvents: "true",
      showDeleted: "true",
      maxResults: "2500"
    });

    if (syncToken) {
      query.set("syncToken", syncToken);
    }

    if (pageToken) {
      query.set("pageToken", pageToken);
    }

    const response = await dependencies.fetch(
      `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events?${query.toString()}`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`
        }
      }
    );

    if (response.status === 410) {
      return {
        resetRequired: true,
        items: [],
        nextSyncToken: null
      };
    }

    if (!response.ok) {
      throw new Error(`Google Calendar events fetch failed with status ${response.status}`);
    }

    const payload = (await response.json()) as {
      items?: GoogleCalendarEvent[];
      nextPageToken?: string;
      nextSyncToken?: string;
    };

    if (Array.isArray(payload.items)) {
      items.push(...payload.items);
    }

    pageToken = payload.nextPageToken ?? null;
    nextSyncToken = payload.nextSyncToken ?? nextSyncToken;
  } while (pageToken);

  return {
    resetRequired: false,
    items,
    nextSyncToken
  };
}

export async function syncGoogleCalendarEvents(
  config: AppConfig,
  options: { calendarId?: string } = {},
  dependencies: SyncGoogleCalendarDependencies = defaultDependencies
) {
  const calendarId = options.calendarId ?? "primary";
  const cursorKey = `calendar:${calendarId}`;
  const token = await refreshGoogleCalendarToken(config, dependencies);
  let cursor = await dependencies.getSyncCursor({
    source: "google_calendar",
    cursorKey
  });
  let cursorReset = false;

  let response = await fetchCalendarEvents(
    token.access_token,
    calendarId,
    cursor?.cursorValue ?? null,
    dependencies
  );

  if (response.resetRequired) {
    cursorReset = true;
    await dependencies.upsertSyncCursor({
      source: "google_calendar",
      cursorKey,
      cursorValue: null,
      metadata: {
        resetAt: new Date().toISOString(),
        reason: "410_gone"
      }
    });

    cursor = null;
    response = await fetchCalendarEvents(token.access_token, calendarId, null, dependencies);
  }

  const ingestEvent = await dependencies.storeIngestEvent({
    source: "google_calendar",
    sourceRecordId: cursorKey,
    payload: response.items,
    validationStatus: "accepted",
    processingStatus: "stored_raw"
  });

  const normalized = response.items
    .map((event) => normalizeGoogleCalendarEvent(event, calendarId))
    .filter((event): event is GoogleCalendarNormalizedEvent => Boolean(event));

  await dependencies.storeCalendarEvents(
    normalized.map((event) => ({
      ingestEventId: ingestEvent.id,
      ...event
    }))
  );

  await dependencies.updateIngestEventProcessingStatus({
    ingestEventId: ingestEvent.id,
    processingStatus: normalized.length > 0 ? "normalized_calendar_events" : "stored_raw_only"
  });

  if (response.nextSyncToken) {
    await dependencies.upsertSyncCursor({
      source: "google_calendar",
      cursorKey,
      cursorValue: response.nextSyncToken,
      metadata: {
        lastIngestEventId: ingestEvent.id,
        itemCount: normalized.length
      }
    });
  }

  await dependencies.updateSourceFreshness({
    source: "google_calendar",
    success: true,
    metadata: {
      ingestEventId: ingestEvent.id,
      itemCount: normalized.length,
      cursorReset
    }
  });

  return {
    ingestEventId: ingestEvent.id,
    itemCount: normalized.length,
    nextSyncToken: response.nextSyncToken ?? null,
    cursorReset
  };
}
