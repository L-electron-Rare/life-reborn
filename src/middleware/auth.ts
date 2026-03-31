import type { MiddlewareHandler } from "hono";

export function isAuthConfigured(): boolean {
  return Boolean(process.env.LIFE_REBORN_API_TOKEN?.trim());
}

export function allowPublicApi(): boolean {
  return /^(1|true|yes)$/i.test(String(process.env.LIFE_REBORN_ALLOW_PUBLIC_API || "").trim());
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
  const received = header?.startsWith("Bearer ") ? header.slice(7).trim() : "";

  if (received !== expected) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  await next();
};