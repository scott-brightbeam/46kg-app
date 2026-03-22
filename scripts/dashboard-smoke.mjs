import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";

import { chromium } from "playwright";

import { createTemporaryDatabase } from "./test-db.mjs";

const ROOT = resolve(new URL("..", import.meta.url).pathname);
const ENV_PATH = resolve(ROOT, ".env");
function getLocalPortPair() {
  const apiPort = process.env.E2E_API_PORT ?? String(3400 + (process.pid % 400));
  const webPort = process.env.E2E_WEB_PORT ?? String(Number(apiPort) + 1);
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

function loadEnvFile() {
  try {
    return parseDotEnv(readFileSync(ENV_PATH, "utf8"));
  } catch {
    return {};
  }
}

function withLoadedEnv() {
  const merged = {
    ...loadEnvFile(),
    ...process.env
  };

  if (!merged.E2E_WEB_BASE_URL) {
    const { apiPort, webPort } = getLocalPortPair();
    const apiBaseUrl = `http://localhost:${apiPort}`;
    const webBaseUrl = `http://localhost:${webPort}`;

    return {
      ...merged,
      API_PORT: apiPort,
      API_BASE_URL: apiBaseUrl,
      WEB_BASE_URL: webBaseUrl,
      NEXT_PUBLIC_API_BASE_URL: apiBaseUrl
    };
  }

  return merged;
}

async function waitForHttp(url, timeoutMs = 45_000) {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    try {
      const response = await fetch(url, { method: "GET" });
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
          await waitForHttp(readyUrl, 1_000);
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
      }
    };
  } catch (error) {
    if (child.exitCode === null) {
      child.kill("SIGKILL");
    }
    throw error;
  }
}

async function runCommand(label, command, args, options = {}) {
  const { cwd = ROOT, env = process.env } = options;
  let logBuffer = "";

  await new Promise((resolvePromise, rejectPromise) => {
    const child = spawn(command, args, {
      cwd,
      env,
      stdio: ["ignore", "pipe", "pipe"]
    });

    child.stdout.on("data", (chunk) => {
      logBuffer = `${logBuffer}${chunk.toString()}`.slice(-12_000);
    });
    child.stderr.on("data", (chunk) => {
      logBuffer = `${logBuffer}${chunk.toString()}`.slice(-12_000);
    });

    child.on("error", rejectPromise);
    child.on("exit", (code, signal) => {
      if (code === 0) {
        resolvePromise();
        return;
      }

      rejectPromise(
        new Error(
          `${label} failed with ${signal ? `signal ${signal}` : `exit code ${code ?? "unknown"}`}.\n\n${
            logBuffer || "(no process output)"
          }`
        )
      );
    });
  });
}

async function canReach(url) {
  try {
    const response = await fetch(url, { method: "GET" });
    return response.status < 500;
  } catch {
    return false;
  }
}

async function ensureServices(env) {
  const apiBaseUrl = env.NEXT_PUBLIC_API_BASE_URL ?? env.API_BASE_URL ?? "http://localhost:3001";
  const webBaseUrl = env.E2E_WEB_BASE_URL ?? env.WEB_BASE_URL ?? "http://localhost:3000";
  const services = [];

  const apiReady = await canReach(`${apiBaseUrl}/auth/me`);
  if (!apiReady) {
    await runCommand("Build API", "npm", ["run", "build", "--workspace", "@codex/api"], {
      env
    });
    services.push(
      await startService("API service", "npm", ["run", "start", "--workspace", "@codex/api"], {
        env: {
          ...env,
          API_BASE_URL: apiBaseUrl,
          WEB_BASE_URL: webBaseUrl
        },
        readyUrl: `${apiBaseUrl}/auth/me`
      })
    );
  }

  const webReady = await canReach(webBaseUrl);
  if (!webReady) {
    await runCommand("Build web", "npm", ["run", "build", "--workspace", "@codex/web"], {
      env: {
        ...env,
        NODE_ENV: "production",
        NEXT_PUBLIC_API_BASE_URL: apiBaseUrl
      }
    });
    const webUrl = new URL(webBaseUrl);
    services.push(
      await startService(
        "Web service",
        "npm",
        ["run", "start", "--workspace", "@codex/web", "--", "--port", webUrl.port || "3000"],
        {
          env: {
            ...env,
            NODE_ENV: "production",
            PORT: webUrl.port || "3000",
            NEXT_PUBLIC_API_BASE_URL: apiBaseUrl,
            WEB_BASE_URL: webBaseUrl
          },
          readyUrl: webBaseUrl
        }
      )
    );
  }

  return {
    apiBaseUrl,
    webBaseUrl,
    async stop() {
      for (const service of services.reverse()) {
        await service.stop();
      }
    }
  };
}

function requireEnv(name) {
  const value = process.env[name];
  if (!value || value.trim().length === 0) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value.trim();
}

async function login(page, email, password) {
  await page.goto(process.env.E2E_WEB_BASE_URL ?? process.env.WEB_BASE_URL ?? "http://localhost:3000", {
    waitUntil: "domcontentloaded"
  });
  await page.getByTestId("login-form").waitFor();
  await page.getByTestId("login-email").fill(email);
  await page.getByTestId("login-password").fill(password);
  await page.getByTestId("login-submit").click();
  const errorBanner = page.getByTestId("error-banner");
  const scopePanel = page.getByTestId("scope-panel");

  await Promise.race([
    scopePanel.waitFor(),
    errorBanner.waitFor().then(async () => {
      throw new Error(`Login failed: ${(await errorBanner.textContent())?.trim() ?? "unknown error"}`);
    })
  ]);
}

async function logout(page) {
  await page.getByRole("button", { name: "Sign out" }).click();
  await page.getByTestId("login-form").waitFor();
}

