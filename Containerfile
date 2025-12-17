FROM oven/bun:1.3.5-alpine AS builder
ENV NODE_ENV=production

WORKDIR /app

COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

COPY tsconfig.json ./
COPY src ./src

RUN bun run build

FROM oven/bun:1.3.5-alpine

WORKDIR /app

COPY --from=builder /app/dist/index.js /app/index.js
COPY template.schema.json database.schema.json ./

EXPOSE 5001

CMD ["/app/index.js", "serve", "-t", "250", "-f", "/data/db.json", "-p", "5001"]
