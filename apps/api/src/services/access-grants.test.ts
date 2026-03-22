import assert from "node:assert/strict";
import test from "node:test";

import type { AppConfig } from "../config.js";
import {
  handleAccessGrantCommand,
  listAccessGrantState,
  updateAccessGrant
} from "./access-grants.js";

const testConfig: AppConfig = {
  NODE_ENV: "test",
  APP_TIME_ZONE: "Europe/London",
  API_PORT: 3001,
  API_BASE_URL: "http://localhost:3001",
  WEB_BASE_URL: "http://localhost:3000",
  DATABASE_URL: "postgres://example",
  OPENAI_API_KEY: "test",
  OPENAI_MODEL: "gpt-5",
  TELEGRAM_BOT_TOKEN: "token",
  TELEGRAM_WEBHOOK_SECRET: "secret",
  TELEGRAM_CHAT_ID: "123",
  TELEGRAM_ALERT_CHAT_ID: undefined,
  ENABLE_OPERATOR_ALERTS: true,
  HEALTH_AUTO_EXPORT_SHARED_SECRET: "health",
  HEVY_API_KEY: undefined,
  AUTH_SESSION_SECRET: "auth",
  STRAVA_CLIENT_ID: undefined,
  STRAVA_CLIENT_SECRET: undefined,
  STRAVA_REFRESH_TOKEN: undefined,
  GOOGLE_CLIENT_ID: undefined,
  GOOGLE_CLIENT_SECRET: undefined,
  GOOGLE_REFRESH_TOKEN: undefined,
  GOOGLE_CALENDAR_ID: "primary",
  BACKUP_PGDUMP_BIN: "pg_dump",
  BACKUP_S3_BUCKET: undefined,
  BACKUP_S3_REGION: undefined,
  BACKUP_S3_ENDPOINT: undefined,
  BACKUP_S3_ACCESS_KEY_ID: undefined,
  BACKUP_S3_SECRET_ACCESS_KEY: undefined,
  BACKUP_S3_PREFIX: "postgres",
  BACKUP_S3_FORCE_PATH_STYLE: false
};

function buildDependencies() {
  const users = {
    user: {
      id: "user-1",
      email: "user@example.com",
      displayName: "Scott",
      role: "user",
      passwordHash: "plain:test",
      isActive: true
    },
    trainer: {
      id: "trainer-1",
      email: "trainer@example.com",
      displayName: "Trainer",
      role: "trainer",
      passwordHash: "plain:test",
      isActive: true
    },
    nutritionist: {
      id: "nutritionist-1",
      email: "nutritionist@example.com",
      displayName: "Nutritionist",
      role: "nutritionist",
      passwordHash: "plain:test",
      isActive: true
    }
  } as const;

  let sequence = 1;
  const decisions: Array<{
    id: string;
    subjectUserId: string;
    practitionerUserId: string;
    category: "exercise" | "nutrition" | "weight" | "engagement_status";
    grantedAt: Date;
    revokedAt: Date | null;
    createdByUserId: string;
  }> = [];
  const sentMessages: string[] = [];
  const storedAssistantMessages: string[] = [];

  return {
    users,
    decisions,
    sentMessages,
    storedAssistantMessages,
    createAccessGrant: async (input: {
      subjectUserId: string;
      practitionerUserId: string;
      category: "exercise" | "nutrition" | "weight" | "engagement_status";
      createdByUserId: string;
    }) => {
      const row = {
        id: `decision-${sequence += 1}`,
        ...input,
        grantedAt: new Date(`2026-03-15T0${sequence}:00:00Z`),
        revokedAt: null
      };
      decisions.unshift(row);
      return row;
    },
    createAccessRevocationMarker: async (input: {
      subjectUserId: string;
      practitionerUserId: string;
      category: "exercise" | "nutrition" | "weight" | "engagement_status";
      createdByUserId: string;
    }) => {
      const row = {
        id: `decision-${sequence += 1}`,
        ...input,
        grantedAt: new Date(`2026-03-15T0${sequence}:00:00Z`),
        revokedAt: new Date(`2026-03-15T0${sequence}:00:00Z`)
      };
      decisions.unshift(row);
      return row;
    },
    getPrimaryUserByRole: async (role: "user" | "trainer" | "nutritionist") => users[role],
    listAccessGrantDecisionsForPair: async (input: {
      subjectUserId: string;
      practitionerUserId: string;
    }) =>
      decisions.filter(
        (decision) =>
          decision.subjectUserId === input.subjectUserId &&
          decision.practitionerUserId === input.practitionerUserId
      ),
    revokeActiveAccessGrants: async (input: {
      subjectUserId: string;
      practitionerUserId: string;
      category: "exercise" | "nutrition" | "weight" | "engagement_status";
    }) => {
      let updated = 0;
      for (const decision of decisions) {
        if (
          decision.subjectUserId === input.subjectUserId &&
          decision.practitionerUserId === input.practitionerUserId &&
          decision.category === input.category &&
          decision.revokedAt === null
        ) {
          decision.revokedAt = new Date("2026-03-15T11:00:00Z");
          updated += 1;
        }
      }
      return updated;
    },
    sendTelegramMessage: async (_config: AppConfig, text: string) => {
      sentMessages.push(text);
      return {};
    },
    storeConversationMessage: async (input: { content: string | null }) => {
      if (input.content) {
        storedAssistantMessages.push(input.content);
      }
      return { id: `message-${sequence += 1}` };
    }
  };
}