async function clearTrainerNutritionGrantIfNeeded(page) {
  const toggle = page.getByTestId("grant-toggle-trainer-nutrition");
  await toggle.waitFor();
  if ((await toggle.textContent())?.trim() === "Visible") {
    await toggle.click();
    await page.getByTestId("success-banner").waitFor();
    await page.getByTestId("success-banner").waitFor({
      state: "attached"
    });
    await page.getByText(/Trainer can no longer see nutrition data\./).waitFor();
  }
}

async function updateSundayTemplate(page) {
  const nextActivity = `Smoke walk ${Date.now()}`;
  const activityInput = page.getByTestId("template-activity-sunday");
  await activityInput.waitFor();
  await activityInput.fill(nextActivity);
  await page.getByTestId("template-intensity-sunday").selectOption("light");
  await page.getByTestId("template-time-sunday").selectOption("morning");
  const routineSelect = page.getByTestId("template-routine-sunday");
  const routineOptions = await routineSelect.locator("option").allTextContents();
  const hasRoutineOption = routineOptions.some((option) =>
    option.includes("30kg Full-Body Barbell Circuit")
  );
  if (hasRoutineOption) {
    await routineSelect.selectOption({ label: "30kg Full-Body Barbell Circuit" });
  }
  await page.getByTestId("template-save-sunday").click();
  await page.getByTestId("template-success-banner").waitFor();
  await page.getByTestId("template-row-sunday").getByText(nextActivity).waitFor();
  if (hasRoutineOption) {
    await page
      .getByTestId("template-row-sunday")
      .getByText("Hevy: 30kg Full-Body Barbell Circuit")
      .waitFor();
  }
}

async function updateNutritionTargets(page) {
  const calories = String(2200 + Math.floor(Date.now() % 120));
  await page.getByTestId("nutrition-target-panel").waitFor();
  await page.getByTestId("nutrition-target-calories").fill(calories);
  await page.getByTestId("nutrition-target-protein").fill("190");
  await page.getByTestId("nutrition-target-fibre").fill("35");
  await page.getByTestId("nutrition-target-save").click();
  await page.getByTestId("nutrition-target-success-banner").waitFor();
  return calories;
}

async function run() {
  const env = withLoadedEnv();
  let tempDatabase = null;
  let managedServices = null;
  let browser = null;

  try {
    tempDatabase = await createTemporaryDatabase(env.DATABASE_URL, "dashboard_smoke", {
      cwd: ROOT,
      env
    });
    const runEnv = {
      ...env,
      DATABASE_URL: tempDatabase.databaseUrl
    };
    Object.assign(process.env, runEnv);
    await runCommand("Run migrations", "npm", ["run", "migrate:up", "--workspace", "@codex/db"], {
      env: runEnv
    });
    await runCommand("Seed source precedence", "npm", ["run", "seed:source-precedence", "--workspace", "@codex/db"], {
      env: runEnv
    });
    await runCommand("Seed dashboard users", "npm", ["run", "seed:dashboard-users", "--workspace", "@codex/api"], {
      env: runEnv
    });
    managedServices = await ensureServices(runEnv);
    browser = await chromium.launch({
      headless: true
    });

    const userEmail = requireEnv("DASHBOARD_USER_EMAIL");
    const userPassword = requireEnv("DASHBOARD_USER_PASSWORD");
    const trainerEmail = requireEnv("DASHBOARD_TRAINER_EMAIL");
    const trainerPassword = requireEnv("DASHBOARD_TRAINER_PASSWORD");

    const context = await browser.newContext();
    const page = await context.newPage();

    await login(page, userEmail, userPassword);
    await page.getByTestId("ops-panel").waitFor();
    await page.getByTestId("report-panel").getByText("Operator summary").waitFor();
    await page.getByTestId("grant-panel-trainer").waitFor();
    await page.getByTestId("template-panel").waitFor();

    await clearTrainerNutritionGrantIfNeeded(page);
    await updateSundayTemplate(page);
    const savedCalories = await updateNutritionTargets(page);

    const trainerNutritionToggle = page.getByTestId("grant-toggle-trainer-nutrition");
    await trainerNutritionToggle.click();
    await page.getByText(/Granted\. Trainer can now see nutrition data\./).waitFor();
    await page.getByTestId("grant-panel-trainer").getByText("2 visible").waitFor();

    await logout(page);

    await login(page, trainerEmail, trainerPassword);
    await page.getByText("Trainer view", { exact: true }).waitFor();
    await page.getByTestId("report-panel").getByText("Coaching summary").waitFor();
    await page.getByTestId("ops-panel").count().then((count) => {
      if (count !== 0) {
        throw new Error("Operator panel should only be visible to the primary user.");
      }
    });
    const scopePanel = page.getByTestId("scope-panel");
    await scopePanel.getByText("Exercise").waitFor();
    await scopePanel.getByText("Nutrition").waitFor();
    await page.getByTestId("nutrition-target-panel").getByText(`${savedCalories} kcal`).waitFor();

    await logout(page);

    await login(page, userEmail, userPassword);
    await page.getByTestId("grant-toggle-trainer-nutrition").click();
    await page.getByText(/Done\. Trainer can no longer see nutrition data\./).waitFor();
    await page.getByTestId("grant-panel-trainer").getByText("1 visible").waitFor();

    console.log(
      JSON.stringify(
        {
          ok: true,
          flow: "user grant -> trainer verify -> user revoke"
        },
        null,
        2
      )
    );
  } finally {
    if (browser) {
      await browser.close();
    }
    if (managedServices) {
      await managedServices.stop();
    }
    if (tempDatabase) {
      await tempDatabase.drop();
    }
  }
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
