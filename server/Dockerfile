# Multi-stage build for linux/arm64 (Raspberry Pi 4)
FROM --platform=linux/arm64 node:20-bookworm-slim AS build
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 make g++ \
    && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json* ./
RUN npm install
COPY tsconfig.json ./
COPY src ./src
RUN npm run build && npm prune --omit=dev

FROM --platform=linux/arm64 node:20-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
ENV DATA_DIR=/data
ENV PORT=8080
ENV HOST=0.0.0.0
RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/* \
    && mkdir -p /data
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/package.json ./
COPY src/db/schema.sql ./dist/db/schema.sql
EXPOSE 8080
VOLUME ["/data"]
CMD ["node", "dist/index.js"]
