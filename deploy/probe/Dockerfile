FROM golang:1.21-alpine AS builder

WORKDIR /src/probe

ENV GOPROXY=https://proxy.golang.org,direct

COPY shared/ /src/shared/
COPY probe/go.mod probe/go.sum ./
RUN go mod download

COPY probe/ ./
RUN CGO_ENABLED=0 GOOS=linux go build -trimpath -ldflags="-s -w -buildid=" -o /out/atlas-probe ./cmd/probe

FROM alpine:3.21

RUN apk add --no-cache ca-certificates iputils traceroute

WORKDIR /app

COPY --from=builder /out/atlas-probe ./atlas-probe

CMD ["./atlas-probe"]
