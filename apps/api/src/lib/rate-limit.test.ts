import assert from "node:assert/strict";
import test from "node:test";

import { createInMemoryRateLimiter } from "./rate-limit.js";

test("createInMemoryRateLimiter denies requests after the configured burst", () => {
  let currentTime = 0;
  const consume = createInMemoryRateLimiter({
    max: 2,
    windowMs: 1_000,
    now: () => currentTime
  });

  assert.deepEqual(consume("login:user@example.com"), {
    allowed: true,
    remaining: 1,
    retryAfterSeconds: 1
  });
  assert.deepEqual(consume("login:user@example.com"), {
    allowed: true,
    remaining: 0,
    retryAfterSeconds: 1
  });
  assert.deepEqual(consume("login:user@example.com"), {
    allowed: false,
    remaining: 0,
    retryAfterSeconds: 1
  });
});

test("createInMemoryRateLimiter resets counts after the window elapses", () => {
  let currentTime = 0;
  const consume = createInMemoryRateLimiter({
    max: 1,
    windowMs: 2_000,
    now: () => currentTime
  });

  assert.equal(consume("webhook").allowed, true);
  assert.equal(consume("webhook").allowed, false);

  currentTime = 2_500;

  assert.deepEqual(consume("webhook"), {
    allowed: true,
    remaining: 0,
    retryAfterSeconds: 2
  });
});
