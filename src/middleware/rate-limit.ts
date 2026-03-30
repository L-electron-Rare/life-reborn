import type { MiddlewareHandler } from "hono";

type Entry = {
  count: number;
  resetAt: number;
};

const entries = new Map<string, Entry>();
const WINDOW_MS = 60_000;
const DEFAULT_LIMIT = 60;

function keyFromRequest(request: Request): string {
  return request.headers.get("x-forwarded-for") || request.headers.get("x-real-ip") || "local";
}

export const rateLimitMiddleware: MiddlewareHandler = async (c, next) => {
  const now = Date.now();
  const limit = parseInt(process.env.LIFE_REBORN_RATE_LIMIT_RPM || `${DEFAULT_LIMIT}`, 10);
  const key = keyFromRequest(c.req.raw);
  const current = entries.get(key);

  if (!current || now >= current.resetAt) {
    entries.set(key, { count: 1, resetAt: now + WINDOW_MS });
    await next();
    return;
  }

  if (current.count >= limit) {
    return c.json({ error: "Too many requests" }, 429);
  }

  current.count += 1;
  await next();
};