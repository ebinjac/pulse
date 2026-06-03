FROM golang:1.25-alpine AS build

WORKDIR /app
COPY apps/api/go.mod ./go.mod
COPY apps/api/go.sum ./go.sum
COPY apps/api ./
RUN go build -o /out/pulse-api ./cmd/api \
    && go build -o /out/pulse-worker ./cmd/worker \
    && go build -o /out/pulse-migrate ./cmd/migrate

FROM alpine:3.20

RUN apk add --no-cache ca-certificates tzdata
RUN adduser -D -H pulse
USER pulse
WORKDIR /app
COPY --from=build /out/pulse-api /app/pulse-api
COPY --from=build /out/pulse-worker /app/pulse-worker
COPY --from=build /out/pulse-migrate /app/pulse-migrate
COPY --from=build /app/migrations /app/migrations

EXPOSE 8080
CMD ["/app/pulse-api"]
