# =============================================================================
# PB-38 — MinIO (serwer + mc) budowany ze źródeł.
#
# Od 2025-10 MinIO wydaje community edition wyłącznie jako kod źródłowy (repozytorium
# zarchiwizowane 2026-04-25), a obrazy minio/minio zniknęły z Docker Huba (~2026-09-12).
# RELEASE.2025-10-15T17-29-55Z to ostatnie wydanie, z poprawką CVE-2025-62506
# (eskalacja uprawnień przez politykę sesji). Budujemy je sami i trzymamy w GHCR —
# deploy nie zależy od obrazu, który może zniknąć. Tymczasowo: docelowo Hetzner Object Storage
# razem z węzłem testowym (decyzja właściciela 2026-09-26).
#
# Budowanie jak w oficjalnym Makefile: `go build -tags kqueue -trimpath --ldflags "$(go run buildscripts/gen-ldflags.go)"`.
# =============================================================================
ARG GO_IMAGE=golang:1.27.1-alpine3.24
ARG RUNTIME_IMAGE=alpine:3.24.2

FROM ${GO_IMAGE} AS build
ARG MINIO_TAG=RELEASE.2025-10-15T17-29-55Z
ARG MC_TAG=RELEASE.2025-08-13T08-35-41Z
ENV CGO_ENABLED=0 GOFLAGS=-trimpath
RUN apk add --no-cache git
RUN git clone --depth 1 --branch "${MINIO_TAG}" https://github.com/minio/minio /src/minio && \
    cd /src/minio && go build -tags kqueue --ldflags "$(go run buildscripts/gen-ldflags.go)" -o /out/minio . && \
    /out/minio --version
RUN git clone --depth 1 --branch "${MC_TAG}" https://github.com/minio/mc /src/mc && \
    cd /src/mc && go build -tags kqueue --ldflags "$(go run buildscripts/gen-ldflags.go)" -o /out/mc . && \
    /out/mc --version

FROM ${RUNTIME_IMAGE}
# curl — healthcheck w compose; ca-certificates — połączenia TLS mc/minio.
RUN apk add --no-cache ca-certificates curl
COPY --from=build /out/minio /out/mc /usr/bin/
EXPOSE 9000 9001
VOLUME ["/data"]
ENTRYPOINT ["minio"]
