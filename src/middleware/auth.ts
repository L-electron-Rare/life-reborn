import type { MiddlewareHandler } from "hono";

export function isAuthConfigured(): boolean {
  return Boolean(process.env.LIFE_REBORN_API_TOKEN?.trim());
}

export function allowPublicApi(): boolean {
  return /^(1|true|yes)$/i.test(String(process.env.LIFE_REBORN_ALLOW_PUBLIC_API || "").trim());
}

export function extractBearerToken(header?: string | null): string {
  return header?.startsWith("Bearer ") ? header.slice(7).trim() : "";
}

export function matchesStaticBearerToken(header?: string | null): boolean {
  const expected = process.env.LIFE_REBORN_API_TOKEN?.trim();
  if (!expected) {
    return false;
  }
  return extractBearerToken(header) === expected;
}

// Warn at module load time if token is missing and public API mode is not enabled.
if (!isAuthConfigured() && !allowPublicApi()) {
  console.warn(
    "[auth] WARNING: LIFE_REBORN_API_TOKEN is not set. " +
    "All requests will be rejected with 401 until a token is configured. " +
    "Set LIFE_REBORN_ALLOW_PUBLIC_API=true to intentionally disable auth."
  );
}

export const authMiddleware: MiddlewareHandler = async (c, next) => {
  // If public API mode is explicitly enabled, skip auth.
  if (allowPublicApi()) {
    await next();
    return;
  }

  const expected = process.env.LIFE_REBORN_API_TOKEN?.trim();

  // Reject all requests when no token is configured (fail-closed).
  if (!expected) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const header = c.req.header("Authorization");
  const received = extractBearerToken(header);

  if (received !== expected) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  await next();
};
