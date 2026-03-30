import { defineConfig } from "orval";

export default defineConfig({
  api: {
    input: {
      target: "./openapi/openapi.json",
    },
    output: {
      client: "fetch",
      mode: "single",
      target: "./src/generated/api.client.ts",
      baseUrl: "http://localhost:3000",
    },
  },
});