FROM python:3.12.12-slim-bookworm@sha256:593bd06efe90efa80dc4eee3948be7c0fde4134606dd40d8dd8dbcade98e669c
RUN pip install --no-cache-dir uv==0.9.5
WORKDIR /app
ADD source.tar /app/
COPY uv.lock /app/uv.lock
RUN uv sync --frozen --no-dev
ENV PATH="/app/.venv/bin:$PATH"
ENTRYPOINT ["arxiv-mcp"]
