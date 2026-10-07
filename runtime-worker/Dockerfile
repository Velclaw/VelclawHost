FROM node:22-bookworm-slim

RUN apt-get update \
  && apt-get install -y --no-install-recommends docker.io git ca-certificates \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY package.json pnpm-lock.yaml* ./
RUN corepack enable && pnpm install --no-frozen-lockfile --allow-build=esbuild --allow-build='@google/genai' --allow-build=core-js --allow-build=protobufjs
COPY . .
RUN pnpm run worker:build

ENV NODE_ENV=production
ENV PORT=10000
CMD ["node", "dist/runtime-worker.cjs"]