test("updateAccessGrant adds an optional trainer category", async () => {
  const dependencies = buildDependencies();

  const result = await updateAccessGrant(
    {
      actorUserId: dependencies.users.user.id,
      practitionerRole: "trainer",
      category: "nutrition",
      action: "grant"
    },
    dependencies
  );

  assert.equal(result.changed, true);
  const trainer = result.snapshots.find((snapshot) => snapshot.practitionerRole === "trainer");
  assert.deepEqual(trainer?.effectiveCategories, ["exercise", "nutrition"]);
});

test("updateAccessGrant can revoke a default nutritionist category", async () => {
  const dependencies = buildDependencies();

  const result = await updateAccessGrant(
    {
      actorUserId: dependencies.users.user.id,
      practitionerRole: "nutritionist",
      category: "weight",
      action: "revoke"
    },
    dependencies
  );

  assert.equal(result.changed, true);
  const nutritionist = result.snapshots.find((snapshot) => snapshot.practitionerRole === "nutritionist");
  assert.deepEqual(nutritionist?.effectiveCategories, ["nutrition"]);
});

test("listAccessGrantState reflects latest grant decisions over defaults", async () => {
  const dependencies = buildDependencies();

  await updateAccessGrant(
    {
      actorUserId: dependencies.users.user.id,
      practitionerRole: "trainer",
      category: "engagement_status",
      action: "grant"
    },
    dependencies
  );
  await updateAccessGrant(
    {
      actorUserId: dependencies.users.user.id,
      practitionerRole: "nutritionist",
      category: "weight",
      action: "revoke"
    },
    dependencies
  );

  const snapshots = await listAccessGrantState(dependencies);
  const trainer = snapshots.find((snapshot) => snapshot.practitionerRole === "trainer");
  const nutritionist = snapshots.find((snapshot) => snapshot.practitionerRole === "nutritionist");

  assert.deepEqual(trainer?.effectiveCategories, ["engagement_status", "exercise"]);
  assert.deepEqual(nutritionist?.effectiveCategories, ["nutrition"]);
});

test("handleAccessGrantCommand parses and responds to Telegram grant commands", async () => {
  const dependencies = buildDependencies();

  const result = await handleAccessGrantCommand(
    testConfig,
    {
      text: "revoke my nutritionist's access to weight data"
    },
    dependencies
  );

  assert.equal(result.handled, true);
  assert.match(result.responseText ?? "", /no longer see weight data/i);
  assert.ok(dependencies.sentMessages.some((message) => /Current sharing:/i.test(message)));
  assert.ok(dependencies.storedAssistantMessages.some((message) => /Nutritionist/i.test(message)));
});
