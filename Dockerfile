FROM debian:bookworm-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

ARG TARGETARCH
COPY dist/${TARGETARCH}/petmon /usr/local/bin/petmon
COPY dist/frontend /app/frontend

RUN useradd -r -s /bin/false petmon
USER petmon

ENV STATIC_DIR=/app/frontend
EXPOSE 8080
ENTRYPOINT ["/usr/local/bin/petmon"]
