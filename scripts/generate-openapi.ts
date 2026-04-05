/**
 * OpenAPI schema generator for life-reborn.
 *
 * This script exports the document produced by the actual Hono route registry,
 * so the generated client cannot silently drift from the runtime surface.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import * as yaml from "js-yaml";
import { buildApp } from "../src/app.js";

const OPENAPI_DIR = path.resolve(process.cwd(), "openapi");

const openAPIConfig = {
  openapi: "3.0.0",
  info: {
    title: "life-reborn API",
    version: "0.1.0",
    description: "Gateway API for life-reborn service, bridging to life-core backend",
    contact: {
      name: "Factory 4 Life",
      url: "https://github.com/factory4life",
    },
    license: {
      name: "MIT",
    },
  },
  servers: [
    {
      url: "http://localhost:3000",
      description: "Development server",
    },
    {
      url: "https://api.saillant.cc",
      description: "Production server",
    },
  ],
} as const;

async function main() {
  fs.mkdirSync(OPENAPI_DIR, { recursive: true });

  const app = buildApp();
  const openAPISchema = app.getOpenAPIDocument(openAPIConfig);

  const jsonPath = path.join(OPENAPI_DIR, "openapi.json");
  const yamlPath = path.join(OPENAPI_DIR, "openapi.yaml");

  fs.writeFileSync(jsonPath, JSON.stringify(openAPISchema, null, 2));
  fs.writeFileSync(yamlPath, yaml.dump(openAPISchema, { noRefs: true }));

  console.log(`OpenAPI schema generated successfully:`);
  console.log(`  JSON: ${jsonPath}`);
  console.log(`  YAML: ${yamlPath}`);
  console.log(`  Routes: ${Object.keys(openAPISchema.paths ?? {}).length}`);
}

main().catch((error) => {
  console.error("Failed to generate OpenAPI schema:", error);
  process.exitCode = 1;
});
