import type { FastifyRequest } from "fastify";

import type { AppConfig } from "../config.js";

function buildOriginError(message: string) {
  const error = new Error(message);
  (error as Error & { statusCode?: number }).statusCode = 403;
  return error;
}

function extractCandidateOrigin(request: FastifyRequest) {
  if (typeof request.headers.origin === "string" && request.headers.origin.trim().length > 0) {
    return request.headers.origin.trim();
  }

  if (typeof request.headers.referer === "string" && request.headers.referer.trim().length > 0) {
    return request.headers.referer.trim();
  }

  return null;
}

export function assertTrustedBrowserOrigin(
  request: FastifyRequest,
  config: Pick<AppConfig, "WEB_BASE_URL">
) {
  const candidate = extractCandidateOrigin(request);

  if (!candidate) {
    throw buildOriginError("A trusted browser origin is required.");
  }

  const expectedOrigin = new URL(config.WEB_BASE_URL).origin;
  let actualOrigin: string;

  try {
    actualOrigin = new URL(candidate).origin;
  } catch {
    throw buildOriginError("Invalid browser origin.");
  }

  if (actualOrigin !== expectedOrigin) {
    throw buildOriginError("Untrusted request origin.");
  }
}
