import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";

import { createTemporaryDatabase } from "./test-db.mjs";

const ROOT = resolve(new URL("..", import.meta.url).pathname);
const ENV_PATH = resolve(ROOT, ".env");
const TEST_DATE = "2026-03-15";
const TEST_WEEK_START = "2026-03-09";
const COACHING_TEST_DATE = "2099-01-06";
const MISSED_WORKOUT_TEST_DATE = "2099-01-07";

function getFullTestPorts(baseEnv) {
  const apiPort = Number(baseEnv.FULL_TEST_API_PORT ?? 3410 + (process.pid % 400));
  const webPort = Number(baseEnv.FULL_TEST_WEB_PORT ?? apiPort + 1);
  return {
    apiPort,
    webPort
  };
}

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
  const fileValues = parseDotEnv(readFileSync(ENV_PATH, "utf8"));
  return {
    ...fileValues,
    ...process.env
  };
}

function createTestEnvironments(baseEnv) {
  const { apiPort, webPort } = getFullTestPorts(baseEnv);
  const apiBaseUrl = `http://localhost:${apiPort}`;
  const webBaseUrl = `http://localhost:${webPort}`;

  const shared = {
    ...baseEnv,
    API_PORT: String(apiPort),
    API_BASE_URL: apiBaseUrl,
    WEB_BASE_URL: webBaseUrl,
    DAILY_CALORIE_TARGET: baseEnv.DAILY_CALORIE_TARGET || "2400",
    DAILY_PROTEIN_TARGET: baseEnv.DAILY_PROTEIN_TARGET || "180",
    DAILY_FIBRE_TARGET: baseEnv.DAILY_FIBRE_TARGET || "30"
  };

  return {
    baseEnv: shared,
    apiEnv: {
      ...shared
    },
    webEnv: {
      ...shared,
      NODE_ENV: "production",
      PORT: String(webPort),
      NEXT_PUBLIC_API_BASE_URL: apiBaseUrl
    },
    apiBaseUrl,
    webBaseUrl,
    apiPort,
    webPort
  };
}

async function runCommand(label, command, args, options = {}) {
  const { cwd = ROOT, env = process.env } = options;

  process.stdout.write(`\n[full-test] ${label}\n`);

  await new Promise((resolvePromise, rejectPromise) => {
    const child = spawn(command, args, {
      cwd,
      env,
      stdio: "inherit"
    });

    child.on("error", rejectPromise);
    child.on("exit", (code, signal) => {
      if (code === 0) {
        resolvePromise();
        return;
      }

      rejectPromise(
        new Error(
          `${label} failed with ${signal ? `signal ${signal}` : `exit code ${code ?? "unknown"}`}.`
        )
      );
    });
  });
}

async function waitForHttp(url, options = {}) {
  const { timeoutMs = 45_000 } = options;
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    try {
      const response = await fetch(url, {
        method: "GET"
      });
      if (response.status < 500) {
        return;
      }
    } catch {
      // Retry until deadline.
    }

    await delay(250);
  }

  throw new Error(`Timed out waiting for ${url}`);
}

async function startService(label, command, args, options = {}) {
  const { cwd = ROOT, env = process.env, readyUrl } = options;
  let logBuffer = "";

  const child = spawn(command, args, {
    cwd,
    env,
    stdio: ["ignore", "pipe", "pipe"]
  });

  const appendLog = (chunk) => {
    logBuffer = `${logBuffer}${chunk}`.slice(-12_000);
  };

  child.stdout.on("data", (chunk) => appendLog(chunk.toString()));
  child.stderr.on("data", (chunk) => appendLog(chunk.toString()));

  try {
    if (readyUrl) {
      while (true) {
        if (child.exitCode !== null) {
          throw new Error(
            `${label} exited before becoming ready.\n\n${logBuffer || "(no process output)"}`
          );
        }

        try {
          await waitForHttp(readyUrl, {
            timeoutMs: 1_000
          });
          break;
        } catch {
          await delay(250);
        }
      }
    }

    return {
      child,
      async stop() {
        if (child.exitCode !== null) {
          return;
        }

        child.kill("SIGINT");
        const deadline = Date.now() + 5_000;

        while (child.exitCode === null && Date.now() < deadline) {
          await delay(100);
        }

        if (child.exitCode === null) {
          child.kill("SIGKILL");
        }
      },
      getLogs() {
        return logBuffer;
      }
    };
  } catch (error) {
    if (child.exitCode === null) {
      child.kill("SIGKILL");
    }
    throw error;
  }
}

