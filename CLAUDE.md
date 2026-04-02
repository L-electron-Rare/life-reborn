# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

life-reborn is the Hono 4 / TypeScript API gateway for FineFab — auth, rate-limiting, OpenAPI 3.1, reverse proxy to life-core. Port 3210.

## Commands

```bash
npm test          # vitest
npm run lint      # tsc --noEmit
npm run build     # compile check
npm run dev       # watch mode with tsx
```

## Architecture

Hono routes in `src/` proxy to life-core (`LIFE_CORE_URL`). Auth via Bearer token or Keycloak JWT. Rate-limiting per IP. Generated OpenAPI client in `src/generated/` — never hand-edit.
