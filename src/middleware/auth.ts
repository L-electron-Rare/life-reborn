import type { MiddlewareHandler } from "hono";

export function isAuthConfigured(): boolean {
  return Boolean(process.env.LIFE_REBORN_API_TOKEN?.trim());
}

export function allowPublicApi(): boolean {
  return /^(1|true|yes)$/i.test(String(process.env.LIFE_REBORN_ALLOW_PUBLIC_API || "").trim());
}

export const authMiddleware: MiddlewareHandler = async (c, next) => {
  if (!isAuthConfigured() || allowPublicApi()) {
    await next();
    return;
  }

  const header = c.req.header("Authorization");
  const expected = process.env.LIFE_REBORN_API_TOKEN?.trim();
  const received = header?.startsWith("Bearer ") ? header.slice(7).trim() : "";

  if (!expected || received !== expected) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  await next();
};