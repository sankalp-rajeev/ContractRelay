FROM node:22-bookworm-slim@sha256:c3de60bf2f9dd0ac6370e6117950ff62d6e339527e7472301c9c78a017978392
WORKDIR /app
ADD source.tar /app/
RUN npm ci --no-audit --no-fund && npm run build
COPY session-bootstrap.mjs session-observe.mjs /app/
LABEL org.opencontainers.image.revision="09faa20ad831ebb570490a785003a1c020f6fbfa"
ENTRYPOINT ["node", "session-bootstrap.mjs"]
