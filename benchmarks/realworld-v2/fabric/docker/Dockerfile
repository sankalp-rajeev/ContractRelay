ARG BASE_IMAGE
FROM ${BASE_IMAGE}
ARG SOURCE_COMMIT
LABEL org.opencontainers.image.revision=${SOURCE_COMMIT}
# Inherit the official binary and entry point unchanged. The bundle extractor
# needs a writable cache when the runtime root filesystem is read-only.
ENV DOTNET_BUNDLE_EXTRACT_BASE_DIR=/tmp/dotnet-bundle
