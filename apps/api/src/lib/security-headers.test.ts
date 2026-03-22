import assert from "node:assert/strict";
import test from "node:test";

import {
  securityHeaders,
  toFastifySecurityHeaders,
  toNextSecurityHeaders
} from "./security-headers.js";

test("toFastifySecurityHeaders returns the default hardened header set", () => {
  const headers = toFastifySecurityHeaders();

  assert.deepEqual(headers, [
    { key: "x-content-type-options", value: "nosniff" },
    { key: "x-frame-options", value: "DENY" },
    { key: "referrer-policy", value: "same-origin" },
    {
      key: "permissions-policy",
      value: "camera=(), microphone=(), geolocation=()"
    }
  ]);
});

test("toNextSecurityHeaders exposes the same header set for all web routes", () => {
  const rules = toNextSecurityHeaders();

  assert.equal(rules.length, 1);
  assert.equal(rules[0]?.source, "/:path*");
  assert.deepEqual(
    Object.fromEntries(rules[0]?.headers.map((header) => [header.key, header.value]) ?? []),
    securityHeaders
  );
});