class SessionClient {
  constructor(baseUrl, trustedOrigin = null) {
    this.baseUrl = baseUrl;
    this.trustedOrigin = trustedOrigin;
    this.cookies = new Map();
  }

  baseUrl;
  trustedOrigin;
  cookies;

  updateCookies(response) {
    const setCookies =
      typeof response.headers.getSetCookie === "function"
        ? response.headers.getSetCookie()
        : [];

    for (const cookie of setCookies) {
      const [pair] = cookie.split(";", 1);
      if (!pair) {
        continue;
      }
      const separatorIndex = pair.indexOf("=");
      if (separatorIndex < 0) {
        continue;
      }

      const name = pair.slice(0, separatorIndex);
      const value = pair.slice(separatorIndex + 1);
      this.cookies.set(name, value);
    }
  }

  cookieHeader() {
    return [...this.cookies.entries()]
      .map(([name, value]) => `${name}=${value}`)
      .join("; ");
  }

  async request(path, options = {}) {
    const headers = new Headers(options.headers ?? undefined);
    const cookieHeader = this.cookieHeader();
    if (cookieHeader) {
      headers.set("cookie", cookieHeader);
    }

    if (this.trustedOrigin && !headers.has("origin")) {
      headers.set("origin", this.trustedOrigin);
    }

    if (options.body && !headers.has("content-type")) {
      headers.set("content-type", "application/json");
    }

    const response = await fetch(`${this.baseUrl}${path}`, {
      ...options,
      headers
    });

    this.updateCookies(response);
    const rawBody = await response.text();
    let json = null;

    if (rawBody) {
      try {
        json = JSON.parse(rawBody);
      } catch {
        json = null;
      }
    }

    return {
      status: response.status,
      json,
      text: rawBody
    };
  }
}

function requireEnvValue(env, name) {
  const value = env[name];
  if (!value || String(value).trim().length === 0) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return String(value).trim();
}

function isConfiguredValue(value) {
  if (!value) {
    return false;
  }

  const trimmed = String(value).trim();
  if (trimmed.length === 0) {
    return false;
  }

  return !/\bplaceholder\b|\bchangeme\b|\bexample\b/i.test(trimmed);
}

function hasAll(env, keys) {
  return keys.every((key) => isConfiguredValue(env[key]));
}

async function runExternalSyncChecks(env) {
  if (hasAll(env, ["HEVY_API_KEY"])) {
    await runCommand("Hevy sync", "npm", ["run", "sync:hevy", "--workspace", "@codex/api"], {
      env
    });
  }

  if (
    env.ENABLE_STRAVA_SYNC === "true" &&
    hasAll(env, ["STRAVA_CLIENT_ID", "STRAVA_CLIENT_SECRET", "STRAVA_REFRESH_TOKEN"])
  ) {
    await runCommand("Strava sync", "npm", ["run", "sync:strava", "--workspace", "@codex/api"], {
      env
    });
  }

  if (hasAll(env, ["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET", "GOOGLE_REFRESH_TOKEN"])) {
    await runCommand(
      "Google Calendar sync",
      "npm",
      ["run", "sync:calendar", "--workspace", "@codex/api"],
      {
        env
      }
    );
  }
}

