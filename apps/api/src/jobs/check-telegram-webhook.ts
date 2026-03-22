import { loadConfig } from "../config.js";

async function main() {
  const config = loadConfig();
  const expectedUrl = new URL("/webhooks/telegram", config.API_BASE_URL).toString();

  const response = await fetch(
    `https://api.telegram.org/bot${config.TELEGRAM_BOT_TOKEN}/getWebhookInfo`
  );

  const payload = (await response.json()) as {
    ok: boolean;
    description?: string;
    result?: {
      url?: string;
      has_custom_certificate?: boolean;
      pending_update_count?: number;
      last_error_date?: number;
      last_error_message?: string;
      max_connections?: number;
      ip_address?: string;
      allowed_updates?: string[];
    };
  };

  if (!response.ok || payload.ok === false) {
    throw new Error(payload.description ?? `Telegram getWebhookInfo failed with status ${response.status}`);
  }

  const info = payload.result ?? {};
  console.log(
    JSON.stringify(
      {
        ok: true,
        expectedUrl,
        actualUrl: info.url ?? null,
        matchesExpectedUrl: info.url === expectedUrl,
        pendingUpdateCount: info.pending_update_count ?? 0,
        lastErrorDate: info.last_error_date ?? null,
        lastErrorMessage: info.last_error_message ?? null,
        ipAddress: info.ip_address ?? null,
        allowedUpdates: info.allowed_updates ?? []
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
