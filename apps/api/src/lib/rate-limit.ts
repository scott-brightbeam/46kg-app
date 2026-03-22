type RateLimitState = {
  count: number;
  windowStartedAt: number;
};

export type RateLimitResult = {
  allowed: boolean;
  remaining: number;
  retryAfterSeconds: number;
};

export function createInMemoryRateLimiter(input: {
  max: number;
  windowMs: number;
  now?: () => number;
}) {
  const state = new Map<string, RateLimitState>();
  const now = input.now ?? Date.now;

  return function consume(key: string): RateLimitResult {
    const currentTime = now();
    const current = state.get(key);

    if (!current || currentTime - current.windowStartedAt >= input.windowMs) {
      state.set(key, {
        count: 1,
        windowStartedAt: currentTime
      });

      return {
        allowed: true,
        remaining: Math.max(input.max - 1, 0),
        retryAfterSeconds: Math.ceil(input.windowMs / 1000)
      };
    }

    current.count += 1;
    const retryAfterSeconds = Math.max(
      1,
      Math.ceil((current.windowStartedAt + input.windowMs - currentTime) / 1000)
    );

    if (current.count > input.max) {
      return {
        allowed: false,
        remaining: 0,
        retryAfterSeconds
      };
    }

    return {
      allowed: true,
      remaining: Math.max(input.max - current.count, 0),
      retryAfterSeconds
    };
  };
}
