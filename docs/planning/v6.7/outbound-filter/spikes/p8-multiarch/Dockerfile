# syntax=docker/dockerfile:1
#
# P8 spike — minimal multi-arch sidecar image for the v6.7 outbound filter.
# Reuses the P3 Go program (just the allowlist check) to exercise the full
# cross-compilation path.

FROM --platform=$BUILDPLATFORM golang:1.22-alpine AS build
ARG TARGETOS
ARG TARGETARCH
WORKDIR /src
COPY main.go .
COPY go.mod .
RUN CGO_ENABLED=0 GOOS=$TARGETOS GOARCH=$TARGETARCH \
    go build -ldflags="-s -w" -o /out/dd-egress-proxy main.go

FROM scratch
COPY --from=build /out/dd-egress-proxy /dd-egress-proxy
EXPOSE 29193
ENTRYPOINT ["/dd-egress-proxy"]
