FROM node:22-bookworm-slim

RUN apt-get update \
  && apt-get install -y --no-install-recommends docker.io git ca-certificates curl unzip \
  && rm -rf /var/lib/apt/lists/* \
  && curl -fsSL https://bun.sh/install | bash

ENV BUN_INSTALL="/root/.bun"
ENV PATH="${BUN_INSTALL}/bin:${PATH}"

WORKDIR /app
COPY package.json bun.lock ./
RUN for attempt in 1 2 3; do \
      bun install && exit 0; \
      echo "bun install failed (attempt ${attempt}/3); retrying transient registry or Prisma engine download errors" >&2; \
      if [ "$attempt" -lt 3 ]; then sleep "$((attempt * 5))"; fi; \
    done; \
    exit 1
COPY . .
RUN bun run worker:build

ENV NODE_ENV=production
ENV PORT=10000
CMD ["node", "dist/runtime-worker.cjs"]
