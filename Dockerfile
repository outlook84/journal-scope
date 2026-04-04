FROM node:24-alpine AS web-build
WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY web/package.json ./web/package.json
RUN corepack enable && pnpm install --frozen-lockfile

COPY . .
RUN pnpm build:web

FROM golang:1.26.1-alpine AS go-build
WORKDIR /app

ARG JOURNAL_SCOPE_VERSION=dev

COPY go.mod go.sum ./
RUN go mod download

COPY . .
COPY --from=web-build /app/web/dist ./web/dist
RUN apk add --no-cache ca-certificates && \
    CGO_ENABLED=0 GOOS=linux go build -trimpath -ldflags="-s -w -X journal-scope.Version=${JOURNAL_SCOPE_VERSION}" -o /out/journal-scope ./cmd/journal-scope

FROM busybox:1.37
RUN mkdir -p /data

COPY --from=go-build /etc/ssl/certs /etc/ssl/certs
COPY --from=go-build /out/journal-scope /usr/local/bin/journal-scope

ENV JOURNAL_SCOPE_LISTEN_ADDR=0.0.0.0:3030 \
    JOURNAL_SCOPE_DATA_DIR=/data

EXPOSE 3030
CMD ["journal-scope"]
