FROM oven/bun:1.3.0@sha256:00cccad6e9c66bbacc250851f689168606aaea551ac473e908bbcf00a5645025
WORKDIR /app
COPY . /app
RUN bun install --frozen-lockfile --ignore-scripts --filter mindwtr-mcp-server --filter @mindwtr/core
ENV HOME=/data
ENTRYPOINT ["bun", "/app/_evaluation/bootstrap.ts"]
