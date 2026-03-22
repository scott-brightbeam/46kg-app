import { loadConfig } from "../config.js";

type ParsedArgs = {
  dropPendingUpdates: boolean;
};

function parseArgs(argv: string[]): ParsedArgs {
  return {
    dropPendingUpdates: argv.includes("--drop-pending-updates")
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const config = loadConfig();
  const webhookUrl = new URL("/webhooks/telegram", config.API_BASE_URL).toString();

  const response = await fetch(
    `https://api.telegram.org/bot${config.TELEGRAM_BOT_TOKEN}/setWebhook`,
    {
      method: "POST",
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify({
        url: webhookUrl,
        secret_token: config.TELEGRAM_WEBHOOK_SECRET,
        allowed_updates: ["message"],
        drop_pending_updates: args.dropPendingUpdates
      })
    }
  );

  const payload = (await response.json()) as {
    ok: boolean;
    description?: string;
    result?: boolean;
  };

  if (!response.ok || payload.ok === false) {
    throw new Error(payload.description ?? `Telegram setWebhook failed with status ${response.status}`);
  }

  console.log(
    JSON.stringify(
      {
        ok: true,
        webhookUrl,
        dropPendingUpdates: args.dropPendingUpdates,
        result: payload.result ?? true
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
