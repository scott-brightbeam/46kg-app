import type { AppConfig } from "../config.js";

const TELEGRAM_API_BASE = "https://api.telegram.org";

export async function sendTelegramMessageToChat(
  config: AppConfig,
  chatId: string,
  text: string
) {
  if (!chatId) {
    throw new Error("chatId is required to send Telegram messages");
  }

  const response = await fetch(
    `${TELEGRAM_API_BASE}/bot${config.TELEGRAM_BOT_TOKEN}/sendMessage`,
    {
      method: "POST",
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify({
        chat_id: chatId,
        text
      })
    }
  );

  if (!response.ok) {
    throw new Error(`Telegram sendMessage failed with status ${response.status}`);
  }

  return response.json();
}

export async function sendTelegramMessage(config: AppConfig, text: string) {
  if (!config.TELEGRAM_CHAT_ID) {
    throw new Error("TELEGRAM_CHAT_ID is required to send messages");
  }

  return sendTelegramMessageToChat(config, config.TELEGRAM_CHAT_ID, text);
}
