import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const ROOT = resolve(new URL("..", import.meta.url).pathname);
const ENV_PATH = resolve(ROOT, ".env");

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

function requireEnv(env, key) {
  const value = env[key];
  if (!value || String(value).trim().length === 0) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return String(value).trim();
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
      typeof response.headers.getSetCookie === "function" ? response.headers.getSetCookie() : [];

    for (const cookie of setCookies) {
      const [pair] = cookie.split(";", 1);
      if (!pair) {
        continue;
      }
      const separatorIndex = pair.indexOf("=");
      if (separatorIndex < 0) {
        continue;
      }
      this.cookies.set(pair.slice(0, separatorIndex), pair.slice(separatorIndex + 1));
    }
  }

  cookieHeader() {
    return [...this.cookies.entries()]
      .map(([name, value]) => `${name}=${value}`)
      .join("; ");
  }

  async request(path, init = {}) {
    const headers = new Headers(init.headers ?? undefined);
    const cookieHeader = this.cookieHeader();

    if (cookieHeader) {
      headers.set("cookie", cookieHeader);
    }

    if (this.trustedOrigin && !headers.has("origin")) {
      headers.set("origin", this.trustedOrigin);
    }

    if (init.body && !headers.has("content-type")) {
      headers.set("content-type", "application/json");
    }

    const response = await fetch(`${this.baseUrl}${path}`, {
      ...init,
      headers
    });

    this.updateCookies(response);
    const text = await response.text();
    let json = null;

    if (text) {
      try {
        json = JSON.parse(text);
      } catch {
        json = null;
      }
    }

    return {
      status: response.status,
      json,
      text
    };
  }
}

async function checkTelegramWebhook(env) {
  const response = await fetch(
    `https://api.telegram.org/bot${requireEnv(env, "TELEGRAM_BOT_TOKEN")}/getWebhookInfo`
  );
  const payload = await response.json();
  const expectedUrl = new URL("/webhooks/telegram", requireEnv(env, "API_BASE_URL")).toString();

  return {
    expectedUrl,
    actualUrl: payload?.result?.url ?? null,
    matchesExpectedUrl: payload?.result?.url === expectedUrl,
    pendingUpdateCount: payload?.result?.pending_update_count ?? 0,
    lastErrorMessage: payload?.result?.last_error_message ?? null
  };
}

async function main() {
  const env = loadEnv();
  const apiBaseUrl = requireEnv(env, "API_BASE_URL");
  const webBaseUrl = requireEnv(env, "WEB_BASE_URL");

  const apiHealth = await fetch(`${apiBaseUrl}/health`);
  const apiHealthJson = await apiHealth.json();

  const webResponse = await fetch(webBaseUrl);
  const webHtml = await webResponse.text();

  const session = new SessionClient(apiBaseUrl, webBaseUrl);
  const login = await session.request("/auth/login", {
    method: "POST",
    body: JSON.stringify({
      email: requireEnv(env, "DASHBOARD_USER_EMAIL"),
      password: requireEnv(env, "DASHBOARD_USER_PASSWORD")
    })
  });

  const authMe = await session.request("/auth/me");
  const ops = await session.request("/ops/status");
  const telegramWebhook = env.TELEGRAM_BOT_TOKEN
    ? await checkTelegramWebhook(env)
    : {
        expectedUrl: null,
        actualUrl: null,
        matchesExpectedUrl: false,
        pendingUpdateCount: null,
        lastErrorMessage: "TELEGRAM_BOT_TOKEN not configured"
      };

  console.log(
    JSON.stringify(
      {
        ok:
          apiHealth.status === 200 &&
          webResponse.status === 200 &&
          login.status === 200 &&
          authMe.status === 200 &&
          ops.status === 200,
        api: {
          status: apiHealth.status,
          health: apiHealthJson
        },
        web: {
          status: webResponse.status,
          titleIncludes46KG: /46KG/i.test(webHtml)
        },
        auth: {
          loginStatus: login.status,
          meStatus: authMe.status
        },
        ops: {
          status: ops.status,
          overallStatus: ops.json?.status?.overallStatus ?? null
        },
        telegramWebhook
      },
      null,
      2
    )
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
