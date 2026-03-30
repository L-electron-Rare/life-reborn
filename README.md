# life-reborn

Gateway API TypeScript de FineFab (interface applicative publique).

## Role
- Fournir les endpoints metier et d'integration.
- Centraliser auth, rate limit, observabilite API.
- Servir de point d'entree pour `life-web` et les clients externes.

## Stack
- TypeScript
- Hono
- pnpm
- vitest

## Structure cible
- `src/routes/`: routes API
- `src/middleware/`: auth, validation, rate limiting
- `openapi/`: specs generees
- `src/generated/`: clients/types generes

## Demarrage rapide
```bash
pnpm install
pnpm test
pnpm build
```

## Roadmap immediate
- Finaliser routes critiques migrees depuis `mascarade/api`.
- Durcir auth/rate limiting.
- OpenAPI 3.1 + generation client stable.
