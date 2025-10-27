FROM oven/bun:1.3.1-alpine

RUN apk add --no-cache tini

WORKDIR /app

COPY package.json bun.lock ./

RUN bun install --frozen-lockfile

COPY server.ts ./

RUN mkdir -p /data

EXPOSE 5001

ENV DB_FILE=/data/db.json
ENV PORT=5001

ENTRYPOINT ["/sbin/tini", "--"]
CMD ["bun", "run", "server.ts"]