async function runDryRunJobs(env) {
  await runCommand(
    "Operations monitor dry run",
    "npm",
    ["run", "run:ops-monitor", "--workspace", "@codex/api", "--", "--dry-run"],
    { env }
  );
  await runCommand(
    "Daily scoring dry run",
    "npm",
    ["run", "run:scoring", "--workspace", "@codex/api", "--", "--date", TEST_DATE, "--dry-run"],
    { env }
  );
  await runCommand(
    "Morning brief dry run",
    "npm",
    ["run", "send:morning-brief", "--workspace", "@codex/api", "--", "--date", TEST_DATE, "--dry-run"],
    { env }
  );
  await runCommand(
    "Weight prompt dry run",
    "npm",
    ["run", "send:weight-prompt", "--workspace", "@codex/api", "--", "--date", TEST_DATE, "--dry-run"],
    { env }
  );
  await runCommand(
    "Check-in prompt dry run",
    "npm",
    ["run", "send:checkin-prompt", "--workspace", "@codex/api", "--", "--date", TEST_DATE, "--dry-run"],
    { env }
  );
  await runCommand(
    "Missed workout follow-up dry run",
    "npm",
    [
      "run",
      "send:missed-workout-follow-up",
      "--workspace",
      "@codex/api",
      "--",
      "--date",
      "2026-03-14",
      "--dry-run"
    ],
    { env }
  );
  await runCommand(
    "Coaching rhythm dry run",
    "npm",
    [
      "run",
      "run:coaching-rhythm",
      "--workspace",
      "@codex/api",
      "--",
      "--now",
      "2026-03-15T13:00:00Z",
      "--dry-run"
    ],
    { env }
  );
}

