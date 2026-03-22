export const securityHeaders = {
  "x-content-type-options": "nosniff",
  "x-frame-options": "DENY",
  "referrer-policy": "same-origin",
  "permissions-policy": "camera=(), microphone=(), geolocation=()"
} as const;

export function toFastifySecurityHeaders() {
  return Object.entries(securityHeaders).map(([key, value]) => ({
    key,
    value
  }));
}

export function toNextSecurityHeaders() {
  return [
    {
      source: "/:path*",
      headers: toFastifySecurityHeaders()
    }
  ];
}
