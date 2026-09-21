FROM oven/bun:1.4-alpine AS build
WORKDIR /app
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile
COPY . .
RUN bun run build

FROM oven/bun:1.4-alpine
WORKDIR /app
ENV NODE_ENV=production
RUN apk add --no-cache postgresql-client
COPY --from=build /app/dist ./dist
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/deploy ./deploy
COPY --from=build /app/db ./db
COPY --from=build /app/deploy/entrypoint.sh /usr/local/bin/velclawhost-entrypoint
RUN chmod +x /usr/local/bin/velclawhost-entrypoint
EXPOSE 3000
ENTRYPOINT ["velclawhost-entrypoint"]
