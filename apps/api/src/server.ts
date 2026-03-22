import Fastify from "fastify";
import cookie from "@fastify/cookie";
import cors from "@fastify/cors";

import type { AppConfig } from "./config.js";
import { registerAccessGrantRoutes } from "./routes/access-grants.js";
import { registerAuthRoutes } from "./routes/auth.js";
import { registerCurrentStateRoutes } from "./routes/current-state.js";
import { registerDayTemplateRoutes } from "./routes/day-templates.js";
import { registerHealthRoutes } from "./routes/health.js";
import { registerNutritionTargetRoutes } from "./routes/nutrition-targets.js";
import { registerOpsRoutes } from "./routes/ops.js";
import { registerWebhookRoutes } from "./routes/webhooks.js";
import { toFastifySecurityHeaders } from "./lib/security-headers.js";

export async function buildServer(config: AppConfig) {
  const app = Fastify({
    logger: true,
    trustProxy: true
  });

  await app.register(cors, {
    origin: [config.WEB_BASE_URL],
    credentials: true
  });

  await app.register(cookie, {
    secret: config.AUTH_SESSION_SECRET
  });

  app.addHook("onSend", async (_request, reply, payload) => {
    for (const header of toFastifySecurityHeaders()) {
      reply.header(header.key, header.value);
    }

    return payload;
  });

  await registerHealthRoutes(app);
  await registerAuthRoutes(app, config);
  await registerAccessGrantRoutes(app, config);
  await registerCurrentStateRoutes(app, config);
  await registerDayTemplateRoutes(app, config);
  await registerNutritionTargetRoutes(app, config);
  await registerOpsRoutes(app, config);
  await registerWebhookRoutes(app, config);

  return app;
}
