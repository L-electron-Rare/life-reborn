FROM node:22-alpine AS builder

WORKDIR /app
RUN corepack enable && corepack prepare pnpm@9.15.0 --activate
COPY package.json pnpm-lock.yaml* ./
RUN pnpm install --frozen-lockfile
COPY . .
RUN pnpm run build

FROM node:22-alpine

RUN addgroup -S app && adduser -S app -G app
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@9.15.0 --activate

COPY package.json pnpm-lock.yaml* ./
RUN pnpm install --frozen-lockfile --prod && pnpm store prune
COPY --from=builder /app/dist ./dist

USER app
EXPOSE 3210

HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
  CMD wget -qO- http://localhost:3210/health || exit 1

CMD ["node", "dist/index.js"]
