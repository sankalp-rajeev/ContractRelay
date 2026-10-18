FROM python:3.12.12-slim-bookworm@sha256:593bd06efe90efa80dc4eee3948be7c0fde4134606dd40d8dd8dbcade98e669c
WORKDIR /app
COPY . /app
# The selected graph-lookup path uses real parsing/graph/MCP implementations.
# Embedding/search dependencies are not installed; no embedding tool is evaluated.
RUN pip install --no-cache-dir -r _evaluation/requirements.lock && pip install --no-deps . && pip freeze > /app/_evaluation/resolved-requirements.txt
ENV PYTHONDONTWRITEBYTECODE=1 HOME=/data NEXUS_STORAGE_DIR=/data/.nexus NEXUS_AUTO_WATCH=false NEXUS_AUDIT_ENABLED=false NEXUS_RATE_LIMIT_ENABLED=false
ENTRYPOINT ["python", "/app/_evaluation/bootstrap.py"]