async function runRouteIntegrationChecks(env, apiBaseUrl, webBaseUrl) {
  const userEmail = requireEnvValue(env, "DASHBOARD_USER_EMAIL");
  const userPassword = requireEnvValue(env, "DASHBOARD_USER_PASSWORD");
  const trainerEmail = requireEnvValue(env, "DASHBOARD_TRAINER_EMAIL");
  const trainerPassword = requireEnvValue(env, "DASHBOARD_TRAINER_PASSWORD");
  const nutritionistEmail = requireEnvValue(env, "DASHBOARD_NUTRITIONIST_EMAIL");
  const nutritionistPassword = requireEnvValue(env, "DASHBOARD_NUTRITIONIST_PASSWORD");
  const telegramSecret = requireEnvValue(env, "TELEGRAM_WEBHOOK_SECRET");

  const userClient = new SessionClient(apiBaseUrl, webBaseUrl);
  const trainerClient = new SessionClient(apiBaseUrl, webBaseUrl);
  const nutritionistClient = new SessionClient(apiBaseUrl, webBaseUrl);
  const liveUpdateId = Date.now();
  const templateActivityType = `integration template ${liveUpdateId}`;
  const targetCalories = 2100 + (liveUpdateId % 200);

  const unauthenticated = await userClient.request("/auth/me");
  assert.equal(unauthenticated.status, 401);

  const userLogin = await userClient.request("/auth/login", {
    method: "POST",
    body: JSON.stringify({
      email: userEmail,
      password: userPassword
    })
  });
  assert.equal(userLogin.status, 200);

  const userMe = await userClient.request("/auth/me");
  assert.equal(userMe.status, 200);
  assert.equal(userMe.json.user.role, "user");
  assert.deepEqual(
    [...userMe.json.access.categories].sort(),
    ["engagement_status", "exercise", "nutrition", "weight"]
  );

  const opsStatus = await userClient.request("/ops/status");
  assert.equal(opsStatus.status, 200);
  assert.ok(["healthy", "warning", "critical"].includes(opsStatus.json.status.overallStatus));

  const userNutritionTargets = await userClient.request("/nutrition-targets");
  assert.equal(userNutritionTargets.status, 200);
  const currentCaloriesTarget =
    userNutritionTargets.json.targets.calories ?? Number(env.DAILY_CALORIE_TARGET);

  const daily = await userClient.request(`/state/daily?date=${TEST_DATE}`);
  assert.equal(daily.status, 200);
  assert.equal(daily.json.summary.nutritionBudget.targets.calories, currentCaloriesTarget);
  assert.ok(daily.json.summary.scores.recovery);
  assert.ok(daily.json.summary.engagementStatus);

  const weekly = await userClient.request(`/state/weekly?weekStart=${TEST_WEEK_START}`);
  assert.equal(weekly.status, 200);

  const userTemplates = await userClient.request("/day-templates");
  assert.equal(userTemplates.status, 200);
  assert.equal(userTemplates.json.templates.length, 7);

  const updatedTemplates = await userClient.request("/day-templates", {
    method: "POST",
    body: JSON.stringify({
      dayOfWeek: "sunday",
      activityType: templateActivityType,
      intensity: "light",
      preferredTime: "morning"
    })
  });
  assert.equal(updatedTemplates.status, 200);
  assert.ok(
    updatedTemplates.json.templates.some(
      (template) =>
        template.dayOfWeek === "sunday" && template.activityType === templateActivityType
    )
  );

  const updatedNutritionTargets = await userClient.request("/nutrition-targets", {
    method: "POST",
    body: JSON.stringify({
      calories: targetCalories,
      protein: 195,
      fibre: 35
    })
  });
  assert.equal(updatedNutritionTargets.status, 200);
  assert.equal(updatedNutritionTargets.json.targets.calories, targetCalories);

  const grant = await userClient.request("/access-grants/grant", {
    method: "POST",
    body: JSON.stringify({
      practitionerRole: "trainer",
      category: "nutrition"
    })
  });
  assert.equal(grant.status, 200);

  const listAfterGrant = await userClient.request("/access-grants");
  assert.equal(listAfterGrant.status, 200);
  const trainerSnapshot = listAfterGrant.json.grants.find(
    (snapshot) => snapshot.practitionerRole === "trainer"
  );
  assert.ok(trainerSnapshot);
  assert.ok(trainerSnapshot.effectiveCategories.includes("nutrition"));

  const trainerLogin = await trainerClient.request("/auth/login", {
    method: "POST",
    body: JSON.stringify({
      email: trainerEmail,
      password: trainerPassword
    })
  });
  assert.equal(trainerLogin.status, 200);

  const trainerMe = await trainerClient.request("/auth/me");
  assert.equal(trainerMe.status, 200);
  assert.equal(trainerMe.json.user.role, "trainer");
  assert.ok(trainerMe.json.access.categories.includes("exercise"));
  assert.ok(trainerMe.json.access.categories.includes("nutrition"));

  const trainerOpsStatus = await trainerClient.request("/ops/status");
  assert.equal(trainerOpsStatus.status, 403);

  const trainerDaily = await trainerClient.request(`/state/daily?date=${TEST_DATE}`);
  assert.equal(trainerDaily.status, 200);
  assert.ok(Array.isArray(trainerDaily.json.summary.meals.entries));

  const trainerTemplates = await trainerClient.request("/day-templates");
  assert.equal(trainerTemplates.status, 200);
  assert.ok(
    trainerTemplates.json.templates.some(
      (template) =>
        template.dayOfWeek === "sunday" && template.activityType === templateActivityType
    )
  );

  const trainerNutritionTargets = await trainerClient.request("/nutrition-targets");
  assert.equal(trainerNutritionTargets.status, 200);
  assert.equal(trainerNutritionTargets.json.targets.calories, targetCalories);

  const nutritionistLogin = await nutritionistClient.request("/auth/login", {
    method: "POST",
    body: JSON.stringify({
      email: nutritionistEmail,
      password: nutritionistPassword
    })
  });
  assert.equal(nutritionistLogin.status, 200);

  const nutritionistMe = await nutritionistClient.request("/auth/me");
  assert.equal(nutritionistMe.status, 200);
  assert.equal(nutritionistMe.json.user.role, "nutritionist");
  assert.ok(nutritionistMe.json.access.categories.includes("nutrition"));
  assert.ok(nutritionistMe.json.access.categories.includes("weight"));

  const nutritionistTemplates = await nutritionistClient.request("/day-templates");
  assert.equal(nutritionistTemplates.status, 403);

  const nutritionistTargets = await nutritionistClient.request("/nutrition-targets");
  assert.equal(nutritionistTargets.status, 200);
  assert.equal(nutritionistTargets.json.targets.calories, targetCalories);

  const validTelegramWebhook = await fetch(`${apiBaseUrl}/webhooks/telegram`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-telegram-bot-api-secret-token": telegramSecret
    },
    body: JSON.stringify({
      update_id: liveUpdateId,
      message: {
        message_id: 1,
        date: 1_710_000_000,
        text: "system integration ping"
      }
    })
  });
  assert.equal(validTelegramWebhook.status, 200);
  assert.deepEqual(await validTelegramWebhook.json(), { ok: true, duplicate: false });

  const duplicateTelegramWebhook = await fetch(`${apiBaseUrl}/webhooks/telegram`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-telegram-bot-api-secret-token": telegramSecret
    },
    body: JSON.stringify({
      update_id: liveUpdateId,
      message: {
        message_id: 1,
        date: 1_710_000_000,
        text: "system integration ping"
      }
    })
  });
  assert.equal(duplicateTelegramWebhook.status, 200);
  assert.deepEqual(await duplicateTelegramWebhook.json(), { ok: true, duplicate: true });

  const badTelegramWebhook = await fetch(`${apiBaseUrl}/webhooks/telegram`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-telegram-bot-api-secret-token": "wrong-secret"
    },
    body: JSON.stringify({
      update_id: 9001,
      message: {
        message_id: 1,
        date: 1_710_000_000,
        text: "Morning"
      }
    })
  });
  assert.equal(badTelegramWebhook.status, 401);

  const revoke = await userClient.request("/access-grants/revoke", {
    method: "POST",
    body: JSON.stringify({
      practitionerRole: "trainer",
      category: "nutrition"
    })
  });
  assert.equal(revoke.status, 200);

  const logout = await userClient.request("/auth/logout", {
    method: "POST"
  });
  assert.equal(logout.status, 200);

  const userMeAfterLogout = await userClient.request("/auth/me");
  assert.equal(userMeAfterLogout.status, 401);
}

