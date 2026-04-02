# life-reborn

FineFab API gateway -- authentication, rate limiting, and OpenAPI-first routing.

Part of the [FineFab](https://github.com/L-electron-Rare) platform.

## What it does

- Serves as the single public-facing entry point for all FineFab clients
- Handles authentication and authorization for API consumers
- Enforces rate limiting and request validation
- Auto-generates OpenAPI 3.1 specs and typed clients
- Proxies requests to `life-core` and other internal services

## Tech stack

TypeScript / Hono / vitest / pnpm

## Quick start

```bash
pnpm install
pnpm dev
```

## Project structure

```
src/routes/       # API route handlers
src/middleware/    # Auth, validation, rate limiting
openapi/          # Generated OpenAPI specs
src/generated/    # Generated clients and types
```

## Related repos

| Repo | Role |
|------|------|
| [life-core](https://github.com/L-electron-Rare/life-core) | AI backend engine |
| [life-web](https://github.com/L-electron-Rare/life-web) | Operator cockpit UI |
| [life-spec](https://github.com/L-electron-Rare/life-spec) | Functional specifications and BMAD gates |
| [finefab-shared](https://github.com/L-electron-Rare/finefab-shared) | Shared contracts and types |

## License

[MIT](LICENSE)
