import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";

import { telegramUpdateSchema } from "@codex/shared";

import type { AppConfig } from "../config.js";
import { createInMemoryRateLimiter } from "../lib/rate-limit.js";
import { handleHealthAutoExportPayload } from "../services/health-auto-export.js";
import { handleTelegramUpdate } from "../services/telegram.js";

type TelegramHeaders = {
  "x-telegram-bot-api-secret-token"?: string;
};

type WebhookRouteDependencies = {
  consumeHealthAutoExportRateLimit: (key: string) => {
    allowed: boolean;
    retryAfterSeconds: number;
  };
  consumeTelegramRateLimit: (key: string) => {
    allowed: boolean;
    retryAfterSeconds: number;
  };
  handleHealthAutoExportPayload: typeof handleHealthAutoExportPayload;
  handleTelegramUpdate: typeof handleTelegramUpdate;
};

const consumeTelegramRateLimit = createInMemoryRateLimiter({
  max: 60,
  windowMs: 60_000
});

const consumeHealthAutoExportRateLimit = createInMemoryRateLimiter({
  max: 120,
  windowMs: 60_000
});

const defaultDependencies: WebhookRouteDependencies = {
  consumeHealthAutoExportRateLimit,
  consumeTelegramRateLimit,
  handleHealthAutoExportPayload,
  handleTelegramUpdate
};

function assertTelegramSecret(
  request: FastifyRequest<{ Headers: TelegramHeaders }>,
  reply: FastifyReply,
  config: AppConfig
) {
  const header = request.headers["x-telegram-bot-api-secret-token"];

  if (header !== config.TELEGRAM_WEBHOOK_SECRET) {
    return reply.code(401).send({ ok: false, error: "Invalid Telegram webhook secret" });
  }

  return null;
}

export async function registerWebhookRoutes(
  app: FastifyInstance,
  config: AppConfig,
  dependencies: WebhookRouteDependencies = defaultDependencies
) {
  app.post<{ Headers: TelegramHeaders }>(
    "/webhooks/telegram",
    async (request, reply) => {
      const rateLimit = dependencies.consumeTelegramRateLimit("telegram_webhook");
      if (!rateLimit.allowed) {
        return reply
          .header("Retry-After", String(rateLimit.retryAfterSeconds))
          .code(429)
          .send({ ok: false, error: "Telegram webhook rate limit exceeded" });
      }

      const secretError = assertTelegramSecret(request, reply, config);

      if (secretError) {
        return secretError;
      }

      const update = telegramUpdateSchema.parse(request.body);

      app.log.info(
        {
          updateId: update.update_id,
          hasText: Boolean(update.message?.text)
        },
        "telegram update received"
      );

      const result = await dependencies.handleTelegramUpdate(update, config);

      return { ok: true, duplicate: result.duplicate };
    }
  );

  app.post("/webhooks/health-auto-export", async (request, reply) => {
    const rateLimit = dependencies.consumeHealthAutoExportRateLimit("health_auto_export_webhook");
    if (!rateLimit.allowed) {
      return reply
        .header("Retry-After", String(rateLimit.retryAfterSeconds))
        .code(429)
        .send({ ok: false, error: "Health Auto Export webhook rate limit exceeded" });
    }

    const sharedSecret = request.headers["x-health-auto-export-secret"];

    if (sharedSecret !== config.HEALTH_AUTO_EXPORT_SHARED_SECRET) {
      return reply.code(401).send({
        ok: false,
        error: "Invalid Health Auto Export secret"
      });
    }

    app.log.info("health auto export payload received");

    const result = await dependencies.handleHealthAutoExportPayload(request.body);

    return { ok: true, ingestEventId: result.ingestEventId };
  });
}