async function runMealIntegrationCheck(env) {
  const [{ loadConfig }, nutritionModule, currentStateModule, persistenceModule, dbModule, drizzleOrm] =
    await Promise.all([
      import("../apps/api/dist/config.js"),
      import("../apps/api/dist/services/nutrition.js"),
      import("../apps/api/dist/services/current-state.js"),
      import("../apps/api/dist/services/persistence.js"),
      import("@codex/db"),
      import("drizzle-orm")
    ]);

  const config = loadConfig(env);
  const testText = "ate a chicken caesar wrap and a packet of ready salted crisps";

  const result = await nutritionModule.handleMealLoggingMessage(
    config,
    {
      text: testText,
      messageDate: new Date(`${TEST_DATE}T12:30:00Z`)
    },
    {
      estimateMealFromText: nutritionModule.estimateMealFromText,
      getDailySummary: currentStateModule.getDailySummary,
      sendTelegramMessage: async () => ({ ok: true, simulated: true }),
      storeConversationMessage: async () => ({ id: "integration-message" }),
      storeMealLog: persistenceModule.storeMealLog
    }
  );

  assert.equal(result.handled, true);
  assert.ok(result.storedMealId);

  const summary = await currentStateModule.getDailySummary({
    date: TEST_DATE
  });
  const inserted = summary.meals.entries.find((entry) => entry.id === result.storedMealId);
  assert.ok(inserted);
  assert.ok(summary.meals.totals.calories >= inserted.calories);

  const db = dbModule.getDb(env.DATABASE_URL);
  await db.delete(dbModule.mealLogs).where(drizzleOrm.eq(dbModule.mealLogs.id, result.storedMealId));
  await dbModule.closeDb();
}

