import { serve } from "@hono/node-server";
import { app } from "./app.js";

const port = parseInt(process.env.PORT || "3210", 10);

if (import.meta.url === `file://${process.argv[1]}`) {
  serve({ fetch: app.fetch, port });
  console.log(`life-reborn listening on port ${port}`);
}

export { app };