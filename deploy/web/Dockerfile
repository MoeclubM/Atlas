FROM node:24-alpine AS frontend-builder

WORKDIR /src/frontend

COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci --no-audit --no-fund

COPY frontend/ ./
RUN npm run build

FROM golang:1.25-alpine AS backend-builder

WORKDIR /src/web

ARG GOPROXY=https://proxy.golang.org,direct
ENV GOPROXY=${GOPROXY}

COPY shared/ /src/shared/
COPY web/go.mod web/go.sum ./
RUN go mod download

COPY web/ ./
RUN CGO_ENABLED=0 GOOS=linux go build -trimpath -ldflags="-s -w -buildid=" -o /out/atlas-server ./cmd/server

FROM busybox:1.36.1-musl

WORKDIR /app

COPY --from=frontend-builder /src/frontend/dist ./static
COPY --from=backend-builder /out/atlas-server ./atlas-server
COPY --from=backend-builder /src/web/migrations ./migrations

EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 CMD ["wget", "-q", "-T", "3", "-O", "/dev/null", "http://127.0.0.1:8080/api/health"]

CMD ["./atlas-server"]