async function cleanupCoachingArtifacts(db, schema, orm, markers) {
  const { and, eq, gte, lt, or, sql } = orm;
  const coachingStart = new Date(`${COACHING_TEST_DATE}T00:00:00Z`);
  const coachingEnd = new Date(`${COACHING_TEST_DATE}T23:59:59.999Z`);
  const missedStart = new Date(`${MISSED_WORKOUT_TEST_DATE}T00:00:00Z`);
  const missedEnd = new Date(`${MISSED_WORKOUT_TEST_DATE}T23:59:59.999Z`);

  await db
    .delete(schema.conversationLog)
    .where(
      or(
        sql`${schema.conversationLog.metadata} ->> 'promptDate' = ${COACHING_TEST_DATE}`,
        sql`${schema.conversationLog.metadata} ->> 'promptDate' = ${MISSED_WORKOUT_TEST_DATE}`
      )
    );

  await db
    .delete(schema.checkinResponses)
    .where(sql`${schema.checkinResponses.sourcePayload} ->> 'rawText' = ${markers.sleepReply}`);

  await db
    .delete(schema.weightEntries)
    .where(sql`${schema.weightEntries.sourcePayload} ->> 'rawText' = ${markers.weightReply}`);

  await db.delete(schema.mealLogs).where(sql`${schema.mealLogs.sourcePayload} ->> 'rawText' = ${markers.mealText}`);

  await db
    .delete(schema.dailyPlans)
    .where(
      or(
        and(gte(schema.dailyPlans.planDate, coachingStart), lt(schema.dailyPlans.planDate, coachingEnd)),
        and(gte(schema.dailyPlans.planDate, missedStart), lt(schema.dailyPlans.planDate, missedEnd))
      )
    );

  await db
    .delete(schema.processedUpdates)
    .where(
      or(
        eq(schema.processedUpdates.externalUpdateId, String(markers.weightUpdateId)),
        eq(schema.processedUpdates.externalUpdateId, String(markers.checkinUpdateId))
      )
    );
}

