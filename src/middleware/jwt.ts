import { Context, Next } from "hono";
import * as jose from "jose";

interface JwtAuthOptions {
  jwksUrl: string;
  issuer: string;
  bypassAuth?: boolean;
}

let jwks: jose.JSONWebKeySet | null = null;
let jwksLastFetch = 0;
const JWKS_CACHE_TTL_MS = 300_000; // 5 min

export function resetJwtCacheForTests(): void {
  jwks = null;
  jwksLastFetch = 0;
}

async function getJWKS(url: string): Promise<jose.JSONWebKeySet> {
  const now = Date.now();
  if (jwks && now - jwksLastFetch < JWKS_CACHE_TTL_MS) {
    return jwks;
  }
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch JWKS: ${response.status}`);
  }
  jwks = (await response.json()) as jose.JSONWebKeySet;
  jwksLastFetch = now;
  return jwks;
}

export function jwtAuthMiddleware(options: JwtAuthOptions) {
  return async (c: Context, next: Next) => {
    if (options.bypassAuth) {
      return next();
    }

    let token: string | undefined;
    const authHeader = c.req.header("Authorization");
    if (authHeader?.startsWith("Bearer ")) {
      token = authHeader.slice(7);
    }

    // SSE fallback: EventSource cannot set custom headers, so the /events
    // endpoint accepts the JWT as a query-string parameter. Restricted to
    // /events only to avoid leaking tokens in access logs / referrers.
    if (!token && c.req.path === "/events") {
      const queryToken = c.req.query("access_token");
      if (queryToken) {
        token = queryToken;
      }
    }

    if (!token) {
      return c.json({ error: "Missing or invalid Authorization header" }, 401);
    }

    try {
      const keySet = await getJWKS(options.jwksUrl);
      const JWKS = jose.createLocalJWKSet(keySet);
      const { payload } = await jose.jwtVerify(token, JWKS, {
        issuer: options.issuer,
      });

      // Attach user info to context
      c.set("user", {
        sub: payload.sub,
        email: payload.email,
        name: payload.preferred_username || payload.name,
        roles: (payload.realm_access as any)?.roles || [],
      });

      return next();
    } catch (err) {
      return c.json({ error: "Invalid or expired token" }, 401);
    }
  };
}
