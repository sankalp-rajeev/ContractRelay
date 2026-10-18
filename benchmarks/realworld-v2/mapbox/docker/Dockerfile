FROM node@sha256:c3de60bf2f9dd0ac6370e6117950ff62d6e339527e7472301c9c78a017978392
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends git && rm -rf /var/lib/apt/lists/*
COPY . .
ARG SOURCE_TAG
RUN git init && git fetch ./history.bundle "refs/tags/${SOURCE_TAG}:refs/tags/${SOURCE_TAG}" && git reset --soft "${SOURCE_TAG}"
RUN npm ci --no-audit --no-fund && npm run build
ENV NODE_ENV=production
ENV OTEL_SDK_DISABLED=true
USER 1000:1000
ENTRYPOINT ["node", "dist/esm/index.js"]