async function runCoachingIntegrationCheck(env) {
  const [
    { loadConfig },
    coachingModule,
    currentStateModule,
    planningModule,
    persistenceModule,
    dbModule,
    drizzleOrm
  ] = await Promise.all([
    import("../apps/api/dist/config.js"),
    import("../apps/api/dist/services/coaching.js"),
    import("../apps/api/dist/services/current-state.js"),
    import("../apps/api/dist/services/planning.js"),
    import("../apps/api/dist/services/persistence.js"),
    import("@codex/db"),
    import("drizzle-orm")
  ]);

  const config = loadConfig(env);
  const runId = Date.now();
  const markers = {
    weightReply: `123.${String(runId).slice(-3)}`,
    sleepReply: `sleep-integration-${runId}`,
    mealText: `integration meal ${runId}: chicken wrap and crisps`,
    weightUpdateId: runId,
    checkinUpdateId: runId + 1
  };

  const sendTelegramMessage = async () => ({ ok: true, simulated: true });
  const dependencies = {
    generateDailyPlan: planningModule.generateDailyPlan,
    getDailySummary: currentStateModule.getDailySummary,
    listRecentConversationMessages: persistenceModule.listRecentConversationMessages,
    sendTelegramMessage,
    setConversationMessageMetadata: persistenceModule.setConversationMessageMetadata,
    storeCheckinResponse: persistenceModule.storeCheckinResponse,
    storeConversationMessage: persistenceModule.storeConversationMessage,
    storeDailyPlan: persistenceModule.storeDailyPlan,
    storeWeightEntry: persistenceModule.storeWeightEntry
  };

  const db = dbModule.getDb(env.DATABASE_URL);

  try {
    await cleanupCoachingArtifacts(db, dbModule, drizzleOrm, markers);

    const weightPrompt = await coachingModule.sendWeightPrompt(
      config,
      { date: COACHING_TEST_DATE },
      dependencies
    );
    assert.equal(weightPrompt.sent, true);

    const weightReply = await coachingModule.handlePromptReply(
      config,
      {
        text: markers.weightReply,
        promptDate: COACHING_TEST_DATE,
        updateId: markers.weightUpdateId,
        messageId: 101
      },
      dependencies
    );
    assert.equal(weightReply.handled, true);
    assert.equal(weightReply.promptKind, "weight");

    const storedWeights = await db
      .select({
        id: dbModule.weightEntries.id,
        kilograms: dbModule.weightEntries.kilograms
      })
      .from(dbModule.weightEntries)
      .where(drizzleOrm.sql`${dbModule.weightEntries.sourcePayload} ->> 'rawText' = ${markers.weightReply}`);
    assert.equal(storedWeights.length, 1);

    const weightPrompts = await db
      .select({
        id: dbModule.conversationLog.id,
        actor: dbModule.conversationLog.actor,
        content: dbModule.conversationLog.content,
        metadata: dbModule.conversationLog.metadata
      })
      .from(dbModule.conversationLog)
      .where(drizzleOrm.sql`${dbModule.conversationLog.metadata} ->> 'promptDate' = ${COACHING_TEST_DATE}`);
    assert.ok(weightPrompts.some((entry) => entry.content?.includes("How was your sleep last night?")));

    const checkinReply = await coachingModule.handlePromptReply(
      config,
      {
        text: markers.sleepReply,
        promptDate: COACHING_TEST_DATE,
        updateId: markers.checkinUpdateId,
        messageId: 102
      },
      dependencies
    );
    assert.equal(checkinReply.handled, true);
    assert.equal(checkinReply.promptKind, "checkin");
    assert.ok(checkinReply.followUpText?.includes("How is your mood today?"));

    const storedCheckins = await db
      .select({
        id: dbModule.checkinResponses.id,
        field: dbModule.checkinResponses.field,
        valueText: dbModule.checkinResponses.valueText
      })
      .from(dbModule.checkinResponses)
      .where(drizzleOrm.sql`${dbModule.checkinResponses.sourcePayload} ->> 'rawText' = ${markers.sleepReply}`);
    assert.equal(storedCheckins.length, 1);
    assert.equal(storedCheckins[0]?.field, "sleep_quality");

    const followUp = await coachingModule.sendMissedWorkoutFollowUp(
      config,
      {
        date: MISSED_WORKOUT_TEST_DATE,
        now: new Date(`${MISSED_WORKOUT_TEST_DATE}T23:30:00Z`)
      },
      dependencies
    );
    assert.equal(followUp.sent, true);

    const missedWorkoutReply = await coachingModule.handlePromptReply(
      config,
      {
        text: "20-minute version",
        promptDate: MISSED_WORKOUT_TEST_DATE,
        updateId: runId + 2,
        messageId: 103
      },
      dependencies
    );
    assert.equal(missedWorkoutReply.handled, true);
    assert.equal(missedWorkoutReply.promptKind, "missed_workout");

    const storedPlans = await db
      .select({
        id: dbModule.dailyPlans.id,
        summary: dbModule.dailyPlans.summary,
        workoutPlan: dbModule.dailyPlans.workoutPlan,
        updatedAt: dbModule.dailyPlans.updatedAt
      })
      .from(dbModule.dailyPlans)
      .where(
        drizzleOrm.and(
          drizzleOrm.gte(dbModule.dailyPlans.planDate, new Date(`${MISSED_WORKOUT_TEST_DATE}T00:00:00Z`)),
          drizzleOrm.lt(dbModule.dailyPlans.planDate, new Date(`${MISSED_WORKOUT_TEST_DATE}T23:59:59.999Z`))
        )
      )
      .orderBy(drizzleOrm.desc(dbModule.dailyPlans.updatedAt));
    assert.ok(storedPlans.length >= 1);
    assert.match(storedPlans[0]?.summary ?? "", /20 minutes|20-minute/i);
  } finally {
    await cleanupCoachingArtifacts(db, dbModule, drizzleOrm, markers);
    await dbModule.closeDb();
  }
}

