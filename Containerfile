FROM oven/bun:1.2.23-alpine

WORKDIR /app

COPY package.json bun.lock ./

RUN bun install --frozen-lockfile

COPY server.ts ./

RUN mkdir -p /data

EXPOSE 5001

ENV DB_FILE=/data/db.json
ENV PORT=5001

CMD ["bun", "run", "server.ts"]
