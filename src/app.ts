import { OpenAPIHono } from "@hono/zod-openapi";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { jwtAuthMiddleware } from "./middleware/jwt.js";
import { rateLimitMiddleware } from "./middleware/rate-limit.js";
import { registerChatRoute } from "./routes/chat.js";
import { registerChatRouteV2, registerChatRouteV1 } from "./routes/chat-v2.js";
import { registerBrowserRoute } from "./routes/browser.js";
import { registerHealthRoute } from "./routes/health.js";
import { registerProvidersRoute } from "./routes/providers.js";
import { registerVersionRoute } from "./routes/version.js";

export function buildApp(): OpenAPIHono {
  const app = new OpenAPIHono();

  const jwtAuth = jwtAuthMiddleware({
    jwksUrl: process.env.KEYCLOAK_JWKS_URL || "https://auth.saillant.cc/realms/electro_life/protocol/openid-connect/certs",
    issuer: process.env.KEYCLOAK_ISSUER || "https://auth.saillant.cc/realms/electro_life",
    bypassAuth: process.env.LIFE_REBORN_ALLOW_PUBLIC_API === "true",
  });

  app.use("*", cors({
    origin: process.env.ALLOWED_ORIGINS?.split(",") || ["https://life.saillant.cc"],
    credentials: true,
  }));
  app.use("*", logger());
  app.use("/api/chat", jwtAuth);
  app.use("/api/browser", jwtAuth);
  app.use("/api/chat", rateLimitMiddleware);
  app.use("/api/browser", rateLimitMiddleware);
  app.use("/api/v1/chat", rateLimitMiddleware);
  app.use("/api/providers", rateLimitMiddleware);

  registerHealthRoute(app);
  registerVersionRoute(app);
  registerProvidersRoute(app);
  registerChatRoute(app);
  registerChatRouteV1(app);
  registerChatRouteV2(app);
  registerBrowserRoute(app);

  app.doc("/doc", {
    openapi: "3.0.0",
    info: {
      title: "life-reborn API",
      version: "0.1.0",
    },
  });

  app.get("/", (c) => c.json({ service: "life-reborn", status: "ready" }, 200));
  return app;
}

export const app = buildApp();