async function runDashboardSmoke(env, webBaseUrl) {
  await runCommand(
    "Dashboard E2E smoke",
    "npm",
    ["run", "test:e2e:dashboard"],
    {
      env: {
        ...env,
        E2E_WEB_BASE_URL: webBaseUrl
      }
    }
  );
}

async function main() {
  const loadedEnv = loadEnv();
  const tempDatabase = await createTemporaryDatabase(loadedEnv.DATABASE_URL, "full_system", {
    cwd: ROOT,
    env: loadedEnv
  });
  const isolatedEnv = {
    ...loadedEnv,
    DATABASE_URL: tempDatabase.databaseUrl
  };
  const { baseEnv, apiEnv, webEnv, apiBaseUrl, webBaseUrl, webPort } = createTestEnvironments(
    isolatedEnv
  );
  const services = [];
  Object.assign(process.env, baseEnv);

  try {
    await runCommand("Workspace typecheck", "npm", ["run", "typecheck"], {
      env: baseEnv
    });
    await runCommand("Build shared", "npm", ["run", "build", "--workspace", "@codex/shared"], {
      env: baseEnv
    });
    await runCommand("Build db", "npm", ["run", "build", "--workspace", "@codex/db"], {
      env: baseEnv
    });
    await runCommand("Run migrations", "npm", ["run", "migrate:up", "--workspace", "@codex/db"], {
      env: baseEnv
    });
    await runCommand(
      "Seed source precedence",
      "npm",
      ["run", "seed:source-precedence", "--workspace", "@codex/db"],
      {
        env: baseEnv
      }
    );
    await runCommand("Build API", "npm", ["run", "build", "--workspace", "@codex/api"], {
      env: baseEnv
    });
    await runCommand("API unit and route tests", "npm", ["run", "test", "--workspace", "@codex/api"], {
      env: baseEnv
    });
    await runCommand("Build web", "npm", ["run", "build", "--workspace", "@codex/web"], {
      env: webEnv
    });
    await runCommand(
      "Seed dashboard users",
      "npm",
      ["run", "seed:dashboard-users", "--workspace", "@codex/api"],
      {
        env: baseEnv
      }
    );

    await runDryRunJobs(baseEnv);
    await runExternalSyncChecks(baseEnv);
    await runCommand(
      "Persist daily scoring",
      "npm",
      ["run", "run:scoring", "--workspace", "@codex/api", "--", "--date", TEST_DATE],
      {
        env: baseEnv
      }
    );
    await runMealIntegrationCheck(baseEnv);
    await runCoachingIntegrationCheck(baseEnv);

    services.push(
      await startService("API service", "npm", ["run", "start", "--workspace", "@codex/api"], {
        env: apiEnv,
        readyUrl: `${apiBaseUrl}/auth/me`
      })
    );
    services.push(
      await startService(
        "Web service",
        "npm",
        ["run", "start", "--workspace", "@codex/web", "--", "--port", String(webPort)],
        {
          env: webEnv,
          readyUrl: webBaseUrl
        }
      )
    );

    await runRouteIntegrationChecks(baseEnv, apiBaseUrl, webBaseUrl);
    await runDashboardSmoke(baseEnv, webBaseUrl);

    process.stdout.write("\n[full-test] All system checks passed.\n");
  } finally {
    for (const service of services.reverse()) {
      await service.stop();
    }
    await tempDatabase.drop();
  }
}

main().catch((error) => {
  console.error("\n[full-test] FAILED");
  console.error(error);
  process.exitCode = 1;
});
